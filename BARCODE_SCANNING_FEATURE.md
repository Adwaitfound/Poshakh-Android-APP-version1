# Barcode Scanning Feature - Order Auto-Fill

## Overview

The barcode scanning feature allows you to quickly add orders by scanning barcodes from invoices or packing slips using your device camera. The app automatically extracts order information and prefills the order form.

## What Was Implemented

### ✅ Components Created

1. **BarcodeScanner.jsx** - Full-screen camera scanner component
   - Requests camera permissions
   - Shows live scanning interface
   - Handles barcode detection
   - Provides visual feedback

2. **barcodeParser.js** - Barcode data parsing utilities
   - Parses various barcode formats (JSON, pipe-delimited, plain text)
   - Extracts order numbers and customer data
   - Fetches full order details from Shopify
   - Matches products to inventory items
   - Detects sizes from product names/SKUs

### ✅ Integration

- **Orders.jsx** updated with:
  - Camera button next to search field (blue button with camera icon)
  - Full barcode scanning workflow
  - Auto-fill form fields from scanned data
  - Status messages for scan results

- **Backend server.js** enhanced:
  - Fetch Shopify orders by order number/name
  - Supports both REST and GraphQL APIs
  - Handles orders with #prefix or without

## How It Works

### 1. User Flow

```
User clicks Camera button
  → App requests camera permission
  → Camera opens with scanning frame
  → User positions barcode in frame
  → Barcode detected automatically
  → App parses barcode data
  → If order number found, fetches from Shopify
  → Form auto-fills with customer/order data
  → User reviews and submits
```

### 2. Data Extraction

The barcode can contain:

- Order number (e.g., "#1001", "1001")
- Customer details (if encoded)
- Product information

The app tries to:

1. Parse the barcode for structured data
2. Extract order number
3. Fetch complete order from Shopify API
4. Match products to inventory
5. Detect size from product variant

### 3. Supported Barcode Formats

- **JSON encoded**: `{"orderNumber":"1001","customerName":"John Doe",...}`
- **Pipe-delimited**: `1001|John Doe|9876543210|Address`
- **Plain order number**: `1001`, `#1001`
- **Numeric AWB/Tracking**: `8013550322`

## Features

### ✨ Smart Order Lookup

- **Local Search**: Checks existing orders first
- **Shopify Integration**: Fetches order details from Shopify
- **Product Matching**: Automatically matches order items to inventory
- **Size Detection**: Extracts size from product variant (S, M, L, XL, XXL)

### ✨ Auto-Fill Fields

When a barcode is successfully scanned, the form auto-fills:

- ✅ Order Number
- ✅ Customer Name
- ✅ Phone Number
- ✅ Shipping Address
- ✅ Platform (Shopify/Shopdeck)
- ✅ Product/Outfit (if matched)
- ✅ Size (if detected)
- ✅ Quantity

### ✨ User Experience

- **Camera Permission**: One-time permission request
- **Visual Feedback**: Animated scanning frame
- **Status Messages**: Clear success/error notifications
- **Manual Entry**: Falls back to manual entry if scan fails
- **Close Anytime**: User can cancel scanning

## Technical Details

### NPM Package

```json
{
  "@capacitor-mlkit/barcode-scanning": "^8.0.0"
}
```

### Permissions Required

- Camera access (requested at runtime)

### API Endpoints

**Backend (server.js)**:

```
GET /api/shopify/order?number={orderNumber}
```

Returns:

```json
{
  "orderNumber": "1001",
  "customerName": "Oiendrila Chatterjee",
  "phone": "8013550322",
  "address": {...},
  "items": [{
    "name": "Mirae Classic Kurti: The OG Favorite - L / Black Ajrakh",
    "sku": "...",
    "quantity": 1
  }],
  "totalPrice": "1380.82",
  "discount": "234.18"
}
```

### Barcode Parser Functions

1. **parseBarcodeData(barcodeText)** - Extract data from barcode
2. **fetchShopifyOrder(orderNumber)** - Get order from Shopify
3. **matchInventoryItem(itemName, inventory)** - Find matching product
4. **extractSize(itemName, sku)** - Detect size from text

## Usage Instructions

### For Users

1. **Click the Camera Icon** (blue button) next to search field
2. **Allow Camera Permission** when prompted
3. **Position Barcode** within the scanning frame
4. **Wait for Auto-Scan** - barcode detected automatically
5. **Review Pre-Filled Data** - verify all fields
6. **Submit Order** as usual

### Testing

To test the barcode scanning:

1. **Mock Barcode**: Use any QR/barcode generator and encode: `#1001`
2. **Test with Real Invoice**: Scan the barcode from a Shopify invoice
3. **Manual Entry**: If scan fails, type order number manually

## Status Messages

- ✅ **"Order #1001 loaded from Shopify!"** - Success
- ⚠️ **"Barcode scanned - please verify details"** - Partial success
- ❌ **"Could not parse barcode"** - Invalid barcode
- ⚠️ **"Order not found"** - Order doesn't exist in Shopify

## Build & Deployment

### Build Commands

```bash
npm run build
npx cap copy android
npx cap sync android
./gradlew assembleDebug
```

### Files Modified/Created

**New Files:**

- `src/components/BarcodeScanner.jsx` (211 lines)
- `src/lib/barcodeParser.js` (193 lines)

**Modified Files:**

- `src/components/Orders.jsx` (+160 lines for scanning logic)
- `backend/server.js` (enhanced Shopify API endpoint)
- `package.json` (added barcode scanning dependency)

## Environment Setup

Ensure backend `.env` has:

```
SHOPIFY_STORE_DOMAIN=poshakh-dev-store.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_xxxxx
```

## Troubleshooting

### Camera Not Working

- Check app has camera permission in Android settings
- Restart the app
- Try on a different device

### Barcode Not Detected

- Ensure good lighting
- Hold device steady
- Position barcode clearly in frame
- Try different distance from barcode

### Order Not Found

- Verify order exists in Shopify
- Check backend is running (`localhost:3001`)
- Check SHOPIFY_ADMIN_TOKEN is configured
- Try manual search with order number

### Form Not Auto-Filling

- Check browser console for errors
- Verify backend API is responding
- Ensure order data format matches expectations

## Future Enhancements

- [ ] Support for multiple barcodes in one scan
- [ ] Batch order import from multiple scans
- [ ] Save scanned history
- [ ] QR code support for custom data
- [ ] Offline mode with cached orders
- [ ] Multiple camera support (front/back)

## Security Notes

- Camera permission required only when scanning
- No images are stored permanently
- Barcode data is processed locally
- API calls use secure HTTPS
- Admin token stored securely in backend

---

**Status**: ✅ Fully Implemented and Ready for Testing
**Version**: 1.0
**Date**: January 19, 2026
