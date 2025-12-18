import React, { useState } from 'react'
import { getDb } from '../firebase'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ORDERS_COLLECTION } from '../lib/utils'
import { logOrderStatusChanged } from '../lib/notificationLogger'

export default function ShippingModal({ visible, orderId, orderNumber, userProfile, onClose, onDataChanged }) {
    const [form, setForm] = useState({ sellingPrice: '', shippingCost: '', otherExpenses: '' })
    const [error, setError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    if (!visible || !orderId) return null

    const handleSubmit = async () => {
        const selling = parseFloat(form.sellingPrice)
        if (isNaN(selling) || selling <= 0) {
            setError("Valid selling price required.")
            return
        }

        setIsSubmitting(true)
        setError('')

        try {
            const db = getDb()
            await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
                status: 'Order Shipped (Completed)',
                finalSellingPrice: selling,
                shippingCost: parseFloat(form.shippingCost) || 0,
                otherExpenses: parseFloat(form.otherExpenses) || 0,
                updatedAt: serverTimestamp()
            })
            // Log order shipped
            await logOrderStatusChanged(orderNumber || orderId, 'Order Shipped (Completed)', userProfile?.name || 'Unknown')
            setForm({ sellingPrice: '', shippingCost: '', otherExpenses: '' })
            if (onDataChanged) await onDataChanged()
            onClose()
        } catch (e) {
            console.error(e)
            setError('Failed to ship order')
        }
        setIsSubmitting(false)
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl p-6 pb-8 shadow-2xl border dark:border-gray-800 border dark:border-gray-800">
                <h3 className="text-lg font-bold mb-4">Complete Shipping</h3>
                {error && (
                    <div className="mb-3 p-2 bg-red-50 text-red-600 text-sm rounded">{error}</div>
                )}
                <div className="space-y-3 mb-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500">Selling Price (₹)</label>
                        <input
                            type="number"
                            className="w-full p-2 border rounded-xl mt-1"
                            value={form.sellingPrice}
                            onChange={e => setForm({ ...form, sellingPrice: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500">Shipping Cost (₹)</label>
                        <input
                            type="number"
                            className="w-full p-2 border rounded-xl mt-1"
                            value={form.shippingCost}
                            onChange={e => setForm({ ...form, shippingCost: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500">Additional Expenses (₹)</label>
                        <input
                            type="number"
                            className="w-full p-2 border rounded-xl mt-1"
                            value={form.otherExpenses}
                            onChange={e => setForm({ ...form, otherExpenses: e.target.value })}
                        />
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={handleSubmit} disabled={isSubmitting} className="flex-1 bg-brand text-white py-3 rounded-xl font-bold">
                        Confirm Ship
                    </button>
                    <button onClick={onClose} disabled={isSubmitting} className="flex-1 bg-gray-100 text-gray-600 dark:text-gray-400 dark:text-gray-500 py-3 rounded-xl font-bold">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}
