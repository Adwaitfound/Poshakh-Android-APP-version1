import React, { useState, useEffect } from 'react'
import { RefreshCw, Package, Truck, MapPin, Phone, Mail, Calendar } from 'lucide-react'

export default function ShiprocketOrders({ allOrders = [], onViewOrder }) {
    const [isSyncing, setIsSyncing] = useState(false)
    const [syncStatus, setSyncStatus] = useState(null)
    const [shiprocketOrders, setShiprocketOrders] = useState([])

    // Filter Shiprocket orders from all orders
    useEffect(() => {
        const filtered = allOrders.filter(order => 
            order.platform === 'Shiprocket' || order.source === 'shiprocket'
        )
        setShiprocketOrders(filtered)
    }, [allOrders])

    const handleSync = async () => {
        setIsSyncing(true)
        setSyncStatus({ status: 'Connecting to Shiprocket...', progress: 0 })

        try {
            const resp = await fetch('http://localhost:3001/api/shiprocket/orders?page=1&per_page=100')
            if (!resp.ok) {
                throw new Error('Failed to fetch Shiprocket orders')
            }

            const data = await resp.json()
            setSyncStatus({ 
                status: `✅ Fetched ${data.orders?.length || 0} orders from Shiprocket`, 
                success: true 
            })

            // Reload page to show new orders
            setTimeout(() => {
                window.location.reload()
            }, 1500)
        } catch (error) {
            console.error('Sync error:', error)
            setSyncStatus({
                status: `❌ Sync failed: ${error.message}`,
                error: true
            })
        } finally {
            setIsSyncing(false)
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
                            View and manage orders synced from Shiprocket
                        </p>
                        <p className="text-sm text-orange-300/60 mt-1">
                            Total: {shiprocketOrders.length} orders
                        </p>
                    </div>
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="px-6 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
                    >
                        <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Sync from Shiprocket'}
                    </button>
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
                        Click "Sync from Shiprocket" to import your orders
                    </p>
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="px-6 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors disabled:opacity-50"
                    >
                        Sync Now
                    </button>
                </div>
            ) : (
                <div className="grid gap-4">
                    {shiprocketOrders.map(order => (
                        <div
                            key={order.id}
                            onClick={() => onViewOrder && onViewOrder(order)}
                            className="bg-gradient-to-r from-gray-900 to-gray-800 border-2 border-orange-500/30 rounded-2xl p-5 hover:border-orange-500/60 transition-all cursor-pointer shadow-lg"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    {/* Order Header */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-2xl font-mono text-orange-400 font-bold">
                                            #{order.orderNumber || order.shiprocketOrderId}
                                        </span>
                                        <span className="px-3 py-1 bg-orange-600/80 text-white text-xs font-bold rounded-full border border-orange-500">
                                            🚚 SHIPROCKET
                                        </span>
                                        {order.awb && (
                                            <span className="text-xs text-gray-400 font-mono">
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
                                            <div className="flex items-start gap-2 text-sm">
                                                <MapPin className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                                                <span className="text-gray-300 line-clamp-2">
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
                                            <span className="text-gray-400">Weight: {order.weight}</span>
                                        )}
                                        {order.createdAt && (
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3 text-orange-400" />
                                                <span className="text-gray-400">
                                                    {new Date(order.createdAt.toDate ? order.createdAt.toDate() : order.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
