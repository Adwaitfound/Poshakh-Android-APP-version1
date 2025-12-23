import React, { useState, useEffect } from 'react'
import { getDb } from '../firebase'
import { doc, updateDoc, serverTimestamp, increment } from 'firebase/firestore'
import { logInventoryAdded } from '../lib/notificationLogger'

export default function ReceiveProductionModal({ visible, batch, onClose, onDataChanged, inventoryItems = [], userProfile }) {
    const [receivedQty, setReceivedQty] = useState({
        S: '',
        M: '',
        L: '',
        XL: '',
        XXL: ''
    })
    const [status, setStatus] = useState('In Progress')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (batch && batch.sizeBreakdown) {
            // Set status from batch
            setStatus(batch.status || 'In Progress')

            // Pre-fill with the estimated quantities if not already received
            if (batch.status !== 'Completed') {
                setReceivedQty({
                    S: (batch.sizeBreakdown.S || 0).toString(),
                    M: (batch.sizeBreakdown.M || 0).toString(),
                    L: (batch.sizeBreakdown.L || 0).toString(),
                    XL: (batch.sizeBreakdown.XL || 0).toString(),
                    XXL: (batch.sizeBreakdown.XXL || 0).toString()
                })
            } else if (batch.receivedBreakdown) {
                // Show already received quantities
                setReceivedQty({
                    S: (batch.receivedBreakdown.S || 0).toString(),
                    M: (batch.receivedBreakdown.M || 0).toString(),
                    L: (batch.receivedBreakdown.L || 0).toString(),
                    XL: (batch.receivedBreakdown.XL || 0).toString(),
                    XXL: (batch.receivedBreakdown.XXL || 0).toString()
                })
            }
        }
    }, [batch])

    if (!visible || !batch) return null

    const totalReceived = Object.values(receivedQty).reduce((sum, val) => sum + (parseInt(val) || 0), 0)
    const totalEstimated = batch.totalPieces || 0

    const handleSubmit = async () => {
        if (totalReceived === 0) {
            setError('Please enter at least one piece received')
            return
        }

        setIsSubmitting(true)
        setError('')

        try {
            const db = getDb()

            // Prepare received breakdown
            const receivedBreakdown = {
                S: parseInt(receivedQty.S) || 0,
                M: parseInt(receivedQty.M) || 0,
                L: parseInt(receivedQty.L) || 0,
                XL: parseInt(receivedQty.XL) || 0,
                XXL: parseInt(receivedQty.XXL) || 0
            }

            // Update production batch
            await updateDoc(doc(db, 'production_batches', batch.id), {
                status: status,
                receivedBreakdown,
                totalReceivedPieces: totalReceived,
                receivedDate: status === 'Completed' ? serverTimestamp() : batch.receivedDate,
                updatedAt: serverTimestamp()
            })

            // Find the outfit in inventory
            const outfit = inventoryItems.find(i => i.id === batch.outfitId)
            if (outfit && status === 'Completed') {
                const outfitRef = doc(db, 'fabrics', batch.outfitId)
                const currentStock = outfit.stockBreakdown || {}

                // Update outfit stock - add received quantities to existing stock
                const newStock = {
                    S: (parseInt(currentStock.S) || 0) + receivedBreakdown.S,
                    M: (parseInt(currentStock.M) || 0) + receivedBreakdown.M,
                    L: (parseInt(currentStock.L) || 0) + receivedBreakdown.L,
                    XL: (parseInt(currentStock.XL) || 0) + receivedBreakdown.XL,
                    XXL: (parseInt(currentStock.XXL) || 0) + receivedBreakdown.XXL
                }

                await updateDoc(outfitRef, {
                    stockBreakdown: newStock,
                    productionCostPerPiece: batch.totalCostPerPiece || 0,
                    updatedAt: serverTimestamp()
                })
            }

            // Log production received
            if (status === 'Completed') {
                await logInventoryAdded(`${batch.outfitName} Received (${totalReceived} pieces)`, 'outfit', userProfile?.name || 'Unknown')
            }

            const message = status === 'Completed'
                ? `✅ Production batch received!\n${totalReceived} pieces added to ${batch.outfitName} inventory`
                : `📦 Production batch updated!\nStatus: ${status}\n${totalReceived} pieces tracked`

            alert(message)

            if (onDataChanged) await onDataChanged()
            onClose()
        } catch (err) {
            console.error('Error receiving production batch:', err)
            setError('Failed to receive batch: ' + err.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const isCompleted = batch.status === 'Completed'

    return (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm">
            <div className="bg-gray-950 w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl h-[85vh] sm:h-auto flex flex-col border-2 border-lime-glow/40">
                <div className="p-6 border-b border-lime-glow/40 bg-emerald-pine flex items-center justify-between flex-shrink-0">
                    <h3 className="text-xl font-bold text-white">
                        Update Production Batch
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
                        <span className="text-2xl">×</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 text-red-200 text-sm rounded-xl">
                            {error}
                        </div>
                    )}

                    {/* Batch Info */}
                    <div className="bg-emerald-pine/20 p-4 rounded-xl border border-lime-glow/30 mb-6">
                        <div className="flex gap-3 mb-3">
                            {batch.outfitImageUrl && (
                                <div className="w-16 h-16 bg-gray-800 rounded-xl overflow-hidden flex-shrink-0">
                                    <img src={batch.outfitImageUrl} className="w-full h-full object-cover" alt={batch.outfitName} />
                                </div>
                            )}
                            <div className="flex-1">
                                <h4 className="font-bold text-white text-base">{batch.outfitName}</h4>
                                <p className="text-sm text-lime-glow">{batch.fabricName}</p>
                                <p className="text-xs text-white/70 mt-1">{batch.fabricUsed}m fabric used</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-white/70 text-xs">Estimated</p>
                                <p className="text-lime-glow font-bold">{totalEstimated} pieces</p>
                            </div>
                            <div>
                                <p className="text-white/70 text-xs">Cost/Piece</p>
                                <p className="text-lime-glow font-bold">₹{(batch.totalCostPerPiece || 0).toFixed(2)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Status Selection */}
                    <div className="bg-gray-900/80 p-4 rounded-xl border border-emerald-pine/60 mb-4">
                        <h4 className="text-xs font-bold text-lime-glow uppercase mb-3">Production Status</h4>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            disabled={isSubmitting}
                            className="w-full p-3 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <option value="In Progress">In Production</option>
                            <option value="Completed">Received</option>
                        </select>
                        {status === 'Completed' && (
                            <p className="text-xs text-lime-glow/80 mt-2">✓ Stock will be added to inventory</p>
                        )}
                        {status === 'In Progress' && (
                            <p className="text-xs text-white/60 mt-2">Stock will NOT be added to inventory yet</p>
                        )}
                    </div>

                    {/* Size Breakdown Input */}
                    <div className="bg-gray-900/80 p-4 rounded-xl border border-emerald-pine/60">
                        <h4 className="text-xs font-bold text-lime-glow uppercase mb-3">
                            {isCompleted ? 'Update Received Quantities' : 'Enter Received Quantities'}
                        </h4>
                        <div className="space-y-3">
                            {['S', 'M', 'L', 'XL', 'XXL'].map(size => (
                                <div key={size} className="flex items-center justify-between gap-3">
                                    <label className="text-white font-semibold text-sm w-12">Size {size}</label>
                                    <div className="flex items-center gap-2 flex-1">
                                        <span className="text-xs text-white/60">Est: {batch.sizeBreakdown?.[size] || 0}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={isSubmitting}
                                            className="flex-1 p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                            placeholder="0"
                                            value={receivedQty[size]}
                                            onChange={(e) => setReceivedQty({ ...receivedQty, [size]: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 pt-4 border-t border-lime-glow/30 flex justify-between items-center">
                            <span className="text-white font-bold">Total Received:</span>
                            <span className={`text-xl font-bold ${totalReceived === totalEstimated ? 'text-lime-glow' : 'text-red-400'}`}>
                                {totalReceived} pieces
                            </span>
                        </div>

                        {totalReceived !== totalEstimated && (
                            <div className="mt-2 p-2 bg-amber-900/30 border border-amber-500/50 rounded-lg text-amber-200 text-xs">
                                ⚠️ Total received ({totalReceived}) differs from estimated ({totalEstimated} pieces)
                            </div>
                        )}
                    </div>

                    {batch.tailorName && (
                        <div className="mt-4 text-sm text-white/80">
                            <p>👔 Tailor: <span className="text-lime-glow">{batch.tailorName}</span></p>
                        </div>
                    )}
                </div>

                <div className="p-6 pt-4 border-t border-lime-glow/40 flex gap-3 flex-shrink-0 bg-gray-950">
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="flex-1 bg-lime-glow text-emerald-pine py-3 rounded-xl font-bold shadow-lg hover:bg-lime-glow/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Saving...' : 'Update Batch'}
                    </button>
                </div>
            </div>
        </div>
    )
}
