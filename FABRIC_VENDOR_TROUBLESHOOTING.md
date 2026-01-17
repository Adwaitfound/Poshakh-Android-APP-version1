# Fabric & Vendor Management - Troubleshooting Guide

## Issue: "No vendors found" message shows

**Cause**: You haven't created any vendors yet

**Solution**:

1. Go to the "Vendors" tab (truck icon 🚚)
2. Click the form section to expand it
3. Fill in vendor details (Name, contact, etc.)
4. Click "Add Vendor" button
5. Once vendor is created, return to Add Item form
6. The vendor dropdown should now show your vendors

---

## Issue: Fabric not appearing in inventory after adding

**Cause**: Data refresh didn't complete, or form had validation error

**Solution**:

1. Check for error message in red box at top of form
2. Make sure ALL required fields are filled:
   - Item name ✓
   - Total length (must be > 0) ✓
   - Length per outfit (must be > 0) ✓
   - Cost per meter (must be > 0) ✓
3. Wait 2-3 seconds after clicking submit
4. Manually refresh the page if needed (Cmd+R)
5. Fabric should appear in Inventory tab

---

## Issue: Vendor name not showing on fabric card

**Cause**: Vendor wasn't selected when fabric was added, OR vendor ID got deleted

**Solution**:

1. Click on fabric to open detail modal
2. Click "Edit" button
3. Re-select the vendor from dropdown
4. Save changes
5. Vendor name should now appear on card (📦 name)

---

## Issue: Transport/Other costs not calculating

**Cause**: Fields might be empty, or need refresh

**Solution**:

1. Open fabric detail modal
2. Check if transport and other cost fields have values
3. The actual cost per meter is calculated as:
   - Base cost + (Transport + Other) ÷ Total Length
4. Example: ₹450 + (₹500 + ₹200) ÷ 10m = ₹520/m
5. Refresh page to see updated calculation

---

## Issue: Can't submit the form - button is disabled

**Cause**: Missing required field or form is still uploading

**Solution**:

1. Check for red error box at top
2. Make sure:
   - Item name is not empty ✓
   - Total length is a number > 0 ✓
   - Length per outfit is a number > 0 ✓
   - Cost per meter is a number > 0 ✓
3. Wait if "Saving..." is showing (don't click multiple times)
4. Check internet connection if stuck

---

## Issue: Old fabric data still showing

**Cause**: Browser cache not cleared, or data refresh failed

**Solution**:

1. **Hard refresh**: Press Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. Check Firebase database in browser console:
   - Right-click → Inspect → Console
   - Should see "Loaded X fabrics" messages
3. Check if new fabric is in database:
   - Firebase Console → Fabrics collection → search for your item
4. If in database but not showing, it might be a filter issue

---

## Issue: Vendor not selected despite dropdown showing vendor

**Cause**: Selection might not have registered, or vendor was deleted

**Solution**:

1. Clear the form completely:
   - Refresh page (Cmd+R)
2. Re-enter all information
3. Click vendor dropdown SLOWLY
4. Select vendor and wait 1 second before moving to next field
5. Try submitting again

---

## Issue: Notification not showing after adding fabric

**Cause**: Notification system might not be loaded, or callback didn't fire

**Solution**:

1. Check the Inventory tab - new fabric should be there
2. Click on the fabric to confirm it was saved
3. Even if notification didn't show, the fabric is in the database
4. Refresh page to see updated list

---

## Quick Checklist When Adding Fabric

- [ ] Vendor created in Vendors tab first
- [ ] "Fabric" option selected (not "Outfit")
- [ ] Item name filled in
- [ ] Total length > 0
- [ ] Length per outfit > 0
- [ ] Cost per meter > 0
- [ ] Vendor selected from dropdown (shows checkmark)
- [ ] Purchase details optional but recommended
- [ ] No red error messages showing
- [ ] Click green submit button
- [ ] See success notification
- [ ] Check Inventory tab for new fabric

---

## Testing the Complete Flow

1. **Create Vendor**:

   - Go to Vendors tab
   - Add: Name, contact info
   - Click submit

2. **Add Fabric**:

   - Go to Inventory → Add Item
   - Select Fabric
   - Enter: Name, length, cost
   - Select vendor from dropdown
   - Add invoice/date (optional)
   - Submit

3. **Verify**:

   - Fabric appears in inventory list
   - Vendor name shows on card
   - Click to view full details
   - See "Vendor & Purchase Details" section

4. **Use in Production**:
   - Create production batch
   - Select this fabric
   - All vendor/cost info available for reference

---

## Performance Tips

✅ Keep vendors list up to date (removes old, unused suppliers)  
✅ Add invoice numbers for all purchases (helps with audits)  
✅ Record transport costs to get accurate fabric costs  
✅ Use descriptive fabric names (helps when selecting for production)

---

## Getting Help

If issue persists:

1. Screenshot the error message
2. Check browser console for red errors (F12 → Console)
3. Check if vendor exists in Vendors tab
4. Verify internet connection is stable
5. Try in a different browser if available
