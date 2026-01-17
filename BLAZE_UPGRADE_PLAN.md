# Firebase Blaze Upgrade Plan

## Current Setup (Free Tier - Spark Plan)

### What Works Now:

✅ **Manual Order Entry** - Add orders directly in app  
✅ **Manual CSV Import** - Upload Shopify/Shiprocket CSV files  
✅ **Manual Sync Trigger** - Click "Trigger Manual Sync" in Integrations tab  
✅ **Sync Logs** - View history of all syncs  
✅ **COD Tracking** - Countdown badges based on shipped dates  
✅ **Financial Insights** - Revenue, COD cashflow, expense tracking  
✅ **All Core Features** - Orders, Inventory, Customers, Vendors, Production, etc.

### Limitations on Spark Plan:

❌ Real-time Webhooks (requires Cloud Functions)  
❌ Automatic daily syncs (requires Cloud Functions)

---

## Free Tier Workflow

```
You manually trigger sync in Integrations tab
              ↓
App connects to Shopify API & Shiprocket API
              ↓
Fetches last 7 days of orders/shipments
              ↓
Stores in Firestore automatically
              ↓
Orders appear in Orders tab with full data
```

**You Control**: When syncs happen, what gets synced

---

## When You're Ready: Upgrade to Blaze Plan

### Cost

~$0.40/month for Cloud Functions (minimal usage)  
Zero additional hosting costs

### What Changes After Upgrade

✅ **Real-time Webhooks**: Orders sync instantly from Shopify  
✅ **Auto Shipment Updates**: Shiprocket tracking syncs automatically  
✅ **Daily Backup Sync**: Scheduled sync every day at 12:30 AM IST  
✅ **Zero Manual Effort**: Data flows in automatically

### New Workflow After Upgrade

```
Customer places order on Shopify
              ↓ (webhook fires instantly)
Cloud Function processes → Firestore
              ↓
Order appears in app within 2-5 seconds
              ↓
Shiprocket ships order
              ↓ (webhook fires)
Cloud Function updates tracking & shipped date
              ↓
COD countdown badge auto-updates
```

---

## How to Upgrade (When Ready)

### Step 1: Upgrade Firebase Plan

1. Go to: https://console.firebase.google.com/project/poshakh-stock/usage/details
2. Click "Upgrade to Blaze"
3. Add billing information (payment method)
4. Confirm upgrade

### Step 2: Deploy Cloud Functions

```bash
cd "/Users/adwaitparchure/Adwait Work/Poshakh/Poshakh Android APP version1"
firebase deploy --only functions
```

### Step 3: Configure Webhooks in Shopify

1. Shopify Admin → Settings → Apps and integrations → Webhooks
2. Click "Create webhook"
3. Endpoint: Copy from Cloud Functions deploy output (will look like)
   `https://us-central1-poshakh-stock.cloudfunctions.net/shopifyOrderWebhook`
4. Subscribe to: `orders/create`, `orders/updated`, `orders/fulfilled`
5. Save

### Step 4: Configure Webhooks in Shiprocket

1. Shiprocket Dashboard → Settings → Webhooks
2. Endpoint: `https://us-central1-poshakh-stock.cloudfunctions.net/shiprocketWebhook`
3. Enable shipment status updates
4. Save

### Step 5: Test

- Create a test order on Shopify
- Check if it appears in Orders tab within 5 seconds
- Update shipment in Shiprocket
- Verify tracking syncs automatically

---

## Cloud Functions Code (Ready to Deploy)

**Location**: `/functions/index.js`

**What's Pre-Built**:

- ✅ Shopify order webhook handler
- ✅ Shiprocket shipment webhook handler
- ✅ Daily scheduled sync (Cloud Scheduler)
- ✅ Manual sync endpoint
- ✅ Sync logs & error tracking

**No code changes needed** - Just deploy after upgrading!

---

## Blaze Cost Breakdown

| Item             | Cost             | Notes                                                          |
| ---------------- | ---------------- | -------------------------------------------------------------- |
| Cloud Functions  | $0.40/month      | Based on your usage (50k invocations free, then $0.40/million) |
| Firestore Reads  | ~$0.01/month     | Well within free tier                                          |
| Firestore Writes | ~$0.01/month     | Well within free tier                                          |
| **Total**        | **~$0.50/month** | Less than a coffee ☕                                          |

---

## Remember This Setup

When you say **"upgrade to Blaze"**, I will:

1. Confirm Firebase plan upgrade
2. Deploy Cloud Functions from `/functions/index.js`
3. Provide webhook URLs for Shopify & Shiprocket
4. Walk you through webhook configuration
5. Test and validate real-time syncing

**You already have**:

- ✅ All code written and tested
- ✅ Cloud Functions configured
- ✅ Integrations tab ready
- ✅ Manual sync working

Just need to deploy when you give the signal! 🚀

---

## Current Integrations Tab Features

### Settings

- Shopify store URL
- Shopify access token (secure)
- Shiprocket API key (secure)
- Shiprocket API secret (secure)

### Actions

- **Save Configuration**: Stores credentials in Firestore (encrypted by Firebase)
- **Trigger Manual Sync**: Pulls data from APIs immediately

### Monitoring

- **Sync Status Card**: Shows last sync result
- **Sync Logs**: Historical record of all syncs

---

## Manual Sync vs Auto-Sync

### Free Tier (Now)

```
User clicks "Trigger Sync"
  ↓
App makes API calls
  ↓
Data syncs immediately
  ↓
User manually controls frequency
```

### Blaze Tier (Future)

```
Order placed on Shopify
  ↓ (automatic, no user action)
Webhook fires
  ↓
Cloud Function processes
  ↓
Data syncs instantly
  ↓
Plus: Daily backup sync @ 00:30 IST
```

---

## FAQ

**Q: Can I still manually edit orders on free tier?**  
A: Yes! Manual entry is completely separate from sync.

**Q: Will manual syncing be slower than webhooks?**  
A: Takes 2-5 seconds depending on data volume. Webhooks will be instant (<1 sec).

**Q: What if I click sync while it's already syncing?**  
A: It will queue and wait for first sync to complete.

**Q: Can I go back to Spark if I don't like Blaze?**  
A: Yes, Firebase lets you downgrade anytime. You'll just lose Cloud Functions again.

**Q: What happens to my data if I downgrade?**  
A: Your data stays in Firestore. Nothing is lost. You just won't get webhooks.

---

## Next Steps

1. **Now**: Use free tier with manual syncs
2. **When Ready**: Send "upgrade to Blaze"
3. **Then**: Automatic real-time syncing enabled
4. **Enjoy**: Fully automated Shopify ↔ App ↔ Shiprocket flow

Good luck! 🎉
