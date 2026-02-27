/**
 * Parser for Shopdeck packing slip OCR text
 * Extracts structured data from OCR-scanned packing slip images
 */

/**
 * Extract order data from OCR text
 * @param {string} ocrText - Raw text from Tesseract OCR
 * @param {array} inventoryItems - Available outfits for SKU matching
 * @returns {Object} Extracted order data
 */
export function parseShopdeckSlip(ocrText, inventoryItems = []) {
  if (!ocrText) {
    throw new Error('No OCR text provided')
  }

  const text = ocrText.trim()
  const extracted = {
    orderId: '',
    customerName: '',
    phone: '',
    shippingAddress: '',
    city: '',
    postalCode: '',
    state: '',
    productName: '',
    productCode: '',
    skuId: '',
    size: '',
    quantity: 1,
    totalPrice: '',
    outfitId: '' // Will be matched from inventory
  }

  // Extract Order ID - prefer explicit "Order Id" line, then fallback to NS* token
  let orderIdMatch = text.match(/Order\s*Id[:\s]+([A-Z0-9\-\s]+)/i)
  if (orderIdMatch) {
    extracted.orderId = orderIdMatch[1].replace(/\s+/g, '').trim()
  }
  if (!extracted.orderId) {
    const orderIdLine = text
      .split('\n')
      .map(line => line.trim())
      .find(line => /Order\s*Id/i.test(line))
    if (orderIdLine) {
      const parts = orderIdLine.split(':')
      const candidate = (parts[1] || parts[0]).replace(/\s+/g, '').trim()
      if (candidate) {
        extracted.orderId = candidate
      }
    }
  }
  if (!extracted.orderId) {
    const nsMatch = text.match(/NS[0-9A-Z]{6,}/i)
    if (nsMatch) {
      extracted.orderId = nsMatch[0].trim()
    }
  }

  // Extract Recipient/Customer Name from "To:" section
  const toSectionMatch = text.match(/To:\s*\n([^\n]+)/i)
  if (toSectionMatch) {
    extracted.customerName = toSectionMatch[1].trim()
  }

  // Extract Shipping Address from "To:" section (multiple lines after name)
  const addressMatch = text.match(/To:\s*\n[^\n]+\n([\s\S]*?)(?=AWB:|Dimensions:|PREPAID|NOTE:)/i)
  if (addressMatch) {
    let address = addressMatch[1].trim()
    // Clean up the address
    address = address.split('\n').filter(line => line.trim() && !line.match(/^\d+\*|KG|CM|Code:/)).join(', ')
    // Extract postal code for later
    const postalMatch = address.match(/(\d{6})/)
    if (postalMatch) {
      extracted.postalCode = postalMatch[1]
      extracted.shippingAddress = address.replace(postalMatch[1], '').trim()
    } else {
      extracted.shippingAddress = address
    }
  }

  // Extract City and State from address
  const cityStateMatch = text.match(/(Mumbai|Bangalore|Delhi|Hyderabad|[A-Za-z\s]+),\s*(Maharashtra|Karnataka|Delhi|Telangana|[A-Za-z\s]+)/i)
  if (cityStateMatch) {
    extracted.city = cityStateMatch[1].trim()
    extracted.state = cityStateMatch[2].trim()
  }

  // Extract SKU ID - more flexible for OCR noise
  const skuMatch = text.match(/SKU\s*(?:ID)?[:\s|_]*([A-Za-z0-9\-]+)/i)
  if (skuMatch) {
    let sku = skuMatch[1].trim()
    if (sku.length > 1 || sku.match(/[a-z]/i)) {
      extracted.skuId = sku
    }
  }
  
  // If SKU not found with label, try to find any alphanumeric pattern in the table area
  if (!extracted.skuId) {
    const tableArea = text.split('NOTE:')[0]
    // Look for SKU patterns like "a3sNkimT" in the product table
    const skuPatterns = tableArea.match(/\b([a-zA-Z0-9]{6,})\s*(\d+)?\s*(?:\d+\s*)?$/gm)
    if (skuPatterns && skuPatterns.length > 0) {
      // Find the most likely SKU (not all digits, contains letters)
      for (let pattern of skuPatterns) {
        if (pattern.match(/[a-zA-Z]/)) {
          extracted.skuId = pattern.split(/\s+/)[0]
          break
        }
      }
    }
  }

  // Extract Quantity
  const qtyMatch = text.match(/Qty[:\s|_]*(\d+)/i)
  if (qtyMatch) {
    extracted.quantity = parseInt(qtyMatch[1]) || 1
  }

  const normalizeSize = (rawValue) => {
    const cleaned = String(rawValue || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
    const match = cleaned.match(/XXXL|XXL|XL|XS|S|M|L/)
    return match ? match[0] : ''
  }

  // Extract Size from text (multiple patterns)
  let sizeMatch = text.match(/Size\s*[:\s]*([A-Z]{1,4})/i)
  if (!sizeMatch) {
    sizeMatch = text.match(/\d+\s*x\s*Size\s*([A-Z]{1,4})/i)
  }
  if (!sizeMatch && extracted.productName) {
    sizeMatch = extracted.productName.match(/\b(XXXL|XXL|XL|XS|S|M|L)\b/i)
  }
  if (!sizeMatch && extracted.skuId) {
    sizeMatch = extracted.skuId.match(/(?:^|[-_\s])(XXXL|XXL|XL|XS|S|M|L)(?:$|[-_\s])/i)
  }
  if (sizeMatch) {
    extracted.size = normalizeSize(sizeMatch[1])
  }

  // Extract Total Price - more flexible pattern
  let priceMatch = text.match(/Total\s*Price[:\s|]*(\d+)/i)
  if (!priceMatch) {
    priceMatch = text.match(/Price[:\s|]*(\d+)/i)
  }
  if (!priceMatch) {
    // Try to find price in the product table row
    const tableRow = text.match(/Halter[^\n]+(Midnight|midnight)[^\n]+(\d{3,})/i)
    if (tableRow && tableRow[2]) {
      extracted.totalPrice = `Rs. ${tableRow[2]}`
    }
  }
  if (priceMatch && !extracted.totalPrice) {
    extracted.totalPrice = `Rs. ${priceMatch[1]}`
  }

  // Extract Product Name - look for "Halter" or other product indicators
  const productNameMatch = text.match(/(Halter[^\n]*\([^)]+\))/i)
  if (productNameMatch) {
    extracted.productName = productNameMatch[1].trim()
  } else {
    const nameMatch = text.match(/Product\s*Name[:\s|]*([^\n|]+)/i)
    if (nameMatch) {
      extracted.productName = nameMatch[1].trim()
    }
  }

  // Extract Product Code (Shopify code)
  const productCodeMatch = text.match(/(shopify[_\s][\d\s]+)/i)
  if (productCodeMatch) {
    extracted.productCode = productCodeMatch[1].trim().replace(/\s+/g, '_')
  }

  // Try to match SKU with inventory items
  if (extracted.skuId && inventoryItems.length > 0) {
    const matchedOutfit = inventoryItems.find(
      item => item.skuId && item.skuId.toLowerCase() === extracted.skuId.toLowerCase()
    )
    if (matchedOutfit) {
      extracted.outfitId = matchedOutfit.id
      if (matchedOutfit.name) {
        extracted.productName = matchedOutfit.name
      }
    }
  }

  return extracted
}

