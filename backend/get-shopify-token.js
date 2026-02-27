#!/usr/bin/env node

/**
 * Shopify Admin API Token Generator
 * This script helps you get an Admin API token from Shopify
 * 
 * Steps:
 * 1. Go to: https://poshakh-dev-store.myshopify.com/admin/apps-and-sales-channels/manage
 * 2. Click "Develop apps"
 * 3. Click "Create an app" or select existing app
 * 4. Go to "API credentials" tab
 * 5. Under "Admin API access tokens", click "Install app" (if not already installed)
 * 6. Copy the "Admin API access token"
 * 7. Run: shopify app:install-dependencies (if using CLI)
 * 
 * ALTERNATIVE - Using Shopify CLI (Recommended):
 * 1. Install: npm install -g @shopify/cli @shopify/app
 * 2. Run: shopify auth logout
 * 3. Run: shopify auth login (follow prompts, select poshakh-dev-store)
 * 4. Run: shopify app env show (this will show your access token)
 * 5. Copy the SHOPIFY_ADMIN_API_ACCESS_TOKEN value
 * 
 * OR - Generate using REST API:
 * You can make a POST request to your Shopify store to create a custom app:
 * POST https://poshakh-dev-store.myshopify.com/admin/api/2024-10/graphql.json
 */

const instructions = `
╔════════════════════════════════════════════════════════════════════════════════╗
║                    GETTING YOUR SHOPIFY ADMIN API TOKEN                        ║
║                                                                                ║
║  METHOD 1: Using Shopify Admin Dashboard (Easiest)                            ║
║  ────────────────────────────────────────────────────────────────────────────  ║
║  1. Go to: https://poshakh-dev-store.myshopify.com/admin                       ║
║  2. Click Settings > Apps and integrations > Develop apps                      ║
║  3. Create a new app or select your app                                        ║
║  4. Go to API credentials tab                                                  ║
║  5. Under "Admin API access tokens":                                           ║
║     - Click "Install app" (if showing)                                         ║
║     - Copy the "Admin API access token" (long string)                          ║
║  6. Paste in backend/.env as SHOPIFY_ADMIN_TOKEN=                             ║
║  7. Restart backend server                                                     ║
║                                                                                ║
║  METHOD 2: Using Shopify CLI (Modern)                                         ║
║  ────────────────────────────────────────────────────────────────────────────  ║
║  1. Run: npm install -g @shopify/cli @shopify/app                             ║
║  2. Run: shopify auth login                                                    ║
║     - Select: poshakh-dev-store                                                ║
║     - Follow browser prompt to authenticate                                    ║
║  3. Run: shopify app env show                                                  ║
║     Look for: SHOPIFY_ADMIN_API_ACCESS_TOKEN                                   ║
║  4. Copy that token to backend/.env                                            ║
║  5. Restart server                                                             ║
║                                                                                ║
║  IMPORTANT: The token gives full admin access to your store!                   ║
║  - Keep it SECRET (don't commit to git)                                        ║
║  - Store in .env file ONLY                                                     ║
║  - Never share or expose in code                                               ║
║                                                                                ║
║  SCOPE REQUIRED:                                                               ║
║  - read_orders (to fetch order data by barcode)                                ║
║  - read_products (optional, for product info)                                  ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝
`;

console.log(instructions);

// Alternative: Create a script that helps with Shopify CLI
const cliSetup = `
╔════════════════════════════════════════════════════════════════════════════════╗
║                     SHOPIFY CLI AUTOMATIC SETUP                               ║
╚════════════════════════════════════════════════════════════════════════════════╝

If you have Shopify CLI installed, run these commands:

$ shopify auth logout
$ shopify auth login
  → Select: poshakh-dev-store
  → Authenticate in browser
  
$ shopify app env show
  → Copy SHOPIFY_ADMIN_API_ACCESS_TOKEN

Then update backend/.env with the token.
`;

console.log(cliSetup);

// Helper function to validate token format
function isValidShopifyToken(token) {
  // Shopify tokens are long base64-like strings
  return token && token.length > 50 && token.length < 300;
}

module.exports = { isValidShopifyToken };
