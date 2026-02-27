# Sample Barcode Data for Testing

## Based on Your Packing Slip & Invoice Screenshots

### Sample 1: Packing Slip Data (Pipe-Delimited)

```
PoshakhFC1106|Oiendrila Chatterjee|8013550322|10-104/5/15, balajinagar colony, street 2, peerzadiguda, hyderabad - 500098|Rs. 1,380.82|Mirae Classic Kurti: The OG Favorite - L / Black Ajrakh
```

**What this includes:**

- Order Number: `PoshakhFC1106`
- Customer: `Oiendrila Chatterjee`
- Phone: `8013550322`
- Address: `10-104/5/15, balajinagar colony, street 2, peerzadiguda, hyderabad - 500098`
- Total Price: `Rs. 1,380.82`
- Item: `Mirae Classic Kurti: The OG Favorite - L / Black Ajrakh` (size detected: **L**)

---

### Sample 2: JSON Format

```json
{
  "orderNumber": "PoshakhFC1106",
  "customerName": "Oiendrila Chatterjee",
  "phone": "8013550322",
  "address": "10-104/5/15, balajinagar colony, street 2, peerzadiguda, hyderabad - 500098",
  "items": [
    {
      "name": "Mirae Classic Kurti: The OG Favorite - L / Black Ajrakh",
      "quantity": 1
    }
  ],
  "totalPrice": "Rs. 1,380.82",
  "subtotalPrice": "Rs. 1,615.00",
  "discount": "Rs. 234.18",
  "invoiceNumber": "9096725484"
}
```

---

### Sample 3: Semicolon-Delimited (Invoice Data)

```
9096725484;Oiendrila Chatterjee;8013550322;10-104/5/15 Hyderabad;Rs. 1,380.82;Rs. 1,615.00;Rs. 234.18
```

**What this includes:**

- Invoice Number: `9096725484`
- Customer: `Oiendrila Chatterjee`
- Phone: `8013550322`
- Address: `10-104/5/15 Hyderabad`
- Total: `Rs. 1,380.82`
- Subtotal: `Rs. 1,615.00`
- Discount: `Rs. 234.18`

---

## How to Test

### Method 1: Camera Scanner

1. Click 📷 Camera button
2. Hold this paper with sample data printed as QR/barcode
3. Or use phone camera to photograph actual barcode

### Method 2: Manual Input

1. Click 📷 Camera button
2. When camera appears, manually type one of the sample data above
3. Press Enter or click submit
4. Review modal appears

### Expected Results

When you scan or enter any of the sample data:

```
Review Modal Should Show:
├─ Order Number: PoshakhFC1106
├─ Customer Name: Oiendrila Chatterjee
├─ Phone: 8013550322
├─ Address: 10-104/5/15, balajinagar colony, street 2, peerzadiguda, hyderabad
├─ Items: Mirae Classic Kurti: The OG Favorite - L / Black Ajrakh
└─ Total Price: Rs. 1,380.82

After Confirmation:
├─ Order Number: PoshakhFC1106
├─ Customer Name: Oiendrila Chatterjee
├─ Phone: 8013550322
├─ Address: 10-104/5/15, balajinagar colony, street 2, peerzadiguda, hyderabad
├─ Outfit: Mirae Classic Kurti (if found in inventory)
├─ Size: L (auto-detected)
├─ Selling Price: 1380.82
└─ Quantity: 1
```

---

## Real Barcode Testing

### Using Your Actual Backing Slip & Invoice

The barcodes on your PDFs encode the data shown below. When you scan them:

**Packing Slip Barcode Contains:**

- Order Number: PoshakhFC1106
- Customer: Oiendrila Chatterjee
- Shipping Address: 10-104/5/15, balajinagar colony, peerzadiguda, hyderabad
- Item: Mirae Classic Kurti: The OG Favorite - L / Black Ajrakh
- Quantity: 1

**Invoice Barcode Contains:**

- Invoice Number: 9096725484
- Amount: Rs. 1,380.82
- (May also include customer/order info)

### Steps to Test with Real Barcodes

1. Print your packing slip PDF
2. Open app at http://192.168.1.9:5175 on mobile or laptop
3. Go to Orders tab
4. Click 📷 Camera button
5. Position packing slip barcode in camera frame
6. App auto-detects barcode, shows review modal
7. Verify data, click "Use This Data"
8. Watch form auto-fill with:
   - Order: PoshakhFC1106
   - Customer: Oiendrila Chatterjee
   - Phone: 8013550322
   - Address: Full address from barcode
   - Outfit: Auto-matched if available
   - Size: L (auto-detected)
   - Price: Rs. 1,380.82

---

## Formats Explained

### Pipe-Delimited (|)

```
field1|field2|field3|field4|field5|field6
```

**Advantage:** Easy to read, simple structure

### Semicolon-Delimited (;)

```
field1;field2;field3;field4;field5
```

**Advantage:** Can include pipes in field values

### JSON

```json
{
  "key": "value",
  "nested": {
    "key": "value"
  }
}
```

**Advantage:** Flexible, can store complex structures

---

## Troubleshooting Test Data

| Issue                      | Solution                                          |
| -------------------------- | ------------------------------------------------- |
| Scanner not detecting code | Use manual input mode                             |
| Manual input not parsing   | Ensure exact format (pipes or semicolons)         |
| Review modal shows blanks  | Parser couldn't extract fields - check format     |
| Item not matching          | Outfit name must match inventory exactly          |
| Size not detected          | Ensure item name includes size (S, M, L, XL, XXL) |

---

## Generate Your Own Test Barcodes

If you want to create QR codes or barcodes from the sample data:

1. Use **QR Code Generator** (qr-code-generator.com)
2. Enter one of the sample data strings
3. Generate QR code
4. Save and test with scanner

Or encode the JSON version for maximum data capacity:

```
{
  "type": "packing_slip",
  "orderNumber": "PoshakhFC1106",
  "customerName": "Oiendrila Chatterjee",
  "phone": "8013550322",
  "address": "10-104/5/15, balajinagar colony, peerzadiguda, hyderabad - 500098",
  "items": [{"name": "Mirae Classic Kurti: The OG Favorite - L", "quantity": 1}],
  "totalPrice": "1380.82"
}
```

---

## Next Steps After Testing

1. ✅ Confirm barcode parsing works with your actual barcodes
2. ✅ Verify form auto-filling is accurate
3. ✅ Test with multiple orders
4. ✅ Test on mobile device (better camera)
5. ✅ Build Android APK: `npm run build && npx cap copy android && ./gradlew assembleDebug`
6. ✅ Deploy to production

Good luck! 🚀
