import React, { useState, useMemo } from 'react'
import { Scissors, Clipboard, X, Trash2, Truck, Package, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { getDb } from '../firebase'
import { collection, addDoc, serverTimestamp, updateDoc, doc, increment } from 'firebase/firestore'
import { FABRICS_COLLECTION, ORDERS_COLLECTION } from '../lib/utils'
import { useNotification } from '../context/NotificationProvider'
import { logOrderCreated, logOrderStatusChanged, logStockAdjusted } from '../lib/notificationLogger'

export default function Orders({
    allOrders = [],
    inventoryItems = [],
    productionBatches = [],
    userProfile,
    onViewOrder,
    onShowLegacyModal,
    onCancelOrder,
    onDeleteOrder,
    onOpenShipping,
    onCreateProductionBatch,
    onReceiveBatch,
    onDataChanged
}) {
    const [orderForm, setOrderForm] = useState({ orderNumber: '', fabricId: '', lengthToCut: '', outfitName: '', customerName: '', size: 'M', stitchingCost: '', acquisitionCost: '' })
    const [stockOrderForm, setStockOrderForm] = useState({ orderNumber: '', outfitId: '', size: 'M', quantity: '1', customerName: '', phone: '', address: '' })
    const [productionQueue, setProductionQueue] = useState([])
    const [orderFilterStatus, setOrderFilterStatus] = useState('active')
    const [orderSort, setOrderSort] = useState('date_desc')
    const [isUploading, setIsUploading] = useState(false)
    const [expandedSections, setExpandedSections] = useState({ batches: false, stock: false, production: false })
    const { notify } = useNotification()

    const fabricOptions = useMemo(() => inventoryItems.filter(i => i.type === 'fabric' && i.currentLength > 0), [inventoryItems])
    const outfitOptions = useMemo(() => inventoryItems.filter(i => i.type === 'outfit'), [inventoryItems])
    const outfitsWithStock = useMemo(() => {
        return inventoryItems.filter(item => {
            if (item.type !== 'outfit') return false
            const totalStock = Object.values(item.stockBreakdown || {}).reduce((sum, val) => sum + (parseInt(val) || 0), 0)
            return totalStock > 0
        }).map(item => ({
            ...item,
            totalStock: Object.values(item.stockBreakdown || {}).reduce((sum, val) => sum + (parseInt(val) || 0), 0)
        }))
    }, [inventoryItems])
    const selectedOutfit = outfitsWithStock.find(o => o.id === stockOrderForm.outfitId)

    const filteredOrders = useMemo(() => {
        let list = [...allOrders]
        list = list.filter(o => o.status !== 'Imported')

        if (orderFilterStatus === 'active') {
            list = list.filter(o => o.status !== 'Cancelled' && o.status !== 'Order Shipped (Completed)')
        } else if (orderFilterStatus === 'completed') {
            list = list.filter(o => o.status === 'Order Shipped (Completed)' || o.status === 'Cancelled')
        }

        list.sort((a, b) => {
            const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
            const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
            if (orderSort === 'date_desc') return dateB - dateA
            if (orderSort === 'date_asc') return dateA - dateB
            return 0
        })
        return list
    }, [allOrders, orderFilterStatus, orderSort])

    const handleAddToQueue = (e) => {
        e.preventDefault()
        const { orderNumber, fabricId, lengthToCut, outfitName, size, stitchingCost, acquisitionCost } = orderForm
        if (!orderNumber || !fabricId) return

        const fabric = inventoryItems.find(f => f.id === fabricId)
        const cutAmount = parseFloat(lengthToCut) || 0

        const item = {
            ...orderForm,
            fabricName: fabric?.name || 'Unknown',
            unit: fabric?.unit || 'm',
            cutAmount,
            stitchingCost: parseFloat(stitchingCost) || 0,
            acquisitionCost: parseFloat(acquisitionCost) || 0,
            imageUrl: fabric?.imageUrl || ''
        }
        setProductionQueue([...productionQueue, item])
        setOrderForm({ ...orderForm, lengthToCut: '', outfitName: '', customerName: '', stitchingCost: '', acquisitionCost: '' })
    }

    const removeQueueItem = (idx) => setProductionQueue(productionQueue.filter((_, i) => i !== idx))

    const handleBatchSubmit = async () => {
        setIsUploading(true)
        try {
            const db = getDb()
            const promises = productionQueue.map(async (item) => {
                if (item.fabricId) {
                    const fabricRef = doc(db, FABRICS_COLLECTION, item.fabricId)
                    if (item.cutAmount > 0) {
                        await updateDoc(fabricRef, { currentLength: increment(-item.cutAmount), updatedAt: serverTimestamp() })
                        await addDoc(collection(fabricRef, 'history'), {
                            amountUsed: item.cutAmount,
                            orderNumber: item.orderNumber,
                            productName: item.outfitName,
                            status: 'Sent to Tailor',
                            type: 'CUT',
                            usedByEmail: userProfile?.name,
                            usedAt: serverTimestamp()
                        })
                    }
                }
                await addDoc(collection(db, ORDERS_COLLECTION), {
                    fabricId: item.fabricId || '',
                    fabricName: item.fabricName,
                    outfitName: item.outfitName,
                    orderNumber: item.orderNumber,
                    customerName: item.customerName,
                    cutAmount: item.cutAmount,
                    unit: item.unit,
                    size: item.size,
                    stitchingCost: item.stitchingCost,
                    acquisitionCost: item.acquisitionCost,
                    imageUrl: item.imageUrl,
                    status: 'Sent to Tailor',
                    usedByEmail: userProfile?.name,
                    createdAt: serverTimestamp()
                })
            })
            await Promise.all(promises)
            setProductionQueue([])
            if (onDataChanged) await onDataChanged()

            // Log to notifications
            for (const item of productionQueue) {
                await logOrderCreated(item.orderNumber, item.customerName || 'N/A', userProfile?.name)
            }

            notify.success(`✅ Added ${productionQueue.length} order(s) to production`)
        } catch (err) {
            console.error('Batch submit error:', err)
            notify.error('Failed to add orders to production')
        }
        setIsUploading(false)
    }

    const handleQuickReceive = async (orderId) => {
        const order = allOrders.find(o => o.id === orderId)
        if (!order || order.orderType !== 'stock') {
            // For non-stock orders, keep the old simple behavior
            const db = getDb()
            await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
                status: 'Received from Tailor',
                updatedAt: serverTimestamp()
            })
            if (onDataChanged) await onDataChanged()
            return
        }

        // For stock orders: partial receive with per-size quantities
        const sizes = ['S', 'M', 'L', 'XL', 'XXL']
        const receivedBreakdown = {}
        let totalReceived = 0

        for (const size of sizes) {
            const qtyStr = prompt(`Please enter the quantity for size ${size} (or 0 to skip):`, '0')
            if (qtyStr === null) return // User cancelled
            const qty = parseInt(qtyStr) || 0
            if (qty > 0) {
                receivedBreakdown[size] = qty
                totalReceived += qty
            }
        }

        if (totalReceived === 0) {
            alert('No quantities entered. Receipt cancelled.')
            return
        }

        setIsUploading(true)
        try {
            const db = getDb()

            // Update the production order with receivedBreakdown
            await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
                status: 'Received from Tailor',
                receivedBreakdown,
                updatedAt: serverTimestamp()
            })

            // Find the matching outfit and increment stock per size
            const outfit = inventoryItems.find(i => i.name === order.outfitName && i.type === 'outfit')
            if (outfit) {
                const outfitRef = doc(db, FABRICS_COLLECTION, outfit.id)
                const stockUpdates = {}
                for (const [size, qty] of Object.entries(receivedBreakdown)) {
                    stockUpdates[`stockBreakdown.${size}`] = increment(qty)
                }
                stockUpdates.updatedAt = serverTimestamp()
                await updateDoc(outfitRef, stockUpdates)

                // Log history for each size
                for (const [size, qty] of Object.entries(receivedBreakdown)) {
                    await addDoc(collection(outfitRef, 'history'), {
                        type: 'OUTFIT_ADD',
                        amount: qty,
                        size,
                        status: 'Received',
                        orderNumber: order.orderNumber || orderId,
                        user: {
                            name: userProfile?.displayName || 'Unknown',
                            email: userProfile?.email || ''
                        },
                        timestamp: serverTimestamp()
                    })
                }
            }

            if (onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Error receiving order:', error)
            alert('Failed to receive order: ' + error.message)
        } finally {
            setIsUploading(false)
        }
    }

    const handleStockOrderSubmit = async (e) => {
        e.preventDefault()
        const { orderNumber, outfitId, size, quantity, customerName, phone, address } = stockOrderForm

        if (!orderNumber || !outfitId || !size || !quantity) {
            alert('Please fill all required fields')
            return
        }

        const outfit = inventoryItems.find(o => o.id === outfitId)
        if (!outfit) {
            alert('Outfit not found')
            return
        }

        const qty = parseInt(quantity)
        const availableStock = parseInt(outfit.stockBreakdown?.[size]) || 0

        if (qty > availableStock) {
            alert(`Not enough stock! Only ${availableStock} pieces available in size ${size}`)
            return
        }

        setIsUploading(true)
        try {
            const db = getDb()

            // Create order
            await addDoc(collection(db, ORDERS_COLLECTION), {
                orderNumber,
                outfitId,
                outfitName: outfit.name,
                imageUrl: outfit.imageUrl || '',
                size,
                quantity: qty,
                customerName,
                phone,
                address,
                productionCostPerPiece: outfit.productionCostPerPiece || 0,
                status: 'Ready to Ship',
                orderType: 'stock',
                usedByEmail: userProfile?.name,
                createdAt: serverTimestamp()
            })

            // Deduct from outfit stock
            const currentStock = outfit.stockBreakdown || {}
            await updateDoc(doc(db, FABRICS_COLLECTION, outfitId), {
                stockBreakdown: {
                    ...currentStock,
                    [size]: availableStock - qty
                },
                updatedAt: serverTimestamp()
            })

            alert(`✅ Order #${orderNumber} created!\n${qty} x ${outfit.name} (${size})\nStock deducted: ${availableStock} → ${availableStock - qty}`)

            setStockOrderForm({ orderNumber: '', outfitId: '', size: 'M', quantity: '1', customerName: '', phone: '', address: '' })
            if (onDataChanged) await onDataChanged()
            notify.success(`✅ Order #${orderNumber} created! ${qty}x ${outfit.name} (${size})`)
        } catch (error) {
            console.error('Stock order error:', error)
            notify.error('Error creating order: ' + error.message)
        } finally {
            setIsUploading(false)
        }
    }

    // Low stock alerts
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

    const recentBatches = useMemo(() => {
        return [...productionBatches]
            .sort((a, b) => {
                const dateA = a.receivedDate?.toDate ? a.receivedDate.toDate() : new Date(a.receivedDate)
                const dateB = b.receivedDate?.toDate ? b.receivedDate.toDate() : new Date(b.receivedDate)
                return dateB - dateA
            })
    }, [productionBatches])

    const formatDate = (date) => {
        if (!date) return 'N/A'
        const d = date.toDate ? date.toDate() : new Date(date)
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    }

    return (
        <div className="space-y-6 fade-in">{/* Production Batches Section */}
            {onCreateProductionBatch && (
                <div className="bg-emerald-pine/10 p-5 rounded-3xl shadow-card border-2 border-emerald-pine">
                    <div className="flex justify-between items-start mb-3">
                        <div
                            className="flex-1 cursor-pointer"
                            onClick={() => setExpandedSections(prev => ({ ...prev, batches: !prev.batches }))}
                        >
                            <h3 className="text-lg font-bold flex items-center gap-2 text-lime-glow">
                                <Package className="w-5 h-5" />
                                Production Batches
                                {expandedSections.batches ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </h3>
                            <p className="text-xs text-lime-glow/70 mt-1">Convert fabric to outfits</p>
                        </div>
                        {expandedSections.batches && (
                            <button
                                onClick={onCreateProductionBatch}
                                className="bg-lime-glow text-emerald-pine px-4 py-2 rounded-xl font-bold text-sm hover:shadow-lg"
                            >
                                + New Batch
                            </button>
                        )}
                    </div>

                    {expandedSections.batches && (
                        <>
                            {lowStockOutfits.length > 0 && (
                                <div className="bg-green-tea/30 p-3 rounded-xl mb-3 border-2 border-lime-glow">
                                    <div className="flex items-center gap-2 mb-2 text-lime-glow">
                                        <AlertCircle className="w-4 h-4" />
                                        <span className="text-xs font-bold">Low Stock Alert</span>
                                    </div>
                                    <div className="space-y-1">
                                        {lowStockOutfits.slice(0, 3).map((outfit, idx) => (
                                            <div key={idx} className="flex justify-between text-xs text-lime-glow">
                                                <span>{outfit.name}</span>
                                                <span className="font-bold">{outfit.totalStock} left</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {recentBatches.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-xs opacity-80 text-lime-glow mb-2">Recent Batches:</p>
                                    {recentBatches.map((batch, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => onReceiveBatch && onReceiveBatch(batch)}
                                            className="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-lime-glow/30 cursor-pointer hover:bg-white/20 active:scale-[0.98] transition-all"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-sm text-lime-glow">{batch.outfitName}</p>
                                                        {batch.status === 'Completed' ? (
                                                            <span className="bg-lime-glow/20 text-lime-glow px-2 py-0.5 rounded text-[10px] font-bold border border-lime-glow/50">
                                                                ✓ Received
                                                            </span>
                                                        ) : (
                                                            <span className="bg-amber-600/80 text-white px-2 py-0.5 rounded text-[10px] font-bold border border-amber-500">
                                                                Pending
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs opacity-80 text-lime-glow/70">{batch.totalReceivedPieces || batch.totalPieces} pcs from {batch.fabricName}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs font-bold text-lime-glow">₹{(batch.totalCostPerPiece || 0).toFixed(0)}/pc</p>
                                                    <p className="text-xs opacity-70 text-lime-glow/70">{formatDate(batch.receivedDate || batch.createdAt)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6 bg-white/10 backdrop-blur-sm rounded-xl">
                                    <Package className="w-8 h-8 mx-auto mb-2 opacity-50 text-lime-glow" />
                                    <p className="text-sm opacity-80 text-lime-glow">No production batches yet</p>
                                    <button
                                        onClick={onCreateProductionBatch}
                                        className="mt-3 bg-lime-glow text-emerald-pine px-4 py-2 rounded-xl font-bold text-xs"
                                    >
                                        Create First Batch
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Ready Stock Orders */}
            <div className="bg-emerald-pine p-5 rounded-3xl shadow-card text-white">
                <div
                    className="cursor-pointer mb-3"
                    onClick={() => setExpandedSections(prev => ({ ...prev, stock: !prev.stock }))}
                >
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Package className="w-5 h-5" />
                        Ready Stock Orders
                        {expandedSections.stock ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </h3>
                    <p className="text-xs opacity-90 mt-1">Fulfill customer orders from produced inventory</p>
                </div>

                {expandedSections.stock && (
                    <form onSubmit={handleStockOrderSubmit} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold opacity-90">Order Number *</label>
                                <input
                                    className="w-full p-2.5 rounded-xl mt-1 bg-white text-emerald-pine text-sm border-2 border-lime-glow font-semibold"
                                    value={stockOrderForm.orderNumber}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, orderNumber: e.target.value })}
                                    placeholder="e.g., 1001"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold opacity-90">Select Outfit *</label>
                                <select
                                    className="w-full p-2.5 rounded-xl mt-1 bg-white text-emerald-pine text-sm border-2 border-lime-glow font-semibold"
                                    value={stockOrderForm.outfitId}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, outfitId: e.target.value })}
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
                        </div>

                        {selectedOutfit && (
                            <div className="bg-white backdrop-blur-sm p-3 rounded-xl">
                                <p className="text-xs font-bold mb-2">Available Stock:</p>
                                <div className="flex gap-2 flex-wrap">
                                    {['S', 'M', 'L', 'XL', 'XXL'].map(size => {
                                        const stock = parseInt(selectedOutfit.stockBreakdown?.[size]) || 0
                                        if (stock === 0) return null
                                        return (
                                            <div key={size} className="bg-white px-2 py-1 rounded-lg text-xs">
                                                <span className="font-bold">{size}:</span> {stock}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold opacity-90">Size *</label>
                                <select
                                    className="w-full p-2.5 rounded-xl mt-1 bg-white text-emerald-pine text-sm border-2 border-lime-glow font-semibold"
                                    value={stockOrderForm.size}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, size: e.target.value })}
                                    required
                                >
                                    {['S', 'M', 'L', 'XL', 'XXL'].map(size => (
                                        <option key={size} value={size}>
                                            {size} {selectedOutfit && `(${parseInt(selectedOutfit.stockBreakdown?.[size]) || 0} available)`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold opacity-90">Quantity *</label>
                                <input
                                    type="number"
                                    min="1"
                                    className="w-full p-2.5 rounded-xl mt-1 bg-white text-emerald-pine text-sm border-2 border-lime-glow font-semibold"
                                    value={stockOrderForm.quantity}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, quantity: e.target.value })}
                                    placeholder="1"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold opacity-90">Customer Name</label>
                            <input
                                className="w-full p-2.5 rounded-xl mt-1 bg-white text-emerald-pine text-sm border-2 border-lime-glow font-semibold"
                                value={stockOrderForm.customerName}
                                onChange={e => setStockOrderForm({ ...stockOrderForm, customerName: e.target.value })}
                                placeholder="Customer name"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold opacity-90">Phone</label>
                                <input
                                    className="w-full p-2.5 rounded-xl mt-1 bg-white text-emerald-pine text-sm border-2 border-lime-glow font-semibold"
                                    value={stockOrderForm.phone}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, phone: e.target.value })}
                                    placeholder="Phone number"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold opacity-90">Address</label>
                                <input
                                    className="w-full p-2.5 rounded-xl mt-1 bg-white text-emerald-pine text-sm border-2 border-lime-glow font-semibold"
                                    value={stockOrderForm.address}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, address: e.target.value })}
                                    placeholder="Delivery address"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isUploading || !stockOrderForm.outfitId}
                            className="w-full bg-green-tea text-emerald-pine font-bold py-3 rounded-xl hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isUploading ? 'Creating Order...' : 'Create Order'}
                        </button>

                        {outfitsWithStock.length === 0 && (
                            <div className="text-center py-4 bg-white backdrop-blur-sm rounded-xl">
                                <p className="text-xs opacity-80">No outfits in stock. Create production batches first!</p>
                            </div>
                        )}
                    </form>
                )}
            </div>

            {/* Production Form */}
            {/* Production Form */}
            <div className="bg-white p-5 rounded-3xl shadow-soft border-l-4 border-brand border dark:border-gray-800">
                <div className="flex justify-between items-center mb-4">
                    <div
                        className="flex-1 cursor-pointer"
                        onClick={() => setExpandedSections(prev => ({ ...prev, production: !prev.production }))}
                    >
                        <h3 className="text-lg font-bold text-black flex items-center gap-2">
                            <Scissors className="w-5 h-5 text-brand" /> Production Queue
                            {expandedSections.production ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                        </h3>
                    </div>
                    {expandedSections.production && onShowLegacyModal && (
                        <button onClick={onShowLegacyModal} className="text-xs bg-gray-100 text-gray-600 dark:text-gray-400 dark:text-gray-500 px-3 py-1.5 rounded-full font-bold hover:bg-gray-200 flex items-center gap-1">
                            + Log Past Order
                        </button>
                    )}
                </div>

                {expandedSections.production && (
                    <>
                        <form onSubmit={handleAddToQueue} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-emerald-pine uppercase">Order #</label>
                                    <input className="w-full p-2 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm placeholder-gray-400" value={orderForm.orderNumber} onChange={e => setOrderForm({ ...orderForm, orderNumber: e.target.value })} placeholder="101" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-emerald-pine uppercase">Select Fabric</label>
                                    <select className="w-full p-2 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm appearance-none cursor-pointer" value={orderForm.fabricId} onChange={e => setOrderForm({ ...orderForm, fabricId: e.target.value })}>
                                        <option value="">-- Choose --</option>
                                        {fabricOptions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-emerald-pine uppercase">Cut Amt</label>
                                    <input type="number" step="0.1" className="w-full p-2 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm placeholder-gray-400" value={orderForm.lengthToCut} onChange={e => setOrderForm({ ...orderForm, lengthToCut: e.target.value })} placeholder="0.0" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-emerald-pine uppercase">Stitching ₹</label>
                                    <input type="number" className="w-full p-2 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm placeholder-gray-400" value={orderForm.stitchingCost} onChange={e => setOrderForm({ ...orderForm, stitchingCost: e.target.value })} placeholder="0.00" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-emerald-pine uppercase">Acq. Cost ₹</label>
                                    <input type="number" className="w-full p-2 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm placeholder-gray-400" value={orderForm.acquisitionCost} onChange={e => setOrderForm({ ...orderForm, acquisitionCost: e.target.value })} placeholder="0.00" />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-emerald-pine uppercase">Target Outfit</label>
                                <input list="outfit-suggestions" className="w-full p-2 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm placeholder-gray-400" value={orderForm.outfitName} onChange={e => setOrderForm({ ...orderForm, outfitName: e.target.value })} placeholder="e.g. Mirae" />
                                <datalist id="outfit-suggestions">
                                    {outfitOptions.map(o => <option key={o.id} value={o.name} />)}
                                </datalist>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-emerald-pine uppercase block mb-1">Target Size</label>
                                <div className="flex bg-emerald-pine/10 p-1 rounded-xl gap-1 overflow-x-auto no-scrollbar border-2 border-lime-glow">
                                    {['S', 'M', 'L', 'XL', 'XXL', 'Custom'].map(s => (
                                        <button key={s} type="button" onClick={() => setOrderForm({ ...orderForm, size: s })} className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${orderForm.size === s ? 'bg-lime-glow text-emerald-pine shadow-md' : 'text-lime-glow hover:bg-lime-glow/20'}`}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button type="submit" className="w-full bg-lime-glow text-emerald-pine py-2 rounded-xl font-bold text-sm hover:shadow-lg">+ Add to Queue</button>
                        </form>

                        {productionQueue.length > 0 && (
                            <div className="mt-4 border-t pt-4">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase">Pending Batch ({productionQueue.length})</h4>
                                    <button onClick={() => setProductionQueue([])} className="text-[10px] text-red-500 hover:underline">Clear All</button>
                                </div>
                                <div className="space-y-2 mb-4">
                                    {productionQueue.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-900 p-2 rounded-lg">
                                            <div>
                                                <span className="font-bold text-brand">{item.fabricName}</span>
                                                {item.cutAmount > 0 && <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 ml-2">Cut: {item.cutAmount} {item.unit}</span>}
                                                <p className="text-[10px] text-gray-400">#{item.orderNumber} → {item.outfitName} ({item.size})</p>
                                            </div>
                                            <button onClick={() => removeQueueItem(idx)} className="text-red-400 hover:text-red-600">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={handleBatchSubmit} disabled={isUploading} className="w-full bg-lime-glow text-emerald-pine py-3 rounded-xl font-bold text-sm shadow-md hover:shadow-lg">
                                    {isUploading ? 'Processing...' : 'Submit Batch to Production'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Order List */}
            <div>
                <div className="flex justify-between items-end mb-3">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Clipboard className="w-5 h-5 text-lime-glow" /> Order History
                    </h3>
                    <div className="flex gap-2">
                        <select className="text-xs bg-white border-2 border-lime-glow rounded-xl px-3 py-2 text-emerald-pine font-semibold shadow-md hover:shadow-lg" value={orderSort} onChange={e => setOrderSort(e.target.value)}>
                            <option value="date_desc">Newest</option>
                            <option value="date_asc">Oldest</option>
                        </select>
                        <select className="text-xs bg-white border-2 border-lime-glow rounded-xl px-3 py-2 text-emerald-pine font-semibold shadow-md hover:shadow-lg" value={orderFilterStatus} onChange={e => setOrderFilterStatus(e.target.value)}>
                            <option value="active">Active Only</option>
                            <option value="completed">Completed/Cancelled</option>
                        </select>
                    </div>
                </div>
                <div className="space-y-3">
                    {filteredOrders.map(order => (
                        <div key={order.id} onClick={() => onViewOrder && onViewOrder(order)} className={`bg-emerald-pine/20 border-2 border-lime-glow/40 p-4 rounded-2xl shadow-card flex flex-col gap-3 relative cursor-pointer hover:border-lime-glow/60 active:scale-95 transition-all ${order.status === 'Cancelled' ? 'opacity-60 grayscale' : ''}`}>
                            {order.status !== 'Cancelled' && order.status !== 'Order Shipped (Completed)' && (
                                <button onClick={(e) => { e.stopPropagation(); onCancelOrder && onCancelOrder(order) }} className="absolute top-3 right-3 text-white/40 hover:text-red-500">
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                            {(order.status === 'Cancelled' || order.status === 'Order Shipped (Completed)') && (
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('Delete button clicked for order:', order.id);
                                    onDeleteOrder && onDeleteOrder(order.id);
                                }} className="absolute bottom-3 right-3 text-white/40 hover:text-red-500 z-10 p-2">
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            )}
                            <div className="flex gap-3">
                                <img src={order.imageUrl} className="w-14 h-14 rounded-xl bg-gray-800 object-cover" />
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-lime-glow font-bold text-sm">#{order.orderNumber}</span>
                                        {order.orderType === 'stock' && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-lime-glow/20 text-lime-glow border border-lime-glow/50">
                                                STOCK
                                            </span>
                                        )}
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${order.status === 'Sent to Tailor' ? 'bg-amber-600/80 text-white border-amber-500' : order.status === 'Ready to Ship' ? 'bg-emerald-700/80 text-white border-emerald-600' : order.status.includes('Shipped') ? 'bg-lime-glow/20 text-lime-glow border-lime-glow/50' : 'bg-gray-700 text-white border-gray-600'}`}>
                                            {order.status}
                                        </span>
                                    </div>
                                    <h4 className="font-bold text-white text-sm">
                                        {order.outfitName || 'Unspecified'}
                                        <span className="text-xs bg-emerald-pine/60 border border-lime-glow/40 px-1 rounded ml-1 text-lime-glow">
                                            {order.quantity ? `${order.quantity}x ` : ''}Size {order.size}
                                        </span>
                                    </h4>
                                    {order.orderType === 'stock' ? (
                                        <p className="text-xs text-lime-glow">₹{(order.productionCostPerPiece || 0).toFixed(2)}/pc</p>
                                    ) : (
                                        <p className="text-xs text-lime-glow">Cost: ₹{order.stitchingCost || 0}</p>
                                    )}
                                </div>
                            </div>
                            {order.status !== 'Cancelled' && (
                                <div className="bg-emerald-pine/40 border border-lime-glow/30 p-2 rounded-xl flex justify-between items-center mt-1">
                                    {order.status === 'Sent to Tailor' ? (
                                        <button onClick={(e) => { e.stopPropagation(); handleQuickReceive(order.id) }} className="text-xs font-bold text-lime-glow hover:underline">
                                            Mark Received
                                        </button>
                                    ) : order.status === 'Received from Tailor' || order.status === 'Ready to Ship' ? (
                                        <button onClick={(e) => { e.stopPropagation(); onOpenShipping && onOpenShipping(order.id) }} className="text-xs font-bold text-lime-glow hover:underline flex items-center gap-1">
                                            <Truck className="w-3 h-3" /> Ship It
                                        </button>
                                    ) : (
                                        <span className="text-[10px] text-lime-glow font-bold">Done</span>
                                    )}
                                </div>
                            )}
                            {(order.customerName || order.phone || order.address) && (
                                <div className="text-[10px] text-white/80 mt-1 border-t border-lime-glow/30 pt-1">
                                    {order.customerName} {order.phone && `• ${order.phone}`} {order.address && `• ${order.address}`}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
