import React, { useMemo, useState } from 'react'
import { Search, Plus } from 'lucide-react'

export default function Inventory({
    inventoryItems = [],
    soldCounts = {},
    onViewItem,
    onAddClick
}) {
    const [searchTerm, setSearchTerm] = useState('')
    const [inventoryFilter, setInventoryFilter] = useState('all')
    const [sortKey, setSortKey] = useState('name')

    const getOutfitTotal = (breakdown) => {
        if (!breakdown) return 0
        return Object.values(breakdown).reduce((a, b) => a + (parseInt(b) || 0), 0)
    }

    const getSoldCount = (item) => {
        const fromCounts = soldCounts[item.id] ?? soldCounts[item.name] ?? 0
        const manualCount = parseInt(item.manualSoldCount) || 0
        return fromCounts + manualCount
    }

    const inventoryList = useMemo(() => {
        let list = [...inventoryItems]

        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            list = list.filter(f =>
                (f.name && f.name.toLowerCase().includes(term)) ||
                (f.websiteProductName && f.websiteProductName.toLowerCase().includes(term)) ||
                (f.location && f.location.toLowerCase().includes(term))
            )
        }

        if (inventoryFilter === 'fabrics') list = list.filter(i => i.type === 'fabric')
        if (inventoryFilter === 'outfits') list = list.filter(i => i.type === 'outfit')
        if (inventoryFilter === 'low') list = list.filter(f => f.type === 'fabric' && f.currentLength < 5)
        if (inventoryFilter === 'from_samples') list = list.filter(i => i.fromSample === true)
        if (inventoryFilter === 'finalized') list = list.filter(i => i.type === 'outfit' && !i.fromSample)

        list.sort((a, b) => {
            if (sortKey === 'name') return (a.name || '').localeCompare(b.name || '')
            if (sortKey === 'stock') {
                const stockA = a.type === 'fabric' ? a.currentLength : getOutfitTotal(a.stockBreakdown)
                const stockB = b.type === 'fabric' ? b.currentLength : getOutfitTotal(b.stockBreakdown)
                return stockB - stockA
            }
            if (sortKey === 'potential') {
                const potA = a.type === 'fabric' ? (a.potentialOutfits || 0) : 0
                const potB = b.type === 'fabric' ? (b.potentialOutfits || 0) : 0
                return potB - potA
            }
            return 0
        })

        return list
    }, [inventoryItems, searchTerm, inventoryFilter, sortKey])

    return (
        <div className="space-y-4 fade-in">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-2xl font-bold text-white">Inventory</h2>
                {onAddClick && (
                    <button
                        onClick={onAddClick}
                        className="text-sm bg-lime-glow text-emerald-pine px-4 py-2 rounded-full font-bold shadow-lg hover:shadow-xl flex items-center gap-1"
                    >
                        <Plus className="w-4 h-4" /> Add Item
                    </button>
                )}
            </div>

            <div className="flex gap-2">
                <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                        <Search className="w-5 h-5" />
                    </span>
                    <input
                        className="w-full pl-10 p-3 bg-white rounded-xl border-2 border-lime-glow shadow-sm text-sm text-gray-900 placeholder-gray-400"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    className="text-xs bg-white border-2 border-lime-glow rounded-lg p-2 text-emerald-pine font-semibold outline-none shadow-sm"
                    value={sortKey}
                    onChange={e => setSortKey(e.target.value)}
                >
                    <option value="name">Name (A-Z)</option>
                    <option value="stock">Stock Level (High)</option>
                    <option value="potential">Potential (High)</option>
                </select>
            </div>

            <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-2">
                {[
                    { key: 'all', label: 'All' },
                    { key: 'fabrics', label: 'Fabrics' },
                    { key: 'outfits', label: 'Outfits' },
                    { key: 'finalized', label: '✅ Finalized' },
                    { key: 'from_samples', label: '🧪 From Samples' },
                    { key: 'low', label: 'Low Stock' },
                ].map(f => (
                    <button
                        key={f.key}
                        onClick={() => setInventoryFilter(f.key)}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${inventoryFilter === f.key ? 'bg-emerald-pine text-lime-glow shadow-lg' : 'bg-lime-glow text-emerald-pine border-2 border-lime-glow'}`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-4 p-2">
                {inventoryList.map(item => {
                    const isFabric = item.type === 'fabric'

                    if (isFabric) {
                        const isLow = item.currentLength > 0 && item.currentLength < 5
                        return (
                            <div
                                key={item.id}
                                className="relative aspect-[4/5] rounded-2xl overflow-hidden shadow-md bg-white cursor-pointer hover:shadow-lg transition-shadow"
                                onClick={() => onViewItem && onViewItem(item)}
                            >
                                <img src={item.imageUrl} className="w-full h-full object-cover" />
                                <div className="absolute bottom-0 w-full bg-gradient-to-t from-black/90 to-transparent p-3 pt-8">
                                    <h4 className="text-white font-bold text-sm truncate">{item.name}</h4>
                                    <p className="text-xs text-gray-200 font-semibold">{(parseFloat(item.currentLength) || 0).toFixed(1)} {item.unit} available</p>
                                    {item.vendorName && (
                                        <p className="text-[10px] text-lime-300 mt-1 truncate">📦 {item.vendorName}</p>
                                    )}
                                </div>
                                {isLow && (
                                    <div className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                                        ⚠️ Low Stock
                                    </div>
                                )}
                            </div>
                        )
                    } else {
                        const totalReady = getOutfitTotal(item.stockBreakdown)
                        const sold = getSoldCount(item)
                        return (
                            <div
                                key={item.id}
                                className="relative aspect-[4/5] rounded-2xl overflow-hidden shadow-md bg-white cursor-pointer"
                                onClick={() => onViewItem && onViewItem(item)}
                            >
                                <img src={item.imageUrl} className="w-full h-full object-cover" />
                                <div className="absolute bottom-0 w-full bg-gradient-to-t from-black/80 to-transparent p-3 pt-6">
                                    <h4 className="text-white font-bold text-sm truncate">{item.name}</h4>
                                    <p className="text-xs text-gray-300 font-bold">
                                        Stock: {totalReady} <span className="opacity-60 font-normal">| Sold: {sold}</span>
                                    </p>
                                </div>
                                {item.fromSample && (
                                    <div className="absolute top-2 left-2 bg-purple-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                                        🧪 Sample
                                    </div>
                                )}
                            </div>
                        )
                    }
                })}
            </div>

            {inventoryList.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                    {searchTerm ? `No items match "${searchTerm}"` : 'No items in this category'}
                </div>
            )}
        </div>
    )
}

