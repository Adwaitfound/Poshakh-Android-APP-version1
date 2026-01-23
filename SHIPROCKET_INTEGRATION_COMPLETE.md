# Shiprocket Integration - Implementation Summary

## Overview
Complete Shiprocket API integration for the Poshakh order management system, enabling automatic order sync, manual import workflow, and persistent data storage.

## What We Built

### 1. Backend API (`backend/server.js`)

#### Endpoints Created:
- **POST `/api/shiprocket/auth`** - Authenticates with Shiprocket API and caches token
- **GET `/api/shiprocket/shipments`** - Fetches orders from Shiprocket with pagination support

#### Key Features:
- **Token Management**: Automatic authentication with token caching
- **Pagination**: Multi-page fetching (100 orders per page)
- **Data Transformation**: Maps Shiprocket API response to app format
- **Field Prioritization**: Uses `billing_*` fields (more reliable than `customer_*` fields)
- **Date Filtering**: Supports `from_date` and `to_date` query parameters

#### Data Mapping:
```javascript
{
  orderNumber: channel_order_id,
  shiprocketOrderId: id,
  awb: last_mile_awb,
  customerName: billing_customer_name || customer_name,
  phone: billing_phone || customer_phone,
  address: {
    line1: billing_address,
    city: billing_city,
    state: billing_state,
    zip: billing_pincode
  },
  platform: 'Shiprocket',
  items: [{
    channel_sku,
    product_cost,
    discount,
    selling_price: (calculated from price - discount)
  }]
}
```

### 2. Frontend Component (`src/components/ShiprocketOrders.jsx`)

#### Features:
- **Auto-sync**: Every 30 seconds (silent mode, no notifications)
- **Manual Sync**: "Sync Now" button with progress feedback
- **Firestore Persistence**: Orders saved to `production_orders` collection
- **Data Loading**: Loads existing orders from Firestore on mount
- **Write Throttling**: 500ms delay every 5 writes to prevent Firebase quota errors
- **Sorting**: Sort by newest/oldest date
- **Date Filtering**: Filter orders by date range (default: Sept 1, 2025 onwards)
- **Expand/Collapse**: Individual order details with proper state tracking
- **Bulk Delete**: "Delete Shiprocket Orders" button for cleanup

#### State Management:
- **Local State**: `shiprocketOrders` for display (populated from Firestore + sync)
- **Firestore**: Persists all orders across devices and sessions
- **Parent Refresh**: Calls `onRefreshOrders()` after sync to update App.jsx state

### 3. Orders Tab Integration (`src/components/Orders.jsx`)

#### Manual Import Workflow:
1. User goes to Shiprocket tab and clicks "Sync Now"
2. Orders appear in Shiprocket tab only
3. User switches to Orders tab
4. User enters last 4 digits of order number or AWB code
5. System searches through synced Shiprocket orders
6. Auto-fills: customer name, phone, address, platform, selling price, product name
7. User selects outfit and completes manual import

#### Search Logic:
```javascript
// Searches by:
- Last 4 digits of order number
- Full order number
- AWB tracking code
```

### 4. App-Level Changes (`src/App.jsx`)

#### Tab Persistence:
Changed from conditional rendering to `display: none` approach:
```jsx
// Before: Components unmount when switching tabs
{activeTab === 'orders' && <Orders />}

// After: Components stay mounted, just hidden
<div style={{ display: activeTab === 'orders' ? 'block' : 'none' }}>
  <Orders />
</div>
```

**Benefits:**
- ✅ Form data persists when switching tabs
- ✅ Shiprocket orders stay loaded in memory
- ✅ No re-mounting/re-fetching on tab switch
- ✅ Better UX for multi-step workflows

## Key Issues Fixed

### 1. Data Quality Issue
**Problem**: Using `/shipments` endpoint showed "Unknown" for customer names  
**Solution**: Switched to `/orders` endpoint with complete customer data  
**Trade-off**: Limited to ~58 orders but with full details

### 2. Firebase Quota Exceeded
**Problem**: Writing 178 orders too quickly hit rate limits  
**Solution**: Added 500ms throttle delay every 5 writes  
```javascript
if ((i + 1) % 5 === 0) {
    await new Promise(resolve => setTimeout(resolve, 500))
}
```

### 3. Data Disappearing on Tab Switch
**Problem**: Orders disappeared when switching between tabs  
**Solution**: 
- Added Firestore loading on component mount
- Changed tab rendering to use `display: none` instead of unmounting
- Added parent state refresh callback

### 4. Import Not Finding Orders
**Problem**: Orders tab couldn't find synced Shiprocket orders  
**Solution**: Added `onRefreshOrders` callback to reload `allOrders` after sync

