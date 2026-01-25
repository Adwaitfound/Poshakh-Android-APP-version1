import React, { useState } from 'react'
import { getDb } from '../firebase'
import { doc, updateDoc, serverTimestamp, collection, addDoc, increment } from 'firebase/firestore'
import { ORDERS_COLLECTION, FABRICS_COLLECTION } from '../lib/utils'
import { logOrderStatusChanged } from '../lib/notificationLogger'

export default function ReturnModal({ visible, orderId, orderNumber, userProfile, onClose, onDataChanged, inventoryItems = [], allOrders = [] }) {
    const [transactionType, setTransactionType] = useState('return') // 'return' | 'exchange'
    const [form, setForm] = useState({ 
        returnCost: '', 
        returnReason: '',
        // Exchange fields
        exchangeOutfitId: '',
        exchangeSize: 'M',
        exchangeQuantity: '1',
        additionalCost: '0'
    })
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState('')

    if (!visible || !orderId) return null

    const currentOrder = allOrders.find(o => o.id === orderId)
    const outfitsWithStock = inventoryItems
        .filter(item => item.type === 'outfit' && Object.values(item.stockBreakdown || {}).reduce((sum, val) => sum + (parseInt(val) || 0), 0) > 0)
        .map(item => ({
            ...item,
            totalStock: Object.values(item.stockBreakdown || {}).reduce((sum, val) => sum + (parseInt(val) || 0), 0)
        }))
    
    const selectedExchangeOutfit = outfitsWithStock.find(o => o.id === form.exchangeOutfitId)

    const submitReturn = async () => {
        setIsSaving(true)
        setError('')
        try {
            const db = getDb()
            
            if (transactionType === 'return') {
                // Simple return - restore inventory and mark order as returned
                await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
                    status: 'Returned',
                    returnCost: parseFloat(form.returnCost) || 0,
                    returnReason: form.returnReason || '',
                    returnedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                })

                // Restore inventory if this was a stock order
                if (currentOrder?.orderType === 'stock' && currentOrder?.outfitId && currentOrder?.size && currentOrder?.quantity) {
                    const outfitRef = doc(db, FABRICS_COLLECTION, currentOrder.outfitId)
                    await updateDoc(outfitRef, {
                        [`stockBreakdown.${currentOrder.size}`]: increment(parseInt(currentOrder.quantity)),
                        updatedAt: serverTimestamp()
                    })

                    // Log history
                    await addDoc(collection(outfitRef, 'history'), {
                        type: 'RETURN_RECEIVED',
                        amount: parseInt(currentOrder.quantity),
                        size: currentOrder.size,
                        orderNumber: currentOrder.orderNumber || orderId,
                        customerName: currentOrder.customerName || 'N/A',
                        status: 'Returned',
                        returnReason: form.returnReason || '',
                        user: {
                            name: userProfile?.displayName || userProfile?.name || 'Unknown',
                            email: userProfile?.email || ''
                        },
                        timestamp: serverTimestamp()
                    })
                }

                await logOrderStatusChanged(orderNumber || orderId, 'Returned', userProfile?.name || 'Unknown')
            } else {
                // Exchange - validate and process both transactions
                if (!form.exchangeOutfitId || !form.exchangeSize || !form.exchangeQuantity) {
                    setError('Please select exchange outfit, size, and quantity')
                    setIsSaving(false)
                    return
                }

                const exchangeQty = parseInt(form.exchangeQuantity)
                const availableStock = parseInt(selectedExchangeOutfit?.stockBreakdown?.[form.exchangeSize]) || 0

                if (exchangeQty > availableStock) {
                    setError(`Not enough stock! Only ${availableStock} pieces available in size ${form.exchangeSize}`)
                    setIsSaving(false)
                    return
                }

                // Update original order
                await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
                    status: 'Exchanged',
                    returnReason: form.returnReason || 'Exchange',
                    exchangedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    exchangeDetails: {
                        returnedOutfit: currentOrder?.outfitName || '',
                        returnedSize: currentOrder?.size || '',
                        returnedQuantity: currentOrder?.quantity || 1,
                        exchangedOutfit: selectedExchangeOutfit?.name || '',
                        exchangedSize: form.exchangeSize,
                        exchangedQuantity: exchangeQty,
                        additionalCost: parseFloat(form.additionalCost) || 0,
                        exchangedBy: userProfile?.name || 'Unknown'
                    }
                })

                // Restore original item to inventory
                if (currentOrder?.orderType === 'stock' && currentOrder?.outfitId && currentOrder?.size && currentOrder?.quantity) {
                    const returnedOutfitRef = doc(db, FABRICS_COLLECTION, currentOrder.outfitId)
                    await updateDoc(returnedOutfitRef, {
                        [`stockBreakdown.${currentOrder.size}`]: increment(parseInt(currentOrder.quantity)),
                        updatedAt: serverTimestamp()
                    })

                    await addDoc(collection(returnedOutfitRef, 'history'), {
                        type: 'EXCHANGE_RETURN',
                        amount: parseInt(currentOrder.quantity),
                        size: currentOrder.size,
                        orderNumber: currentOrder.orderNumber || orderId,
                        customerName: currentOrder.customerName || 'N/A',
                        status: 'Exchanged (Returned)',
                        user: {
                            name: userProfile?.displayName || userProfile?.name || 'Unknown',
                            email: userProfile?.email || ''
                        },
                        timestamp: serverTimestamp()
                    })
                }

                // Deduct exchange item from inventory
                const exchangeOutfitRef = doc(db, FABRICS_COLLECTION, form.exchangeOutfitId)
                await updateDoc(exchangeOutfitRef, {
                    [`stockBreakdown.${form.exchangeSize}`]: increment(-exchangeQty),
                    updatedAt: serverTimestamp()
                })

                await addDoc(collection(exchangeOutfitRef, 'history'), {
                    type: 'EXCHANGE_GIVEN',
                    amount: -exchangeQty,
                    size: form.exchangeSize,
                    orderNumber: currentOrder?.orderNumber || orderId,
                    customerName: currentOrder?.customerName || 'N/A',
                    status: 'Exchanged (Given)',
                    user: {
                        name: userProfile?.displayName || userProfile?.name || 'Unknown',
                        email: userProfile?.email || ''
                    },
                    timestamp: serverTimestamp()
                })

                await logOrderStatusChanged(orderNumber || orderId, 'Exchanged', userProfile?.name || 'Unknown')
            }

            if (onDataChanged) await onDataChanged()
            onClose()
        } catch (e) {
            console.error('Return/Exchange submit error:', e)
            setError(e.message || 'Failed to process transaction')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm">
            <div className="bg-gray-950 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-2 border-lime-glow/40">
                <div className="bg-emerald-pine p-6 border-b border-lime-glow/40 flex justify-between items-center flex-shrink-0">
                    <h3 className="font-bold text-lg text-white">
                        {transactionType === 'return' ? 'Return Order' : 'Exchange Order'}
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
                        <span className="text-2xl">×</span>
                    </button>
                </div>

                {/* Transaction Type Toggle */}
                <div className="px-6 pt-4 flex-shrink-0">
                    <div className="bg-emerald-pine rounded-2xl p-1 flex gap-1 border-2 border-lime-glow/40">
                        <button
                            onClick={() => setTransactionType('return')}
                            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${transactionType === 'return' ? 'bg-lime-glow text-emerald-pine shadow' : 'text-lime-glow/60'}`}
                        >
                            Return Only
                        </button>
                        <button
                            onClick={() => setTransactionType('exchange')}
                            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${transactionType === 'exchange' ? 'bg-lime-glow text-emerald-pine shadow' : 'text-lime-glow/60'}`}
                        >
                            Exchange
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {error && (
                        <div className="mb-3 p-3 bg-red-900/50 border border-red-500/50 text-red-200 text-sm rounded-xl">{error}</div>
                    )}

                    {/* Current Order Info */}
                    {currentOrder && (
                        <div className="mb-4 p-3 bg-emerald-900/40 border border-lime-glow/30 rounded-xl">
                            <p className="text-xs text-lime-glow/70 mb-1">Original Order</p>
                            <p className="text-sm font-bold text-white">{currentOrder.outfitName}</p>
                            <p className="text-xs text-lime-glow">
                                Size: {currentOrder.size} | Qty: {currentOrder.quantity || 1}
                            </p>
                        </div>
                    )}

                    {transactionType === 'return' ? (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-lime-glow/80 uppercase mb-1 block">Return Cost (₹)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 text-sm"
                                    placeholder="Optional refund amount"
                                    value={form.returnCost}
                                    onChange={e => setForm({ ...form, returnCost: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-lime-glow/80 uppercase mb-1 block">Reason for Return</label>
                                <textarea
                                    rows={3}
                                    className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 text-sm"
                                    placeholder="Why is this being returned?"
                                    value={form.returnReason}
                                    onChange={e => setForm({ ...form, returnReason: e.target.value })}
                                />
                            </div>
                            {currentOrder?.orderType === 'stock' && (
                                <div className="p-3 bg-green-900/30 border border-green-500/40 rounded-xl">
                                    <p className="text-xs text-green-300">
                                        ✓ Item will be restored to inventory ({currentOrder.quantity || 1}x {currentOrder.size})
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-lime-glow/80 uppercase mb-1 block">Reason for Exchange</label>
                                <textarea
                                    rows={2}
                                    className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 text-sm"
                                    placeholder="Why exchange?"
                                    value={form.returnReason}
                                    onChange={e => setForm({ ...form, returnReason: e.target.value })}
                                />
                            </div>

                            <div className="border-t border-lime-glow/20 pt-3">
                                <p className="text-xs font-bold text-lime-glow mb-2">EXCHANGE WITH:</p>
                                
                                <div>
                                    <label className="text-xs font-bold text-lime-glow/80 uppercase mb-1 block">Select Outfit *</label>
                                    <select
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 text-sm"
                                        value={form.exchangeOutfitId}
                                        onChange={e => setForm({ ...form, exchangeOutfitId: e.target.value })}
                                        required
                                    >
                                        <option value="">Choose outfit...</option>
                                        {outfitsWithStock.map(o => (
                                            <option key={o.id} value={o.id}>
                                                {o.name} ({o.totalStock} pcs)
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {selectedExchangeOutfit && (
                                    <div className="mt-2 p-2 bg-emerald-900/40 border border-lime-glow/30 rounded-lg">
                                        <p className="text-xs text-lime-glow/70 mb-1">Available Stock:</p>
                                        <div className="flex gap-1 flex-wrap">
                                            {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(size => {
                                                const stock = parseInt(selectedExchangeOutfit?.stockBreakdown?.[size]) || 0
                                                if (stock === 0) return null
                                                return (
                                                    <div key={size} className="px-2 py-1 rounded-full text-xs font-bold bg-lime-400/80 text-emerald-900">
                                                        {size}: {stock}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-2 mt-3">
                                    <div>
                                        <label className="text-xs font-bold text-lime-glow/80 uppercase mb-1 block">Size *</label>
                                        <select
                                            className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 text-sm"
                                            value={form.exchangeSize}
                                            onChange={e => setForm({ ...form, exchangeSize: e.target.value })}
                                            required
                                        >
                                            {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(size => (
                                                <option key={size} value={size}>
                                                    {size} {selectedExchangeOutfit && `(${parseInt(selectedExchangeOutfit.stockBreakdown?.[size]) || 0})`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-lime-glow/80 uppercase mb-1 block">Quantity *</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max={selectedExchangeOutfit ? (parseInt(selectedExchangeOutfit.stockBreakdown?.[form.exchangeSize]) || 999) : 999}
                                            className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 text-sm"
                                            value={form.exchangeQuantity}
                                            onChange={e => setForm({ ...form, exchangeQuantity: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <label className="text-xs font-bold text-lime-glow/80 uppercase mb-1 block">Additional Cost (₹)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 text-sm"
                                        placeholder="If customer pays extra"
                                        value={form.additionalCost}
                                        onChange={e => setForm({ ...form, additionalCost: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-lime-glow/40 bg-gray-950 flex gap-3 flex-shrink-0">
                    <button onClick={submitReturn} disabled={isSaving} className="flex-1 bg-lime-glow text-emerald-pine py-3 rounded-xl font-bold shadow-lg hover:bg-lime-glow/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        {isSaving ? 'Processing...' : (transactionType === 'return' ? 'Confirm Return' : 'Confirm Exchange')}
                    </button>
                    <button onClick={onClose} className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-white/20 active:scale-95 transition-all border border-lime-glow/40">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}
