import React, { useState, useEffect } from 'react'
import { getDb } from '../firebase'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ORDERS_COLLECTION } from '../lib/utils'
import { logOrderStatusChanged } from '../lib/notificationLogger'

export default function ShippingModal({ visible, orderId, order, userProfile, onClose, onDataChanged }) {
    const [form, setForm] = useState({ sellingPrice: '', shippingCost: '', otherExpenses: '' })
    const [error, setError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Pre-fill form with existing order data
    useEffect(() => {
        if (visible && order) {
            setForm({
                sellingPrice: order.finalSellingPrice?.toString() || order.amount?.toString() || '',
                shippingCost: order.shippingCost?.toString() || order.shipping?.toString() || '',
                otherExpenses: order.otherExpenses?.toString() || ''
            })
        }
    }, [visible, order])

    if (!visible || !orderId) return null

    // Check if order already has the required pricing data
    const hasExistingData = order?.finalSellingPrice || order?.amount

    const handleSubmit = async () => {
        const selling = parseFloat(form.sellingPrice)
        
        // If order already has pricing data, allow proceeding without re-entering
        if (!hasExistingData && (isNaN(selling) || selling <= 0)) {
            setError("Valid selling price required.")
            return
        }

        setIsSubmitting(true)
        setError('')

        try {
            const db = getDb()
            const finalPrice = selling || order?.finalSellingPrice || order?.amount || 0
            
            await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
                status: 'Order Shipped (Completed)',
                finalSellingPrice: finalPrice,
                shippingCost: parseFloat(form.shippingCost) || order?.shippingCost || order?.shipping || 0,
                otherExpenses: parseFloat(form.otherExpenses) || order?.otherExpenses || 0,
                updatedAt: serverTimestamp()
            })
            // Log order shipped
            const orderNumber = order?.orderNumber || orderId
            await logOrderStatusChanged(orderNumber, 'Order Shipped (Completed)', userProfile?.name || 'Unknown')
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
                {hasExistingData && (
                    <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm rounded-lg">
                        ✓ Order pricing already set. You can edit below or just confirm.
                    </div>
                )}
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
                            placeholder={order?.finalSellingPrice || order?.amount ? '(Pre-filled from import)' : 'Required'}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500">Shipping Cost (₹)</label>
                        <input
                            type="number"
                            className="w-full p-2 border rounded-xl mt-1"
                            value={form.shippingCost}
                            onChange={e => setForm({ ...form, shippingCost: e.target.value })}
                            placeholder={order?.shippingCost || order?.shipping ? '(Pre-filled from import)' : 'Optional'}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500">Additional Expenses (₹)</label>
                        <input
                            type="number"
                            className="w-full p-2 border rounded-xl mt-1"
                            value={form.otherExpenses}
                            onChange={e => setForm({ ...form, otherExpenses: e.target.value })}
                            placeholder="Optional"
                        />
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={handleSubmit} disabled={isSubmitting} className="flex-1 bg-brand text-white py-3 rounded-xl font-bold hover:opacity-90 disabled:opacity-50">
                        {hasExistingData ? 'Confirm & Ship' : 'Confirm Ship'}
                    </button>
                    <button onClick={onClose} disabled={isSubmitting} className="flex-1 bg-gray-100 text-gray-600 dark:text-gray-400 dark:text-gray-500 py-3 rounded-xl font-bold">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}
