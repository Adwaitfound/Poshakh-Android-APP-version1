# Shopdeck QR Code Generation Guide

## Overview

Since Shopdeck doesn't provide native QR codes for orders like Shopify does, the Poshakh app now includes a built-in **Shopdeck QR Generator** that creates scannable QR codes from your Shopdeck order data. This allows you to use the same barcode scanning workflow for both Shopify and Shopdeck orders.

## Feature Implementation

### Option B: Full Data Format ✅

The implementation uses **Option B (Rich Format)** - full pipe-delimited order data:

```
OrderID|CustomerName|Phone|Address|TotalPrice|Quantity x Item
```

**Example:**

```
NS0A179F4F82A8AA8B|Pattabiraman chandramouli|9876543210|Plot 20-21, Hyderabad - 500009|Rs. 1280|1x Halter Neck Racerback Dress (L) (SKU: 9OUf5HR)
```

This format ensures that when you scan the generated QR code, all order details are automatically populated in the form - just like Shopify orders.

## How to Use

### Step 1: Enter Shopdeck Order Details

1. In the **Orders** section, select **"Shopdeck"** from the Platform dropdown
2. Fill in the required fields:
   - **Order Number**: Your Shopdeck Order ID (e.g., `NS0A179F4F82A8AA8B`)
   - **Customer Name**: Customer's full name
   - **Phone**: Contact number
   - **Address**: Shipping address
   - **Outfit**: Select the product from inventory
   - **Size, Quantity, Price**: Order specifics

### Step 2: Generate QR Code

Once you've filled in the basic details, a new button appears:

```
[🔷 Generate QR Code for Shopdeck]
```

Click this button to open the QR generator modal.

### Step 3: QR Generator Modal

The modal shows:

- 📱 **QR Code Preview**: Large, scannable QR code image
- 📋 **Order Information**: Summary of encoded data
- **Encoded Data Format**: The exact pipe-delimited string being encoded

### Step 4: Download or Print

Choose your action:

| Action                     | Use Case                                               |
| -------------------------- | ------------------------------------------------------ |
| **Print QR Code**          | Print directly to a label printer for the packing slip |
| **Download QR Code (PNG)** | Save as image, print later, or attach to documents     |
| **Copy QR Data**           | Copy the raw pipe-delimited string to clipboard        |

## Practical Workflow

### For Each Shopdeck Order:

1. **Open Poshakh App** → Orders section
2. **Set Platform**: Shopdeck
3. **Enter Order Details**: From your packing slip
4. **Click "Generate QR Code"**
5. **Print the QR**: Attach it to your packing slip or label
6. **Later, Scan It**: Use the barcode scanner to auto-fill future orders with same customer/product

### When Receiving Orders:

1. **Scan the Generated QR** with the barcode scanner
2. Order details auto-fill automatically
3. Verify in the review modal
4. Confirm to create order

## Technical Details

### Data Format

The pipe-delimited format supports automatic parsing:

```
Column 1: Order ID/Number (Shopdeck Order ID)
Column 2: Customer Name
Column 3: Phone Number
Column 4: Full Address (includes city and postal code)
Column 5: Total Price (with Rs. prefix)
Column 6: Items (quantity x product name with SKU)
```

### QR Generation Method

- **Service**: QR Server API (free, no API key required)
- **Size**: 300x300 pixels (print-friendly)
- **Format**: PNG image
- **URL Format**: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=<encoded_data>`

### Parser Integration

The existing barcode parser (`src/lib/barcodeParser.js`) automatically:

- Detects Shopdeck format using platform detection logic
- Parses pipe-delimited data
- Fills all form fields
- Sets platform correctly for auto-fill

## Example Workflow

### Scenario: Manual Shopdeck Order Entry

**Packing Slip Data:**

- Order ID: `NS0A179F4F82A8AA8B`
- Customer: Pattabiraman chandramouli
- Phone: 9876543210
- Address: Plot 20-21 Sanjeevitha Nagar, Hyderabad 500009
- Product: Halter Neck Racerback Dress (L) - MidnightBloom
- SKU: 9OUf5HR
- Price: ₹1280
- Quantity: 1

**Steps:**

1. Fill form with above details
2. Click "Generate QR Code for Shopdeck"
3. Print the QR code
4. Attach to packing slip with order details
5. When ready to scan, use the Poshakh barcode scanner
6. All details auto-fill, just confirm to create order

## Benefits vs Alternatives

### Option A (Order ID Only) ❌

- Simple QR code
- **Downside**: Requires manual lookup of customer/address/product

### Option B (Full Data) ✅ **Selected**

- Full auto-fill experience
- Consistent with Shopify workflow
- No manual lookups needed
- Same scanner works for both platforms

## Troubleshooting

### QR Code Won't Load in Modal

**Issue**: "Failed to load QR code image"

**Solutions:**

1. Check internet connection
2. Ensure order details are complete
3. Try refreshing the page
4. Use "Copy QR Data" and generate manually at qr-server.com

### Font/Size Issues When Printing

**Solutions:**

- Adjust print zoom (100% recommended)
- Use label printer settings if available
- QR code size is 300x300 pixels (good for standard labels)

### QR Code Data String Too Long

**Info**: Maximum QR code capacity is ~4,000 characters. Current format is ~150-200 chars, so this shouldn't be an issue.

### Scanner Not Recognizing Generated QR

**Steps to debug:**

1. Open the generated PNG in an image viewer
2. Test with your phone camera app
3. If phone camera works but Poshakh scanner doesn't:
   - Adjust lighting in the app
   - Ensure QR code is printed clearly
   - Try different zoom levels in scanner

## Files Involved

| File                                     | Purpose                                      |
| ---------------------------------------- | -------------------------------------------- |
| `src/lib/shopdeckQRGenerator.js`         | QR data generation utility (already existed) |
| `src/components/ShopdeckQRGenerator.jsx` | React component for QR modal                 |
| `src/components/Orders.jsx`              | Integration with Orders form                 |
| `src/lib/barcodeParser.js`               | Parser for Shopdeck format detection         |

## Future Enhancements

Potential improvements for later:

- Batch QR generation for multiple orders
- Built-in label printer integration
- QR history/template storage
- Custom QR styling (logo, colors)
- Barcode alternatives (Code128, EAN-13) for Shopdeck compatibility

## Support

For issues or questions:

1. Check the QR data in the modal (Encoded Data Format section)
2. Verify all required fields are filled
3. Test the QR code with your phone camera first
4. Ensure proper lighting when scanning in the app

---

**Status**: ✅ Production Ready  
**Last Updated**: February 2026  
**Platform**: Shopdeck Manual Orders
