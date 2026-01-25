/**
 * Barcode Parser - Extracts data from QR code/barcode scans
 * Supports multiple formats: JSON, pipe-delimited, semicolon-delimited
 */

/**
 * Main function to parse barcode data
 * @param {string} barcodeText - The raw text from the QR code/barcode
 * @returns {object} Structured data object with parsed fields
 */
export function parseBarcodeData(barcodeText) {
  if (!barcodeText || typeof barcodeText !== 'string') {
    return { type: 'unknown', raw: barcodeText, error: 'Invalid barcode data' }
  }

  const text = barcodeText.trim()
  console.log('🔍 RAW BARCODE TEXT:', text)
  console.log('📏 Length:', text.length)
  
  let parsed = null

  // Try JSON format first
  try {
    const json = JSON.parse(text)
    if (json && typeof json === 'object') {
      parsed = json
      console.log('✅ Parsed as JSON')
      return normalizeData(parsed, 'json')
    }
  } catch (e) {
    // Not JSON, continue
  }

  // Try pipe-delimited format (PRIORITY - this is what Shopify uses)
  if (text.includes('|')) {
    const parts = text.split('|')
    console.log('✅ Detected pipe-delimited format with', parts.length, 'parts')
    parts.forEach((p, i) => console.log(`  Part ${i}:`, p))
    
    if (parts.length >= 3) {
      parsed = parsePipeDelimited(parts)
      console.log('✅ Parsed as pipe-delimited')
      return normalizeData(parsed, 'pipe')
    }
  }

  // Try semicolon-delimited format
  if (text.includes(';')) {
    const parts = text.split(';')
    if (parts.length >= 3) {
      parsed = parseSemicolonDelimited(parts)
      console.log('✅ Parsed as semicolon-delimited')
      return normalizeData(parsed, 'semicolon')
    }
  }

  // Try to extract order number and other patterns
  parsed = extractPatterns(text)
  
  // If we got an order number, it's valid data
  if (parsed.orderNumber) {
    console.log('✅ Parsed using pattern matching')
    return normalizeData(parsed, 'pattern')
  }
  
  // Fallback - return what we found even if partial
  console.log('⚠️ Parsed with partial data using pattern matching')
  return normalizeData(parsed, 'pattern')
}

/**
 * Parse pipe-delimited format
 * Format from Shopify: orderNumber|customerName|phone|address|totalPrice|items
 * Example: 1171|Jayashree|9967524131|148 chandr darshan soc 702A...|Rs. 1380.82|Halter Neck Kurti - S / Maroon
 */
function parsePipeDelimited(parts) {
  return {
    orderNumber: (parts[0] || '').trim(),
    customerName: (parts[1] || '').trim(),
    phone: (parts[2] || '').trim(),
    address: (parts[3] || '').trim(),
    totalPrice: (parts[4] || '').trim(),
    items: (parts[5] || '').trim() // Can have multiple items separated by semicolons
  }
}

/**
 * Parse semicolon-delimited format
 * Format: orderNumber;customerName;phone;address;totalPrice;items
 */
function parseSemicolonDelimited(parts) {
  return {
    orderNumber: parts[0]?.trim() || '',
    customerName: parts[1]?.trim() || '',
    phone: parts[2]?.trim() || '',
    address: parts[3]?.trim() || '',
    totalPrice: parts[4]?.trim() || '',
    items: parts[5]?.trim() || ''
  }
}

/**
 * Extract data using pattern matching - MORE AGGRESSIVE
 */
