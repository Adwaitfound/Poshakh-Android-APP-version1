import React, { useState } from 'react'
import { getDb } from '../firebase'
import { doc, deleteDoc } from 'firebase/firestore'
import { ORDERS_COLLECTION } from '../lib/utils'
import { logOrderStatusChanged } from '../lib/notificationLogger'

export default function DeleteConfirmModal({ visible, orderId, orderNumber, customerName, userProfile, onClose, onDataChanged }) {
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [isDeleting, setIsDeleting] = useState(false)

    console.log('DeleteConfirmModal render:', { visible, orderId })

    if (!visible || !orderId) return null

    const handleDelete = async () => {
        console.log('handleDelete called, password:', password)
        if (password !== 'posh123') {
            setError("Incorrect Password!")
            return
        }

        setIsDeleting(true)
        setError('')

        try {
            const db = getDb()
            await deleteDoc(doc(db, ORDERS_COLLECTION, orderId))
            // Log order deletion
            await logOrderStatusChanged(orderNumber || orderId, 'Deleted', userProfile?.name || 'Unknown')
            setPassword('')
            if (onDataChanged) await onDataChanged()
            onClose()
        } catch (e) {
            console.error(e)
            setError("Delete failed: " + e.message)
        }
        setIsDeleting(false)
    }

    return (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm">
            <div className="bg-gray-900 w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl p-6 pb-8 shadow-2xl border-2 border-red-500/50">
                <h3 className="text-lg font-bold mb-4 text-red-500 flex items-center gap-2">
                    <span>🗑️</span> Delete Record?
                </h3>
                <p className="text-sm text-white/80 mb-4">Enter admin password to permanently delete this order history.</p>
                {error && (
                    <div className="mb-3 p-2 bg-red-900/50 border border-red-500/50 text-red-200 text-sm rounded">{error}</div>
                )}
                <input
                    type="password"
                    className="w-full p-3 bg-gray-800 border-2 border-lime-glow/40 text-white rounded-xl mb-4"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoFocus
                    disabled={isDeleting}
                />
                <div className="flex gap-3">
                    <button onClick={handleDelete} disabled={isDeleting} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 disabled:opacity-50">
                        {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                    <button onClick={() => { setPassword(''); onClose(); }} disabled={isDeleting} className="flex-1 bg-gray-700 text-white py-3 rounded-xl font-bold hover:bg-gray-600 disabled:opacity-50">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}
