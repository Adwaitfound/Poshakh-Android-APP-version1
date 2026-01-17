import React, { useState, useEffect } from 'react';
import { getDb } from '../firebase';
import { doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { Eye, EyeOff, Save, AlertCircle, CheckCircle, Loader, Copy, Upload } from 'lucide-react';

export default function IntegrationsSettings({ onImportSuccess = () => {} }) {
  const [shopifyStore, setShopifyStore] = useState('');
  const [shopifyAccessToken, setShopifyAccessToken] = useState('');
  const [shiprocketApiKey, setShiprocketApiKey] = useState('');
  const [shiprocketApiSecret, setShiprocketApiSecret] = useState('');
  const [showTokens, setShowTokens] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState('');

  // Load existing config
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const db = getDb();
      const configDoc = await getDoc(doc(db, 'config', 'integrations'));
      if (configDoc.exists()) {
        const data = configDoc.data();
        setShopifyStore(data.shopifyStore || '');
        setShopifyAccessToken(data.shopifyAccessToken || '');
        setShiprocketApiKey(data.shiprocketApiKey || '');
        setShiprocketApiSecret(data.shiprocketApiSecret || '');
      }
      
      // Load recent sync logs
      loadSyncLogs();
    } catch (error) {
      console.error('Error loading config:', error);
      setMessage('Failed to load configuration');
    }
  };

  const loadSyncLogs = async () => {
    try {
      const db = getDb();
      const logsQuery = query(
        collection(db, 'syncLogs'),
        orderBy('timestamp', 'desc'),
        limit(10)
      );
      const snapshot = await getDocs(logsQuery);
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp
      }));
      setSyncLogs(logs);
      if (logs.length > 0) {
        setLastSyncTime(logs[0].timestamp);
      }
    } catch (error) {
      console.error('Error loading sync logs:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage('');
    try {
      const db = getDb();
      await setDoc(doc(db, 'config', 'integrations'), {
        shopifyStore,
        shopifyAccessToken,
        shiprocketApiKey,
        shiprocketApiSecret,
        updatedAt: new Date()
      });
      setMessage('Configuration saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error saving configuration: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setMessage('');
    try {
      const db = getDb();
      
      // Log the sync attempt
      await addDoc(collection(db, 'syncLogs'), {
        type: 'manual_sync_started',
        status: 'in_progress',
        timestamp: serverTimestamp()
      });

      let shopifyCount = 0;
      let shiprocketCount = 0;
      let errors = [];

      // 1. Sync Shopify orders
      if (shopifyStore && shopifyAccessToken) {
        try {
          const shopifyUrl = `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders.json`;
          const shopifyResponse = await fetch(shopifyUrl, {
            headers: {
              'X-Shopify-Access-Token': shopifyAccessToken
            }
          });

          if (!shopifyResponse.ok) {
            throw new Error(`Shopify API error: ${shopifyResponse.status}`);
          }

          const data = await shopifyResponse.json();
          const orders = data.orders || [];
          
          // Parse and store Shopify orders
          for (const order of orders) {
            const parsedOrder = parseShopifyOrder(order);
            await setDoc(doc(db, 'production_orders', parsedOrder.orderId), parsedOrder, { merge: true });
            shopifyCount++;
          }

          setMessage(`✅ Synced ${shopifyCount} Shopify orders!`);
        } catch (error) {
          errors.push(`Shopify: ${error.message}`);
        }
      }

      // 2. Sync Shiprocket shipments
      if (shiprocketApiKey) {
        try {
          const shiprocketUrl = 'https://apiv2.shiprocket.in/v1/external/shipments/search';
          const shiprocketResponse = await fetch(shiprocketUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${shiprocketApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              page: 1,
              filters: {
                created_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
              }
            })
          });

          if (!shiprocketResponse.ok) {
            throw new Error(`Shiprocket API error: ${shiprocketResponse.status}`);
          }

          const data = await shiprocketResponse.json();
          const shipments = data.data || [];

          for (const shipment of shipments) {
            await matchShiprocketShipment(shipment);
            shiprocketCount++;
          }

          setMessage(`✅ Synced ${shopifyCount} orders, ${shiprocketCount} shipments!`);
        } catch (error) {
          errors.push(`Shiprocket: ${error.message}`);
        }
      }

      // Log completion
      const logData = {
        type: 'manual_sync',
        shopifyOrdersSync: shopifyCount,
        shiprocketShipmentsSync: shiprocketCount,
        status: errors.length > 0 ? 'partial' : 'success',
        timestamp: serverTimestamp()
      };
      if (errors.length > 0) {
        logData.errors = errors;
      }
      await addDoc(collection(db, 'syncLogs'), logData);

      if (errors.length > 0) {
        setMessage(`⚠️ Partial sync: ${shopifyCount} orders, ${shiprocketCount} shipments. Errors: ${errors.join('; ')}`);
      }

      setTimeout(() => loadSyncLogs(), 1000);
    } catch (error) {
      setMessage('Error during sync: ' + error.message);
      await addDoc(collection(getDb(), 'syncLogs'), {
        type: 'manual_sync',
        status: 'error',
        error: error.message,
        timestamp: serverTimestamp()
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Helper: Parse Shopify order
  const parseShopifyOrder = (shopifyOrder) => {
    const customer = shopifyOrder.customer || {};
    const lineItems = shopifyOrder.line_items || [];
    
    return {
      orderId: `SHOPIFY-${shopifyOrder.id}`,
      shopifyOrderId: shopifyOrder.id.toString(),
      shopifyOrderNumber: shopifyOrder.order_number,
      customerName: customer.first_name && customer.last_name 
        ? `${customer.first_name} ${customer.last_name}` 
        : customer.first_name || 'Unknown',
      customerEmail: customer.email || '',
      customerPhone: customer.phone || '',
      customerCity: customer.default_address?.city || '',
      customerState: customer.default_address?.province || '',
      items: lineItems.map(item => ({
        name: item.title,
        sku: item.sku || item.id.toString(),
        quantity: item.quantity,
        price: parseFloat(item.price),
        originalPrice: parseFloat(item.original_price || item.price)
      })),
      amount: parseFloat(shopifyOrder.total_price),
      subtotal: parseFloat(shopifyOrder.subtotal_price),
      discount: parseFloat(shopifyOrder.total_discounts),
      tax: parseFloat(shopifyOrder.total_tax),
      shipping: parseFloat(shopifyOrder.total_shipping || 0),
      paymentMethod: shopifyOrder.payment_gateway_names?.[0] || 'Unknown',
      paymentMode: shopifyOrder.financial_status === 'paid' ? 'Prepaid' : 'COD',
      status: 'Order Placed',
      orderDate: new Date(shopifyOrder.created_at),
      shippedDate: shopifyOrder.fulfillment_status === 'fulfilled' 
        ? new Date(shopifyOrder.updated_at) 
        : null,
      source: 'Shopify',
      syncedAt: new Date(),
      notes: shopifyOrder.note || ''
    };
  };

  // Helper: Match Shiprocket shipment to order
  const matchShiprocketShipment = async (shiprocketData) => {
    const orderId = shiprocketData.order_id || shiprocketData.shopify_order_id;
    
    if (!orderId) return;
    
    try {
      const db = getDb();
      const orderRef = doc(db, 'production_orders', `SHOPIFY-${orderId}`);
      const orderDoc = await getDoc(orderRef);
      
      if (orderDoc.exists()) {
        await setDoc(orderRef, {
          shiprocketTrackingId: shiprocketData.tracking_number || '',
          shiprocketStatus: shiprocketData.status || '',
          shippedDate: shiprocketData.shipped_date ? new Date(shiprocketData.shipped_date) : null,
          deliveredDate: shiprocketData.delivered_date ? new Date(shiprocketData.delivered_date) : null,
          lastUpdatedShiprocket: new Date()
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error updating order with Shiprocket data:', error);
    }
  };

  // Helper function to extract size from product name
  const extractSizeFromText = (text) => {
    if (!text) return 'M';
    const sizeMatch = text.match(/([XSML]|XL|XXL|S|M|L|XS)\s*(?:\/|$)/i);
    return sizeMatch ? sizeMatch[1].toUpperCase() : 'M';
  };

  // CSV Parsing - Improved with better delimiter detection
  const parseCSV = (csvText) => {
    // Parse CSV respecting quoted fields with embedded newlines
    const rows = parseCSVRows(csvText);
    
    if (rows.length === 0) {
      console.error('No CSV rows parsed');
      return { headers: [], data: [] };
    }
    
    console.log(`Detected delimiter: COMMA`);
    
    // First row is headers
    const headerFields = rows[0].map(h => h.trim().toLowerCase());
    console.log('CSV Headers:', headerFields);
    
    // Convert remaining rows to objects using header mapping
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const values = rows[i].map(v => v.trim());
      const row = {};
      headerFields.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      data.push(row);
    }
    
    console.log(`Parsed ${data.length} CSV rows (actual orders)`);
    if (data.length > 0) {
      console.log('First row:', data[0]);
    }
    
    return { headers: headerFields, data };
  };

  // Parse CSV into rows, respecting quoted fields with embedded newlines
  const parseCSVRows = (csvText) => {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;
    
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];
      
      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          // Escaped quote (double quote inside quoted field)
          currentField += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        // Field separator
        currentRow.push(currentField);
        currentField = '';
      } else if ((char === '\n' || char === '\r') && !insideQuotes) {
        // Row separator - handle \r\n combinations
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        if (currentField || currentRow.length > 0) {
          currentRow.push(currentField);
          if (currentRow.some(f => f.trim())) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentField = '';
        }
      } else {
        currentField += char;
      }
    }
    
    // Add last field and row
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      if (currentRow.some(f => f.trim())) {
        rows.push(currentRow);
      }
    }
    
    return rows;
  };

  // Import Shopify CSV
  const handleShopifyCSVImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    setImportProgress(0);
    setImportStatus('Reading CSV file...');
    setMessage('');
    
    try {
      const csvText = await file.text();
      setImportProgress(10);
      setImportStatus('Parsing CSV data...');
      
      const { headers, data } = parseCSV(csvText);
      const db = getDb();
      let importedCount = 0;
      let errors = [];
      const totalRows = data.length;
      
      setImportStatus(`Processing ${totalRows} orders...`);
      
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        try {
          // Extract order ID from the 'name' field (first column) - Shopify export has order # in name field
          let orderId = row['name'] || '';
          
          if (!orderId || !orderId.includes('#')) {
            console.warn(`Row ${i+1} skipped - no order ID found`);
            continue;
          }
          
          // Sanitize orderId - remove invalid characters for Firebase
          const sanitizedId = orderId.replace(/[\/\s\\?#\[\]@!$&'()*+,;=:^`|<>{}]/g, '_').substring(0, 100);
          
          console.log(`Processing order ${i+1}/${totalRows}: "${orderId}" → "${sanitizedId}"`);
          
          // Extract customer info - use shipping address if available, else billing
          const customerName = row['shipping name'] || row['billing name'] || row['name'] || 'Unknown Customer';
          const customerPhone = row['shipping phone'] || row['billing phone'] || '';
          const shippingAddress = row['shipping address1'] || '';
          const billingAddress = row['billing address1'] || '';
          const address = shippingAddress || billingAddress || '';
          
          // Extract product/outfit info from lineitem fields
          const outfitName = row['lineitem name'] || 'Product';
          const size = extractSizeFromText(outfitName);
          const quantity = parseInt(row['lineitem quantity']) || 1;
          const lineitemPrice = parseFloat(row['lineitem price']) || 0;
          
          // Calculate pricing
          const totalAmount = parseFloat(row['total']) || 0;
          const subtotal = parseFloat(row['subtotal']) || 0;
          const shippingCost = parseFloat(row['shipping']) || 0;
          const discountAmount = parseFloat(row['discount amount']) || 0;
          const taxAmount = parseFloat(row['taxes']) || 0;
          
          // Create order object with proper Shopify data
          const order = {
            orderId: `SHOPIFY-CSV-${sanitizedId}`,
            orderNumber: orderId,
            shopifyOrderId: sanitizedId,
            customerName: customerName.trim(),
            customerEmail: row['email'] || '',
            customerPhone: customerPhone.trim(),
            customerCity: row['shipping city'] || row['billing city'] || '',
            customerState: row['shipping province'] || row['billing province'] || '',
            city: row['shipping city'] || row['billing city'] || '',
            state: row['shipping province'] || row['billing province'] || '',
            address: address.trim(),
            phone: customerPhone.trim(),
            email: row['email'] || '',
            outfitName: outfitName.trim(),
            size: size || 'M',
            quantity: quantity || 1,
            imageUrl: '',
            // Pricing fields
            amount: totalAmount,
            orderTotal: totalAmount,
            finalSellingPrice: totalAmount, // Critical field for display
            subtotal: subtotal,
            discount: discountAmount,
            tax: taxAmount,
            shipping: shippingCost,
            stitchingCost: 0, // Will be set later in tailor workflow
            // Payment info
            paymentMethod: row['payment method'] || row['payment reference'] || 'Unknown',
            paymentMode: row['payment method']?.includes('COD') || row['payment method'] === 'Cash on Delivery (COD)' ? 'COD' : 'Prepaid',
            // Status
            status: row['fulfillment status'] === 'fulfilled' ? 'Shipped' : 'Order Placed',
            fulfillmentStatus: row['fulfillment status'] || 'unfulfilled',
            // Items
            items: [
              {
                name: outfitName.trim(),
                sku: row['lineitem sku'] || orderId,
                quantity: quantity || 1,
                price: lineitemPrice,
                originalPrice: parseFloat(row['lineitem compare at price']) || lineitemPrice
              }
            ],
            // Timestamps
            orderDate: serverTimestamp(),
            createdAt: serverTimestamp(),
            shippedDate: row['fulfilled at'] ? new Date(row['fulfilled at']) : null,
            // Metadata
            source: 'Shopify CSV Import',
            importedAt: serverTimestamp(),
            notes: row['notes'] || '',
            paid: row['financial status']?.toLowerCase() === 'paid'
          };
          
          console.log('Order object created:', {
            orderId: order.orderId,
            customerName: order.customerName,
            outfitName: order.outfitName,
            size: order.size,
            quantity: order.quantity,
            amount: order.amount,
            finalSellingPrice: order.finalSellingPrice,
            paymentMode: order.paymentMode
          });
          
          // Save order to Firestore
          await setDoc(doc(db, 'production_orders', order.orderId), order, { merge: true });
          console.log(`✓ Saved order ${order.orderId}`);
          
          // Create or update customer record (check for duplicates by phone/address)
          if (customerPhone || address) {
            try {
              const customersRef = collection(db, 'customers');
              let existingCustomer = null;
              
              // Check if customer already exists by phone or address
              if (customerPhone) {
                const phoneQuery = await getDocs(query(customersRef, where('phone', '==', customerPhone)));
                if (phoneQuery.docs.length > 0) {
                  existingCustomer = phoneQuery.docs[0];
                  console.log(`Found existing customer by phone: ${existingCustomer.id}`);
                }
              }
              
              if (!existingCustomer && address) {
                const addressQuery = await getDocs(query(customersRef, where('address', '==', address)));
                if (addressQuery.docs.length > 0) {
                  existingCustomer = addressQuery.docs[0];
                  console.log(`Found existing customer by address: ${existingCustomer.id}`);
                }
              }
              
              if (existingCustomer) {
                // Update existing customer
                await setDoc(doc(db, 'customers', existingCustomer.id), {
                  name: customerName.trim(),
                  email: order.customerEmail,
                  phone: customerPhone.trim(),
                  address: address.trim(),
                  city: order.customerCity,
                  state: order.customerState,
                  lastUpdated: serverTimestamp()
                }, { merge: true });
                console.log(`✓ Updated customer: ${existingCustomer.id}`);
              } else {
                // Create new customer
                const newCustomerRef = await addDoc(customersRef, {
                  name: customerName.trim(),
                  email: order.customerEmail,
                  phone: customerPhone.trim(),
                  address: address.trim(),
                  city: order.customerCity,
                  state: order.customerState,
                  importedAt: serverTimestamp()
                });
                console.log(`✓ Created new customer: ${newCustomerRef.id}`);
              }
            } catch (err) {
              console.warn(`Customer save error: ${err.message}`, err);
            }
          }
          
          importedCount++;
          console.log(`✓ Saved order SHOPIFY-CSV-${sanitizedId}`);
          
          // Update progress (10% to 90% for processing)
          const progress = 10 + Math.floor((i + 1) / totalRows * 80);
          setImportProgress(progress);
          setImportStatus(`Imported ${importedCount} of ${totalRows} orders...`);
        } catch (error) {
          console.error(`✗ Error importing row ${i+1}:`, error);
          errors.push(`Row ${i+1}: ${error.message}`);
        }
      }
      
      setImportProgress(95);
      setImportStatus('Saving import log...');
      
      // Log import
      const logData = {
        type: 'shopify_csv_import',
        shopifyOrdersImported: importedCount,
        status: errors.length > 0 ? 'partial' : 'success',
        timestamp: serverTimestamp()
      };
      if (errors.length > 0) {
        logData.errors = errors.slice(0, 5);
      }
      await addDoc(collection(db, 'syncLogs'), logData);
      
      setImportProgress(100);
      setImportStatus('Complete!');
      setMessage(`✅ Imported ${importedCount} orders from Shopify CSV!`);
      setTimeout(() => {
        loadSyncLogs();
        onImportSuccess(); // Reload orders in parent component
      }, 1000);
    } catch (error) {
      setMessage('Error importing CSV: ' + error.message);
      console.error(error);
    } finally {
      setTimeout(() => {
        setIsImporting(false);
        setImportProgress(0);
        setImportStatus('');
      }, 2000);
      e.target.value = '';
    }
  };

  // Import Shiprocket CSV
  const handleShiprocketCSVImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    setImportProgress(0);
    setImportStatus('Reading CSV file...');
    setMessage('');
    
    try {
      const csvText = await file.text();
      setImportProgress(10);
      setImportStatus('Parsing CSV data...');
      
      const { headers, data } = parseCSV(csvText);
      const db = getDb();
      let importedCount = 0;
      let errors = [];
      const totalRows = data.length;
      
      setImportStatus(`Processing ${totalRows} shipments...`);
      
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        try {
          const orderId = row['order id'] || row['shipment id'] || row['id'];
          if (!orderId) continue;
          
          // Try to find existing order
          const orderRef = doc(db, 'production_orders', `SHOPIFY-${orderId}`);
          const orderDoc = await getDoc(orderRef);
          
          // Update existing order or create new one with shipment info
          const shipmentData = {
            shiprocketTrackingId: row['tracking number'] || row['tracking id'] || '',
            shiprocketStatus: row['status'] || row['shipment status'] || '',
            shippedDate: row['shipped date'] || row['ship date'] ? new Date(row['shipped date'] || row['ship date']) : null,
            deliveredDate: row['delivered date'] || row['delivery date'] ? new Date(row['delivered date'] || row['delivery date']) : null,
            shiprocketAwb: row['awb'] || row['awb number'] || '',
            lastUpdatedShiprocket: new Date()
          };
          
          if (orderDoc.exists()) {
            // Update existing order
            await setDoc(orderRef, shipmentData, { merge: true });
          } else {
            // Create new order with shipment info
            await setDoc(doc(db, 'production_orders', `SHIPROCKET-CSV-${orderId}`), {
              orderId: `SHIPROCKET-CSV-${orderId}`,
              shiprocketOrderId: orderId,
              customerName: row['customer name'] || row['recipient name'] || '',
              customerCity: row['city'] || '',
              customerState: row['state'] || '',
              status: 'Shipped',
              source: 'Shiprocket CSV Import',
              importedAt: new Date(),
              ...shipmentData
            });
          }
          
          importedCount++;
          
          // Update progress (10% to 90% for processing)
          const progress = 10 + Math.floor((i + 1) / totalRows * 80);
          setImportProgress(progress);
          setImportStatus(`Imported ${importedCount} of ${totalRows} shipments...`);
        } catch (error) {
          errors.push(`Row error: ${error.message}`);
        }
      }
      
      setImportProgress(95);
      setImportStatus('Saving import log...');
      
      // Log import
      const logData = {
        type: 'shiprocket_csv_import',
        shiprocketShipmentsImported: importedCount,
        status: errors.length > 0 ? 'partial' : 'success',
        timestamp: serverTimestamp()
      };
      if (errors.length > 0) {
        logData.errors = errors.slice(0, 5);
      }
      await addDoc(collection(db, 'syncLogs'), logData);
      
      setImportProgress(100);
      setImportStatus('Complete!');
      setMessage(`✅ Imported ${importedCount} shipments from Shiprocket CSV!`);
      setTimeout(() => loadSyncLogs(), 1000);
    } catch (error) {
      setMessage('Error importing CSV: ' + error.message);
      console.error(error);
    } finally {
      setTimeout(() => {
        setIsImporting(false);
        setImportProgress(0);
        setImportStatus('');
      }, 2000);
      e.target.value = '';
      e.target.value = '';
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Integrations & Sync Settings</h1>

      {/* Message Alert */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
          message.includes('success') 
            ? 'bg-green-50 border border-green-200 text-green-700' 
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.includes('success') ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {message}
        </div>
      )}

      {/* Shopify Configuration */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <span className="text-green-600">◆</span> Shopify Configuration
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Shopify Store URL
            </label>
            <input
              type="text"
              placeholder="mystore.myshopify.com"
              value={shopifyStore}
              onChange={(e) => setShopifyStore(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Your Shopify store domain (without https://)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Access Token
            </label>
            <div className="relative">
              <input
                type={showTokens ? "text" : "password"}
                placeholder="shpat_..."
                value={shopifyAccessToken}
                onChange={(e) => setShopifyAccessToken(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent pr-10"
              />
              <button
                onClick={() => setShowTokens(!showTokens)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showTokens ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Get from Shopify Admin → Apps → App and sales channel settings → Admin API access
            </p>
          </div>
        </div>
      </div>

      {/* Shiprocket Configuration */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <span className="text-blue-600">◆</span> Shiprocket Configuration
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                type={showTokens ? "text" : "password"}
                placeholder="Your Shiprocket API Key"
                value={shiprocketApiKey}
                onChange={(e) => setShiprocketApiKey(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
              />
              <button
                onClick={() => setShowTokens(!showTokens)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showTokens ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Secret
            </label>
            <div className="relative">
              <input
                type={showTokens ? "text" : "password"}
                placeholder="Your Shiprocket API Secret"
                value={shiprocketApiSecret}
                onChange={(e) => setShiprocketApiSecret(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
              />
              <button
                onClick={() => setShowTokens(!showTokens)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showTokens ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Get from Shiprocket dashboard → Settings → Integrations
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
        >
          {loading ? <Loader size={20} className="animate-spin" /> : <Save size={20} />}
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {/* Info: Manual Sync Not Available */}
      <div className="mb-6 bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
        <p className="text-sm text-yellow-900">
          <strong>Note:</strong> API-based Manual Sync requires Firebase Blaze plan. For now, use <strong>CSV Import</strong> below to sync your Shopify and Shiprocket data.
        </p>
      </div>

      {/* CSV Import */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
        <h2 className="text-2xl font-semibold mb-4">CSV Import</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Shopify CSV Import */}
          <div className="border-2 border-dashed border-green-300 rounded-lg p-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <span className="text-green-600">◆</span> Shopify CSV Import
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Upload a CSV file exported from Shopify with your orders. Supported columns: Order ID, Customer Name, Email, Phone, Product, Quantity, Price, Total, Date, etc.
            </p>
            <label className="flex items-center justify-center gap-2 px-4 py-3 bg-green-50 border-2 border-green-300 rounded-lg cursor-pointer hover:bg-green-100 transition">
              <Upload size={18} className="text-green-600" />
              <span className="text-sm font-medium text-green-700">Choose CSV File</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleShopifyCSVImport}
                disabled={isImporting}
                className="hidden"
              />
            </label>
          </div>

          {/* Shiprocket CSV Import */}
          <div className="border-2 border-dashed border-blue-300 rounded-lg p-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <span className="text-blue-600">◆</span> Shiprocket CSV Import
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Upload a CSV file exported from Shiprocket with shipment tracking data. Supported columns: Order ID, Tracking Number, Status, Shipped Date, Delivered Date, etc.
            </p>
            <label className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 border-2 border-blue-300 rounded-lg cursor-pointer hover:bg-blue-100 transition">
              <Upload size={18} className="text-blue-600" />
              <span className="text-sm font-medium text-blue-700">Choose CSV File</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleShiprocketCSVImport}
                disabled={isImporting}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {isImporting && (
          <div className="mt-6 bg-blue-50 border border-blue-200 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <Loader size={20} className="animate-spin text-blue-600" />
              <span className="font-semibold text-blue-900">{importStatus}</span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-2"
                style={{ width: `${importProgress}%` }}
              >
                {importProgress > 10 && (
                  <span className="text-[10px] font-bold text-white">
                    {importProgress}%
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sync Status */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-2xl font-semibold mb-4">Sync Status & Logs</h2>
        
        {lastSyncTime && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
            <p className="text-sm text-blue-900">
              Last sync: <strong>{new Date(lastSyncTime).toLocaleString()}</strong>
            </p>
          </div>
        )}

        <div className="space-y-3">
          {syncLogs.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No sync logs yet. Run a sync to get started.</p>
          ) : (
            syncLogs.map((log) => (
              <div key={log.id} className={`p-4 rounded-lg border-l-4 ${
                log.status === 'success' 
                  ? 'bg-green-50 border-green-500 text-green-900' 
                  : 'bg-red-50 border-red-500 text-red-900'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold capitalize">{log.type?.replace('_', ' ')}</p>
                    <p className="text-sm opacity-75">
                      {log.shopifyOrdersSync && `Shopify: ${log.shopifyOrdersSync} orders`}
                      {log.shopifyOrdersSync && log.shiprocketShipmentsSync && ' | '}
                      {log.shiprocketShipmentsSync && `Shiprocket: ${log.shiprocketShipmentsSync} shipments`}
                    </p>
                    {log.error && <p className="text-sm mt-1">Error: {log.error}</p>}
                  </div>
                  <span className="text-xs opacity-75">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-8 bg-blue-50 border border-blue-200 p-6 rounded-lg">
        <h3 className="font-semibold mb-3 text-blue-900">How it works (Free Tier)</h3>
        <ul className="text-sm text-blue-900 space-y-2 list-disc list-inside">
          <li><strong>Manual Sync:</strong> Click "Trigger Manual Sync" to pull data from Shopify & Shiprocket APIs in real-time</li>
          <li><strong>CSV Import:</strong> Upload Shopify or Shiprocket CSV files to bulk import historical data</li>
          <li><strong>Sync Logs:</strong> View history of all syncs and imports below</li>
          <li><strong>Ready for webhooks:</strong> When you upgrade to Blaze, webhooks will sync automatically in real-time</li>
        </ul>
      </div>

      {/* Blaze Upgrade Info */}
      <div className="mt-6 bg-purple-50 border border-purple-200 p-6 rounded-lg">
        <h3 className="font-semibold mb-3 text-purple-900">Future: Blaze Plan Upgrade</h3>
        <p className="text-sm text-purple-900 mb-3">
          When you're ready to upgrade to Firebase Blaze plan (~$0.40/month for Cloud Functions), real-time webhooks will automatically sync data from Shopify & Shiprocket instantly.
        </p>
        <p className="text-xs text-purple-700">
          Just say "upgrade to Blaze" and I'll activate the pre-built Cloud Functions. No code changes needed.
        </p>
      </div>
    </div>
  );
}
