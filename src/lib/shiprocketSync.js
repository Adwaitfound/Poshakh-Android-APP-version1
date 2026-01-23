import { getDb } from '../firebase'
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { ORDERS_COLLECTION } from './utils'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

/**
 * Fetch Shiprocket orders from the backend API
 */
export async function fetchShiprocketOrders(page = 1, per_page = 100, status_filter = '') {
  try {
    const url = new URL(`${BACKEND_URL}/api/shiprocket/orders`)
    url.searchParams.set('page', page)
    url.searchParams.set('per_page', per_page)
    if (status_filter) {
      url.searchParams.set('status_filter', status_filter)
    }

    const resp = await fetch(url.toString())
    if (!resp.ok) {
      const error = await resp.json()
      throw new Error(error.error || 'Failed to fetch Shiprocket orders')
    }

    const data = await resp.json()
    return data.orders || []
  } catch (error) {
    console.error('Error fetching Shiprocket orders:', error)
    throw error
  }
}

/**
 * Sync Shiprocket order into Firestore
 * Returns the order doc reference if created/updated
 */
export async function syncShiprocketOrder(shiprocketOrder) {
  const db = getDb()
  const ordersRef = collection(db, ORDERS_COLLECTION)

  // Check if order already exists
  const q = query(
    ordersRef,
    where('shiprocketOrderId', '==', shiprocketOrder.shiprocketOrderId || shiprocketOrder.orderNumber)
  )
  const existing = await getDocs(q)

  const orderData = {
    orderNumber: shiprocketOrder.orderNumber,
    shiprocketOrderId: shiprocketOrder.shiprocketOrderId,
    shipmentId: shiprocketOrder.shipmentId,
    awb: shiprocketOrder.awb,
    trackingNumber: shiprocketOrder.trackingNumber,
    customerName: shiprocketOrder.customerName,
    phone: shiprocketOrder.phone,
    email: shiprocketOrder.email,
    address: shiprocketOrder.address,
    platform: shiprocketOrder.platform || 'Shiprocket',
    status: shiprocketOrder.status || 'pending',
    courier: shiprocketOrder.courier,
    weight: shiprocketOrder.weight,
    source: 'shiprocket',
    sourceData: shiprocketOrder, // Store full response for reference
    updatedAt: serverTimestamp(),
  }

  if (existing.size > 0) {
    // Update existing order
    const docId = existing.docs[0].id
    await updateDoc(doc(db, ORDERS_COLLECTION, docId), orderData)
    console.log(`✅ Updated Shiprocket order: ${shiprocketOrder.orderNumber}`)
    return { id: docId, ...orderData }
  } else {
    // Create new order
    const createdAt = shiprocketOrder.orderDate ? new Date(shiprocketOrder.orderDate) : new Date()
    orderData.createdAt = createdAt
    const docRef = await addDoc(ordersRef, orderData)
    console.log(`✅ Created Shiprocket order: ${shiprocketOrder.orderNumber}`)
    return { id: docRef.id, ...orderData }
  }
}

/**
 * Batch sync multiple Shiprocket orders
 */
export async function syncShiprocketOrdersBatch(shiprocketOrders) {
  const results = []
  const errors = []

  for (const order of shiprocketOrders) {
    try {
      const result = await syncShiprocketOrder(order)
      results.push(result)
    } catch (error) {
      console.error(`Failed to sync order ${order.orderNumber}:`, error)
      errors.push({ orderNumber: order.orderNumber, error: error.message })
    }
  }

  return { results, errors }
}

/**
 * Pull all Shiprocket orders and sync to Firestore
 */
export async function pullShiprocketOrders(options = {}) {
  const { page = 1, per_page = 100, status_filter = '', onProgress } = options

  try {
    if (onProgress) onProgress({ status: 'Fetching orders from Shiprocket...' })

    const orders = await fetchShiprocketOrders(page, per_page, status_filter)
    if (!orders || orders.length === 0) {
      if (onProgress) onProgress({ status: 'No orders found in Shiprocket', count: 0 })
      return { success: true, synced: 0, failed: 0 }
    }

    if (onProgress) onProgress({ status: `Found ${orders.length} orders. Syncing to Firestore...` })

    const { results, errors } = await syncShiprocketOrdersBatch(orders)

    if (onProgress) {
      onProgress({
        status: `Sync complete! ${results.length} synced, ${errors.length} failed`,
        count: results.length,
        errors: errors.length > 0 ? errors : null,
      })
    }

    return { success: true, synced: results.length, failed: errors.length, errors }
  } catch (error) {
    console.error('Error pulling Shiprocket orders:', error)
    if (onProgress) onProgress({ status: `Error: ${error.message}`, error: true })
    throw error
  }
}
