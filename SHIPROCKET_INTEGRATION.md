# Shiprocket Integration Guide

## Overview
The Poshakh app now supports pulling orders directly from Shiprocket. This eliminates the need for Shopify integration and allows you to sync shipment data into Firestore automatically.

## Setup

### 1. Shiprocket Credentials
Make sure your Shiprocket credentials are configured in `backend/.env`:

```bash
SHIPROCKET_EMAIL=your-email@example.com
SHIPROCKET_PASSWORD=your-password
SHIPROCKET_TOKEN=  # Will be auto-generated on first auth
```

### 2. Backend Server
The backend (`backend/server.js`) already has these endpoints:
- `POST /api/shiprocket/auth` - Authenticate with Shiprocket
- `GET /api/shiprocket/orders` - Fetch all orders from Shiprocket
- `GET /api/shiprocket/order?awb=<AWB>` - Fetch specific order by AWB

### 3. Frontend Sync
The Orders component has a "Sync Shiprocket" button that:
1. Fetches orders from Shiprocket API
2. Transforms them into the app's order format
3. Syncs them into Firestore (creates new or updates existing)

## How to Use

### Option 1: Manual Sync Button
1. Go to the **Orders** tab
2. Click the **"Sync Shiprocket"** button (orange button with refresh icon)
3. Watch the sync progress message
4. Orders will be automatically added/updated in your database

### Option 2: Programmatic Sync
```javascript
import { pullShiprocketOrders } from './lib/shiprocketSync'

// Pull and sync orders
const result = await pullShiprocketOrders({
  page: 1,
  per_page: 100,
  status_filter: '', // optional
  onProgress: (update) => {
    console.log(update.status) // "Fetching...", "Syncing...", etc
  }
})

console.log(`Synced: ${result.synced}, Failed: ${result.failed}`)
```

### Option 3: Scan AWB
1. Go to the Orders tab
2. Scan a tracking number/AWB in the scan field
3. The order will be fetched from Shiprocket and form will auto-fill

## Data Mapping

Shiprocket shipment data is transformed as follows:

```
Shiprocket Field       → App Field
order_id              → shiprocketOrderId
shipment_id           → shipmentId
awb_code              → awb, trackingNumber
order_date            → orderDate
consignee_name        → customerName
consignee_phone       → phone
consignee_email       → email
consignee_address     → address.line1
destination_city      → address.city
destination_state     → address.state
destination_country   → address.country
consignee_pincode     → address.zip
channel_name          → platform
current_status        → status
courier_name          → courier
weight                → weight
order_items           → items (raw)
```

Orders are stored in Firestore with:
- `source: 'shiprocket'` - to identify they came from Shiprocket
- `sourceData: {...}` - full original response
- Auto-generated createdAt timestamp

## Status Updates

When you sync, Shiprocket orders are stored with their current Shiprocket status. You can:
1. View shipment tracking info (AWB, courier, weight)
2. Update order status manually in the app
3. Sync again to get latest Shiprocket status updates

## Error Handling

If sync fails:
- Check Shiprocket credentials in `backend/.env`
- Ensure backend is running (`npm run dev` in backend folder)
- Check SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD are correct
- Verify Shiprocket API is accessible

## API Endpoints

### Get All Orders
```bash
GET /api/shiprocket/orders?page=1&per_page=100&status_filter=
```

Response:
```json
{
  "success": true,
  "orders": [...],
  "pagination": {
    "page": 1,
    "per_page": 100,
    "total": 500
  }
}
```

### Get Order by AWB
```bash
GET /api/shiprocket/order?awb=1234567890
```

## Notes
- Orders synced from Shiprocket have `source: 'shiprocket'`
- Duplicate orders are prevented using `shiprocketOrderId` as unique identifier
- Manual orders created in the app still have `platform: 'Shopify'` or `'Shopdeck'`
- Each sync can pull up to 100 orders (paginated)
