# How to Test Shiprocket Integration

## Prerequisites

1. **Backend running**:
   ```bash
   cd backend
   npm run dev
   ```
   Should see: `✅ Poshakh backend running on http://localhost:3001`

2. **Shiprocket credentials configured** in `backend/.env`:
   - `SHIPROCKET_EMAIL` ✓
   - `SHIPROCKET_PASSWORD` ✓
   - Credentials should be valid Shiprocket login

3. **Frontend running**:
   ```bash
   npm run dev
   ```
   App should be at `http://localhost:5173` (or next available port)

## Test Steps

### 1. Test Backend Connectivity
Open in browser or curl:
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","store":"poshakh-dev-store.myshopify.com"}
```

### 2. Test Shiprocket Authentication
```bash
curl -X POST http://localhost:3001/api/shiprocket/auth
# Should return: {"message":"Shiprocket authenticated","token":"..."}
```

### 3. Test Order Fetching
```bash
curl http://localhost:3001/api/shiprocket/orders?page=1&per_page=10
# Should return: {"success":true,"orders":[...],"pagination":{...}}
```

### 4. Test App Integration

**Step 1**: Open app → **Orders** tab

**Step 2**: Look for the orange **"Sync Shiprocket"** button at the top right

**Step 3**: Click the button

**Step 4**: Watch for:
- Button becomes disabled with spinner
- Status message appears: "Connecting to Shiprocket..."
- Message changes to: "Found X orders. Syncing to Firestore..."
- Final message: "Sync complete! X synced, 0 failed"

**Step 5**: Check for new orders:
- Scroll through order list
- New orders should have `platform: "Shiprocket"`
- Should see customer name, phone, address from Shiprocket

### 5. Test Duplicate Prevention

**Step 1**: Click "Sync Shiprocket" again

**Step 2**: Check that:
- Same number of orders shown as previous sync
- No duplicate orders created
- Status message shows "X synced" (same count as before)

### 6. Test AWB Scanning

**Step 1**: Get an AWB from a Shiprocket order (in the UI, it should show as "trackingNumber")

**Step 2**: In Orders tab, paste the AWB in the scan field at top

**Step 3**: Form should auto-fill with:
- Order number
- Customer name
- Phone
- Address

## Common Issues & Fixes

### Issue: "Shiprocket token not configured"
**Fix**: Make sure `backend/.env` has:
```
SHIPROCKET_EMAIL=valid-email
SHIPROCKET_PASSWORD=valid-password
```

### Issue: Auth returns 401 Unauthorized
**Fix**: Double-check credentials are correct for your Shiprocket account

### Issue: No orders fetched
**Check**:
1. Do you have orders in Shiprocket account?
2. Are orders in a shipped status?
3. Check browser console for errors (F12 → Console tab)
4. Check terminal where backend is running for error logs

### Issue: Orders don't appear after sync
**Check**:
1. Go to Firebase → Firestore → `orders` collection
2. Filter by `source == "shiprocket"`
3. Should see new documents there
4. If yes, might be a UI refresh issue - reload page

### Issue: Build fails
**Fix**: Clean and rebuild
```bash
rm -rf dist
npm run build
```

## Monitoring

### Check Firestore for synced orders:
1. Firebase Console → Firestore
2. Collection: `orders`
3. Filter where `source == "shiprocket"`
4. Should see documents with:
   - `shiprocketOrderId`
   - `awb`
   - `customerName`
   - `platform: "Shiprocket"`

### Check backend logs:
```
✅ Created Shiprocket order: SHP-1234567
✅ Updated Shiprocket order: SHP-1234568
```

## Success Criteria

✅ Backend `/api/shiprocket/orders` returns order list
✅ "Sync Shiprocket" button appears in Orders tab
✅ Clicking button shows progress messages
✅ Orders appear in order list after sync
✅ Orders have Shiprocket platform badge
✅ Syncing again doesn't create duplicates
✅ AWB scanning prefills form

## Next Steps

1. Deploy to Firebase: `npm run deploy`
2. Set up backend hosting (Heroku, Railway, etc.)
3. Update app with backend URL: Set `VITE_BACKEND_URL` env var
4. Test in production

See `SHIPROCKET_INTEGRATION.md` for complete API reference.
