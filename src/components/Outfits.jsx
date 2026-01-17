import React, { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import OutfitDetailModal from './OutfitDetailModal'

export default function Outfits({ allOrders = [], inventoryItems = [] }) {
    const [selectedOutfit, setSelectedOutfit] = useState(null)
    const [selectedInventoryItem, setSelectedInventoryItem] = useState(null)

    const cleanNumber = (val) => {
        if (typeof val === 'number') return val
        if (!val) return 0
        const s = String(val).replace(/[^0-9.-]/g, '')
        return parseFloat(s) || 0
    }

    const getOutfitTotal = (stockBreakdown) => {
        if (!stockBreakdown) return 0
        return Object.values(stockBreakdown).reduce((sum, val) => sum + (parseFloat(val) || 0), 0)
    }

    // Get only outfits that exist in inventory
    const inventoryOutfits = useMemo(() => {
        return inventoryItems
            .filter(item => item.type === 'outfit')
            .map(item => ({
                name: item.name,
                imageUrl: item.imageUrl || `https://placehold.co/150x150/e2e8f0/64748b?text=${item.name.substring(0, 3)}`,
                stock: getOutfitTotal(item.stockBreakdown),
                revenue: 0,
                qty: 0,
                salesBySize: {},
                inInventory: true
            }))
    }, [inventoryItems])

    const outfitPerformanceList = useMemo(() => {
        const stats = {}

        // Initialize with inventory outfits
        inventoryOutfits.forEach(outfit => {
            stats[outfit.name.toLowerCase()] = { ...outfit }
        })

        // Add sales data
        allOrders.forEach(o => {
            if (o.status === 'Cancelled') return
            const name = (o.outfitName || o.productName || 'Unknown').trim()
            const nameLower = name.toLowerCase()
            const baseRevenue = cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0
            const discount = cleanNumber(o.discount) || 0
            const revenue = baseRevenue - discount

            if (stats[nameLower]) {
                const saleQty = parseInt(o.quantity) || 1
                stats[nameLower].revenue += revenue
                stats[nameLower].qty += saleQty

                // Track sales by size for breakdown in detail modal
                const sizeKey = (o.size || 'Unknown').toUpperCase()
                const currentSalesBySize = stats[nameLower].salesBySize || {}
                currentSalesBySize[sizeKey] = (parseInt(currentSalesBySize[sizeKey]) || 0) + saleQty
                stats[nameLower].salesBySize = currentSalesBySize
            }
        })

        return Object.values(stats).sort((a, b) => b.revenue - a.revenue)
    }, [allOrders, inventoryOutfits])

    // Find outfit names in orders that don't exist in inventory
    const orphanedOrders = useMemo(() => {
        const inventoryOutfits = inventoryItems.filter(i => i.type === 'outfit')
        
        const orphaned = []

        allOrders.forEach(o => {
            if (o.status === 'Cancelled') return
            const outfitName = (o.outfitName || o.productName || '').trim()
            if (!outfitName || outfitName === 'Unknown') return

            // Check if outfit exists in inventory using case-insensitive and trimmed comparison
            const matchesInventory = inventoryOutfits.some(item => 
                item.name.toLowerCase().trim() === outfitName.toLowerCase().trim()
            )

            if (!matchesInventory) {
                const existing = orphaned.find(item => item.name.toLowerCase().trim() === outfitName.toLowerCase().trim())
                if (existing) {
                    existing.count += 1
                    if (!existing.orderIds.includes(o.orderNumber || o.id)) {
                        existing.orderIds.push(o.orderNumber || o.id)
                    }
                } else {
                    orphaned.push({
                        name: outfitName,
                        count: 1,
                        orderIds: [o.orderNumber || o.id],
                        imageUrl: o.imageUrl || `https://placehold.co/150x150/fef3c7/f59e0b?text=${outfitName.substring(0, 3)}`
                    })
                }
            }
        })

        return orphaned
    }, [allOrders, inventoryItems])

    return (
        <div className="space-y-6 fade-in">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Outfit Performance</h2>
                <div className="text-xs bg-white dark:bg-gray-950 px-3 py-1 rounded-full shadow font-bold text-gray-500 dark:text-gray-400 border dark:border-gray-800">{outfitPerformanceList.length} Items</div>
            </div>

            {/* Orphaned Orders Warning */}
            {orphanedOrders.length > 0 && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-xl">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h3 className="font-bold text-yellow-900 text-sm mb-2">
                                ⚠️ Outfits Not in Inventory ({orphanedOrders.length})
                            </h3>
                            <p className="text-xs text-yellow-800 mb-3">
                                These outfit names appear in orders but don't exist in your inventory.
                                Add them to inventory or update order history to match existing outfit names.
                            </p>
                            <div className="space-y-2">
                                {orphanedOrders.map((orphan, idx) => (
                                    <div key={idx} className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-yellow-200 dark:border-yellow-900 flex gap-3 items-center border dark:border-gray-800">
                                        <div className="w-12 h-12 bg-yellow-100 rounded-lg overflow-hidden flex-shrink-0">
                                            <img src={orphan.imageUrl} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">{orphan.name}</h4>
                                            <p className="text-xs text-gray-500">
                                                Found in {orphan.count} order{orphan.count > 1 ? 's' : ''}: {orphan.orderIds.slice(0, 3).join(', ')}
                                                {orphan.orderIds.length > 3 && ` +${orphan.orderIds.length - 3} more`}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-bold text-yellow-700 bg-yellow-100 px-2 py-1 rounded">
                                                FIX
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-yellow-700 mt-3 font-bold">
                                💡 Tip: Go to Inventory → Add Item to create these outfits, or edit orders to use existing outfit names.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Inventory Outfits */}
            <div className="grid grid-cols-1 gap-4">
                {outfitPerformanceList.length > 0 ? outfitPerformanceList.map((outfit, idx) => {
                    const inventoryItem = inventoryItems.find(i => i.type === 'outfit' && i.name === outfit.name)
                    return (
                        <button
                            key={idx}
                            onClick={() => {
                                setSelectedOutfit(outfit)
                                setSelectedInventoryItem(inventoryItem)
                            }}
                            className="bg-white dark:bg-gray-950 p-4 rounded-2xl shadow-card border dark:border-gray-800 flex gap-4 items-center border dark:border-gray-800 hover:shadow-lg hover:border-lime-glow transition-all cursor-pointer"
                        >
                            <div className="w-16 h-16 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0">
                                <img src={outfit.imageUrl} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                                <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">{outfit.name}</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Stock: {outfit.stock}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-green-600">₹{(outfit.revenue / 1000).toFixed(1)}k</p>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold">{outfit.qty} SOLD</p>
                            </div>
                        </button>
                    )
                }) : <div className="text-center py-10 text-gray-400"><p>No outfits in inventory yet.</p><p className="text-xs mt-2">Add outfits in the Inventory tab</p></div>}
            </div>

            {/* Modal */}
            <OutfitDetailModal
                outfit={selectedOutfit}
                inventoryItem={selectedInventoryItem}
                onClose={() => {
                    setSelectedOutfit(null)
                    setSelectedInventoryItem(null)
                }}
            />
        </div>
    )
}