function extractPatterns(text) {
  if (!text || text.length === 0) {
    return {
      orderNumber: '',
      customerName: '',
      phone: '',
      address: '',
      totalPrice: '',
      items: '',
      quantity: '1'
    }
  }

  // Split by lines for easier parsing
  const lines = text.split('\n').map(l => l.trim()).filter(l => l)
  
  // 1. ORDER NUMBER - Look for numeric patterns like 1171 or Order 1171
  let orderNumber = ''
  for (const line of lines) {
    const match = line.match(/(?:Order\s+)?(\d{4,})\b|([A-Z]+)(\d{3,})/)
    if (match) {
      orderNumber = (match[1] || (match[2] + match[3]) || '').toString()
      if (orderNumber && orderNumber.length >= 3) break
    }
  }
  
  // 2. PHONE - Look for 10 digit phone number
  let phone = ''
  const phoneMatch = text.match(/\b(\d{10})\b/)
  if (phoneMatch) {
    phone = phoneMatch[1]
  }
  
  // 3. CUSTOMER NAME - Look for text that appears before phone or after "to"
  let customerName = ''
  // Try pattern: Ship to Name
  let custMatch = text.match(/(?:Ship\s+to|To)\s+([A-Za-z\s]+?)\s+(?:\d{10}|$)/i)
  if (custMatch) {
    customerName = custMatch[1].trim()
  }
  // Or just find a capitalized word before the phone number
  if (!customerName && phone) {
    const beforePhone = text.substring(0, text.indexOf(phone))
    const nameMatch = beforePhone.match(/([A-Za-z]+)\s+\d/)
    if (nameMatch) {
      customerName = nameMatch[1]
    }
  }
  
  // 4. ADDRESS - Look for multi-line address text
  let address = ''
  // Look for street number pattern like "148 chandr"
  const addressMatch = text.match(/(\d+\s+[A-Za-z\s,.\/\-]+?(?:road|nagar|soc|st|lane|street|colony|sector|near)[\w\s,.\/\-]*)/i)
  if (addressMatch) {
    address = addressMatch[1].trim()
  }
  
  // 5. TOTAL PRICE - Look for Rs. format or just numbers with decimals
  let totalPrice = ''
  const priceMatch = text.match(/Rs\.?\s*(\d+[.,]\d{2}|\d+)/i)
  if (priceMatch) {
    totalPrice = 'Rs. ' + priceMatch[1]
  }
  
  // 6. ITEMS - Look for product names with size indicators
  let items = ''
  let quantity = '1'
  // Pattern: "Qty: 1" or "1 x ProductName" or just product name
  const qtyMatch = text.match(/[Qq]ty[:\s]+(\d+)/)
  if (qtyMatch) {
    quantity = qtyMatch[1]
  }
  
  // Look for product name (words that include capitals and might have slashes for size)
  const itemMatch = text.match(/([A-Z][A-Za-z\s\-:]+?)\s*(?:[-/]\s*[A-Z]{1,3}\s*(?:[-/]\s*[A-Za-z]+)?)?$/m)
  if (itemMatch) {
    items = itemMatch[1].trim()
  }
  
  return {
    orderNumber,
    customerName,
    phone,
    address,
    totalPrice,
    items,
    quantity
  }
}

/**
 * Normalize and standardize the parsed data
 */
function normalizeData(data, format) {
  // Extract full address from multi-line format
  let fullAddress = (data.address || '').trim()
  
  // If address is incomplete, try to reconstruct from text
  if (data.raw && typeof data.raw === 'string' && (!fullAddress || fullAddress.length < 10)) {
    const addressMatch = data.raw.match(/Ship to\s+([A-Za-z\s.]+)\s+(\d{10})\s+([\s\S]+?)(?:Order Details|$)/i)
    if (addressMatch && addressMatch[3]) {
      fullAddress = addressMatch[3]
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.match(/^\d{1,2}$/))
        .join(' ')
    }
  }
  
  const normalized = {
    type: detectType(data),
    format,
    raw: data.raw || data,
    orderNumber: cleanOrderNumber(data.orderNumber || ''),
    customerName: (data.customerName || '').trim(),
    phone: cleanPhone(data.phone || ''),
    address: fullAddress,
    invoiceNumber: cleanOrderNumber(data.invoiceNumber || ''),
    totalPrice: cleanPrice(data.totalPrice || ''),
    items: extractItems(data.items || data.item || ''),
    quantity: parseInt(data.quantity || data.qty || '1') || 1
  }

  return normalized
}

/**
 * Detect barcode type (packing slip, invoice, or unknown)
 */
function detectType(data) {
  const hasItems = (data.items || data.item || '').length > 0
  const hasPrice = (data.totalPrice || data.price || data.total || '').match(/\d/)
  
  if (hasPrice && !hasItems) return 'invoice'
  if (hasItems) return 'packing_slip'
  return 'order'
}

/**
 * Clean and normalize order number
 */
