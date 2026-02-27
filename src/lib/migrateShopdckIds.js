/**
 * Migration script to rename existing Shopdeck order IDs sequentially
 * 
 * Two modes:
 * 1. renumberShopdeckOrders() - Renumber ALL Shopdeck orders chronologically: Shpdck1001, 1002, etc.
 * 2. migrateShopdeckOrderIds() - Format fix only (legacy): Shpdck23 -> Shpdck1023
 */

export async function cleanupShopdeckDuplicates(firestore) {
  try {
    console.log('Starting cleanup of duplicate Shopdeck order IDs...')

    const { getDocs, query, collection, updateDoc, doc, where } = await import('firebase/firestore')

    const ordersRef = collection(firestore, 'production_orders')
    
    // Get ALL orders and filter for Shopdeck client-side (handles case variations)
    const allOrdersSnapshot = await getDocs(collection(firestore, 'production_orders'))
    
    const orders = []
    allOrdersSnapshot.forEach(docSnapshot => {
      const order = docSnapshot.data()
      // Check if it's a Shopdeck order (handles case variations)
      const platform = order.platform || 'Shopify'
      if (platform === 'Shopdeck' || platform === 'Shopodeck' || platform === 'shopdeck' || platform === 'shopodeck') {
        const createdDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0)
        orders.push({
          id: docSnapshot.id,
          order,
          createdDate
        })
      }
    })

    console.log(`Found ${orders.length} Shopdeck orders for cleanup`)

    orders.sort((a, b) => a.createdDate - b.createdDate)

    // Check for duplicates
    const numberMap = {}
    orders.forEach(({ order }) => {
      const orderId = order.orderNumber || ''
      const match = orderId.match(/[Ss]hpdck(\d+)/)  // Case-insensitive
      if (match) {
        const num = parseInt(match[1], 10)
        if (!numberMap[num]) {
          numberMap[num] = []
        }
        numberMap[num].push(orderId)
      }
    })

    const duplicates = Object.entries(numberMap).filter(([_, ids]) => ids.length > 1)
    console.log('Found duplicates:', duplicates)

    let successCount = 0
    let fixedCount = 0
    const errors = []

    // Re-assign all numbers sequentially to ensure no gaps or duplicates
    for (let idx = 0; idx < orders.length; idx++) {
      const { id, order } = orders[idx]
      const oldOrderId = order.orderNumber
      const newOrderId = `Shpdck${1001 + idx}`

      try {
        await updateDoc(doc(firestore, 'production_orders', id), {
          orderNumber: newOrderId,
          previousOrderNumber: oldOrderId,
          renumberedAt: new Date().toISOString(),
          sequenceNumber: 1001 + idx
        })

        if (oldOrderId !== newOrderId) {
          console.log(`✓ [${idx + 1}/${orders.length}] ${oldOrderId} → ${newOrderId}`)
          fixedCount++
        }
        successCount++
      } catch (error) {
        const errorMsg = `Failed to update order ${idx}: ${error.message}`
        errors.push(errorMsg)
        console.error(`✗ ${errorMsg}`)
      }
    }

    const summary = {
      success: successCount,
      fixed: fixedCount,
      duplicatesFound: duplicates.length,
      failed: errors.length,
      total: orders.length,
      errors,
      timestamp: new Date().toISOString()
    }

    console.log('Cleanup complete:', summary)
    return summary
  } catch (error) {
    console.error('Cleanup failed:', error)
    throw error
  }
}

