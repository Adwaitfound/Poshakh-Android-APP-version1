# Access Poshakh App on Your Phone - Local Network

## ✅ Configuration Complete

Your dev server is now configured to accept connections from your local network!

## How to Access from Your Phone

### **Step 1: Find Your Computer's IP Address**

On **Mac**, run this in terminal:

```bash
ipconfig getifaddr en0
```

Or use a longer command that shows all:

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Look for something like: **192.168.x.x** or **10.0.x.x**

### **Step 2: Open App on Your Phone**

In your phone's browser (Chrome, Safari, Firefox), go to:

```
http://YOUR_IP:5173
```

**Example:**

```
http://192.168.1.100:5173
```

## ⚠️ Important Notes

### Before Starting Dev Server

- **Restart** your dev server so the new config takes effect
- Stop current dev server (Ctrl+C)
- Start it again: `npm run dev`

### Phone Camera Access

- Your phone must be on the **same WiFi network** as your computer
- Both must be connected to the same router

### Using the Barcode Scanner

1. Open the app on your phone
2. Go to Orders tab
3. Click **Scan** button
4. Point camera at QR code on packing slip
5. Auto-fills the form!

### Testing Locally First

- Open on your computer: `http://localhost:5173`
- Then try on phone: `http://192.168.1.100:5173` (use your actual IP)

## Troubleshooting

### Can't access from phone?

1. **Check WiFi connection**
   - Both devices must be on same WiFi network
   - Some networks block device-to-device communication

2. **Find correct IP**

   ```bash
   # On Mac:
   ifconfig | grep "inet " | grep -v 127.0.0.1

   # On Windows (in PowerShell):
   ipconfig | findstr "IPv4"
   ```

3. **Check if dev server is running**
   - Terminal should show: `VITE v4.x.x  ready in XXX ms`
   - And: `➜  Local:   http://localhost:5173/`

4. **Firewall issues?**
   - macOS might block incoming connections
   - Allow access when prompted, or:
     - System Preferences → Security & Privacy → Firewall Options
     - Add your terminal app to allowed apps

### Camera doesn't work on phone?

- Make sure site is accessed via **HTTP** (not HTTPS)
- Some phones require HTTPS for camera - you can use localhost via HTTPS with ngrok or similar

## Terminal Output Example

When running `npm run dev`, you should see:

```
  VITE v4.4.0  ready in 123 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.100:5173/
```

The "Network" address is what you use on your phone!

## Using Barcode Scanner on Phone

The barcode scanning feature works great on mobile:

1. **Desktop**: Perfect for testing the full workflow
2. **Phone**: Better for actual scanning with real camera
3. **Tablet**: Good middle ground

All three access the same database in real-time.

## More Advanced Setup (Optional)

### Access from outside home network?

Use a tunnel service:

```bash
# Using ngrok (free tier)
npm install -g ngrok
ngrok http 5173
```

Then access via the provided URL from anywhere.

### Custom Domain (local)

Edit your `/etc/hosts` file (Mac/Linux):

```
192.168.1.100 poshakh.local
```

Then access: `http://poshakh.local:5173`

## Key Points

✅ Dev server now listens on all network interfaces (0.0.0.0)
✅ Port is 5173 (configurable in vite.config.js)
✅ Phone and computer must be on same WiFi
✅ Camera access works on phone
✅ All data syncs in real-time
✅ No additional setup needed beyond restarting dev server

## File Modified

- `vite.config.js` - Added `host: '0.0.0.0'` to server config

Ready to scan some packing slips on your phone! 📱📷