/**
 * Validate extracted data has minimum required fields
 * @param {Object} data - Extracted order data
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export function validateExtractedData(data) {
  const errors = []

  if (!data.orderId) errors.push('Order ID not found')
  if (!data.customerName) errors.push('Customer Name not found')
  if (!data.skuId) errors.push('SKU ID not found')
  if (!data.productName) errors.push('Product Name not found')
  if (!data.size) errors.push('Size not found')
  if (!data.quantity || data.quantity < 1) errors.push('Valid quantity not found')
  // Note: Price is optional as Shopdeck labels may not show it

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Format extracted data for display/preview
 * @param {Object} data - Extracted order data
 * @returns {string} HTML formatted preview
 */
export function formatExtractedPreview(data) {
  return `
    <div class="space-y-2 text-sm">
      <p><strong>Order ID:</strong> ${data.orderId || '—'}</p>
      <p><strong>Product:</strong> ${data.productName || '—'}</p>
      <p><strong>SKU:</strong> ${data.skuId || '—'}</p>
      <p><strong>Quantity:</strong> ${data.quantity || '—'}</p>
      <p><strong>Price:</strong> ${data.totalPrice || '—'}</p>
    </div>
  `
}

/**
 * Extract multiple slips from multi-page OCR
 * Splits text by "Order Id:" patterns to identify separate orders
 * @param {string} ocrText - Raw OCR text potentially containing multiple slips
 * @returns {Array} Array of order data strings
 */
export function splitMultipleSlips(ocrText) {
  const slips = ocrText.split(/Order\s*Id[:\s]+/i)
  
  // First element is usually garbage, rejoin with the order ID pattern
  return slips.slice(1).map((slip, idx) => {
    // Reconstruct the Order Id line
    const lines = slip.split('\n')
    const orderId = lines[0].trim().split(/[\s\n]/)[0]
    return `Order Id: ${orderId}\n${slip}`
  })
}

export default {
  parseShopdeckSlip,
  validateExtractedData,
  formatExtractedPreview,
  splitMultipleSlips
}