export async function renumberShopdeckOrders(firestore) {
  try {
    console.log('Starting sequential renumbering of Shopdeck orders...')

    const { getDocs, query, collection, updateDoc, doc, where } = await import('firebase/firestore')

    const ordersRef = collection(firestore, 'production_orders')
    
    // Get ALL orders and filter for Shopdeck client-side (handles case variations)
    const allOrdersSnapshot = await getDocs(collection(firestore, 'production_orders'))
    
    const orders = []
    allOrdersSnapshot.forEach(docSnapshot => {
      const order = docSnapshot.data()
      // Check if it's a Shopdeck order (handles case variations)
      const platform = order.platform || 'Shopify'
      if (platform === 'Shopdeck' || platform === 'Shopodeck' || platform === 'shopdeck' || platform === 'shopodeck') {
        const createdDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0)
        orders.push({
          id: docSnapshot.id,
          order,
          createdDate
        })
      }
    })

    console.log(`Found ${orders.length} Shopdeck orders for renumbering`)

    orders.sort((a, b) => a.createdDate - b.createdDate)

    let successCount = 0
    const errors = []

    // Renumber sequentially starting from 1001
    for (let idx = 0; idx < orders.length; idx++) {
      const { id, order } = orders[idx]
      const newOrderId = `Shpdck${1001 + idx}`
      const oldOrderId = order.orderNumber

      try {
        await updateDoc(doc(firestore, 'production_orders', id), {
          orderNumber: newOrderId,
          previousOrderNumber: oldOrderId,
          renumberedAt: new Date().toISOString(),
          sequenceNumber: 1001 + idx
        })

        console.log(`✓ [${idx + 1}/${orders.length}] ${oldOrderId} → ${newOrderId}`)
        successCount++
      } catch (error) {
        const errorMsg = `Failed to update ${oldOrderId}: ${error.message}`
        errors.push(errorMsg)
        console.error(`✗ ${errorMsg}`)
      }
    }

    const summary = {
      success: successCount,
      failed: errors.length,
      total: orders.length,
      errors,
      timestamp: new Date().toISOString(),
      startDate: orders[0]?.createdDate.toISOString() || 'unknown',
      endDate: orders[orders.length - 1]?.createdDate.toISOString() || 'unknown'
    }

    console.log('Renumbering complete:', summary)
    return summary
  } catch (error) {
    console.error('Renumbering failed:', error)
    throw error
  }
}

export async function migrateShopdeckOrderIds(firestore) {
  try {
    console.log('Starting Shopdeck Order ID migration...')

    const { getDocs, query, collection, updateDoc, doc } = await import('firebase/firestore')

    const ordersRef = collection(firestore, 'production_orders')
    const snapshot = await getDocs(query(ordersRef))

    let migrationCount = 0
    const errors = []

    for (const docSnapshot of snapshot.docs) {
      const order = docSnapshot.data()
      const orderId = order.orderNumber || ''

      // Check if it's a Shopdeck order that needs migration
      if (orderId.startsWith('Shpdck') && !orderId.match(/Shpdck\d{4,}/)) {
        // Extract the number part (e.g., "23" from "Shpdck23")
        const match = orderId.match(/Shpdck(\d+)/)
        if (match) {
          const originalNum = parseInt(match[1], 10)
          const newNum = 1000 + originalNum
          const newOrderId = `Shpdck${newNum}`

          try {
            await updateDoc(doc(firestore, 'production_orders', docSnapshot.id), {
              orderNumber: newOrderId,
              migratedAt: new Date().toISOString(),
              migratedFrom: orderId
            })

            console.log(`✓ ${orderId} → ${newOrderId}`)
            migrationCount++
          } catch (error) {
            errors.push(`Failed to update ${orderId}: ${error.message}`)
            console.error(`✗ Failed to update ${orderId}:`, error)
          }
        }
      }
    }

    const summary = {
      success: migrationCount,
      failed: errors.length,
      errors,
      timestamp: new Date().toISOString()
    }

    console.log('Migration complete:', summary)
    return summary
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  }
}

