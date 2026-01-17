import React, { useMemo, useState } from 'react'
import { Scissors, Package, TrendingUp, AlertCircle, X } from 'lucide-react'

export default function Production({ productionBatches = [], inventoryItems = [], onCreateBatch, onReceiveBatch, onCancelBatch }) {
    const [filter, setFilter] = useState('all') // all, completed, in-progress

    const stats = useMemo(() => {
        const totalBatches = productionBatches.length
        const totalPieces = productionBatches.reduce((sum, b) => sum + (b.totalPieces || 0), 0)
        const totalFabricUsed = productionBatches.reduce((sum, b) => sum + (parseFloat(b.fabricUsed) || 0), 0)
        const totalStitchingCost = productionBatches.reduce((sum, b) => sum + (parseFloat(b.stitchingCostTotal) || 0), 0)
        const avgCostPerPiece = totalPieces > 0 ?
            productionBatches.reduce((sum, b) => sum + ((b.totalCostPerPiece || 0) * (b.totalPieces || 0)), 0) / totalPieces : 0

        return {
            totalBatches,
            totalPieces,
            totalFabricUsed,
            totalStitchingCost,
            avgCostPerPiece
        }
    }, [productionBatches])

    // Low stock alerts - outfits with stock < 5 total pieces
    const lowStockOutfits = useMemo(() => {
        return inventoryItems
            .filter(item => item.type === 'outfit')
            .map(item => {
                const totalStock = Object.values(item.stockBreakdown || {})
                    .reduce((sum, val) => sum + (parseInt(val) || 0), 0)
                return { ...item, totalStock }
            })
            .filter(item => item.totalStock < 5)
            .sort((a, b) => a.totalStock - b.totalStock)
    }, [inventoryItems])

    // Fabric suggestions for production
    const fabricSuggestions = useMemo(() => {
        return inventoryItems
            .filter(item => item.type === 'fabric' && parseFloat(item.currentLength) > 10)
            .map(fabric => {
                const lengthAvailable = parseFloat(fabric.currentLength) || 0
                const avgFabricPerPiece = 1.1 // Approximate, can be calculated from history
                const potentialPieces = Math.floor(lengthAvailable / avgFabricPerPiece)
                return { ...fabric, lengthAvailable, potentialPieces }
            })
            .sort((a, b) => b.lengthAvailable - a.lengthAvailable)
    }, [inventoryItems])

    const sortedBatches = useMemo(() => {
        return [...productionBatches].sort((a, b) => {
            const dateA = a.receivedDate?.toDate ? a.receivedDate.toDate() : new Date(a.receivedDate)
            const dateB = b.receivedDate?.toDate ? b.receivedDate.toDate() : new Date(b.receivedDate)
            return dateB - dateA
        })
    }, [productionBatches])

    const formatDate = (date) => {
        if (!date) return 'N/A'
        const d = date.toDate ? date.toDate() : new Date(date)
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }

    return (
        <div className="space-y-6 fade-in pb-20">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">Production</h2>
                <button
                    onClick={onCreateBatch}
                    className="bg-lime-glow hover:shadow-lg text-emerald-pine px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"
                >
                    <Scissors className="w-4 h-4" />
                    New Batch
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-pine p-4 rounded-2xl shadow-card text-white">
                    <div className="flex items-center gap-2 mb-2">
                        <Package className="w-5 h-5" />
                        <p className="text-xs opacity-90">Total Batches</p>
                    </div>
                    <p className="text-2xl font-bold text-lime-glow">{stats.totalBatches}</p>
                    <p className="text-xs opacity-80 mt-1">{stats.totalPieces} pieces produced</p>
                </div>
                <div className="bg-emerald-pine p-4 rounded-2xl shadow-card text-white">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-5 h-5" />
                        <p className="text-xs opacity-90">Avg Cost/Piece</p>
                    </div>
                    <p className="text-2xl font-bold text-lime-glow">₹{stats.avgCostPerPiece.toFixed(0)}</p>
                    <p className="text-xs opacity-80 mt-1">Production cost</p>
                </div>
            </div>

            {/* Low Stock Alerts */}
            {lowStockOutfits.length > 0 && (
                <div className="bg-emerald-pine/20 p-4 rounded-2xl border-2 border-lime-glow">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="w-5 h-5 text-lime-glow" />
                        <h3 className="font-bold text-lime-glow">Low Stock Alert</h3>
                    </div>
                    <div className="space-y-2">
                        {lowStockOutfits.map((outfit, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm">
                                <span className="text-white">{outfit.name}</span>
                                <span className="font-bold text-lime-glow">{outfit.totalStock} left</span>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={onCreateBatch}
                        className="mt-3 w-full bg-lime-glow hover:shadow-lg text-emerald-pine py-2 rounded-lg text-sm font-bold"
                    >
                        Create Production Batch
                    </button>
                </div>
            )}

            {/* Fabric Suggestions */}
            {fabricSuggestions.length > 0 && (
                <div className="bg-gray-900/80 p-5 rounded-2xl shadow-card border border-emerald-pine/60">
                    <h3 className="font-bold text-lime-glow mb-3">Available Fabric for Production</h3>
                    <div className="space-y-2">
                        {fabricSuggestions.slice(0, 5).map((fabric, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3 bg-black/50 border border-emerald-pine/40 rounded-xl">
                                <div>
                                    <p className="font-bold text-white text-sm">{fabric.name}</p>
                                    <p className="text-xs text-lime-glow/80">{fabric.available}m available</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-lime-glow">~{fabric.potentialPieces} pieces</p>
                                    <p className="text-xs text-lime-glow/80">@ {fabric.avgConsumption}m/pc</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Production Batches List */}
            <div className="bg-gray-900/80 p-5 rounded-2xl shadow-card border border-emerald-pine/60">
                <h3 className="font-bold text-lime-glow mb-4">Production History</h3>
                <div className="space-y-3">
                    {sortedBatches.length === 0 ? (
                        <div className="text-center py-10 text-white/60">
                            <Scissors className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p>No production batches yet</p>
                            <button
                                onClick={onCreateBatch}
                                className="mt-4 bg-lime-glow text-emerald-pine px-6 py-2 rounded-xl font-bold"
                            >
                                Create First Batch
                            </button>
                        </div>
                    ) : (
                        sortedBatches.map((batch, idx) => (
                            <div
                                key={idx}
                                onClick={() => onReceiveBatch && onReceiveBatch(batch)}
                                className="border border-emerald-pine/60 bg-black/50 rounded-xl p-4 hover:bg-emerald-pine/10 cursor-pointer transition-all active:scale-[0.98]"
                            >
                                <div className="flex gap-3">
                                    {batch.outfitImageUrl && (
                                        <div className="w-16 h-16 bg-gray-800 rounded-xl overflow-hidden flex-shrink-0">
                                            <img src={batch.outfitImageUrl} className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1">
                                                <h4 className="font-bold text-white text-sm truncate">{batch.outfitName}</h4>
                                                <p className="text-xs text-lime-glow/80">{batch.fabricName}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {batch.status === 'Completed' ? (
                                                    <span className="bg-lime-glow/20 text-lime-glow px-2 py-1 rounded text-xs font-bold border border-lime-glow/50">
                                                        ✓ Received
                                                    </span>
                                                ) : batch.status === 'Cancelled' ? (
                                                    <span className="bg-red-900/40 text-red-400 px-2 py-1 rounded text-xs font-bold border border-red-500/40">
                                                        ✗ Cancelled
                                                    </span>
                                                ) : (
                                                    <span className="bg-amber-600/80 text-white px-2 py-1 rounded text-xs font-bold border border-amber-500">
                                                        Pending
                                                    </span>
                                                )}
                                                {batch.status !== 'Completed' && batch.status !== 'Cancelled' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            onCancelBatch && onCancelBatch(batch)
                                                        }}
                                                        className="p-1.5 hover:bg-red-900/40 rounded transition-all"
                                                        title="Cancel batch"
                                                    >
                                                        <X className="w-4 h-4 text-red-400 hover:text-red-300" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-3 mt-2 text-xs">
                                            <span className="bg-emerald-pine text-lime-glow px-2 py-1 rounded">
                                                {batch.totalReceivedPieces || batch.totalPieces} pcs
                                            </span>
                                            <span className="bg-gray-800 text-white px-2 py-1 rounded">
                                                {batch.fabricUsed}m used
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-lime-glow">₹{((batch.totalCost || 0) / (batch.totalPieces || 1)).toFixed(0)}/pc</p>
                                        <p className="text-xs text-white/70">{formatDate(batch.createdAt)}</p>
                                    </div>
                                </div>

                                {/* Size Breakdown */}
                                <div className="mt-3 pt-3 border-t border-emerald-pine/40 flex gap-2 text-xs">
                                    {Object.entries(batch.sizeBreakdown || {}).map(([size, qty]) => (
                                        qty > 0 && (
                                            <span key={size} className="bg-emerald-pine/40 text-lime-glow px-2 py-1 rounded">
                                                {size}: {qty}
                                            </span>
                                        )
                                    ))}
                                </div>

                                {/* Tailor & Notes */}
                                {(batch.tailorName || batch.notes) && (
                                    <div className="mt-2 text-xs text-white/80">
                                        {batch.tailorName && <p>👔 {batch.tailorName}</p>}
                                        {batch.notes && <p className="text-lime-glow/70 italic mt-1">{batch.notes}</p>}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
