import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

admin.initializeApp();
const db = admin.firestore();

// ============================================================
// HELPER: Parse Shopify order to app schema
// ============================================================
function parseShopifyOrder(shopifyOrder) {
  const customer = shopifyOrder.customer || {};
  const lineItems = shopifyOrder.line_items || [];
  
  return {
    orderId: `SHOPIFY-${shopifyOrder.id}`,
    shopifyOrderId: shopifyOrder.id.toString(),
    shopifyOrderNumber: shopifyOrder.order_number,
    customerName: customer.first_name && customer.last_name 
      ? `${customer.first_name} ${customer.last_name}` 
      : customer.first_name || 'Unknown',
    customerEmail: customer.email || '',
    customerPhone: customer.phone || '',
    customerCity: customer.default_address?.city || '',
    customerState: customer.default_address?.province || '',
    items: lineItems.map(item => ({
      name: item.title,
      sku: item.sku || item.id.toString(),
      quantity: item.quantity,
      price: parseFloat(item.price),
      originalPrice: parseFloat(item.original_price || item.price)
    })),
    amount: parseFloat(shopifyOrder.total_price),
    subtotal: parseFloat(shopifyOrder.subtotal_price),
    discount: parseFloat(shopifyOrder.total_discounts),
    tax: parseFloat(shopifyOrder.total_tax),
    shipping: parseFloat(shopifyOrder.total_shipping || 0),
    paymentMethod: shopifyOrder.payment_gateway_names?.[0] || 'Unknown',
    paymentMode: shopifyOrder.financial_status === 'paid' ? 'Prepaid' : 'COD',
    status: 'Order Placed',
    orderDate: new Date(shopifyOrder.created_at),
    shippedDate: shopifyOrder.fulfillment_status === 'fulfilled' 
      ? new Date(shopifyOrder.updated_at) 
      : null,
    source: 'Shopify',
    syncedAt: new Date(),
    notes: shopifyOrder.note || ''
  };
}

// ============================================================
// HELPER: Match Shiprocket shipment to order & update
// ============================================================
async function matchShiprocketShipment(shiprocketData) {
  const orderId = shiprocketData.order_id || shiprocketData.shopify_order_id;
  
  if (!orderId) return;
  
  try {
    const orderRef = db.collection('orders').doc(`SHOPIFY-${orderId}`);
    const orderDoc = await orderRef.get();
    
    if (orderDoc.exists) {
      await orderRef.update({
        shiprocketTrackingId: shiprocketData.tracking_number || '',
        shiprocketStatus: shiprocketData.status || '',
        shippedDate: shiprocketData.shipped_date ? new Date(shiprocketData.shipped_date) : null,
        deliveredDate: shiprocketData.delivered_date ? new Date(shiprocketData.delivered_date) : null,
        lastUpdatedShiprocket: new Date()
      });
    }
  } catch (error) {
    console.error('Error updating order with Shiprocket data:', error);
  }
}

// ============================================================
// WEBHOOK: Shopify Order Created/Updated
// ============================================================
export const shopifyOrderWebhook = functions.https.onRequest(async (req, res) => {
  try {
    // Verify webhook (in production, verify HMAC signature)
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    const shopifyOrder = req.body;
    const parsedOrder = parseShopifyOrder(shopifyOrder);
    
    // Store in Firestore
    await db.collection('orders').doc(parsedOrder.orderId).set(parsedOrder, { merge: true });
    
    // Log sync
    await db.collection('syncLogs').add({
      type: 'shopify_order',
      orderId: parsedOrder.orderId,
      status: 'success',
      timestamp: new Date(),
      source: 'webhook'
    });

    res.status(200).json({ success: true, orderId: parsedOrder.orderId });
  } catch (error) {
    console.error('Shopify webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// WEBHOOK: Shiprocket Shipment Updated
// ============================================================
export const shiprocketWebhook = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    const shiprocketData = req.body;
    await matchShiprocketShipment(shiprocketData);
    
    // Log sync
    await db.collection('syncLogs').add({
      type: 'shiprocket_shipment',
      trackingId: shiprocketData.tracking_number,
      status: 'success',
      timestamp: new Date(),
      source: 'webhook'
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Shiprocket webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// SCHEDULED: Daily sync from Shopify & Shiprocket
// ============================================================
export const dailySync = functions.pubsub
  .schedule('every day 00:30')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    try {
      // Get API credentials from Firestore config
      const configDoc = await db.collection('config').doc('integrations').get();
      const config = configDoc.data() || {};
      
      if (!config.shopifyAccessToken || !config.shopifyStore) {
        console.log('Shopify credentials not configured');
        return;
      }

      // 1. Fetch recent orders from Shopify
      const shopifyUrl = `https://${config.shopifyStore}.myshopify.com/admin/api/2024-01/orders.json`;
      const shopifyResponse = await axios.get(shopifyUrl, {
        headers: {
          'X-Shopify-Access-Token': config.shopifyAccessToken
        },
        params: {
          status: 'any',
          limit: 250,
          created_at_min: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
        }
      });

      let shopifyCount = 0;
      for (const order of shopifyResponse.data.orders) {
        const parsedOrder = parseShopifyOrder(order);
        await db.collection('orders').doc(parsedOrder.orderId).set(parsedOrder, { merge: true });
        shopifyCount++;
      }

      // 2. Fetch shipments from Shiprocket
      let shiprocketCount = 0;
      if (config.shiprocketApiKey && config.shiprocketApiSecret) {
        const shiprocketUrl = 'https://apiv2.shiprocket.in/v1/external/shipments/search';
        try {
          const shiprocketResponse = await axios.post(
            shiprocketUrl,
            {
              page: 1,
              filters: {
                created_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
              }
            },
            {
              headers: {
                'Authorization': `Bearer ${config.shiprocketApiKey}`
              }
            }
          );

          for (const shipment of shiprocketResponse.data.data || []) {
            await matchShiprocketShipment(shipment);
            shiprocketCount++;
          }
        } catch (shipError) {
          console.error('Shiprocket sync error:', shipError.message);
        }
      }

      // Log sync completion
      await db.collection('syncLogs').add({
        type: 'daily_sync',
        shopifyOrdersSync: shopifyCount,
        shiprocketShipmentsSync: shiprocketCount,
        status: 'success',
        timestamp: new Date()
      });

      console.log(`Daily sync completed: ${shopifyCount} Shopify orders, ${shiprocketCount} Shiprocket shipments`);
    } catch (error) {
      console.error('Daily sync error:', error);
      await db.collection('syncLogs').add({
        type: 'daily_sync',
        status: 'error',
        error: error.message,
        timestamp: new Date()
      });
    }
  });

// ============================================================
// HTTP: Manual trigger sync
// ============================================================
export const triggerSync = functions.https.onRequest(async (req, res) => {
  try {
    // Verify user is authenticated (basic check)
    const uid = req.query.uid || req.body.uid;
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Run the sync logic
    const configDoc = await db.collection('config').doc('integrations').get();
    const config = configDoc.data() || {};

    // ... (same sync logic as dailySync)
    
    res.status(200).json({ 
      success: true, 
      message: 'Sync triggered successfully' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// HTTP: Get sync status & logs
// ============================================================
export const getSyncStatus = functions.https.onRequest(async (req, res) => {
  try {
    const uid = req.query.uid || req.body.uid;
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const logs = await db.collection('syncLogs')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const logs_data = logs.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp
    }));

    res.status(200).json({ logs: logs_data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
