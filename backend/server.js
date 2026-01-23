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
  const { page = 1, per_page = 100, status_filter = '' } = req.query;

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
    // Fetch shipments from Shiprocket
    const url = new URL('https://apiv2.shiprocket.in/v1/external/shipments');
    url.searchParams.set('page', page);
    url.searchParams.set('per_page', per_page);
    if (status_filter) {
      url.searchParams.set('status', status_filter);
    }

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
    const shipments = shipmentsData.data || shipmentsData.shipments || [];

    // Transform each shipment into order format
    const transformed = shipments.map(s => ({
      orderNumber: s.order_id || s.channel_order_id || s.order_reference || `SHP-${s.shipment_id}`,
      shiprocketOrderId: s.order_id,
      shipmentId: s.shipment_id,
      awb: s.awb_code || '',
      trackingNumber: s.awb_code || '',
      orderDate: s.order_date || s.created_date || new Date().toISOString(),
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
      platform: s.channel_name || 'Shiprocket',
      weight: s.weight,
      status: s.current_status || s.status || 'pending',
      courier: s.courier_name || s.courier || '',
      items: s.order_items || [],
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

app.listen(PORT, () => {
  console.log(`✅ Poshakh backend running on http://localhost:${PORT}`);
  console.log(`📦 Shopify store: ${SHOPIFY_STORE_DOMAIN}`);
});
