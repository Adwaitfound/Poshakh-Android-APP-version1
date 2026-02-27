# Barcode Scanning System - Complete Setup Guide

## Overview

The barcode scanning system reads barcode data directly from packing slips and invoices (without needing Shopify API) and allows you to review and auto-fill order forms.

## How It Works

### 1. **Two-Barcode System**

- **Packing Slip Barcode**: Contains order number, customer name, phone, address, and item details
- **Invoice Barcode**: Contains invoice number, pricing (subtotal, discount, total)

### 2. **Data Flow**

```
Scan Barcode
    ↓
Extract Data from Barcode (direct encoding)
    ↓
Display Review Modal (BarcodeDataReviewModal)
    ↓
User Reviews & Edits Data
    ↓
Auto-fill Order Form Fields
```

### 3. **Components**

#### **BarcodeScanner.jsx**

- Full-screen modal with camera interface
- Handles both web (html5-qrcode) and mobile (ML Kit) barcode detection
- Automatically stops when barcode is detected
- Has manual input fallback if camera fails

#### **BarcodeDataReviewModal.jsx** (NEW)

- Shows extracted barcode data in an editable form
- Allows user to verify, correct, or add missing information
- Shows raw barcode data in collapsed details section
- Confirms data before auto-filling order form

#### **barcodeParser.js** (UPDATED)

- `parseBarcodeData()` - Extracts data from barcode text
- Supports multiple formats: JSON, pipe-delimited (|), semicolon-delimited (;)
- Identifies barcode type (packing slip vs invoice)
- Returns structured data object

#### **Orders.jsx** (UPDATED)

- Added `handleBarcodeScanned()` - Initiates parsing and shows review modal
- Added `handleBarcodeDataConfirm()` - Processes reviewed data and auto-fills form
- Added `showBarcodeReview` and `barcodeReviewData` state
- Integrated BarcodeDataReviewModal component

## Barcode Data Formats

### Supported Barcode Encoding Formats

#### **JSON Format**

```json
{
  "orderNumber": "PoshakhFC1106",
  "customerName": "Oiendrila Chatterjee",
  "phone": "8013550322",
  "address": "10-104/5/15, balajinagar colony, street 2, peerzadiguda, hyderabad",
  "items": [
    {
      "name": "Mirae Classic Kurti: The OG Favorite - L / Black Ajrakh",
      "quantity": 1
    }
  ],
  "totalPrice": "Rs. 1,380.82",
  "invoiceNumber": "9096725484"
}
```

#### **Pipe-Delimited Format**

```
PoshakhFC1106|Oiendrila Chatterjee|8013550322|10-104/5/15, balajinagar colony|Rs. 1,380.82|Mirae Classic Kurti: The OG Favorite - L / Black Ajrakh
```

#### **Semicolon-Delimited Format**

```
PoshakhFC1106;Oiendrila Chatterjee;8013550322;10-104/5/15, balajinagar colony;Rs. 1,380.82;Mirae Classic Kurti: The OG Favorite - L / Black Ajrakh
```

## Using the System

### **Step 1: Scan Order Barcode**

1. Click **📷 Camera** button in Orders section header
2. Camera modal appears
3. Position barcode in frame - scanner auto-detects and closes
4. If camera fails, manually type the barcode data

### **Step 2: Review Data**

1. Modal shows extracted barcode data
2. Fields appear editable if values were extracted
3. You can:
   - Correct mistakes
   - Add missing information (phone, address, etc.)
   - Verify item names
   - Check pricing

### **Step 3: Confirm & Auto-fill**

1. Click **"Use This Data"** button
2. Order form auto-fills with:
   - Order Number
   - Customer Name
   - Phone
   - Address
   - Outfit/Item (matched from inventory)
   - Size (detected from item name)
   - Selling Price (from total price in barcode)

### **Step 4: Manual Editing (if needed)**

1. Review auto-filled form fields
2. Adjust outfit, size, quantity as needed
3. Add fabric cost, stitching cost, etc.
4. Create order

## Barcode Parsing Logic

### **1. Format Detection**

The parser tries formats in this order:

1. JSON parsing
2. Pipe-delimited (|)
3. Semicolon-delimited (;)
4. Pattern matching (order numbers like `#PoshakhFC1106`)
5. Pure numeric codes (AWB, invoice numbers)

### **2. Order Number Patterns**

Recognizes formats like:

- `#PoshakhFC1106`
- `ORDER:PoshakhFC1106`
- `PoshakhFC1106` (Poshakh order format)
- `9096725484` (numeric invoice/AWB)

### **3. Type Detection**

- **invoice** - If contains total/price in "Rs." format
- **packing_slip** - If contains item details
- **unknown** - Fallback for pure order numbers

## Inventory Matching

When barcode contains item name, the system:

1. Tries exact name match first
2. Falls back to partial/substring match
3. Searches by keywords
4. Auto-detects size (S, M, L, XL, XXL) from item name

Example:

- Barcode: "Mirae Classic Kurti: The OG Favorite - L / Black Ajrakh"
- Extracted size: **L**
- Matched outfit: **Mirae Classic Kurti**

## Error Handling

| Error                       | Solution                                                  |
| --------------------------- | --------------------------------------------------------- |
| Camera not available        | Manual input fallback - type barcode                      |
| Camera access denied        | Check browser permissions for camera                      |
| Barcode can't be parsed     | Review modal shows raw data - edit manually               |
| Item not found in inventory | Form auto-fills customer data, you select outfit manually |
| Missing fields              | Review modal shows editable fields - add them             |

## No Shopify API Required ✅

The barcode data is **encoded directly in the barcode**, so:

- ❌ No need for SHOPIFY_ADMIN_TOKEN
- ❌ No API calls to Shopify servers
- ❌ No internet dependency (except for barcode scanning)
- ✅ Faster processing
- ✅ Works offline after scanning

## Testing Your Barcodes

### **To test with sample data:**

1. Scan packing slip barcode (contains order info)
2. Review modal shows: orderNumber, customerName, phone, address, items
3. Confirm to auto-fill order form

**OR** manually enter barcode data for testing:

```
PoshakhFC1106|Oiendrila Chatterjee|8013550322|10-104/5/15 Hyderabad|Rs. 1380.82|Mirae Classic Kurti: The OG Favorite - L
```

## File Structure

```
src/
├── components/
│   ├── Orders.jsx (UPDATED - added review modal integration)
│   ├── BarcodeScanner.jsx (existing - camera interface)
│   └── BarcodeDataReviewModal.jsx (NEW - data review UI)
└── lib/
    └── barcodeParser.js (UPDATED - direct data extraction)

backend/
└── server.js (NO API calls needed for barcode data)
```

## Future Enhancements

1. **Batch Scanning** - Scan multiple barcodes for bulk order creation
2. **Save Templates** - Store common customer/address data
3. **Barcode Generation** - Create custom barcodes for orders
4. **Two-Step Barcodes** - Scan packing slip, then invoice for complete data
5. **Offline Queue** - Queue orders when offline, sync when connected

## Support

If barcodes aren't being detected:

1. Ensure barcode is clearly printed and not wrinkled
2. Position barcode in center of camera frame
3. Ensure good lighting
4. Try using manual input as fallback
5. Check browser console for error messages
