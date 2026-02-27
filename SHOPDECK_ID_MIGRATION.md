# Shopdeck Order ID Migration Feature

## Overview

Automatic migration tool to rename existing Shopdeck orders from old format (Shpdck23) to new format (Shpdck1023).

## What Changed

### Auto ID Generation (ShopdeckSlipUploader)

- When OCR Order ID is missing or "not available" → generates `Shpdck1000`, `Shpdck1001`, etc.
- When OCR Order ID exists → adds prefix to keep it: `NS097A...` becomes `ShpdckNS097A...`
- Counter persists in browser localStorage (survives page refresh)

### Migration Script (migrateShopdckIds.js)

Two main functions:

1. **migrateShopdeckOrderIds(firestore)**
   - Renames all Shopdeck orders: Shpdck23 → Shpdck1023
   - Adds `migratedAt` and `migratedFrom` fields
   - Logs success/failure per order
   - Returns summary: { success, failed, errors, timestamp }

2. **getMigrationStats(firestore)**
   - Checks how many orders need migration
   - Returns: { needsMigration, alreadyMigrated, otherPlatforms, total }
   - Shows sample orders in each category

### Migration UI (Orders.jsx)

- New "🔄 Migrate Shopdeck IDs" button under metrics dashboard
- Two-step workflow:
  1. Click button → Check migration stats (shows counts)
  2. If orders need migration → Confirm and execute
- Modal displays:
  - Count of orders needing migration
  - Count already migrated
  - Count for other platforms
  - Confirmation prompt before running

## How It Works

### User Flow

1. Click "🔄 Migrate Shopdeck IDs" button
2. System checks: "X orders need migration, Y already migrated"
3. Click "Migrate N Orders" to proceed
4. Confirm the action
5. Migration runs and updates Firestore
6. Success notification with results

### Technical Flow

```
Button Click
  ↓
handleCheckMigration()
  ↓
getMigrationStats() → returns { needsMigration, alreadyMigrated, ... }
  ↓
Display Stats in Modal
  ↓
User clicks "Migrate"
  ↓
handleExecuteMigration()
  ↓
migrateShopdeckOrderIds()
  ↓
Loop through all orders:
  - Check if Shpdck + 1-3 digits (Shpdck23)
  - Convert to Shpdck + 4+ digits (Shpdck1023)
  - Add timestamps and tracking fields
  ↓
Update Firestore documents
  ↓
Return summary { success, failed, errors }
  ↓
Show notification and refresh data
```

## Files Modified

1. **src/components/ShopdeckSlipUploader.jsx**
   - Added `getNextShopdeckOrderId()` function
   - Added `normalizeOrderId()` function
   - Auto-applies Shpdck prefix to OCR order IDs
   - Generates counter-based IDs when missing
   - localStorage key: `'shopdeckOrderIdCounter'`

2. **src/lib/migrateShopdckIds.js** (NEW)
   - `migrateShopdeckOrderIds(firestore)` - executes migration
   - `getMigrationStats(firestore)` - checks migration stats
   - Complete with error handling and logging

3. **src/components/Orders.jsx**
   - Added migration imports
   - Added state: `migrationStats`, `isMigrating`, `showMigrationModal`
   - Added handlers: `handleCheckMigration()`, `handleExecuteMigration()`
   - Added migration modal UI
   - Added "🔄 Migrate Shopdeck IDs" button to dashboard

## Limitations & Notes

- **One-time operation**: Run once to migrate all old IDs
- **Non-reversible**: Renamed orders keep tracking fields (migratedFrom, migratedAt) but cannot be reversed
- **Safety**: Requires explicit confirmation before running
- **Atomicity**: Each order updated individually (if one fails, others still migrate)
- **Counter reset**: localStorage counter only resets if manually cleared

## Example Transformations

| Old Format               | New Format | Counter |
| ------------------------ | ---------- | ------- |
| Shpdck23                 | Shpdck1023 | +1000   |
| Shpdck5                  | Shpdck1005 | +1000   |
| Shpdck999                | Shpdck1999 | +1000   |
| ShpdckNS... (new format) | No change  | Skipped |

## Testing the Migration

### Pre-Migration Check

1. Click "🔄 Migrate Shopdeck IDs"
2. Wait for stats to load
3. Note count of orders needing migration
4. Close without running (safe, just checking)

### Run Migration

1. Click "🔄 Migrate Shopdeck IDs"
2. Click "Check Migration Status" to verify counts
3. Click "Migrate N Orders"
4. Confirm the action in browser popup
5. Wait for migration to complete
6. See success notification with updated counts

### Verify Results

1. Go to Orders page
2. Search for orders (should still work)
3. Check order details - migratedFrom field shows old ID
4. Run "Check Migration Status" again - should show 0 needing migration

## Future Enhancements

- [ ] Bulk undo/rollback capability
- [ ] Export migration report
- [ ] Schedule migrations
- [ ] Dry-run mode
- [ ] Migration progress bar
- [ ] Email notification on completion

## Troubleshooting

**Q: Migration button doesn't appear**
A: Check if user has admin permissions and Orders component loaded

**Q: Migration seems stuck**
A: Check browser console for errors, may need manual refresh

**Q: Want to verify before running?**
A: Click button and check stats - doesn't run until confirmed

**Q: Can I undo the migration?**
A: Not currently, but migratedFrom field shows original ID for reference
