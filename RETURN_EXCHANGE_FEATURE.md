# Return & Exchange Feature Documentation

## Overview

The Return & Exchange feature has been implemented to automatically manage inventory when customers return items or exchange them for different products.

## Features Implemented

### 1. Return to Inventory Logic

When a customer returns an item:

- **Automatic Stock Restoration**: The returned quantity is automatically added back to the inventory
- **Stock Order Only**: Inventory restoration only applies to `stock` orders (not `custom` orders)
- **Size-Specific**: Returns are added to the correct size (XS, S, M, L, XL, XXL) in the `stockBreakdown`
- **Audit Trail**: All returns are logged in the order's history subcollection with type `RETURN_RECEIVED`

**Example:**

- Customer returns 2 units of "Blue Kurta" in size M
- Stock automatically increases: `stockBreakdown.M += 2`
- Order status updates to "Returned"
- History log created with timestamp, user, and details

### 2. Exchange Tracking Logic

When a customer exchanges an item for a different product:

- **Dual Inventory Updates**:
  - Returned item is added back to inventory (like a return)
  - New item is deducted from inventory (like a new order)
- **Stock Validation**: System checks if the new item has sufficient stock before processing
- **Exchange Details Saved**: Order is updated with complete exchange information:
  ```javascript
  exchangeDetails: {
    returnedOutfit: "Original Outfit ID",
    returnedSize: "M",
    exchangedOutfit: "New Outfit ID",
    exchangedSize: "L",
    additionalCost: 100 // If customer paid extra
  }
  ```
- **Audit Trail**: Two history entries are created:
  - `EXCHANGE_RETURN`: Logs the returned item being added to inventory
  - `EXCHANGE_GIVEN`: Logs the new item being deducted from inventory

### 3. UI Components

#### Transaction Type Toggle

Users can select between:

- **Return Only**: Simple return with refund
- **Exchange**: Swap for different outfit/size

#### Return Form Fields

- Return Cost (₹): Optional refund amount
- Reason for Return: Required explanation
- Auto-notification: Shows when item will be restored to inventory

#### Exchange Form Fields

- Reason for Exchange: Why the exchange is happening
- Select Outfit: Dropdown of all available outfits with stock
- Stock Indicator: Real-time display of available sizes and quantities
- Size Selection: Choose size with live stock counts
- Quantity: How many units to exchange
- Additional Cost (₹): If customer pays price difference

## Technical Implementation

### Files Modified

1. **src/components/ReturnModal.jsx**
   - Added `transactionType` state ('return' | 'exchange')
   - Expanded form state with exchange fields
   - Implemented dual inventory update logic
   - Added stock validation for exchanges
   - Created comprehensive UI with toggle and conditional forms

2. **src/App.jsx**
   - Added `inventoryItems` and `allOrders` props to ReturnModal
   - Enables outfit selection and stock validation

### Firestore Operations

```javascript
// Return: Restore inventory
await updateDoc(outfitRef, {
  [`stockBreakdown.${size}`]: increment(quantity),
});

// Exchange: Restore returned item + Deduct new item
await updateDoc(returnedOutfitRef, {
  [`stockBreakdown.${returnedSize}`]: increment(returnedQty),
});
await updateDoc(exchangeOutfitRef, {
  [`stockBreakdown.${newSize}`]: increment(-newQty),
});
```

### History Logging

All transactions are logged to `production_orders/{orderId}/history`:

```javascript
{
  type: 'RETURN_RECEIVED' | 'EXCHANGE_RETURN' | 'EXCHANGE_GIVEN',
  amount: quantity,
  size: 'M',
  user: userProfile.name,
  timestamp: new Date()
}
```

## User Workflow

### Return Flow

1. Admin clicks "Return" on an order
2. Selects "Return Only" mode
3. Enters return cost and reason
4. System shows confirmation that stock will be restored
5. Clicks "Confirm Return"
6. Order status → "Returned"
7. Stock automatically increments
8. History logged

### Exchange Flow

1. Admin clicks "Return" on an order
2. Selects "Exchange" mode
3. Enters exchange reason
4. Selects new outfit from dropdown
5. Views available stock for selected outfit
6. Chooses size and quantity
7. Enters additional cost if applicable
8. Clicks "Confirm Exchange"
9. System validates stock availability
10. Order updated with `exchangeDetails` object
11. Returned item added to inventory
12. New item deducted from inventory
13. Two history entries created

## Validation & Safety

### Return Validation

- ✅ Only stock orders can restore inventory
- ✅ Custom orders don't affect inventory on return
- ✅ Returns require reason (empty check)

### Exchange Validation

- ✅ New outfit must be selected
- ✅ Size must be selected
- ✅ Quantity must be > 0
- ✅ Stock availability checked before processing
- ✅ Prevents exchanges if insufficient stock
- ✅ Validates selected outfit exists in inventory

### Error Handling

- Clear error messages for validation failures
- Stock availability shown in real-time
- Disabled submit button while processing
- Loading state during save operations

## Benefits

1. **Automated Inventory Management**: No manual stock adjustments needed
2. **Complete Audit Trail**: Every transaction is logged with user and timestamp
3. **Flexible Exchanges**: Track complex exchange scenarios
4. **Stock Accuracy**: Real-time validation prevents overselling
5. **Business Insights**: Exchange details help understand customer preferences

## Future Enhancements

- Return/Exchange reports and analytics
- Automated refund processing
- Email notifications to customers
- Batch exchange processing
- Return approval workflow
- Exchange cost calculations (automatic price difference)
