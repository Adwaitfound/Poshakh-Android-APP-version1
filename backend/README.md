# Poshakh Backend - Shopify Order Import

Simple Express backend for fetching Shopify orders by ID.

## Setup

### 1. Authenticate via OAuth (CLI app)

If the API credentials tab isn’t visible, use OAuth with your app’s Client ID/Secret:

1. Open Dev Dashboard → Settings → Credentials and copy the **Client ID** and **Secret**.

2. Edit `backend/.env`:

```
SHOPIFY_STORE_DOMAIN=poshakh-dev-store.myshopify.com
SHOPIFY_CLIENT_ID=3d93016fdd299a87783f702c1495d6a5
SHOPIFY_CLIENT_SECRET=<paste from Dev Dashboard Settings>
SHOPIFY_SCOPES=read_orders,read_products
SHOPIFY_REDIRECT_URL=http://localhost:3001/auth/callback
```

3. Start backend: `npm start`

4. In your browser, visit: `http://localhost:3001/auth/shopify`

Approve the app install. You’ll see “✅ Shopify Admin token saved”. The token persists in `backend/shopify_token.json`.

### 2. Add Token to `.env`

Edit `backend/.env`:

```
SHOPIFY_STORE_DOMAIN=poshakh-dev-store.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_your_token_here
PORT=3001
NODE_ENV=development
```

Replace `shpat_your_token_here` with your actual token.

### 3. Start Backend

```bash
cd backend
npm start
```

Backend runs on `http://localhost:3001`

### 4. Test the API

GraphQL by order number:

```bash
# Replace #1001 with a real Shopify order name
curl "http://localhost:3001/api/shopify/orderByNumber?name=%231001"
```

Or REST by numeric ID:

```bash
curl "http://localhost:3001/api/shopify/order?id=12345"
```

**Example response:**

```json
{
  "orderNumber": "#1001",
  "orderId": "gid://shopify/Order/...",
  "orderDate": "2024-01-15T10:00:00Z",
  "customerName": "John Doe",
  "phone": "9876543210",
  "email": "john@example.com",
  "address": {
    "line1": "123 Main St",
    "city": "Mumbai",
    "state": "MH",
    "country": "IN",
    "zip": "400001"
  },
  "lineItems": [
    {
      "title": "Custom Outfit",
      "sku": "OUTFIT123-M",
      "variantTitle": "Medium",
      "quantity": 2
    }
  ],
  "platform": "Shopify",
  "totalPrice": "5000.00",
  "currency": "INR"
}
```

## Frontend Integration

Once backend is running, the React app can fetch orders via:

```javascript
const response = await fetch(
  `http://localhost:3001/api/shopify/order?id=${orderId}`
);
const order = await response.json();
```

This will auto-fill the Orders form with customer details.