export async function getMigrationStats(firestore) {
  try {
    const { getDocs, query, collection, where } = await import('firebase/firestore')

    const ordersRef = collection(firestore, 'production_orders')
    
    // Get ALL orders and filter for Shopdeck client-side (handles case variations)
    const allOrdersSnapshot = await getDocs(collection(firestore, 'production_orders'))
    
    const shopdeckOrders = []
    allOrdersSnapshot.forEach(docSnapshot => {
      const order = docSnapshot.data()
      // Check if it's a Shopdeck order (handles case variations: Shopdeck, Shopodeck, etc.)
      const platform = order.platform || 'Shopify'
      if (platform === 'Shopdeck' || platform === 'Shopodeck' || platform === 'shopdeck' || platform === 'shopodeck') {
        shopdeckOrders.push({ id: docSnapshot.id, order })
      }
    })

    console.log(`Found ${shopdeckOrders.length} Shopdeck orders for migration stats`)

    // Count those that need sequential renumbering
    const needsRenumbering = shopdeckOrders.filter(({ order }) => {
      const orderId = order.orderNumber || ''
      return !orderId.match(/Shpdck\d{4,}/)
    })

    // Detect duplicates and gaps - more robust check
    const numberMap = {}
    const usedNumbers = new Set()
    const detailedOrders = []
    
    shopdeckOrders.forEach(({ id, order }) => {
      const orderId = order.orderNumber || ''
      const match = orderId.match(/[Ss]hpdck(\d+)/)  // Case-insensitive match
      if (match) {
        const num = parseInt(match[1], 10)
        usedNumbers.add(num)
        
        if (!numberMap[num]) {
          numberMap[num] = []
        }
        numberMap[num].push({ id, orderNumber: orderId })
        detailedOrders.push({ num, id, orderNumber: orderId })
      }
    })

    // Log all numbers found for debugging
    const sortedNums = Array.from(usedNumbers).sort((a, b) => a - b)
    console.log('Shopdeck order numbers found:', sortedNums.join(', '))

    const duplicates = Object.entries(numberMap).filter(([_, ids]) => ids.length > 1)
    console.log(`Duplicate numbers detected: ${duplicates.length}`, duplicates.map(([num, ids]) => `Shpdck${num} (${ids.length}x)`))
    
    // Check for gaps
    let gaps = 0
    const gapList = []
    if (usedNumbers.size > 0) {
      const minNum = Math.min(...usedNumbers)
      const maxNum = Math.max(...usedNumbers)
      for (let i = minNum; i <= maxNum; i++) {
        if (!usedNumbers.has(i)) {
          gaps++
          gapList.push(i)
        }
      }
    }
    if (gapList.length > 0) {
      console.log(`Gaps found in sequence: ${gapList.join(', ')}`)
    }

    // Count those that need format fix only
    const needsFormatFix = shopdeckOrders.filter(({ order }) => {
      const orderId = order.orderNumber || ''
      return orderId.toLowerCase().startsWith('shpdck') && orderId.match(/[Ss]hpdck\d{1,3}$/)
    })

    // Get total orders
    const totalSnapshot = allOrdersSnapshot

    return {
      shopdeckTotal: shopdeckOrders.length,
      needsRenumbering: needsRenumbering.length,
      needsFormatFix: needsFormatFix.length,
      alreadyCorrect: shopdeckOrders.length - needsRenumbering.length - needsFormatFix.length,
      duplicatesFound: duplicates.length,
      gapsFound: gaps,
      otherPlatforms: totalSnapshot.size - shopdeckOrders.length,
      total: totalSnapshot.size,
      details: {
        needsRenumbering: needsRenumbering.slice(0, 5).map(({ order }) => order.orderNumber),
        alreadyCorrect: shopdeckOrders.filter(({ order }) => order.orderNumber?.match(/[Ss]hpdck\d{4,}/)).slice(0, 5).map(({ order }) => order.orderNumber),
        duplicates: duplicates.slice(0, 3).map(([num, ids]) => `Shpdck${num} (${ids.length}x)`),
        gaps: gapList.slice(0, 10)
      }
    }
  } catch (error) {
    console.error('Failed to get migration stats:', error)
    throw error
  }
}
