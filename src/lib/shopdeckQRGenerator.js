/**
 * Shopdeck QR Code Generator
 * Generates pipe-delimited QR codes from Shopdeck packing slips
 * Format matches Shopify's pipe-delimited packing slip standard
 */

/**
 * Extract data from Shopdeck packing slip and generate QR code data string
 * @param {object} shopdeckOrder - Shopdeck order data
 * @returns {string} Pipe-delimited string ready for QR encoding
 * 
 * Expected Shopdeck order object:
 * {
 *   orderId: "NS0A179F4F82A8AA8B",
 *   customerName: "Pattabiraman chandramouli",
 *   shippingAddress: "Plot no 20 and 21 sanjeevitha nagar colony...",
 *   postalCode: "500009",
 *   productName: "Halter Neck Racerback Dress with Pockets (L) (MidnightBloom)",
 *   productCode: "shopify_5206929732",
 *   skuId: "9OUf5HR",
 *   quantity: 1,
 *   totalPrice: "Rs. 1280" // or just "1280"
 * }
 */
export function generateShopdeckQRData(shopdeckOrder) {
  if (!shopdeckOrder) {
    throw new Error('Shopdeck order data is required')
  }

  const {
    orderId = '',
    customerName = '',
    shippingAddress = '',
    postalCode = '',
    productName = '',
    productCode = '',
    skuId = '',
    quantity = 1,
    totalPrice = '',
    phone = '',
    city = '',
    state = ''
  } = shopdeckOrder

  // Validate required fields
  if (!orderId || !customerName) {
    throw new Error('Order ID and customer name are required')
  }

  // Format price - remove "Rs." if present
  const formattedPrice = totalPrice
    ? totalPrice.replace(/Rs\.\s*/, 'Rs. ')
    : 'Rs. 0'

  // Build full address
  let fullAddress = shippingAddress || ''
  if (city) fullAddress += `, ${city}`
  if (postalCode) fullAddress += ` - ${postalCode}`
  if (state) fullAddress += `, ${state}`

  // Format item with size if available
  let itemString = productName || ''
  if (skuId) {
    itemString += ` (SKU: ${skuId})`
  }

  // Generate pipe-delimited string (Shopify format)
  // Format: orderNumber|customerName|phone|address|totalPrice|items
  const qrData = [
    orderId,                    // Shopdeck Order ID
    customerName,               // Customer name
    phone || '0000000000',      // Phone (placeholder if not provided)
    fullAddress,                // Full shipping address
    formattedPrice,             // Total price
    `${quantity}x ${itemString}` // Item with quantity
  ].join('|')

  console.log('📱 Generated Shopdeck QR data:', qrData)
  return qrData
}

/**
 * Create a formatted Shopdeck order object from packing slip data
 * Use this if you're parsing the packing slip manually
 */
export function createShopdeckOrder({
  orderId,
  customerName,
  shippingAddress,
  postalCode,
  productName,
  productCode,
  skuId,
  quantity = 1,
  totalPrice,
  phone = '',
  city = '',
  state = 'Telangana'
}) {
  return {
    orderId,
    customerName,
    shippingAddress,
    postalCode,
    productName,
    productCode,
    skuId,
    quantity: parseInt(quantity) || 1,
    totalPrice,
    phone,
    city,
    state
  }
}

/**
 * Get QR code generation URLs for different services
 * Use these to generate actual QR codes
 */
export function getQRGenerationUrl(data, service = 'qr-server') {
  const encodedData = encodeURIComponent(data)

  switch (service) {
    case 'qr-server':
      // qr-server.com - No API key needed, free tier
      return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedData}`

    case 'uii-api':
      // uii.com QR API - Simple, no auth
      return `https://api.uii.io/v1/qr?content=${encodedData}&size=300`

    case 'qr-code-generator':
      // qr-code-generator.com API (requires API key)
      return `https://api.qr-server.com/v1/create-qr-code/?size=300x300&data=${encodedData}`

    default:
      return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedData}`
  }
}

/**
 * Example: Generate a static URL that can be used in img src or printed
 * This is PERFECT for Shopdeck - generate the URL, print it to a label
 */
export function generateShopdeckQRUrl(shopdeckOrder) {
  try {
    const qrData = generateShopdeckQRData(shopdeckOrder)
    return getQRGenerationUrl(qrData)
  } catch (error) {
    console.error('Error generating QR URL:', error)
    throw error
  }
}

/**
 * Example Shopdeck order from your packing slip
 */
export const EXAMPLE_SHOPDECK_ORDER = {
  orderId: 'NS0A179F4F82A8AA8B',
  customerName: 'Pattabiraman chandramouli',
  shippingAddress: 'Plot no 20 and 21 sanjeevitha nagar colony, behind tarband hanuman temple',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500009',
  productName: 'Halter Neck Racerback Dress with Pockets (L) (MidnightBloom)',
  productCode: 'shopify_5206929732',
  skuId: '9OUf5HR',
  quantity: 1,
  totalPrice: 'Rs. 1280',
  phone: '9876543210'
}

export default {
  generateShopdeckQRData,
  createShopdeckOrder,
  getQRGenerationUrl,
  generateShopdeckQRUrl,
  EXAMPLE_SHOPDECK_ORDER
}
