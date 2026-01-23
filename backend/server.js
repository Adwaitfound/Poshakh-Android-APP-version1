import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
let SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN; // may be set via OAuth
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || 'read_orders,read_products';
const SHOPIFY_REDIRECT_URL = process.env.SHOPIFY_REDIRECT_URL || `http://localhost:${PORT}/auth/callback`;
const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL;
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD;
let SHIPROCKET_TOKEN = process.env.SHIPROCKET_TOKEN;

const tokenFile = path.join(process.cwd(), 'shopify_token.json');
if (!SHOPIFY_ADMIN_TOKEN && fs.existsSync(tokenFile)) {
  try {
    const saved = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
    if (saved && saved.access_token) {
      SHOPIFY_ADMIN_TOKEN = saved.access_token;
      console.log('🔐 Loaded saved Shopify Admin token from shopify_token.json');
    }
  } catch (e) {
    console.warn('Could not read shopify_token.json:', e.message);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', store: SHOPIFY_STORE_DOMAIN });
});

// Manual token setup: paste your Admin API token from store admin into .env
app.get('/auth/status', (req, res) => {
  if (SHOPIFY_ADMIN_TOKEN) {
    res.json({ 
      status: 'authenticated', 
      message: 'Admin API token is configured',
      store: SHOPIFY_STORE_DOMAIN 
    });
  } else {
    res.json({ 
      status: 'not_authenticated',
      message: 'Add SHOPIFY_ADMIN_TOKEN to backend/.env. Get it from: https://poshakh-dev-store.myshopify.com/admin → Settings → Apps → Develop apps → [your app] → API credentials',
      instructions: [
        '1. Open https://poshakh-dev-store.myshopify.com/admin',
        '2. Settings → Apps and sales channels → Develop apps',
        '3. Select an existing app or create one',
        '4. Configuration → Admin API scopes → add read_orders, read_products → Save',
        '5. Install app',
        '6. API credentials → copy Admin API access token',
        '7. Paste into backend/.env as SHOPIFY_ADMIN_TOKEN=shpat_xxx'
      ]
    });
  }
});

