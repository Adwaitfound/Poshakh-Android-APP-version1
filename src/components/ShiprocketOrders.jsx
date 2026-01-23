import React, { useState, useEffect } from 'react'
import { RefreshCw, Package, Truck, MapPin, Phone, Mail, Calendar, ChevronDown, ChevronUp, Package2, Trash2 } from 'lucide-react'
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { getDb } from '../firebase'

const ORDERS_COLLECTION = 'production_orders'

export default function ShiprocketOrders({ allOrders = [], onViewOrder }) {
    const [isSyncing, setIsSyncing] = useState(false)
    const [syncStatus, setSyncStatus] = useState(null)
    const [shiprocketOrders, setShiprocketOrders] = useState([])
    const [expandedOrder, setExpandedOrder] = useState(null)
    const [lastSync, setLastSync] = useState(null)

    // Auto-sync every 30 seconds
    useEffect(() => {
        const syncInterval = setInterval(() => {
            handleSync(true) // true = silent mode, no toast notifications
        }, 30000)

        return () => clearInterval(syncInterval)
    }, [])

    // Filter Shiprocket orders from all orders
    useEffect(() => {
        const filtered = allOrders.filter(order => 
            order.platform === 'Shiprocket' || order.source === 'shiprocket'
        )
        setShiprocketOrders(filtered)
    }, [allOrders])

    const handleClearAll = async () => {
        if (!window.confirm('Delete all Shiprocket orders? This cannot be undone.')) {
            return
        }

        setIsSyncing(true)
        setSyncStatus({ status: 'Deleting all orders...', progress: 0 })

        try {
            const db = getDb()
            const q = query(
                collection(db, ORDERS_COLLECTION),
                where('source', '==', 'shiprocket')
            )
            const docs = await getDocs(q)
            
            let deletedCount = 0
            for (const docSnap of docs.docs) {
                await deleteDoc(doc(db, ORDERS_COLLECTION, docSnap.id))
                deletedCount++
            }

            setSyncStatus({ 
                status: `✅ Deleted ${deletedCount} orders`, 
                success: true 
            })

            setTimeout(() => {
                window.location.reload()
            }, 1500)
        } catch (error) {
            console.error('Delete error:', error)
            setSyncStatus({
                status: `❌ Delete failed: ${error.message}`,
                error: true
            })
        } finally {
            setIsSyncing(false)
        }
    }

    const handleSync = async (silent = false) => {
        if (!silent) setIsSyncing(true)
        if (!silent) setSyncStatus({ status: 'Connecting to Shiprocket...', progress: 0 })

        try {
            const resp = await fetch('http://localhost:3001/api/shiprocket/orders?page=1&per_page=100')
            if (!resp.ok) {
                throw new Error('Failed to fetch Shiprocket orders')
            }

            const data = await resp.json()
            const orders = data.orders || []
            setLastSync(new Date())

            // Save/update all orders in Firestore (check and update if exists)
            const db = getDb()
            let savedCount = 0
            let updatedCount = 0

            for (const order of orders) {
                try {
                    // Skip orders without shiprocketOrderId (can't track them)
                    if (!order.shiprocketOrderId) {
                        console.warn(`Skipping order ${order.orderNumber} - no shiprocketOrderId`)
                        continue
                    }

                    // Filter out undefined values
                    const cleanOrder = Object.fromEntries(
                        Object.entries(order).filter(([_, value]) => value !== undefined)
                    )

                    // Check if order already exists by shiprocketOrderId
                    const existingQuery = query(
                        collection(db, ORDERS_COLLECTION),
                        where('shiprocketOrderId', '==', order.shiprocketOrderId)
                    )
                    const existingDocs = await getDocs(existingQuery)

                    if (existingDocs.empty) {
                        // Create new order
                        await addDoc(collection(db, ORDERS_COLLECTION), {
                            ...cleanOrder,
                            source: 'shiprocket',
                            platform: 'Shiprocket',
                            orderType: 'shiprocket_import',
                            createdAt: serverTimestamp(),
                            syncedAt: serverTimestamp()
                        })
                        savedCount++
                    } else {
                        // Update existing order with new data (keep createdAt, update syncedAt and status)
                        const existingDoc = existingDocs.docs[0]
                        await updateDoc(doc(db, ORDERS_COLLECTION, existingDoc.id), {
                            ...cleanOrder,
                            source: 'shiprocket',
                            platform: 'Shiprocket',
                            syncedAt: serverTimestamp()
                            // Note: createdAt is NOT updated, preserving original creation time
                        })
                        updatedCount++
                    }
                } catch (err) {
                    console.error(`Failed to sync order ${order.orderNumber}:`, err)
                }
            }

            if (!silent) {
                const message = updatedCount > 0 
                    ? `✅ Synced ${savedCount} new, updated ${updatedCount} existing orders`
                    : `✅ Synced ${savedCount} new orders`
                setSyncStatus({ 
                    status: message, 
                    success: true 
                })

                // Reload page to show new/updated orders (only on manual sync, not auto)
                setTimeout(() => {
                    window.location.reload()
                }, 1500)
            } else {
                // Auto-sync: just update local state without reload
                console.log(`Auto-sync: ${savedCount} new, ${updatedCount} updated`);
            }
        } catch (error) {
            console.error('Sync error:', error)
            if (!silent) {
                setSyncStatus({
                    status: `❌ Sync failed: ${error.message}`,
                    error: true
                })
            }
        } finally {
            if (!silent) setIsSyncing(false)
        }
    }

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-900/40 to-amber-900/40 border-2 border-orange-500/50 rounded-3xl p-6 mb-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-4xl">🚚</span>
                            <h1 className="text-3xl font-bold text-orange-100">Shiprocket Orders</h1>
                        </div>
                        <p className="text-orange-200/80">
                            View all orders synced from Shiprocket (Auto-syncs every 30 seconds)
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                            <p className="text-sm text-orange-300/60">
                                Total: {shiprocketOrders.length} orders
                            </p>
                            {lastSync && (
                                <p className="text-xs text-orange-300/60">
                                    Last sync: {lastSync.toLocaleTimeString()}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleSync(false)}
                            disabled={isSyncing}
                            className="px-6 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                        >
                            <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? 'Syncing...' : 'Sync Now'}
                        </button>
                        <button
                            onClick={handleClearAll}
                            disabled={isSyncing || shiprocketOrders.length === 0}
                            className="px-4 py-3 bg-red-600/80 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                            title="Delete all Shiprocket orders"
                        >
                            <Trash2 className="w-5 h-5" />
                            Clear All
                        </button>
                    </div>
                </div>

                {/* Sync Status */}
                {syncStatus && (
                    <div className={`mt-4 p-3 rounded-xl border ${syncStatus.error ? 'bg-red-900/40 border-red-600/60' : syncStatus.success ? 'bg-green-900/40 border-green-600/60' : 'bg-orange-900/40 border-orange-600/60'}`}>
                        <span className={`text-sm font-semibold ${syncStatus.error ? 'text-red-300' : syncStatus.success ? 'text-green-300' : 'text-orange-300'}`}>
                            {syncStatus.status}
                        </span>
                    </div>
                )}
            </div>

            {/* Orders List */}
            {shiprocketOrders.length === 0 ? (
                <div className="bg-gray-900 border-2 border-gray-700 rounded-3xl p-12 text-center">
                    <Package className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                    <h3 className="text-xl font-bold text-gray-400 mb-2">No Shiprocket Orders</h3>
                    <p className="text-gray-500 mb-6">
                        Click "Sync Now" to import your orders
                    </p>
                    <button
                        onClick={() => handleSync(false)}
                        disabled={isSyncing}
                        className="px-6 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors disabled:opacity-50"
                    >
                        Sync Now
                    </button>
                </div>
            ) : (
                <div className="grid gap-4">
                    {shiprocketOrders.map(order => {
                        const isExpanded = expandedOrder === order.id
                        return (
                            <div
                                key={order.id}
                                className="bg-gradient-to-r from-gray-900 to-gray-800 border-2 border-orange-500/30 rounded-2xl overflow-hidden hover:border-orange-500/60 transition-all shadow-lg"
                            >
                                {/* Main Order Card */}
                                <div
                                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                                    className="p-5 cursor-pointer hover:bg-gray-800/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            {/* Order Header */}
                                            <div className="flex items-center gap-3 mb-3 flex-wrap">
                                                <span className="text-2xl font-mono text-orange-400 font-bold">
                                                    #{order.orderNumber || order.shiprocketOrderId}
                                                </span>
                                                <span className="px-3 py-1 bg-orange-600/80 text-white text-xs font-bold rounded-full border border-orange-500">
                                                    🚚 SHIPROCKET
                                                </span>
                                                {order.awb && (
                                                    <span className="text-xs text-gray-400 font-mono bg-gray-700/50 px-2 py-1 rounded">
                                                        AWB: {order.awb}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Customer Info */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <Package className="w-4 h-4 text-orange-400" />
                                                    <span className="text-white font-semibold">{order.customerName || 'Unknown Customer'}</span>
                                                </div>
                                                {order.phone && (
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <Phone className="w-4 h-4 text-orange-400" />
                                                        <span className="text-gray-300">{order.phone}</span>
                                                    </div>
                                                )}
                                                {order.email && (
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <Mail className="w-4 h-4 text-orange-400" />
                                                        <span className="text-gray-300">{order.email}</span>
                                                    </div>
                                                )}
                                                {order.address && (
                                                    <div className="flex items-start gap-2 text-sm md:col-span-2">
                                                        <MapPin className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                                                        <span className="text-gray-300">
                                                            {typeof order.address === 'string' 
                                                                ? order.address 
                                                                : `${order.address.line1 || ''} ${order.address.city || ''} ${order.address.state || ''} ${order.address.zip || ''}`.trim()
                                                            }
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Order Details */}
                                            <div className="flex items-center gap-4 flex-wrap text-xs">
                                                {order.courier && (
                                                    <div className="flex items-center gap-1">
                                                        <Truck className="w-3 h-3 text-orange-400" />
                                                        <span className="text-gray-400">{order.courier}</span>
                                                    </div>
                                                )}
                                                {order.status && (
                                                    <span className={`px-2 py-1 rounded-full ${
                                                        order.status.toLowerCase().includes('delivered') ? 'bg-green-900/40 text-green-300' :
                                                        order.status.toLowerCase().includes('shipped') ? 'bg-blue-900/40 text-blue-300' :
                                                        'bg-gray-700 text-gray-300'
                                                    }`}>
                                                        {order.status}
                                                    </span>
                                                )}
                                                {order.weight && (
                                                    <span className="text-gray-400">Weight: {order.weight} kg</span>
                                                )}
                                                {order.orderDate && (
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="w-3 h-3 text-orange-400" />
                                                        <span className="text-gray-400">
                                                            {new Date(order.orderDate).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expand Button */}
                                        <div className="flex-shrink-0">
                                            {isExpanded ? (
                                                <ChevronUp className="w-6 h-6 text-orange-400" />
                                            ) : (
                                                <ChevronDown className="w-6 h-6 text-orange-400" />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="border-t border-orange-500/20 bg-gray-900/50 p-5 space-y-4">
                                        {/* Shiprocket IDs */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {order.shiprocketOrderId && (
                                                <div className="bg-gray-800/50 p-3 rounded-lg">
                                                    <p className="text-xs text-gray-400 uppercase tracking-wide">Shiprocket Order ID</p>
                                                    <p className="text-sm text-orange-300 font-mono mt-1">{order.shiprocketOrderId}</p>
                                                </div>
                                            )}
                                            {order.shipmentId && (
                                                <div className="bg-gray-800/50 p-3 rounded-lg">
                                                    <p className="text-xs text-gray-400 uppercase tracking-wide">Shipment ID</p>
                                                    <p className="text-sm text-orange-300 font-mono mt-1">{order.shipmentId}</p>
                                                </div>
                                            )}
                                            {order.trackingNumber && (
                                                <div className="bg-gray-800/50 p-3 rounded-lg">
                                                    <p className="text-xs text-gray-400 uppercase tracking-wide">Tracking Number</p>
                                                    <p className="text-sm text-orange-300 font-mono mt-1">{order.trackingNumber}</p>
                                                </div>
                                            )}
                                            {order.platform && (
                                                <div className="bg-gray-800/50 p-3 rounded-lg">
                                                    <p className="text-xs text-gray-400 uppercase tracking-wide">Channel/Platform</p>
                                                    <p className="text-sm text-orange-300 font-mono mt-1">{order.platform}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Address Details */}
                                        {order.address && typeof order.address === 'object' && (
                                            <div className="bg-gray-800/50 p-3 rounded-lg">
                                                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Full Address</p>
                                                <div className="text-sm text-gray-300 space-y-1 font-mono">
                                                    {order.address.line1 && <p>📍 {order.address.line1}</p>}
                                                    {order.address.line2 && <p>📍 {order.address.line2}</p>}
                                                    {order.address.city && <p>🏙️ {order.address.city}, {order.address.state} {order.address.zip}</p>}
                                                    {order.address.country && <p>🌍 {order.address.country}</p>}
                                                </div>
                                            </div>
                                        )}

                                        {/* Order Items */}
                                        {order.items && Array.isArray(order.items) && order.items.length > 0 && (
                                            <div className="bg-gray-800/50 p-3 rounded-lg">
                                                <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Items in Order</p>
                                                <div className="space-y-2">
                                                    {order.items.map((item, idx) => (
                                                        <div key={idx} className="bg-gray-700/50 p-2 rounded border border-gray-600/50">
                                                            <div className="flex items-start gap-2">
                                                                <Package2 className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                                                                <div className="text-xs text-gray-300 flex-1">
                                                                    <p className="font-semibold text-white">{item.name || item.product_name || 'Item ' + (idx + 1)}</p>
                                                                    <div className="mt-1 grid grid-cols-3 gap-2 text-gray-400">
                                                                        {item.quantity && <p>Qty: {item.quantity}</p>}
                                                                        {item.sku && <p>SKU: {item.sku}</p>}
                                                                        {item.price && <p>₹{item.price}</p>}
                                                                    </div>
                                                                    {item.hsn && <p className="text-gray-500 mt-1">HSN: {item.hsn}</p>}
                                                                    {item.tax && <p className="text-gray-500">Tax: {item.tax}%</p>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Metadata */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                            {order.createdAt && (
                                                <div className="bg-gray-800/50 p-2 rounded">
                                                    <p className="text-gray-400">Created</p>
                                                    <p className="text-orange-300 text-xs mt-1">
                                                        {order.createdAt.toDate ? new Date(order.createdAt.toDate()).toLocaleDateString() : new Date(order.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            )}
                                            {order.updatedAt && (
                                                <div className="bg-gray-800/50 p-2 rounded">
                                                    <p className="text-gray-400">Updated</p>
                                                    <p className="text-orange-300 text-xs mt-1">
                                                        {order.updatedAt.toDate ? new Date(order.updatedAt.toDate()).toLocaleDateString() : new Date(order.updatedAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Raw JSON */}
                                        <details className="bg-gray-800/50 p-3 rounded-lg cursor-pointer">
                                            <summary className="text-xs text-gray-400 uppercase tracking-wide font-semibold">View Raw Data</summary>
                                            <pre className="text-xs text-gray-400 mt-2 overflow-x-auto bg-gray-900 p-2 rounded border border-gray-700">
                                                {JSON.stringify(order, null, 2)}
                                            </pre>
                                        </details>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
