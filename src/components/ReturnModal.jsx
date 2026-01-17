import React, { useState } from 'react'
import { getDb } from '../firebase'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ORDERS_COLLECTION } from '../lib/utils'
import { logOrderStatusChanged } from '../lib/notificationLogger'

export default function ReturnModal({ visible, orderId, orderNumber, userProfile, onClose, onDataChanged }) {
    const [form, setForm] = useState({ returnCost: '', returnReason: '' })
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState('')

    if (!visible || !orderId) return null

    const submitReturn = async () => {
        setIsSaving(true)
        setError('')
        try {
            const db = getDb()
            await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
                status: 'Returned',
                returnCost: parseFloat(form.returnCost) || 0,
                returnReason: form.returnReason || '',
                returnedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            })
            try { await logOrderStatusChanged(orderNumber || orderId, 'Returned', userProfile?.name || 'Unknown') } catch {}
            if (onDataChanged) await onDataChanged()
            onClose()
        } catch (e) {
            console.error('Return submit error:', e)
            setError(e.message || 'Failed to record return')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm">
            <div className="bg-gray-950 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl h-[60vh] sm:h-auto overflow-hidden flex flex-col shadow-2xl border-2 border-lime-glow/40">
                <div className="bg-emerald-pine p-6 border-b border-lime-glow/40 flex justify-between items-center flex-shrink-0">
                    <h3 className="font-bold text-lg text-white">Return Order</h3>
                    <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
                        <span className="text-2xl">×</span>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    {error && (
                        <div className="mb-3 p-3 bg-red-900/50 border border-red-500/50 text-red-200 text-sm rounded-xl">{error}</div>
                    )}
                    <div className="space-y-3">
                        <input
                            type="number"
                            className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 text-sm"
                            placeholder="Return Cost (₹)"
                            value={form.returnCost}
                            onChange={e => setForm({ ...form, returnCost: e.target.value })}
                        />
                        <textarea
                            rows={3}
                            className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 text-sm"
                            placeholder="Reason for Return"
                            value={form.returnReason}
                            onChange={e => setForm({ ...form, returnReason: e.target.value })}
                        />
                    </div>
                </div>
                <div className="p-6 border-t border-lime-glow/40 bg-gray-950 flex gap-3">
                    <button onClick={submitReturn} disabled={isSaving} className="flex-1 bg-lime-glow text-emerald-pine py-3 rounded-xl font-bold shadow-lg hover:bg-lime-glow/90 active:scale-95 transition-all">
                        {isSaving ? 'Saving...' : 'Confirm Return'}
                    </button>
                    <button onClick={onClose} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-white/20 active:scale-95 transition-all border border-lime-glow/40">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}
