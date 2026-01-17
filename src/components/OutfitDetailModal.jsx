import React, { useState } from 'react'

export default function OutfitDetailModal({ outfit, inventoryItem, onClose }) {
    if (!outfit || !inventoryItem) return null

    const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'UNKNOWN']
    const stockBreakdown = inventoryItem.stockBreakdown || {}
    const salesBreakdown = outfit.salesBySize || {}
    const totalSold = outfit.qty || 0
    const [viewMode, setViewMode] = useState('stock') // 'stock' | 'sold'

    const getSizeCount = (source, size) => {
        return parseInt(source[size]) || 0
    }

    const totalStock = sizes.reduce((sum, size) => sum + getSizeCount(stockBreakdown, size), 0)
    const totalActive = viewMode === 'stock' ? totalStock : totalSold

    return (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 backdrop-blur-sm">
            <div className="w-full sm:max-w-2xl h-[90vh] sm:h-auto max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl bg-[#0e1c1b] text-white border border-emerald-600/30">
                {/* Header */}
                <div className="flex justify-between items-center p-5 sm:p-6 bg-gradient-to-r from-emerald-700 via-emerald-800 to-emerald-900">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-emerald-200/80 font-semibold">Outfit Details</p>
                        <h2 className="text-xl sm:text-2xl font-extrabold">{outfit.name}</h2>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-emerald-900/50 border border-emerald-600/50 flex items-center justify-center text-emerald-100 hover:bg-emerald-800/80">
                        <span className="text-2xl leading-none">×</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 sm:p-6 space-y-6">
                    {/* Outfit Image */}
                    <div className="rounded-2xl overflow-hidden border border-emerald-700/50 shadow-lg">
                        <div className="w-full h-52 sm:h-64 bg-emerald-950/70 relative">
                            <img src={outfit.imageUrl} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        </div>
                    </div>

                    {/* Stock / Sold Summary */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            className={`p-4 rounded-2xl text-left border transition shadow-lg ${viewMode === 'stock' ? 'bg-emerald-700/30 border-emerald-500 shadow-emerald-900/40' : 'bg-emerald-900/40 border-emerald-700/50 hover:border-emerald-500/60'}`}
                            onClick={() => setViewMode('stock')}
                        >
                            <p className="text-xs uppercase tracking-wide text-emerald-200 font-semibold">Available Stock</p>
                            <p className="text-3xl font-black text-lime-200 drop-shadow-sm">{totalStock}</p>
                            <p className="text-xs text-emerald-200/80 mt-1">Tap to view size wise</p>
                        </button>
                        <button
                            className={`p-4 rounded-2xl text-left border transition shadow-lg ${viewMode === 'sold' ? 'bg-amber-500/20 border-amber-300 text-amber-100 shadow-amber-900/40' : 'bg-emerald-900/40 border-emerald-700/50 hover:border-amber-400/60 text-emerald-100'}`}
                            onClick={() => setViewMode('sold')}
                        >
                            <p className={`text-xs uppercase tracking-wide font-semibold ${viewMode === 'sold' ? 'text-amber-100' : 'text-emerald-200'}`}>Sold</p>
                            <p className="text-3xl font-black text-amber-200 drop-shadow-sm">{totalSold}</p>
                            <p className={`text-xs mt-1 ${viewMode === 'sold' ? 'text-amber-100/80' : 'text-emerald-200/80'}`}>Tap to view size wise</p>
                        </button>
                    </div>

                    {/* Size Breakdown */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold tracking-wide uppercase text-emerald-100">{viewMode === 'stock' ? 'Stock by Size' : 'Sold by Size'}</h3>
                            <span className="text-xs px-3 py-1 rounded-full border border-emerald-600/60 bg-emerald-900/40 font-semibold text-emerald-100">
                                Total {viewMode === 'stock' ? totalStock : totalSold}
                            </span>
                        </div>
                        {sizes.map(size => {
                            const key = size === 'UNKNOWN' ? 'UNKNOWN' : size
                            const source = viewMode === 'stock' ? stockBreakdown : salesBreakdown
                            const count = getSizeCount(source, key)
                            const percentage = totalActive > 0 ? (count / totalActive) * 100 : 0
                            const isActive = count > 0
                            return (
                                <div key={key} className={`flex items-center gap-3 p-2 rounded-xl border ${isActive ? 'border-emerald-600/60 bg-emerald-900/40' : 'border-emerald-800/60 bg-emerald-950/40'} transition`}>
                                    <div className="w-12 h-12 bg-emerald-800 text-lime-100 rounded-xl flex items-center justify-center font-black text-sm tracking-wide">
                                        {size === 'UNKNOWN' ? 'N/A' : size}
                                    </div>
                                    <div className="flex-1">
                                        <div className="h-10 rounded-lg overflow-hidden bg-emerald-950/70 border border-emerald-800/60">
                                            <div
                                                className={`${viewMode === 'stock' ? 'bg-gradient-to-r from-lime-400 via-emerald-300 to-emerald-500' : 'bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500'} h-full flex items-center px-3 text-emerald-900 font-black text-sm transition-all`}
                                                style={{ width: `${percentage}%` }}
                                            >
                                                {count > 0 && <span>{count}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right w-14">
                                        <p className="font-bold text-lime-100">{count}</p>
                                        <p className="text-[10px] text-emerald-200/80">{percentage.toFixed(0)}%</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Revenue Info */}
                    <div className="pt-4 border-t border-emerald-800/70 flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-emerald-200/70 font-semibold">Total Revenue</p>
                            <p className="text-2xl font-black text-lime-200 drop-shadow-sm">₹{(outfit.revenue || 0).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-emerald-200/70">Avg per unit</p>
                            <p className="text-lg font-bold text-emerald-100">₹{totalSold > 0 ? Math.round((outfit.revenue || 0) / totalSold).toLocaleString() : '0'}</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-emerald-800/60 bg-emerald-950/70 p-4 sm:p-5 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-lime-400 text-emerald-900 font-black rounded-xl shadow-lg hover:shadow-emerald-700/40 transition"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
