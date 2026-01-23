# Deploy Backend to Railway (Free Tier)

## Quick Deploy Steps:

1. **Sign up for Railway**: https://railway.app/
   - Login with GitHub

2. **Create New Project**:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account
   - Select this repository

3. **Configure Backend Service**:
   - Railway will auto-detect Node.js
   - Set root directory: `/backend`
   - It will automatically use `npm start` from package.json

4. **Add Environment Variables**:
   Go to your project → Variables → Add:
   ```
   PORT=3001
   SHOPIFY_STORE_DOMAIN=poshakh-dev-store.myshopify.com
   SHOPIFY_ACCESS_TOKEN=your_shopify_token
   SHIPROCKET_EMAIL=adwait@thefoundproject.com
   SHIPROCKET_PASSWORD=NKvXpE8uMzAS$^CqWw6^meMmI5MSfLj8
   ```

5. **Deploy**:
   - Railway will automatically deploy
   - You'll get a public URL like: `https://your-app.up.railway.app`

6. **Configure Shiprocket Webhook**:
   - Login to https://app.shiprocket.in
   - Go to Settings → API → Webhooks
   - Add webhook URL: `https://your-app.up.railway.app/api/shiprocket/webhook`
   - Select events: Order Created, Order Shipped, Order Delivered
   - Save

7. **Update Frontend**:
   In your frontend code, update the API URL from:
   ```
   http://localhost:3001
   ```
   To:
   ```
   https://your-app.up.railway.app
   ```

## Alternative: Render.com (Also Free)

1. Go to https://render.com/
2. New → Web Service
3. Connect GitHub repo
4. Root directory: `backend`
5. Build command: `npm install`
6. Start command: `node server.js`
7. Add same environment variables
8. Get public URL and configure Shiprocket webhook

---

## For Local Testing with ngrok:

If you want to test locally first:

```bash
# Install ngrok (already installed via Homebrew)
# Get auth token from: https://dashboard.ngrok.com/signup
ngrok config add-authtoken YOUR_TOKEN_HERE

# Start ngrok
ngrok http 3001

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Add to Shiprocket: https://abc123.ngrok.io/api/shiprocket/webhook
```

**Note**: ngrok URLs change every time you restart. For production, use Railway/Render.
