import { getDb } from '../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { logChange } from './changeLogger'

const NOTIFICATIONS_COLLECTION = 'notifications'

export const logNotification = async (title, message, type = 'info', user = 'System') => {
    try {
        const db = getDb()
        await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
            title,
            message,
            type, // 'login', 'order', 'inventory', 'stock', 'warning'
            user,
            read: false,
            createdAt: serverTimestamp()
        })
    } catch (error) {
        console.error('Error logging notification:', error)
    }
}

export const logLogin = async (userName) => {
    await logNotification(
        'User Login',
        `${userName} logged in to the app`,
        'login',
        userName
    )
    await logChange('auth', 'login', `${userName} logged in`, null, userName)
}

export const logOrderCreated = async (orderNumber, customerName, user) => {
    await logNotification(
        'Order Created',
        `Order #${orderNumber} created for ${customerName}`,
        'order',
        user
    )
    await logChange('orders', 'created', `Order #${orderNumber} created for ${customerName}`, { orderNumber, customerName }, user)
}

export const logOrderStatusChanged = async (orderNumber, newStatus, user = 'Unknown', oldStatus = '') => {
    const changeMsg = oldStatus ? `Order #${orderNumber}: ${oldStatus} → ${newStatus}` : `Order #${orderNumber}: ${newStatus}`
    await logNotification(
        'Order Status Changed',
        changeMsg,
        'order',
        user
    )
    const action = newStatus === 'Deleted' ? 'deleted' : 'updated'
    await logChange('orders', action, changeMsg, { orderNumber, oldStatus, newStatus }, user)
}

export const logInventoryAdded = async (itemName, itemType = 'inventory', user = 'Unknown') => {
    await logNotification(
        'Inventory Added',
        `${itemName} added (${itemType})`,
        'inventory',
        user
    )
    await logChange('inventory', 'created', `${itemName} added (${itemType})`, { itemName, itemType }, user)
}

export const logStockAdjusted = async (itemName, type, amount, user) => {
    await logNotification(
        `Stock ${type === 'ADD' ? 'Added' : 'Deducted'}`,
        `${itemName}: ${type === 'ADD' ? '+' : '-'}${amount}`,
        'stock',
        user
    )
    await logChange('inventory', 'updated', `${itemName} stock ${type === 'ADD' ? 'added' : 'deducted'} by ${amount}`, { itemName, type, amount }, user)
}

export const logLowStockAlert = async (itemName, currentStock) => {
    await logNotification(
        'Low Stock Alert',
        `${itemName} is running low: ${currentStock} left`,
        'warning',
        'System'
    )
    await logChange('inventory', 'warning', `${itemName} low stock (${currentStock} left)`, { itemName, currentStock }, 'System')
}