// 1) OAuth start: redirect to Shopify to install/authorize the app
app.get('/auth/shopify', (req, res) => {
  if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET in .env' });
  }
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${encodeURIComponent(SHOPIFY_SCOPES)}&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URL)}`;
  res.redirect(url);
});

// 2) OAuth callback: exchange code for Admin API access token and persist it locally
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing ?code in callback');
  }
  try {
    const resp = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).send(`OAuth exchange failed: ${text}`);
    }
    const data = await resp.json();
    SHOPIFY_ADMIN_TOKEN = data.access_token;
    fs.writeFileSync(tokenFile, JSON.stringify(data, null, 2));
    res.send('✅ Shopify Admin token saved. You can close this tab and return to the app.');
    console.log('✅ Received and saved Shopify Admin token');
  } catch (e) {
    console.error('OAuth error:', e);
    res.status(500).send('OAuth error');
  }
});

// REST: Fetch order by numeric ID from Shopify
app.get('/api/shopify/order', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Order ID required' });
  }

  if (!SHOPIFY_ADMIN_TOKEN) {
    return res.status(500).json({ error: 'Shopify token not configured. Visit /auth/shopify to authenticate.' });
  }

  try {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2026-01/orders/${id}.json`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Shopify API error: ${response.statusText}`,
        details: await response.text()
      });
    }

    const { order } = await response.json();

    // Transform Shopify order to app format
    const transformedOrder = {
      orderNumber: order.order_number?.toString() || order.name,
      orderId: order.id?.toString(),
      orderDate: order.created_at,
      customerName: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim(),
      phone: order.shipping_address?.phone || order.billing_address?.phone || order.customer?.phone || '',
      email: order.email || order.customer?.email || '',
      address: {
        line1: order.shipping_address?.address1 || '',
        line2: order.shipping_address?.address2 || '',
        city: order.shipping_address?.city || '',
        state: order.shipping_address?.province || '',
        country: order.shipping_address?.country || '',
        zip: order.shipping_address?.zip || '',
      },
      lineItems: order.line_items?.map(li => ({
        title: li.title,
        sku: li.sku,
        variantTitle: li.variant_title,
        quantity: li.quantity,
      })) || [],
      platform: 'Shopify',
      totalPrice: order.total_price,
      currency: order.currency,
    };

    res.json(transformedOrder);
  } catch (error) {
    console.error('Error fetching Shopify order:', error);
    res.status(500).json({ error: 'Failed to fetch order', details: error.message });
  }
});

// GraphQL: Fetch order by order name (e.g., #1001) using Admin GraphQL API
app.get('/api/shopify/orderByNumber', async (req, res) => {
  const { name } = req.query; // pass order name like #1001
  if (!name) return res.status(400).json({ error: 'Order name required, e.g., #1001' });
  if (!SHOPIFY_ADMIN_TOKEN) return res.status(500).json({ error: 'Shopify token missing. Visit /auth/shopify' });

  const query = `
    query($query: String!) {
      orders(first: 1, query: $query) {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { displayName phone email }
            shippingAddress { address1 address2 city province country zip phone }
            lineItems(first: 20) {
              edges { node { name sku quantity variantTitle } }
            }
          }
        }
      }
    }
  `;
  const variables = { query: `name:${name}` };
  try {
    const resp = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2026-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'GraphQL error', details: text });
    }
    const data = await resp.json();
    const edge = data?.data?.orders?.edges?.[0];
    if (!edge) return res.status(404).json({ error: 'Order not found' });
    const o = edge.node;
    const transformed = {
      orderNumber: o.name,
      orderId: o.id,
      orderDate: o.createdAt,
      customerName: o.customer?.displayName || '',
      phone: o.customer?.phone || o.shippingAddress?.phone || '',
      email: o.customer?.email || '',
      address: {
        line1: o.shippingAddress?.address1 || '',
        line2: o.shippingAddress?.address2 || '',
        city: o.shippingAddress?.city || '',
        state: o.shippingAddress?.province || '',
        country: o.shippingAddress?.country || '',
        zip: o.shippingAddress?.zip || '',
      },
      lineItems: (o.lineItems?.edges || []).map(e => ({
        title: e.node.name,
        sku: e.node.sku,
        variantTitle: e.node.variantTitle,
        quantity: e.node.quantity,
      })),
      platform: 'Shopify',
      totalPrice: o.totalPriceSet?.shopMoney?.amount,
      currency: o.totalPriceSet?.shopMoney?.currencyCode,
    };
    res.json(transformed);
  } catch (e) {
    console.error('GraphQL fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch order by number' });
  }
});

// Shiprocket: Authenticate and get token
app.post('/api/shiprocket/auth', async (req, res) => {
  if (!SHIPROCKET_EMAIL || !SHIPROCKET_PASSWORD) {
    return res.status(500).json({ error: 'Shiprocket credentials not configured in .env' });
  }
  try {
    const resp = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD }),
    });
    if (!resp.ok) return res.status(resp.status).json({ error: 'Shiprocket auth failed', details: await resp.text() });
    const data = await resp.json();
    SHIPROCKET_TOKEN = data.token;
    res.json({ message: 'Shiprocket authenticated', token: data.token });
  } catch (e) {
    console.error('Shiprocket auth error:', e);
    res.status(500).json({ error: 'Shiprocket auth failed' });
  }
});

// Shiprocket: Fetch order by AWB/tracking number with full shipment details
app.get('/api/shiprocket/order', async (req, res) => {
  const { awb } = req.query;

  if (!awb) {
    return res.status(400).json({ error: 'AWB required' });
  }

  // Auto-authenticate if no token
  if (!SHIPROCKET_TOKEN && SHIPROCKET_EMAIL && SHIPROCKET_PASSWORD) {
    try {
      const authResp = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD }),
      });
      if (authResp.ok) {
        const authData = await authResp.json();
        SHIPROCKET_TOKEN = authData.token;
      }
    } catch (e) {
      console.error('Auto-auth failed:', e);
    }
  }

  if (!SHIPROCKET_TOKEN) {
    return res.status(500).json({ error: 'Shiprocket token not configured. Call POST /api/shiprocket/auth or set SHIPROCKET_TOKEN in .env' });
  }

  try {
    // First try: Get shipment details by AWB using shipments API
    const shipmentsResp = await fetch('https://apiv2.shiprocket.in/v1/external/shipments', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SHIPROCKET_TOKEN}`,
      },
    });

    if (shipmentsResp.ok) {
      const shipmentsData = await shipmentsResp.json();
      const shipments = shipmentsData.data || shipmentsData.shipments || [];
      
      // Search for matching AWB in shipments
      const matchedShipment = shipments.find(s => 
        s.awb_code === awb || 
        s.tracking_number === awb ||
        (Array.isArray(s.awb) && s.awb.some(a => a.awb_code === awb))
      );

      if (matchedShipment) {
        const s = matchedShipment;
        const transformed = {
          orderNumber: s.order_id || s.channel_order_id || s.order_reference || '',
          awb: s.awb_code || awb,
          trackingNumber: s.awb_code || awb,
          orderDate: s.order_date || s.pickup_date || '',
          customerName: s.consignee_name || s.customer_name || '',
          phone: s.consignee_phone || s.phone || '',
          email: s.consignee_email || s.email || '',
          address: {
            line1: s.consignee_address || s.address || '',
            line2: s.consignee_address_2 || '',
            city: s.destination_city || s.city || '',
            state: s.destination_state || s.state || '',
            country: s.destination_country || 'IN',
            zip: s.consignee_pincode || s.zip || '',
          },
          platform: s.channel_name || 'Unknown',
          weight: s.weight,
          status: s.current_status || s.status,
          courier: s.courier_name || s.courier,
        };
        return res.json(transformed);
      }
    }

    // Second try: Use tracking API as fallback (returns less data but works for all AWBs)
    const trackResp = await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SHIPROCKET_TOKEN}`,
      },
    });

    if (!trackResp.ok) {
      return res.status(trackResp.status).json({ error: 'Shiprocket API error', details: await trackResp.text() });
    }

    const trackData = await trackResp.json();
    const shipment = trackData.tracking_data || trackData;

    if (!shipment || !shipment.awb_code) {
      return res.status(404).json({ error: 'AWB not found in Shiprocket' });
    }

    // Transform tracking data
    const transformed = {
      orderNumber: shipment.order_id || shipment.channel_order_id || '',
      awb: shipment.awb_code || awb,
      trackingNumber: shipment.awb_code || awb,
      orderDate: shipment.order_date || shipment.pickup_date || '',
      customerName: shipment.consignee_name || '',
      phone: shipment.consignee_phone || '',
      email: shipment.consignee_email || '',
      address: {
        line1: shipment.consignee_address || '',
        line2: shipment.consignee_address_2 || '',
        city: shipment.destination_city || '',
        state: shipment.destination_state || '',
        country: shipment.destination_country || 'IN',
        zip: shipment.consignee_pincode || '',
      },
      platform: shipment.channel_name || 'Unknown',
      weight: shipment.weight,
      status: shipment.current_status || shipment.status,
      courier: shipment.courier_name,
    };

    res.json(transformed);
  } catch (error) {
    console.error('Error fetching Shiprocket order:', error);
    res.status(500).json({ error: 'Failed to fetch order from Shiprocket', details: error.message });
  }
});

// Shiprocket: Fetch all orders
app.get('/api/shiprocket/orders', async (req, res) => {
  const { page = 1, per_page = 100, status_filter = '', from_date = '', to_date = '', created_after = '', created_before = '' } = req.query;

  // Auto-authenticate if no token
  if (!SHIPROCKET_TOKEN && SHIPROCKET_EMAIL && SHIPROCKET_PASSWORD) {
    try {
      const authResp = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD }),
      });
      if (authResp.ok) {
        const authData = await authResp.json();
        SHIPROCKET_TOKEN = authData.token;
      }
    } catch (e) {
      console.error('Auto-auth failed:', e);
    }
  }

  if (!SHIPROCKET_TOKEN) {
    return res.status(500).json({ error: 'Shiprocket token not configured. Call POST /api/shiprocket/auth or set SHIPROCKET_TOKEN in .env' });
  }

  try {
    // Use orders endpoint instead of shipments for complete customer data
    const url = new URL('https://apiv2.shiprocket.in/v1/external/orders');
    url.searchParams.set('page', page);
    url.searchParams.set('per_page', per_page);
    if (status_filter) {
      url.searchParams.set('status', status_filter);
    }
    // Add date filters if provided - try multiple parameter names Shiprocket might support
    if (from_date) {
      url.searchParams.set('from_date', from_date);
      url.searchParams.set('order_date_start', from_date);
    }
    if (to_date) {
      url.searchParams.set('to_date', to_date);
      url.searchParams.set('order_date_end', to_date);
    }
    if (created_after) {
      url.searchParams.set('created_after', created_after);
    }
    if (created_before) {
      url.searchParams.set('created_before', created_before);
    }

    const shipmentsResp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SHIPROCKET_TOKEN}`,
      },
    });

    console.log('🔗 Shiprocket URL:', url.toString());

    if (!shipmentsResp.ok) {
      const errorText = await shipmentsResp.text();
      return res.status(shipmentsResp.status).json({ error: 'Shiprocket API error', details: errorText });
    }

    const shipmentsData = await shipmentsResp.json();
    const shipments = shipmentsData.data || shipmentsData.shipments || [];

    console.log(`📦 Shiprocket API returned ${shipments.length} orders (page ${page})`, { total: shipmentsData.total, shipments_count: shipmentsData.shipments_count });

    // Debug: Log extracted customer data
    if (shipments.length > 0) {
      const first = shipments[0];
      console.log('✅ All order keys:', Object.keys(first).slice(0, 30).join(', '));
      
      // Log product fields to debug selling_price
      if (first.products && first.products.length > 0) {
        console.log('✅ First product fields:', Object.keys(first.products[0]));
        console.log('✅ First product data:', JSON.stringify(first.products[0], null, 2).substring(0, 500));
      }
    }

    // Transform each order into our format
    const transformed = shipments.map(s => ({
      orderNumber: s.channel_order_id || s.order_id || s.order_reference || `SHP-${s.id}`,
      shiprocketOrderId: s.id, // Use 'id' field from orders endpoint
      shipmentId: s.shipment_id || s.id,
      awb: s.awb_code || s.last_mile_awb || '',
      trackingNumber: s.awb_code || s.last_mile_awb || '',
      orderDate: s.order_date || s.created_date || new Date().toISOString(),
      // Try multiple field names for customer data
      customerName: s.consignee_name || s.customer_name || s.shipping_customer_name || s.buyer_name || '',
      phone: s.consignee_phone || s.customer_phone || s.phone || s.shipping_phone || s.billing_phone || s.customer_alternate_phone || '',
      email: s.consignee_email || s.customer_email || s.email || s.shipping_email || s.billing_email || '',
      address: {
        line1: s.consignee_address || s.customer_address || s.address || s.shipping_address || s.buyer_address || '',
        line2: s.consignee_address_2 || s.customer_address_2 || s.address_2 || s.shipping_address_2 || '',
        city: s.destination_city || s.customer_city || s.city || s.shipping_city || s.billing_city || '',
        state: s.destination_state || s.customer_state || s.state || s.shipping_state || s.billing_state || '',
        country: s.destination_country || s.customer_country || s.country || s.billing_country || 'IN',
        zip: s.consignee_pincode || s.customer_pincode || s.zip || s.shipping_pincode || s.billing_pincode || '',
      },
      platform: s.channel_name || 'Shiprocket',
      weight: s.weight,
      status: s.current_status || s.status || 'pending',
      courier: s.courier_name || s.courier || '',
      // Pricing fields
      sellingPrice: s.payment || s.total || s.sub_total || 0,
      discount: s.discount || 0,
      // Transform products - calculate selling_price if missing
      items: (s.products || s.order_items || []).map(p => ({
        ...p,
        // Calculate selling_price if not provided or is 0
        selling_price: p.selling_price > 0 ? p.selling_price : ((parseFloat(p.price) || 0) - (parseFloat(p.discount) || 0)),
        product_cost: p.product_cost || p.price || 0,
      })),
    }));

    res.json({
      success: true,
      orders: transformed,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(per_page),
        total: shipmentsData.total || shipments.length,
      },
    });
  } catch (error) {
    console.error('Error fetching Shiprocket orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders from Shiprocket', details: error.message });
  }
});