### 5. All Orders Expanding Together
**Problem**: Clicking expand on one order expanded all orders  
**Solution**: Changed from `order.id` to `order.shiprocketOrderId` for tracking expanded state  
**Root Cause**: Freshly synced orders don't have Firestore `id` yet (all `undefined`)

## Technical Specifications

### API Endpoint Used
- **URL**: `https://apiv2.shiprocket.in/v1/external/orders`
- **Authentication**: Bearer token via email/password
- **Pagination**: 100 records per page
- **Rate Limits**: Handled with write throttling

### Database Schema
**Collection**: `production_orders`

**Fields Added for Shiprocket Orders**:
```javascript
{
  shiprocketOrderId: Number,    // Unique Shiprocket ID
  source: 'shiprocket',         // Identifies origin
  platform: 'Shiprocket',       // Display badge
  awb: String,                  // Tracking number
  trackingNumber: String,       // Same as AWB
  items: [{
    channel_sku: String,
    product_cost: Number,
    discount: Number,
    selling_price: Number
  }],
  createdAt: Timestamp          // Firestore server timestamp
}
```

### Performance Optimizations
1. **Deduplication**: Checks existing orders before inserting
2. **Batch Loading**: Fetches all pages in sequence
3. **Silent Auto-sync**: No UI updates during background sync
4. **Component Persistence**: No re-mounting on tab switches

## User Workflow

### Sync Orders
1. Navigate to "Shiprocket Orders" tab
2. (Optional) Adjust date filters
3. Click "Sync Now"
4. Watch progress: "Fetching page X of Y..."
5. See orders appear in list with full details

### Import Individual Order
1. Go to "Orders" tab
2. Scroll to "Import from Shiprocket" section
3. Enter last 4 digits (e.g., "1163" for order "PoshakhFC1163")
4. Click "Import"
5. Form auto-fills with customer details
6. Select outfit from inventory
7. Complete order as normal

### View Order Details
1. In Shiprocket tab, click any order card
2. Expands to show:
   - Full address
   - Email
   - AWB tracking
   - Item details (SKU, cost, discount, selling price)
   - Order date and status

## Limitations & Trade-offs

### Current Constraints
- **Max ~58 orders**: Using `/orders` endpoint instead of `/shipments` for data quality
- **Write throttling**: Syncing 58 orders takes ~6 seconds (500ms every 5 writes)
- **Memory usage**: All tabs stay mounted (slight increase, negligible for modern browsers)

### Future Enhancements (Not Implemented)
- Hybrid approach: Merge `/orders` + `/shipments` data by order ID
- Real-time webhook integration for instant updates
- Automatic matching: Link Shiprocket orders to existing inventory by SKU
- Bulk import: Import multiple orders at once

## Files Modified

```
backend/
  └── server.js                    [Added Shiprocket endpoints]

src/
  ├── App.jsx                      [Tab persistence + refresh callback]
  └── components/
      ├── ShiprocketOrders.jsx     [New component - full implementation]
      └── Orders.jsx               [Import form integration]
```

## Testing Checklist

- [x] Backend authenticates with Shiprocket
- [x] Pagination fetches all available orders
- [x] Customer names display correctly
- [x] Items show SKU, cost, discount, selling price
- [x] Orders persist in Firestore
- [x] Data survives tab switches
- [x] No Firebase quota errors during sync
- [x] Import form finds orders by last 4 digits
- [x] Import form auto-fills all customer details
- [x] Expand/collapse works independently per order
- [x] Auto-sync runs every 30 seconds
- [x] Sort by date works (newest/oldest)
- [x] Date filters apply correctly
- [x] Delete all orders works

## Environment Variables Required

```env
# In backend/.env or similar
SHIPROCKET_EMAIL=your-email@example.com
SHIPROCKET_PASSWORD=your-password
```

## Maintenance Notes

### If orders aren't syncing:
1. Check backend logs: `tail -f /tmp/server.log`
2. Verify Shiprocket credentials are valid
3. Test auth endpoint: `curl -X POST http://localhost:3001/api/shiprocket/auth`
4. Check date filter range includes recent orders

### If import can't find orders:
1. Ensure you've clicked "Sync Now" in Shiprocket tab first
2. Verify orders appear in Shiprocket tab
3. Check browser console for `allOrders` array
4. Confirm order number matches (try full number, not just last 4)

### If data disappears:
1. Check Firestore connection (Firebase config valid?)
2. Verify write permissions in Firestore rules
3. Look for quota errors in browser console

## Success Metrics

✅ **Data Quality**: All customer names and details visible  
✅ **Performance**: 58 orders sync in ~6 seconds  
✅ **Reliability**: No Firebase quota errors  
✅ **UX**: Form data persists across tab switches  
✅ **Automation**: Auto-sync every 30 seconds keeps data fresh  

---

**Implementation Date**: January 23, 2026  
**Status**: ✅ Complete and Production-Ready
