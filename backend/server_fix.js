// This is the corrected fetch section - copy lines 323-336
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const resp = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!resp.ok) {