// Shiprocket: Get orders with full details (pricing, customer info, items)
// Use /orders endpoint which has complete order details (pricing, customer info)
// Note: Limited to 58 orders with complete data
app.get('/api/shiprocket/shipments', async (req, res) => {
  const { page = 1, per_page = 100, from_date = '', to_date = '' } = req.query;

  if (!SHIPROCKET_TOKEN) {
    return res.status(500).json({ error: 'Shiprocket token not configured' });
  }

  try {
    const url = new URL('https://apiv2.shiprocket.in/v1/external/orders');
    url.searchParams.set('page', page);
    url.searchParams.set('per_page', per_page);
    if (from_date) {
      url.searchParams.set('from_date', from_date);
    }
    if (to_date) {
      url.searchParams.set('to_date', to_date);
    }

    console.log('🔗 Orders URL (complete data):', url.toString());

    const shipmentsResp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SHIPROCKET_TOKEN}`,
      },
    });

    if (!shipmentsResp.ok) {
      const errorText = await shipmentsResp.text();
      return res.status(shipmentsResp.status).json({ error: 'Shiprocket API error', details: errorText });
    }

    const shipmentsData = await shipmentsResp.json();
    const rawOrders = shipmentsData.data || shipmentsData.orders || [];

    console.log(`📦 Shiprocket Orders API returned ${rawOrders.length} orders (page ${page})`);
    if (rawOrders.length > 0) {
      console.log('✅ First order customer:', rawOrders[0].billing_customer_name || rawOrders[0].customer_name || 'N/A');
      console.log('✅ First order items:', rawOrders[0].items?.length || 0);
    }

    const metaPagination = shipmentsData.meta?.pagination || {};
    let totalCount = parseInt(metaPagination.total) || rawOrders.length;
    
    // For /orders endpoint, pagination total is reliable
    console.log('📄 Total count:', totalCount);

    console.log('🔍 Has next page:', !!metaPagination.links?.next);

    // Transform to our format (from /orders endpoint)
    const orders = rawOrders.map(o => ({
      orderNumber: o.channel_order_id || `SHP-${o.id}`,
      shiprocketOrderId: o.id,
      awb: o.last_mile_awb || o.awb || '',
      trackingNumber: o.last_mile_awb || o.awb || '',
      orderDate: o.created_at || new Date().toISOString(),
      customerName: o.billing_customer_name || o.customer_name || 'Unknown',
      phone: o.billing_phone || o.customer_phone || o.customer_alternate_phone || '',
      email: o.billing_email || o.customer_email || '',
      address: {
        line1: o.billing_address || o.customer_address || '',
        line2: o.billing_address_2 || o.customer_address_2 || '',
        city: o.billing_city || o.customer_city || '',
        state: o.billing_state || o.customer_state || '',
        country: o.billing_country || o.customer_country || 'IN',
        zip: o.billing_pincode || o.customer_pincode || '',
      },
      platform: o.channel_name || 'Shiprocket',
      status: o.master_status || o.status || 'pending',
      courier: o.last_mile_courier_name || o.courier_name || '',
      sellingPrice: o.total || o.total_order_value || 0,
      discount: o.discount || 0,
      items: (o.items || o.products || []).map(p => ({
        id: p.id,
        name: p.name,
        sku: p.channel_sku || p.sku || '',
        channel_sku: p.channel_sku || p.sku || '',
        quantity: p.quantity || 1,
        price: parseFloat(p.price) || 0,
        product_cost: parseFloat(p.product_cost) || 0,
        discount: parseFloat(p.discount) || 0,
        selling_price: p.selling_price > 0 ? parseFloat(p.selling_price) : (parseFloat(p.price) - parseFloat(p.discount)) || 0,
        mrp: parseFloat(p.mrp) || 0,
        hsn: p.hsn || '',
      })),
    }));

    const pagination = shipmentsData.meta?.pagination || shipmentsData.pagination || {};

    res.json({
      success: true,
      orders: orders,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(per_page),
        total: totalCount,
      },
    });
  } catch (error) {
    console.error('Error fetching Shiprocket orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders from Shiprocket', details: error.message });
  }
});

// Shiprocket: Webhook endpoint to receive real-time order updates
app.post('/api/shiprocket/webhook', express.json(), async (req, res) => {
  try {
    console.log('📥 Shiprocket webhook received:', JSON.stringify(req.body, null, 2));
    
    const payload = req.body;
    
    // Shiprocket sends different event types
    // Common events: order_created, order_shipped, order_delivered, order_cancelled
    
    if (!payload) {
      return res.status(400).json({ error: 'No payload received' });
    }

    // Transform webhook data to our order format
    const orderData = payload.order || payload;
    
    const transformedOrder = {
      orderNumber: orderData.channel_order_id || orderData.order_id || orderData.id,
      shiprocketOrderId: orderData.id || orderData.order_id,
      shipmentId: orderData.shipment_id,
      awb: orderData.awb_code || orderData.awb || '',
      trackingNumber: orderData.awb_code || orderData.awb || '',
      orderDate: orderData.order_date || orderData.created_at || new Date().toISOString(),
      // Webhook should have unmasked customer data
      customerName: orderData.customer_name || orderData.billing_customer_name || '',
      phone: orderData.customer_phone || orderData.billing_phone || orderData.phone || '',
      email: orderData.customer_email || orderData.billing_email || orderData.email || '',
      address: {
        line1: orderData.customer_address || orderData.billing_address || '',
        line2: orderData.customer_address_2 || orderData.billing_address_2 || '',
        city: orderData.customer_city || orderData.billing_city || '',
        state: orderData.customer_state || orderData.billing_state || '',
        country: orderData.customer_country || 'IN',
        zip: orderData.customer_pincode || orderData.billing_pincode || '',
      },
      platform: orderData.channel_name || 'Shiprocket',
      weight: orderData.weight || orderData.total_weight,
      status: orderData.status || orderData.order_status || 'pending',
      courier: orderData.courier_name || orderData.courier || '',
      items: orderData.products || orderData.order_items || [],
      // Webhook metadata
      webhookEvent: payload.event_type || 'order_update',
      webhookReceivedAt: new Date().toISOString(),
    };

    console.log('✅ Transformed webhook order:', {
      orderNumber: transformedOrder.orderNumber,
      customerName: transformedOrder.customerName,
      phone: transformedOrder.phone,
      email: transformedOrder.email,
      status: transformedOrder.status,
    });

    // Send success response to Shiprocket
    res.json({ 
      success: true, 
      message: 'Webhook received and processed',
      orderNumber: transformedOrder.orderNumber 
    });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed', details: error.message });
  }
});

// Delete all Shiprocket orders from Firestore
app.post('/api/shiprocket/delete-all', async (req, res) => {
  try {
    const db = getDb();
    const batch = db.batch();

    // Query all Shiprocket orders
    const q = query(collection(db, 'production_orders'), where('source', '==', 'shiprocket'));
    const snap = await getDocs(q);

    console.log(`🗑️ Deleting ${snap.docs.length} Shiprocket orders...`);

    snap.docs.forEach((docSnap) => {
      batch.delete(doc(db, 'production_orders', docSnap.id));
    });

    await batch.commit();
    res.json({ success: true, deletedCount: snap.docs.length });
  } catch (error) {
    console.error('❌ Delete all Shiprocket orders error:', error);
    res.status(500).json({ error: 'Failed to delete orders', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Poshakh backend running on http://localhost:${PORT}`);
  console.log(`📦 Shopify store: ${SHOPIFY_STORE_DOMAIN}`);
  console.log(`🔗 Shiprocket webhook URL: http://localhost:${PORT}/api/shiprocket/webhook`);
});