function cleanOrderNumber(value) {
  if (!value) return ''
  // Accept as-is if it's already numeric
  if (/^\d+$/.test(value)) return value.toString()
  // Remove common prefixes and special characters
  return value
    .replace(/^#|^ORDER[:\s]*/i, '')
    .replace(/[^\w\d-]/g, '')
    .trim()
}

/**
 * Clean and validate phone number
 */
function cleanPhone(value) {
  if (!value) return ''
  // Extract 10-digit phone number
  const match = value.replace(/\D/g, '').match(/\d{10}$/)
  return match ? match[0] : value.replace(/\D/g, '')
}

/**
 * Clean and parse price
 */
function cleanPrice(value) {
  if (!value) return '0.00'
  // If it already has Rs., keep it
  if (value.includes('Rs')) return value
  // Extract just the number
  const match = value.match(/(\d+[.,]\d{2}|\d+)/)
  if (match) {
    return 'Rs. ' + match[0].replace(',', '.')
  }
  return '0.00'
}

/**
 * Extract items from text
 * Formats supported:
 * - "1x Halter Neck Kurti - S / Maroon"
 * - "Halter Neck Kurti - S / Maroon (Qty: 1)"
 * - "Halter Neck Kurti: The OG Favorite - L / Black Ajrakh"
 * - Multiple items separated by semicolon: "Item1 - S;Item2 - M"
 */
function extractItems(itemText) {
  if (!itemText) return []
  
  const items = []
  
  // Split by semicolon first (multiple items)
  const itemLines = itemText.split(';').map(l => l.trim()).filter(l => l)
  
  for (const line of itemLines) {
    if (!line) continue
    
    // Extract quantity if present (e.g., "1x Item" or "Qty: 1")
    const qtyMatch = line.match(/^(\d+)[x\s]+(.+)$/)
    let name = qtyMatch ? qtyMatch[2].trim() : line
    let qty = qtyMatch ? parseInt(qtyMatch[1]) : 1
    
    // Also check for "Qty:" pattern in the full line
    const qtyPattern = line.match(/[Qq]ty[:\s]+(\d+)/)
    if (qtyPattern) {
      qty = parseInt(qtyPattern[1])
      name = line.replace(/[Qq]ty[:\s]+\d+/, '').trim()
    }
    
    // Extract size from name (look for S, M, L, XL, XXL pattern)
    const size = extractSize(name)
    
    // Clean the item name - remove size and color info
    const cleanedName = cleanItemName(name)
    
    items.push({
      name: cleanedName,
      quantity: qty,
      size,
      raw: line
    })
  }
  
  return items.length > 0 ? items : [{ name: itemText, quantity: 1, size: 'M', raw: itemText }]
}

/**
 * Extract size from item name
 * Looks for S, M, L, XL, XXL patterns
 */
function extractSize(text) {
  const sizeMatch = text.match(/\b(XS|XXL|XL|S|M|L)\b/i)
  return sizeMatch ? sizeMatch[1].toUpperCase() : 'M'
}

/**
 * Clean item name by removing size and color info
 * Input: "Halter Neck Kurti - S / Maroon"
 * Output: "Halter Neck Kurti"
 */
function cleanItemName(text) {
  if (!text) return ''
  
  // Remove size and everything after it
  // Pattern: dash followed by size letter, then slash and color
  return text
    .replace(/\s*[-–]\s*(?:Size\s+)?[A-Z]{1,3}(?:\s*[-/]\s*.*)?$/i, '') // Removes " - S / Maroon"
    .replace(/\s*\(.*\)$/, '') // Removes parenthetical info
    .trim()
}

/**
 * Match parsed item with inventory outfit
 * @param {object} parsedItem - Item from barcode
 * @param {array} inventoryItems - All inventory items
 * @returns {object|null} Matched outfit or null
 */
export function matchOutfitFromItem(parsedItem, inventoryItems) {
  if (!parsedItem || !parsedItem.name) return null
  
  const outfits = inventoryItems.filter(i => i.type === 'outfit')
  const itemName = parsedItem.name.toLowerCase()
  
  // Exact name match
  let match = outfits.find(o => o.name.toLowerCase() === itemName)
  if (match) return match
  
  // Substring match (case-insensitive)
  match = outfits.find(o => o.name.toLowerCase().includes(itemName) || itemName.includes(o.name.toLowerCase()))
  if (match) return match
  
  // Fuzzy match by keywords
  const keywords = itemName.split(/[\s\-:]+/).filter(k => k.length > 2)
  match = outfits.find(o => {
    const outfitLower = o.name.toLowerCase()
    return keywords.some(k => outfitLower.includes(k))
  })
  
  return match || null
}

export default { parseBarcodeData, matchOutfitFromItem }
