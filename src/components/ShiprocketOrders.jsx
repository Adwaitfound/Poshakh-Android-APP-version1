import React, { useState, useEffect } from 'react'
import { RefreshCw, Package, Truck, MapPin, Phone, Mail, Calendar, ChevronDown, ChevronUp, Package2, Trash2 } from 'lucide-react'
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { getDb } from '../firebase'
import { API_BASE_URL } from '../config'

const ORDERS_COLLECTION = 'production_orders'

export default function ShiprocketOrders({ allOrders = [], onViewOrder, onRefreshOrders }) {
    const [isSyncing, setIsSyncing] = useState(false)
    const [syncStatus, setSyncStatus] = useState(null)
    const [shiprocketOrders, setShiprocketOrders] = useState([]) // Local state for synced orders
    const [expandedOrder, setExpandedOrder] = useState(null)
    const [lastSync, setLastSync] = useState(null)
    const [filterFromDate, setFilterFromDate] = useState('2025-09-01')
    const [filterToDate, setFilterToDate] = useState(new Date().toISOString().split('T')[0])
    const [sortBy, setSortBy] = useState('newest') // 'newest' or 'oldest'

    // Load existing Shiprocket orders from Firestore on mount
    useEffect(() => {
        const loadOrders = async () => {
            try {
                const db = getDb()
                const queries = [
                    query(collection(db, ORDERS_COLLECTION), where('source', '==', 'shiprocket')),
                    query(collection(db, ORDERS_COLLECTION), where('platform', '==', 'Shiprocket')),
                ]

                const allDocs = []
                for (const q of queries) {
                    const snapshot = await getDocs(q)
                    snapshot.docs.forEach(docSnap => {
                        const data = docSnap.data()
                        if (!allDocs.find(d => d.shiprocketOrderId === data.shiprocketOrderId)) {
                            allDocs.push({ id: docSnap.id, ...data })
                        }
                    })
                }

                setShiprocketOrders(allDocs)
                console.log(`✅ Loaded ${allDocs.length} Shiprocket orders from Firestore`)
            } catch (error) {
                console.error('Error loading Shiprocket orders:', error)
            }
        }

        loadOrders()
    }, [])

    // Auto-sync every 30 seconds
    useEffect(() => {
        const syncInterval = setInterval(() => {
            handleSync(true) // true = silent mode, no toast notifications
        }, 30000)

        return () => clearInterval(syncInterval)
    }, [])

    const handleClearAll = async () => {
        if (!window.confirm('Delete all Shiprocket orders? This cannot be undone.')) {
            return
        }

        setIsSyncing(true)
        setSyncStatus({ status: 'Deleting all orders...', progress: 0 })

        try {
            const db = getDb()

            // Firestore doesn't support OR in a single query; fetch both variants.
            const queries = [
                query(collection(db, ORDERS_COLLECTION), where('source', '==', 'shiprocket')),
                query(collection(db, ORDERS_COLLECTION), where('platform', '==', 'Shiprocket')),
            ]

            let deletedCount = 0

            for (const q of queries) {
                const docs = await getDocs(q)
                for (const docSnap of docs.docs) {
                    await deleteDoc(doc(db, ORDERS_COLLECTION, docSnap.id))
                    deletedCount++
                }
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
            // First, authenticate with Shiprocket to get token
            const authResp = await fetch(`${API_BASE_URL}/api/shiprocket/auth`, { method: 'POST' })
            if (!authResp.ok) {
                throw new Error('Failed to authenticate with Shiprocket')
            }
            
            // Now fetch shipments
            // Fetch first page from shipments endpoint (has more orders than /orders endpoint)
            const firstResp = await fetch(`${API_BASE_URL}/api/shiprocket/shipments?page=1&per_page=100&from_date=${filterFromDate}${filterToDate ? '&to_date=' + filterToDate : ''}`)
            if (!firstResp.ok) {
                throw new Error('Failed to fetch Shiprocket shipments')
            }

            const firstData = await firstResp.json()
            const firstPageOrders = firstData.orders || []
            const totalOrders = firstData.pagination?.total || firstPageOrders.length
            const totalPages = Math.ceil(totalOrders / 100)

            console.log('🔄 Sync Debug:', { totalOrders, firstPageCount: firstPageOrders.length, totalPages, pagination: firstData.pagination })

            if (!silent) {
                setSyncStatus({ status: `Found ${totalOrders} shipments. Fetching pages (1/${totalPages})...`, progress: 0 })
            }

            let allOrders = [...firstPageOrders]

            // Fetch remaining pages if any
            if (totalPages > 1) {
                for (let page = 2; page <= totalPages; page++) {
                    if (!silent) {
                        setSyncStatus({ status: `Fetching page ${page} of ${totalPages}...`, progress: Math.round((page - 1) / totalPages * 50) })
                    }
                    const pageResp = await fetch(`${API_BASE_URL}/api/shiprocket/shipments?page=${page}&per_page=100&from_date=${filterFromDate}${filterToDate ? '&to_date=' + filterToDate : ''}`)
                    if (pageResp.ok) {
                        const pageData = await pageResp.json()
                        allOrders = allOrders.concat(pageData.orders || [])
                    }
                }
            }

            const orders = allOrders
            setLastSync(new Date())
            
            // Set orders to local state for display
            setShiprocketOrders(orders)
            
            if (!silent) {
                setSyncStatus({ status: `Saving ${orders.length} orders to database...`, progress: 95 })
            }

            // Save to Firestore so they're available on all devices
            const db = getDb()
            let savedCount = 0
            
            // Write in batches with delays to avoid quota exceeded errors
            for (let i = 0; i < orders.length; i++) {
                const order = orders[i]
                try {
                    const shiprocketId = order.shiprocketOrderId || order.id
                    
                    const orderRef = query(collection(db, ORDERS_COLLECTION), 
                        where('shiprocketOrderId', '==', shiprocketId))
                    const existing = await getDocs(orderRef)
                    
                    if (existing.empty) {
                        // New order - add it
                        const docRef = await addDoc(collection(db, ORDERS_COLLECTION), {
                            ...order,
                            shiprocketOrderId: shiprocketId,
                            source: 'shiprocket',
                            platform: 'Shiprocket',
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        })
                        savedCount++
                        console.log(`✅ Saved ${savedCount}/${orders.length} orders`)
                    }
                } catch (err) {
                    console.error('Error saving order to Firestore:', err)
                }
                
                // Add delay every 5 writes to avoid quota exceeded
                if ((i + 1) % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 500))
                }
            }
            
            if (!silent) {
                setSyncStatus({ status: `Saved ${savedCount}/${orders.length} orders...`, progress: 98 })
            }

            if (!silent) {
                setSyncStatus({ 
                    status: `✅ Synced ${orders.length} shipments (${savedCount} new) - view in Shiprocket tab, import via Orders tab`, 
                    success: true 
                })
                console.log(`Sync complete: ${orders.length} shipments, ${savedCount} saved to Firestore`)
            } else {
                // Auto-sync: just logged
                console.log(`Auto-sync: ${orders.length} shipments, ${savedCount} new to Firestore`);
            }
            
            // Refresh parent allOrders so Orders tab can find them
            if (onRefreshOrders && savedCount > 0) {
                onRefreshOrders()
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
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                            <p className="text-sm text-orange-300/60">
                                Total: {shiprocketOrders.length} orders
                            </p>
                            {lastSync && (
                                <p className="text-xs text-orange-300/60">
                                    Last sync: {lastSync.toLocaleTimeString()}
                                </p>
                            )}
                        </div>
                        {/* Date Filters */}
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <label className="text-xs text-orange-300/80">From:</label>
                            <input 
                                type="date" 
                                value={filterFromDate} 
                                onChange={(e) => setFilterFromDate(e.target.value)}
                                className="text-xs bg-orange-900/40 border border-orange-500/50 text-orange-100 rounded px-2 py-1"
                            />
                            <label className="text-xs text-orange-300/80">To:</label>
                            <input 
                                type="date" 
                                value={filterToDate} 
                                onChange={(e) => setFilterToDate(e.target.value)}
                                className="text-xs bg-orange-900/40 border border-orange-500/50 text-orange-100 rounded px-2 py-1"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="text-xs bg-orange-900/40 border border-orange-500/50 text-orange-100 rounded px-2 py-2 font-semibold hover:bg-orange-900/60 transition-colors"
                            title="Sort orders by date"
                        >
                            <option value="newest">📅 Newest First</option>
                            <option value="oldest">📅 Oldest First</option>
                        </select>
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
                <div className="space-y-3">
                    {[...shiprocketOrders].sort((a, b) => {
                        const dateA = new Date(a.orderDate || 0)
                        const dateB = new Date(b.orderDate || 0)
                        return sortBy === 'newest' ? dateB - dateA : dateA - dateB
                    }).map(order => {
                        const isExpanded = expandedOrder === (order.shiprocketOrderId || order.id)
                        return (
                            <div
                                key={order.shiprocketOrderId || order.id}
                                className="bg-emerald-pine/20 border-2 border-lime-glow/40 hover:border-lime-glow/60 p-2 md:p-4 rounded-2xl shadow-card cursor-pointer transition-all"
                            >
                                {/* Main Order Card - matching Orders.jsx style */}
                                <div
                                    onClick={() => setExpandedOrder(isExpanded ? null : (order.shiprocketOrderId || order.id))}
                                    className="flex gap-2 md:gap-3"
                                >
                                    {/* Order Image Placeholder */}
                                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-orange-600/20 flex items-center justify-center flex-shrink-0 border-2 border-orange-500/30">
                                        <Package className="w-6 h-6 md:w-7 md:h-7 text-orange-400" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        {/* Order number and badges - mobile optimized */}
                                        <div className="flex items-center gap-1 md:gap-2 flex-wrap mb-0.5 md:mb-1">
                                            <span className="font-mono text-lime-glow font-bold text-xs md:text-sm">
                                                #{order.orderNumber || order.shiprocketOrderId}
                                            </span>
                                            <span className="text-[8px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded border whitespace-nowrap bg-orange-600/80 text-white border-orange-500">
                                                🚚 SHIPROCKET
                                            </span>
                                            {order.awb && (
                                                <span className="text-[8px] md:text-[10px] font-mono bg-emerald-pine/60 border border-lime-glow/40 px-1.5 py-0.5 rounded text-lime-glow">
                                                    AWB: {order.awb}
                                                </span>
                                            )}
                                        </div>

                                        {/* Status badge */}
                                        {order.status && (
                                            <div className="mb-0.5 md:mb-1">
                                                <span className={`text-[8px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded border inline-block ${
                                                    order.status.toLowerCase().includes('delivered') ? 'bg-lime-glow/20 text-lime-glow border-lime-glow/50' :
                                                    order.status.toLowerCase().includes('shipped') ? 'bg-emerald-700/80 text-white border-emerald-600' :
                                                    order.status.toLowerCase().includes('pending') ? 'bg-amber-600/80 text-white border-amber-500' :
                                                    'bg-gray-700 text-white border-gray-600'
                                                }`}>
                                                    {order.status}
                                                </span>
                                            </div>
                                        )}

                                        {/* Customer name and details - condensed */}
                                        <h4 className="font-bold text-white text-xs md:text-sm leading-tight mb-0.5">
                                            {order.customerName || 'Unknown Customer'}
                                        </h4>

                                        {/* Outfit name and pricing */}
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <div className="flex-1">
                                                {order.items && order.items.length > 0 && (
                                                    <h5 className="font-bold text-white text-xs md:text-sm leading-tight">
                                                        {order.items[0].name || order.items[0].product_name || 'Outfit'}
                                                    </h5>
                                                )}
                                            </div>
                                            {parseFloat(order.sellingPrice) > 0 && (
                                                <span className="font-bold text-lime-glow text-xs md:text-sm bg-emerald-pine/40 border border-lime-glow/30 px-2 py-0.5 rounded whitespace-nowrap">
                                                    ₹{parseFloat(order.sellingPrice).toFixed(2)}
                                                </span>
                                            )}
                                        </div>

                                        {/* Phone, email, courier - condensed */}
                                        <div className="flex items-center gap-1 md:gap-2 text-[10px] md:text-xs text-lime-glow/80 flex-wrap">
                                            {order.phone && order.phone !== 'xxxxxxxxxx' && (
                                                <span className="bg-emerald-pine/60 border border-lime-glow/40 px-1 rounded flex items-center gap-1">
                                                    <Phone className="w-2.5 h-2.5 md:w-3 md:h-3" />
                                                    {order.phone}
                                                </span>
                                            )}
                                            {order.courier && (
                                                <span className="bg-emerald-pine/60 border border-lime-glow/40 px-1 rounded flex items-center gap-1">
                                                    <Truck className="w-2.5 h-2.5 md:w-3 md:h-3" />
                                                    {order.courier}
                                                </span>
                                            )}
                                            {order.weight && (
                                                <span className="text-lime-glow/60">{order.weight}kg</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expand/Collapse Icon */}
                                    <div className="flex-shrink-0 flex items-center">
                                        {isExpanded ? (
                                            <ChevronUp className="w-5 h-5 md:w-6 md:h-6 text-lime-glow" />
                                        ) : (
                                            <ChevronDown className="w-5 h-5 md:w-6 md:h-6 text-lime-glow/60" />
                                        )}
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="mt-3 pt-3 border-t border-lime-glow/20 space-y-2">
                                        {/* Email & Address */}
                                        {order.email && (
                                            <div className="bg-emerald-pine/40 border border-lime-glow/30 rounded-lg p-2">
                                                <div className="flex items-center gap-2 text-xs">
                                                    <Mail className="w-3 h-3 text-lime-glow" />
                                                    <span className="text-white">{order.email}</span>
                                                </div>
                                            </div>
                                        )}
                                        {order.address && (
                                            <div className="bg-emerald-pine/40 border border-lime-glow/30 rounded-lg p-2">
                                                <div className="flex items-start gap-2 text-xs">
                                                    <MapPin className="w-3 h-3 text-lime-glow mt-0.5 flex-shrink-0" />
                                                    <span className="text-white">
                                                        {typeof order.address === 'string' 
                                                            ? order.address 
                                                            : `${order.address.line1 || ''} ${order.address.city || ''} ${order.address.state || ''} ${order.address.zip || ''}`.trim()
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Order Items */}
                                        {order.items && Array.isArray(order.items) && order.items.length > 0 && (
                                            <div className="bg-emerald-pine/40 border border-lime-glow/30 rounded-lg p-2">
                                                <p className="text-[10px] text-lime-glow/70 uppercase tracking-wide mb-2 font-semibold">Items ({order.items.length})</p>
                                                <div className="space-y-1.5">
                                                    {order.items.map((item, idx) => (
                                                        <div key={idx} className="bg-emerald-pine/60 rounded p-1.5 border border-lime-glow/20">
                                                            <div className="flex items-start gap-2">
                                                                <Package2 className="w-3 h-3 text-lime-glow mt-0.5 flex-shrink-0" />
                                                                <div className="text-xs text-white flex-1">
                                                                    <p className="font-semibold">{item.name || item.product_name || 'Item ' + (idx + 1)}</p>
                                                                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-lime-glow/70 flex-wrap">
                                                                        {item.quantity && <span>Qty: {item.quantity}</span>}
                                                                        {(item.channel_sku || item.sku) && (
                                                                            <span className="font-mono bg-lime-glow/10 px-1 rounded">
                                                                                {item.channel_sku || item.sku}
                                                                            </span>
                                                                        )}
                                                                        {item.product_cost && (
                                                                            <span className="text-lime-glow">Cost: ₹{parseFloat(item.product_cost).toFixed(2)}</span>
                                                                        )}
                                                                        {item.discount && item.discount > 0 && (
                                                                            <span className="text-orange-400">-₹{parseFloat(item.discount).toFixed(2)}</span>
                                                                        )}
                                                                        {item.selling_price && item.selling_price > 0 && (
                                                                            <span className="font-bold text-lime-glow">₹{parseFloat(item.selling_price).toFixed(2)}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Pricing Details */}
                                        {(order.sellingPrice || order.discount) && (
                                            <div className="bg-emerald-pine/40 border border-lime-glow/30 rounded-lg p-2">
                                                <p className="text-[10px] text-lime-glow/70 uppercase tracking-wide mb-2 font-semibold">Payment Details</p>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    {order.sellingPrice > 0 && (
                                                        <div>
                                                            <span className="text-lime-glow/60">Total Amount:</span>
                                                            <p className="font-bold text-lime-glow text-sm">₹{order.sellingPrice}</p>
                                                        </div>
                                                    )}
                                                    {order.discount > 0 && (
                                                        <div>
                                                            <span className="text-lime-glow/60">Discount:</span>
                                                            <p className="font-bold text-orange-400">₹{order.discount}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Shiprocket IDs */}
                                        <div className="grid grid-cols-2 gap-2">
                                            {order.shiprocketOrderId && (
                                                <div className="bg-emerald-pine/40 border border-lime-glow/30 rounded-lg p-2">
                                                    <p className="text-[9px] text-lime-glow/60 uppercase tracking-wide">SR Order ID</p>
                                                    <p className="text-[10px] text-white font-mono mt-0.5">{order.shiprocketOrderId}</p>
                                                </div>
                                            )}
                                            {order.shipmentId && (
                                                <div className="bg-emerald-pine/40 border border-lime-glow/30 rounded-lg p-2">
                                                    <p className="text-[9px] text-lime-glow/60 uppercase tracking-wide">Shipment ID</p>
                                                    <p className="text-[10px] text-white font-mono mt-0.5">{order.shipmentId}</p>
                                                </div>
                                            )}
                                            {order.trackingNumber && (
                                                <div className="bg-emerald-pine/40 border border-lime-glow/30 rounded-lg p-2">
                                                    <p className="text-[9px] text-lime-glow/60 uppercase tracking-wide">Tracking</p>
                                                    <p className="text-[10px] text-white font-mono mt-0.5">{order.trackingNumber}</p>
                                                </div>
                                            )}
                                            {order.orderDate && (
                                                <div className="bg-emerald-pine/40 border border-lime-glow/30 rounded-lg p-2">
                                                    <p className="text-[9px] text-lime-glow/60 uppercase tracking-wide">Order Date</p>
                                                    <p className="text-[10px] text-white mt-0.5">
                                                        {new Date(order.orderDate).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Timestamps */}
                                        <div className="flex items-center gap-2 text-[9px] text-lime-glow/50">
                                            {order.createdAt && (
                                                <span>
                                                    Created: {order.createdAt.toDate ? new Date(order.createdAt.toDate()).toLocaleDateString() : new Date(order.createdAt).toLocaleDateString()}
                                                </span>
                                            )}
                                            {order.syncedAt && (
                                                <span>
                                                    • Synced: {order.syncedAt.toDate ? new Date(order.syncedAt.toDate()).toLocaleDateString() : new Date(order.syncedAt).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>

                                        {/* Raw JSON View */}
                                        <details className="mt-2">
                                            <summary className="cursor-pointer text-[10px] text-lime-glow/70 hover:text-lime-glow font-semibold">
                                                View Raw Data
                                            </summary>
                                            <pre className="mt-2 p-2 bg-black/50 rounded-lg overflow-x-auto text-[9px] text-lime-glow/60 border border-lime-glow/20 max-h-64 overflow-y-auto">
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
