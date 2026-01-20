import React from 'react'

export default function InventoryDetailModal({ item, soldCounts = {}, onClose, onOpenEdit, onOpenStock, onViewHistory, onDelete }) {
    if (!item) return null

    const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
    const stockBreakdown = item.stockBreakdown || {}
    const totalStock = item.type === 'outfit'
        ? sizes.reduce((sum, s) => sum + (parseFloat(stockBreakdown[s]) || 0), 0)
        : parseFloat(item.currentLength) || 0
    // Get actual sold count from soldCounts prop (prefer id to avoid name collisions) plus manual count
    const soldFromCounts = soldCounts[item.id] ?? soldCounts[item.name] ?? 0
    const sold = (parseInt(soldFromCounts) || 0) + (parseInt(item.manualSoldCount) || 0)

    const downloadImage = async () => {
        if (!item.imageUrl) return
        try {
            const response = await fetch(item.imageUrl)
            if (!response.ok) throw new Error('Image fetch failed')
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${item.name || 'inventory-image'}.jpg`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Download failed', err)
            alert('Could not download the image. Please try again.')
        }
    }

    return (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center backdrop-blur-sm">
            <div className="w-full sm:max-w-2xl h-[90vh] sm:h-auto max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl bg-[#0e1c1b] text-white border border-emerald-600/30">
                {/* Header */}
                <div className="flex justify-between items-center p-5 sm:p-6 bg-gradient-to-r from-emerald-700 via-emerald-800 to-emerald-900 sticky top-0 z-10">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-emerald-200/80 font-semibold">Inventory Item</p>
                        <h3 className="text-xl sm:text-2xl font-extrabold leading-tight">{item.name}</h3>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-emerald-900/50 border border-emerald-600/50 flex items-center justify-center text-emerald-100 hover:bg-emerald-800/80">
                        <span className="text-2xl leading-none">×</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 sm:p-6 space-y-6">
                    {/* Image */}
                    <div className="rounded-2xl overflow-hidden border border-emerald-700/50 shadow-lg">
                        <div className="w-full h-52 sm:h-64 bg-emerald-950/70 relative">
                            {item.imageUrl && <img src={item.imageUrl} className="w-full h-full object-cover" alt={item.name} />}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        </div>
                    </div>

                    <button
                        onClick={downloadImage}
                        className="w-full py-3 px-4 rounded-2xl border border-emerald-500/70 bg-emerald-900/40 text-emerald-50 font-semibold shadow-lg hover:border-emerald-300/80 transition"
                    >
                        Download Image
                    </button>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => { onClose(); onOpenEdit && onOpenEdit(item) }} className="py-3 px-4 rounded-2xl border border-emerald-600/60 bg-emerald-900/40 text-emerald-100 font-semibold shadow-lg hover:border-emerald-400/80 transition">
                            Edit
                        </button>
                        <button onClick={() => { onClose(); onOpenStock && onOpenStock(item, 'ADD') }} className="py-3 px-4 rounded-2xl border border-emerald-600/60 bg-gradient-to-r from-lime-400 to-emerald-400 text-emerald-900 font-black shadow-lg hover:shadow-emerald-700/40 transition">
                            Adjust Stock
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 sm:p-5 rounded-2xl text-left border-2 border-emerald-600/60 bg-emerald-900/40 shadow-lg">
                            <p className="text-[10px] sm:text-xs uppercase tracking-wide text-emerald-200 font-semibold">Available</p>
                            <p className="text-3xl sm:text-4xl font-black text-lime-200 drop-shadow-sm leading-tight">{totalStock}</p>
                            <p className="text-[10px] sm:text-xs text-emerald-200/80 mt-1">{item.type === 'outfit' ? 'Total pieces' : `Length (${item.unit || 'm'})`}</p>
                        </div>
                        <div className="p-4 sm:p-5 rounded-2xl text-left border-2 border-amber-400/70 bg-amber-500/10 text-amber-100 shadow-lg">
                            <p className="text-[10px] sm:text-xs uppercase tracking-wide font-semibold text-amber-200">Sold</p>
                            <p className="text-3xl sm:text-4xl font-black text-amber-200 drop-shadow-sm leading-tight">{sold}</p>
                            <p className="text-[10px] sm:text-xs text-amber-100/80 mt-1">Recorded sales</p>
                        </div>
                    </div>

                    {/* Pricing / meta */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 sm:p-4 rounded-2xl border border-emerald-700/60 bg-emerald-950/50">
                            <p className="text-[10px] sm:text-xs text-emerald-200/80 uppercase font-semibold">Selling Price</p>
                            <p className="text-lg sm:text-xl font-bold text-lime-200">₹{item.sellingPrice || 0}</p>
                        </div>
                        <div className="p-3 sm:p-4 rounded-2xl border border-emerald-700/60 bg-emerald-950/50">
                            <p className="text-[10px] sm:text-xs text-emerald-200/80 uppercase font-semibold">Stitching Cost</p>
                            <p className="text-lg sm:text-xl font-bold text-lime-200">₹{item.stitchingCost || 0}</p>
                        </div>
                        {item.type === 'fabric' && (
                            <>
                                <div className="p-3 sm:p-4 rounded-2xl border border-emerald-700/60 bg-emerald-950/50">
                                    <p className="text-[10px] sm:text-xs text-emerald-200/80 uppercase font-semibold">Cost / m</p>
                                    <p className="text-lg sm:text-xl font-bold text-lime-200">₹{item.costPerMeter || 0}</p>
                                </div>
                                <div className="p-3 sm:p-4 rounded-2xl border border-emerald-700/60 bg-emerald-950/50">
                                    <p className="text-[10px] sm:text-xs text-emerald-200/80 uppercase font-semibold">Length</p>
                                    <p className="text-lg sm:text-xl font-bold text-lime-200">{item.currentLength || 0} {item.unit || 'm'}</p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Vendor & Purchase Information */}
                    {item.type === 'fabric' && item.vendorName && (
                        <div className="space-y-3 pt-2 border-t border-emerald-700/40">
                            <h4 className="text-sm font-bold tracking-wide uppercase text-emerald-100">📦 Vendor & Purchase Details</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 sm:p-4 rounded-2xl border border-lime-400/40 bg-lime-400/5">
                                    <p className="text-[10px] text-lime-200/80 uppercase font-semibold">Vendor</p>
                                    <p className="text-sm font-bold text-lime-200 mt-1">{item.vendorName}</p>
                                </div>
                                {item.purchaseDate && (
                                    <div className="p-3 sm:p-4 rounded-2xl border border-lime-400/40 bg-lime-400/5">
                                        <p className="text-[10px] text-lime-200/80 uppercase font-semibold">Purchase Date</p>
                                        <p className="text-sm font-bold text-lime-200 mt-1">{new Date(item.purchaseDate).toLocaleDateString()}</p>
                                    </div>
                                )}
                                {item.invoiceNumber && (
                                    <div className="p-3 sm:p-4 rounded-2xl border border-lime-400/40 bg-lime-400/5">
                                        <p className="text-[10px] text-lime-200/80 uppercase font-semibold">Invoice</p>
                                        <p className="text-sm font-bold text-lime-200 mt-1">{item.invoiceNumber}</p>
                                    </div>
                                )}
                                {item.actualCostPerMeter && item.actualCostPerMeter !== item.costPerMeter && (
                                    <div className="p-3 sm:p-4 rounded-2xl border border-amber-400/40 bg-amber-400/5">
                                        <p className="text-[10px] text-amber-200/80 uppercase font-semibold">Actual Cost/m</p>
                                        <p className="text-sm font-bold text-amber-200 mt-1">₹{item.actualCostPerMeter.toFixed(2)}</p>
                                    </div>
                                )}
                            </div>
                            {(item.transportCost || item.otherCosts) && (
                                <div className="p-3 sm:p-4 rounded-2xl border border-emerald-700/60 bg-emerald-950/50">
                                    <p className="text-[10px] text-emerald-200/80 uppercase font-semibold mb-2">Additional Costs</p>
                                    <div className="space-y-1 text-sm">
                                        {item.transportCost && <p>🚚 Transport: ₹{item.transportCost.toFixed(2)}</p>}
                                        {item.otherCosts && <p>📋 Other: ₹{item.otherCosts.toFixed(2)}</p>}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Stock Breakdown for Outfits */}
                    {item.type === 'outfit' && item.stockBreakdown && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold tracking-wide uppercase text-emerald-100">Stock by Size</h4>
                                <span className="text-xs px-3 py-1 rounded-full border border-emerald-600/60 bg-emerald-900/40 font-semibold text-emerald-100">Total {totalStock}</span>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                                {sizes.map(size => (
                                    <div key={size} className="p-3 rounded-xl border border-emerald-700/60 bg-emerald-950/50 text-center shadow">
                                        <p className="text-xs font-bold text-emerald-200/80">{size}</p>
                                        <p className="text-xl font-black text-lime-200 mt-1">{stockBreakdown[size] || 0}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Footer actions */}
                    <div className="space-y-3 pt-2">
                        <button onClick={() => { onViewHistory && onViewHistory(item) }} className="w-full py-3 rounded-xl border border-emerald-600/60 bg-emerald-900/40 text-emerald-100 font-semibold hover:border-emerald-400/80 transition">
                            View Transaction History
                        </button>
                        <button onClick={() => { onDelete && onDelete(item) }} className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold shadow-lg hover:shadow-rose-800/50 transition">
                            Delete Item
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
