import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { getDb } from '../firebase'

export const logChange = async (type, action, description, details = null, user = 'Unknown') => {
    try {
        const db = getDb()
        if (!db) return

        await addDoc(collection(db, 'change_history'), {
            type, // 'orders', 'inventory', 'customers', 'production'
            action, // 'created', 'updated', 'deleted'
            description,
            details,
            user,
            timestamp: serverTimestamp()
        })
    } catch (error) {
        console.error('Error logging change:', error)
    }
}
