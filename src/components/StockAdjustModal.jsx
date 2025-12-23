import React, { useState } from 'react'
import { getDb } from '../firebase'
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore'
import { FABRICS_COLLECTION } from '../lib/utils'
import { logStockAdjusted } from '../lib/notificationLogger'

export default function StockAdjustModal({ item, type, onClose, userProfile, onDataChanged }) {
    const [amount, setAmount] = useState('')
    const [size, setSize] = useState('M')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    if (!item) return null

    const sizes = item.type === 'outfit' ? ['S', 'M', 'L', 'XL', 'XXL'] : null

    const handleSubmit = async (e) => {
        e.preventDefault()
        const amt = parseFloat(amount)
        if (!amt || amt <= 0) return

        setIsLoading(true)
        setError('')

        try {
            const db = getDb()
            const docRef = doc(db, FABRICS_COLLECTION, item.id)
            const isAdd = type === 'ADD'

            if (item.type === 'fabric') {
                const newLen = isAdd ? item.currentLength + amt : item.currentLength - amt
                if (!isAdd && newLen < 0) {
                    setError("Cannot deduct more than available.")
                    setIsLoading(false)
                    return
                }
                await updateDoc(docRef, { currentLength: newLen, updatedAt: serverTimestamp() })
                await addDoc(collection(docRef, 'history'), {
                    type: isAdd ? 'ADJUST_ADD' : 'ADJUST_DEDUCT',
                    amountUsed: amt,
                    isAddition: isAdd,
                    status: 'Manual Adjustment',
                    orderNumber: 'MANUAL',
                    usedByEmail: userProfile?.name,
                    usedAt: serverTimestamp()
                })
            } else {
                const currentQty = item.stockBreakdown?.[size] || 0
                const newQty = isAdd ? currentQty + amt : currentQty - amt
                if (!isAdd && newQty < 0) {
                    setError("Cannot deduct more than available.")
                    setIsLoading(false)
                    return
                }
                const newBreakdown = { ...item.stockBreakdown, [size]: newQty }
                await updateDoc(docRef, { stockBreakdown: newBreakdown, updatedAt: serverTimestamp() })
                await addDoc(collection(docRef, 'history'), {
                    type: isAdd ? 'OUTFIT_ADD' : 'OUTFIT_SOLD',
                    amountUsed: amt,
                    isAddition: isAdd,
                    size: size,
                    status: `Stock ${isAdd ? 'In' : 'Out'}`,
                    orderNumber: 'MANUAL',
                    usedByEmail: userProfile?.name,
                    usedAt: serverTimestamp()
                })
            }
            setAmount('')
            if (onDataChanged) await onDataChanged()

            // Log the stock adjustment
            await logStockAdjusted(item.name, type, amt, userProfile?.name)

            onClose()
        } catch (e) {
            console.error(e)
            setError('Failed to adjust stock')
        }
        setIsLoading(false)
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl p-6 pb-8 shadow-2xl border dark:border-gray-800 border dark:border-gray-800">
                <h3 className="text-lg font-bold mb-4 text-center">{type === 'ADD' ? 'Add Stock' : 'Deduct Stock'}</h3>
                {item.type === 'outfit' && (
                    <div className="flex justify-center gap-2 mb-4">
                        {['S', 'M', 'L', 'XL', 'XXL'].map(s => (
                            <button
                                key={s}
                                onClick={() => setSize(s)}
                                className={`w-10 h-10 rounded-full font-bold text-sm transition-colors ${size === s ? 'bg-[#084734] text-[#CEF17B]' : 'bg-gray-100 text-gray-500'}`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
                {error && (
                    <div className="mb-4 text-center text-red-600 text-sm">{error}</div>
                )}
                <div className="mb-4">
                    <input
                        type="number"
                        step="0.1"
                        className="w-full p-4 border-2 border-[#084734]/30 rounded-2xl text-2xl text-center font-bold focus:border-[#084734] outline-none text-gray-800"
                        autoFocus
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.0"
                        disabled={isLoading}
                    />
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleSubmit}
                        className="flex-1 bg-[#084734] text-[#CEF17B] py-3 rounded-xl font-bold shadow-lg hover:brightness-110 active:scale-95 transition-all"
                        disabled={isLoading || !amount}
                    >
                        Confirm
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 bg-gray-100 text-gray-700 dark:text-gray-300 py-3 rounded-xl font-bold border border-gray-200"
                        disabled={isLoading}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}
