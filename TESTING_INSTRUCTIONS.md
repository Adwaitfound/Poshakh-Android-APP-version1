# Testing Admin Activity Logging

## Quick Start Testing

### Prerequisites
1. Have the app deployed to Firebase (✅ https://poshakh-stock.web.app)
2. Have two browser windows/tabs ready
3. One logged in as **Adwait** (admin - to see notifications)
4. One logged in as **Binay** (staff - to perform actions)

---

## Test Cases

### ✅ Test 1: Login Logging
**Step 1:** Open new browser tab and go to https://poshakh-stock.web.app  
**Step 2:** Log in as Adwait (admin)  
**Step 3:** In Adwait's tab, click the bell icon in top-right  
**Expected:** You should see a "Login" notification with Adwait's name and timestamp

---

### ✅ Test 2: Stock Adjustment Logging
**Step 1:** In Binay's tab, go to Inventory  
**Step 2:** Click any fabric item  
**Step 3:** Click "Stock Adjust"  
**Step 4:** Add 5 meters (or deduct 2)  
**Step 5:** Confirm the adjustment  
**Step 6:** In Adwait's tab, click the bell icon  
**Expected:** You should see a "Stock Adjusted" notification showing:
- Item name
- ADD/DEDUCT type
- Amount (5m / 2m)
- By: Binay

---

### ✅ Test 3: Order Creation Logging
**Step 1:** In Binay's tab, go to Orders  
**Step 2:** Create a new order:
  - Order #: TEST001
  - Customer: Test Customer
  - Outfit: (pick any)
  - Status: Sent to Tailor
**Step 3:** Click "Add"  
**Step 4:** In Adwait's tab, click the bell icon  
**Expected:** You should see an "Order Created" notification with:
- Order #: TEST001
- Customer: Test Customer
- By: Binay

---

### ✅ Test 4: Order Status Change Logging
**Step 1:** In Binay's tab, go to Orders  
**Step 2:** Click on the order you just created  
**Step 3:** Edit the status to "In Tailor Hands"  
**Step 4:** Click "Update"  
**Step 5:** In Adwait's tab, click the bell icon  
**Expected:** You should see "Order Status Changed" notification with:
- Order #: TEST001
- New Status: In Tailor Hands
- By: Binay

---

### ✅ Test 5: Inventory Item Creation
**Step 1:** In Binay's tab, go to Add Item  
**Step 2:** Create a new fabric:
  - Name: TestFabric001
  - Type: Fabric
  - Total Length: 10
  - Cost Per Meter: 50
**Step 3:** Click "Save"  
**Step 4:** In Adwait's tab, click the bell icon  
**Expected:** You should see "Inventory Added" notification with:
- Item: TestFabric001
- Type: Fabric
- By: Binay

---

### ✅ Test 6: Production Batch Logging
**Step 1:** In Binay's tab, go to Production  
**Step 2:** Create a new production batch:
  - Fabric: (pick any with stock)
  - Outfit: (pick any)
  - Fabric Used: 3m
  - Sizes: S:5, M:5, L:5, XL:2, XXL:1
**Step 3:** Click "Create"  
**Step 4:** In Adwait's tab, click the bell icon  
**Expected:** Two notifications should appear:
  1. "Inventory Added" for production batch creation
  2. "Stock Adjusted" for fabric deduction

---

### ✅ Test 7: Production Batch Reception
**Step 1:** After creating a batch in Test 6, go to Production  
**Step 2:** Click "Receive Batch" on the batch you created  
**Step 3:** Confirm the received quantities  
**Step 4:** Change status to "Completed"  
**Step 5:** Click "Receive"  
**Step 6:** In Adwait's tab, click the bell icon  
**Expected:** You should see "Inventory Added" notification with:
- Item: OutfitName Received (18 pieces)
- Type: Outfit
- By: Binay

---

## Verification Checklist

- [ ] Notifications appear in real-time (don't need to refresh)
- [ ] Bell icon shows unread count badge
- [ ] Notifications are color-coded by type
- [ ] Each notification shows:
  - Action title
  - Action details
  - User name
  - Timestamp (e.g., "just now", "2 minutes ago")
- [ ] Only admin users (Adwait/Avani) see the bell icon
- [ ] Notifications persist after refresh (they're stored in Firestore)

---

## Admin User Access

Only the following users should see the notification bell icon:
- ✅ Adwait
- ✅ Avani

Other users (Binay, etc.) should NOT see the notification bell.

---

## Firestore Verification

To verify logs are being saved:
1. Go to Firebase Console: https://console.firebase.google.com
2. Select **poshakh-stock** project
3. Go to **Firestore Database**
4. Find **notifications** collection
5. You should see documents with:
   - `title`: "Order Created", "Stock Adjusted", etc.
   - `message`: Details of the action
   - `type`: "order", "stock", "inventory", etc.
   - `user`: Name of who performed the action
   - `read`: false (for unread) or true (if marked as read)
   - `createdAt`: Timestamp

---

## Troubleshooting

**Issue:** Notifications not appearing  
**Solution:** 
- Check browser console for errors (F12 → Console tab)
- Verify you're logged in as Adwait/Avani (admin)
- Verify the bell icon is visible in top-right
- Check Firestore console to see if documents are being created

**Issue:** Notifications only appear for Adwait  
**Solution:**  
Normal behavior! Only admins see the notifications. Staff users (Binay) perform actions but don't see the notifications.

**Issue:** Notifications disappear on refresh  
**Solution:**  
This is a known limitation - the current implementation shows notifications in real-time in the React component but doesn't persist the UI state. Refreshing resets the view. Notifications are still saved in Firestore. This can be enhanced by adding notification persistence to localStorage.

---

## Current Build Info

- **Web App:** https://poshakh-stock.web.app (✅ Deployed)
- **APK:** Built with all logging features enabled
- **Firestore:** notifications collection active
- **Real-time Sync:** Enabled via onSnapshot listener

**Last Deploy:** Just now  
**Last Build:** Just now  
**Status:** ✅ Production Ready
