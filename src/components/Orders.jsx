import React, { useState, useMemo } from 'react'
import Papa from 'papaparse'
import { Scissors, Clipboard, X, Trash2, Truck, Package, AlertCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { getDb } from '../firebase'
import { collection, addDoc, serverTimestamp, updateDoc, doc, increment } from 'firebase/firestore'
import { FABRICS_COLLECTION, ORDERS_COLLECTION, parsePrice, formatCurrency } from '../lib/utils'
import { useNotification } from '../context/NotificationProvider'
import { logOrderCreated, logOrderStatusChanged, logStockAdjusted } from '../lib/notificationLogger'
import { pullShiprocketOrders } from '../lib/shiprocketSync'

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
    onCancelBatch,
    onDataChanged
}) {
    const [stockOrderForm, setStockOrderForm] = useState({ orderNumber: '', outfitId: '', size: 'M', quantity: '1', customerName: '', phone: '', address: '', sellingPrice: '', stitchingCost: '', fabricCost: '', productionCost: '', platform: 'Shopify' })
    const [scanInput, setScanInput] = useState('')
    const [scanStatus, setScanStatus] = useState(null) // 'found', 'notfound', null
    const [orderFilterStatus, setOrderFilterStatus] = useState('active')
    const [orderSort, setOrderSort] = useState('date_desc')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [isUploading, setIsUploading] = useState(false)
    const [isSyncingShiprocket, setIsSyncingShiprocket] = useState(false)
    const [syncStatus, setSyncStatus] = useState(null)
    const [expandedSections, setExpandedSections] = useState({ batches: true, stock: false })
    const [selectedOrders, setSelectedOrders] = useState(new Set())
    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const { notify } = useNotification()

    // Multi-select helpers
    const toggleSelectOrder = (orderId) => {
        const newSet = new Set(selectedOrders)
        if (newSet.has(orderId)) {
            newSet.delete(orderId)
        } else {
            newSet.add(orderId)
        }
        setSelectedOrders(newSet)
    }

    const toggleSelectAll = (visibleOrderIds) => {
        if (selectedOrders.size === visibleOrderIds.length) {
            setSelectedOrders(new Set())
        } else {
            setSelectedOrders(new Set(visibleOrderIds))
        }
    }

    const handleBulkDelete = () => {
        if (selectedOrders.size === 0) return
        setDeleteConfirm('bulk')
    }

    const exportToCSV = () => {
        if (filteredOrders.length === 0) return
        const headers = ['Order Number', 'Customer Name', 'Phone', 'Status', 'Platform', 'Outfit', 'Size', 'Qty', 'Amount', 'Date']
        const rows = filteredOrders.map(o => [
            o.orderNumber || '',
            o.customerName || '',
            o.phone || '',
            o.status || '',
            o.platform || '',
            o.outfitName || o.productName || '',
            o.size || '',
            o.quantity || 1,
            o.orderTotal || o.finalSellingPrice || o.sellingPrice || 0,
            (parseDate(o.createdAt) || new Date()).toLocaleDateString('en-IN')
        ])
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const confirmBulkDelete = async () => {
        for (const orderId of selectedOrders) {
            await onDeleteOrder(orderId)
        }
        setSelectedOrders(new Set())
        setDeleteConfirm(null)
    }

    // Helper to parse dates from Firestore
    const parseDate = (value) => {
        if (!value) return null
        if (value.toDate) return value.toDate()
        const d = new Date(value)
        return Number.isNaN(d.getTime()) ? null : d
    }

    // Handle barcode/AWB scan to prefill order form
    const handleScanOrder = async (e) => {
        e.preventDefault()
        if (!scanInput.trim()) return

        const searchTerm = scanInput.trim()
        setScanStatus(null)

        try {
            // First try: search local orders by orderNumber or trackingNumber
            const matchedOrder = allOrders.find(o => 
                (o.orderNumber && o.orderNumber.toString() === searchTerm) ||
                (o.trackingNumber && o.trackingNumber === searchTerm)
            )

            if (matchedOrder) {
                // Prefill form with matched order data
                const outfit = inventoryItems.find(i => i.id === matchedOrder.outfitId || i.name === matchedOrder.outfitName)
                setStockOrderForm(prev => ({
                    ...prev,
                    orderNumber: matchedOrder.orderNumber || prev.orderNumber,
                    outfitId: outfit?.id || prev.outfitId,
                    customerName: matchedOrder.customerName || prev.customerName,
                    phone: matchedOrder.phone || prev.phone,
                    address: matchedOrder.address || prev.address,
                    platform: matchedOrder.platform || 'Shopify',
                    size: matchedOrder.size || 'M',
                    quantity: matchedOrder.quantity?.toString() || '1'
                }))
                setScanStatus('found')
                setScanInput('')
                setTimeout(() => setScanStatus(null), 2000)
                return
            }

            // Second try: fetch from Shiprocket by AWB (assume numeric scan is an AWB)
            if (/^\d+$/.test(searchTerm)) {
                try {
                    const resp = await fetch(`http://localhost:3001/api/shiprocket/order?awb=${searchTerm}`)
                    if (resp.ok) {
                        const shippingData = await resp.json()
                        
                        // Auto-fill from Shiprocket data
                        const outfit = inventoryItems.length > 0 ? inventoryItems[0] : null
                        setStockOrderForm(prev => ({
                            ...prev,
                            orderNumber: shippingData.orderNumber || shippingData.awb || prev.orderNumber,
                            outfitId: outfit?.id || prev.outfitId,
                            customerName: shippingData.customerName || prev.customerName,
                            phone: shippingData.phone || prev.phone,
                            address: shippingData.address?.line1 || prev.address,
                            platform: shippingData.platform || 'Unknown',
                            size: prev.size,
                            quantity: '1'
                        }))
                        setScanStatus('found')
                        setScanInput('')
                        setTimeout(() => setScanStatus(null), 2000)
                        return
                    }
                } catch (err) {
                    console.warn('Shiprocket lookup failed:', err)
                    // Fall through to notfound
                }
            }

            // Not found in local orders or Shiprocket
            setScanStatus('notfound')
            setTimeout(() => setScanStatus(null), 2000)
        } catch (error) {
            console.error('Scan error:', error)
            setScanStatus('notfound')
        }
    }

    // Sync orders from Shiprocket
    const handleSyncShiprocket = async () => {
        setIsSyncingShiprocket(true)
        setSyncStatus({ status: 'Connecting to Shiprocket...', progress: 0 })

        try {
            const result = await pullShiprocketOrders({
                page: 1,
                per_page: 100,
                onProgress: (update) => {
                    setSyncStatus(prev => ({ ...prev, ...update }))
                }
            })

            notify({
                type: 'success',
                title: '✅ Shiprocket Sync Complete',
                message: `Synced ${result.synced} orders. ${result.failed > 0 ? `${result.failed} failed.` : ''}`
            })

            setSyncStatus(null)

            // Refresh orders
            if (onDataChanged) {
                await onDataChanged()
            }
        } catch (error) {
            console.error('Sync error:', error)
            setSyncStatus({
                status: `❌ Sync failed: ${error.message}`,
                error: true
            })
            notify({
                type: 'error',
                title: '❌ Sync Failed',
                message: error.message
            })
        } finally {
            setIsSyncingShiprocket(false)
        }
    }

    // Helper to get COD remittance date
    const getCodRemittanceDate = (order) => {
        const explicitDate = parseDate(order.codRemittanceDate)
        if (explicitDate) return explicitDate
        const orderDate = parseDate(order.orderDate) || parseDate(order.createdAt) || new Date()
        const expected = new Date(orderDate)
        expected.setDate(expected.getDate() + 4)
        return expected
    }

    // Helper to get COD countdown badge
    const getCodCountdown = (order) => {
        const paymentMethod = order.paymentMethod || order.paymentMode || 'Prepaid'
        const isShipped = order.status === 'Order Shipped (Completed)'
        
        if (paymentMethod !== 'COD' || !isShipped) return null
        
        const remittanceDate = getCodRemittanceDate(order)
        const now = new Date()
        const daysLeft = Math.ceil((remittanceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysLeft > 0) {
            return { text: `COD in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`, color: 'bg-green-600/80 border-green-500', type: 'pending' }
        } else if (daysLeft === 0) {
            return { text: 'COD due today', color: 'bg-orange-600/80 border-orange-500', type: 'today' }
        } else {
            return { text: `COD overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) > 1 ? 's' : ''}`, color: 'bg-red-600/80 border-red-500', type: 'overdue' }
        }
    }

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

    // Find production batch for selected outfit and extract cost data
    const outfitCostData = useMemo(() => {
        if (!selectedOutfit) return null
        
        // Find the most recent completed batch for this outfit
        const batch = productionBatches
            .filter(b => b.outfitId === selectedOutfit.id && b.status === 'Completed')
            .sort((a, b) => {
                const dateA = a.receivedDate?.toDate ? a.receivedDate.toDate() : new Date(a.receivedDate)
                const dateB = b.receivedDate?.toDate ? b.receivedDate.toDate() : new Date(b.receivedDate)
                return dateB - dateA
            })[0]
        
        if (!batch) return null
        
        return {
            stitchingCostPerPiece: batch.stitchingCostPerPiece || 0,
            fabricCostPerPiece: batch.fabricCostPerPiece || 0,
            accessoriesCostPerPiece: batch.accessoriesCostPerPiece || 0,
            packagingCostPerPiece: batch.packagingCostPerPiece || 0,
            otherCostPerPiece: batch.otherCostPerPiece || 0,
            totalCostPerPiece: batch.totalCostPerPiece || 0,
            vendorName: batch.vendorName || 'N/A',
            batchId: batch.id
        }
    }, [selectedOutfit, productionBatches])

    // Auto-fill costs when outfit changes
    React.useEffect(() => {
        if (outfitCostData) {
            setStockOrderForm(prev => ({
                ...prev,
                stitchingCost: outfitCostData.stitchingCostPerPiece.toString(),
                fabricCost: outfitCostData.fabricCostPerPiece.toString(),
                productionCost: outfitCostData.totalCostPerPiece.toString(),
                sellingPrice: selectedOutfit?.sellingPrice?.toString() || ''
            }))
        }
    }, [outfitCostData, selectedOutfit?.sellingPrice])

    const filteredOrders = useMemo(() => {
        const toNumber = (val) => {
            const n = parsePrice(val || 0)
            return Number.isFinite(n) ? n : 0
        }

        const toDateMs = (order) => {
            const primary = parseDate(order.createdAt || order.orderDate || order.shippedAt)
            return primary ? primary.getTime() : 0
        }

        const orderValue = (order) => {
            const base = order.orderTotal ?? order.finalSellingPrice ?? order.totalPrice ?? order.sellingPrice ?? order.amount ?? 0
            const qty = parseInt(order.quantity) || 1
            return toNumber(base) || toNumber(base) * qty
        }

        let list = [...allOrders]
        list = list.filter(o => o.status !== 'Imported')

        // Date range filter
        if (fromDate) {
            const fromMs = new Date(fromDate).setHours(0, 0, 0, 0)
            list = list.filter(o => toDateMs(o) >= fromMs)
        }
        if (toDate) {
            const toMs = new Date(toDate).setHours(23, 59, 59, 999)
            list = list.filter(o => toDateMs(o) <= toMs)
        }

        if (orderFilterStatus === 'active') {
            list = list.filter(o => o.status !== 'Cancelled' && o.status !== 'Order Shipped (Completed)')
        } else if (orderFilterStatus === 'completed') {
            list = list.filter(o => o.status === 'Order Shipped (Completed)' || o.status === 'Cancelled')
        } else if (orderFilterStatus === 'cod_overdue') {
            list = list.filter(o => {
                const cod = getCodCountdown(o)
                return cod && cod.type === 'overdue'
            })
        }

        // Date range filter
        if (fromDate || toDate) {
            const from = fromDate ? new Date(fromDate + 'T00:00:00') : null
            const to = toDate ? new Date(toDate + 'T23:59:59') : null
            list = list.filter(o => {
                const d = parseDate(o.createdAt || o.orderDate || o.shippedAt)
                if (!d) return false
                if (from && d < from) return false
                if (to && d > to) return false
                return true
            })
        }

        list.sort((a, b) => {
            if (orderSort === 'date_desc') return toDateMs(b) - toDateMs(a)
            if (orderSort === 'date_asc') return toDateMs(a) - toDateMs(b)
            if (orderSort === 'value_desc') return orderValue(b) - orderValue(a)
            if (orderSort === 'value_asc') return orderValue(a) - orderValue(b)
            if (orderSort === 'status') return (a.status || '').localeCompare(b.status || '')
            if (orderSort === 'platform') return (a.platform || '').localeCompare(b.platform || '')
            return 0
        })
        return list
    }, [allOrders, orderFilterStatus, orderSort, fromDate, toDate])

    const handleExportCSV = () => {
        const rows = filteredOrders.map(o => ({
            OrderNumber: o.orderNumber || o.id,
            Status: o.status || '',
            Platform: o.platform || '',
            Customer: o.customerName || '',
            Phone: o.phone || '',
            Size: o.size || '',
            Quantity: o.quantity || 1,
            Value: o.orderTotal ?? o.finalSellingPrice ?? o.sellingPrice ?? '',
            CreatedAt: (() => { const d = parseDate(o.createdAt || o.orderDate); return d ? d.toISOString() : '' })(),
        }))
        const csv = Papa.unparse(rows)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `orders_${new Date().toISOString().slice(0,10)}.csv`
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
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

    const handleStockOrderSubmit = async (e, keepCustomerInfo = false) => {
        e.preventDefault()
        const { orderNumber, outfitId, size, quantity, customerName, phone, address, fabricCost, stitchingCost, sellingPrice, productionCost, platform } = stockOrderForm

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

            // Create order with cost breakdown
            const sellingPriceNum = parseFloat(sellingPrice) || 0
            const productionCostNum = parseFloat(productionCost) || outfit.productionCostPerPiece || 0
            const fabricCostNum = parseFloat(fabricCost) || 0
            const stitchingCostNum = parseFloat(stitchingCost) || 0
            
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
                platform,
                // Per-piece costs
                productionCostPerPiece: productionCostNum,
                fabricCostPerPiece: fabricCostNum,
                stitchingCostPerPiece: stitchingCostNum,
                sellingPrice: sellingPriceNum,
                profitPerPiece: sellingPriceNum - productionCostNum,
                // Total costs for customer history display
                finalSellingPrice: sellingPriceNum * qty,
                orderTotal: sellingPriceNum * qty,
                stitchingCost: stitchingCostNum * qty,
                fabricCost: fabricCostNum * qty,
                status: 'Ready to Ship',
                orderType: 'stock',
                usedByEmail: userProfile?.name,
                createdAt: serverTimestamp()
            })

            // Deduct from outfit stock using atomic increment (FIXED)
            const outfitRef = doc(db, FABRICS_COLLECTION, outfitId)
            await updateDoc(outfitRef, {
                [`stockBreakdown.${size}`]: increment(-qty),
                updatedAt: serverTimestamp()
            })

            // Log stock deduction to outfit history
            await addDoc(collection(outfitRef, 'history'), {
                type: 'STOCK_DEDUCTION',
                amount: -qty,
                size,
                orderNumber,
                customerName: customerName || 'N/A',
                status: 'Order Created',
                user: {
                    name: userProfile?.displayName || userProfile?.name || 'Unknown',
                    email: userProfile?.email || ''
                },
                timestamp: serverTimestamp()
            })

            await logStockAdjusted(outfit.name, size, -qty, `Order #${orderNumber}`, userProfile?.name)

            // Reset form - keep customer info if requested
            if (keepCustomerInfo) {
                setStockOrderForm({ orderNumber: '', outfitId: '', size: 'M', quantity: '1', customerName, phone, address, sellingPrice: '', stitchingCost: '', fabricCost: '', productionCost: '', platform })
                notify.success(`✅ Order #${orderNumber} created! ${qty}x ${outfit.name} (${size}) - Ready for next order`)
            } else {
                setStockOrderForm({ orderNumber: '', outfitId: '', size: 'M', quantity: '1', customerName: '', phone: '', address: '', sellingPrice: '', stitchingCost: '', fabricCost: '', productionCost: '', platform: 'Shopify' })
                notify.success(`✅ Order #${orderNumber} created! ${qty}x ${outfit.name} (${size})`)
            }

            if (onDataChanged) await onDataChanged()
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

    // Auto-generate next Shopdeck order number
    const getNextShopdeckNumber = () => {
        const shopdeckOrders = allOrders.filter(o => 
            (o.platform === 'Shopdeck' || o.orderNumber?.startsWith('shpdck')) &&
            o.orderNumber
        )
        
        if (shopdeckOrders.length === 0) return 'shpdck1'
        
        const numbers = shopdeckOrders
            .map(o => {
                const match = o.orderNumber.toString().match(/shpdck(\d+)/i)
                return match ? parseInt(match[1]) : 0
            })
            .filter(n => !Number.isNaN(n))
        
        const maxNum = Math.max(...numbers, 0)
        return `shpdck${maxNum + 1}`
    }

    // Handle platform change - auto-set order number for Shopdeck
    const handlePlatformChange = (platform) => {
        setStockOrderForm(prev => ({
            ...prev,
            platform,
            orderNumber: platform === 'Shopdeck' ? getNextShopdeckNumber() : prev.orderNumber
        }))
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
                                            className="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-lime-glow/30 transition-all"
                                        >
                                            <div className="flex justify-between items-start gap-3">
                                                <div 
                                                    className="flex-1 cursor-pointer hover:opacity-80"
                                                    onClick={() => onReceiveBatch && onReceiveBatch(batch)}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-sm text-lime-glow">{batch.outfitName}</p>
                                                        {batch.status === 'Completed' ? (
                                                            <span className="bg-lime-glow/20 text-lime-glow px-2 py-0.5 rounded text-[10px] font-bold border border-lime-glow/50">
                                                                ✓ Received
                                                            </span>
                                                        ) : batch.status === 'Cancelled' ? (
                                                            <span className="bg-red-900/40 text-red-400 px-2 py-0.5 rounded text-[10px] font-bold border border-red-500/40">
                                                                ✗ Cancelled
                                                            </span>
                                                        ) : (
                                                            <span className="bg-amber-600/80 text-white px-2 py-0.5 rounded text-[10px] font-bold border border-amber-500">
                                                                Pending
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs opacity-80 text-lime-glow/70">{batch.totalReceivedPieces || batch.totalPieces} pcs from {batch.fabricName}</p>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <div className="text-right">
                                                        <p className="text-xs font-bold text-lime-glow">₹{(batch.totalCostPerPiece || 0).toFixed(0)}/pc</p>
                                                        <p className="text-xs opacity-70 text-lime-glow/70">{formatDate(batch.receivedDate || batch.createdAt)}</p>
                                                    </div>
                                                    {batch.status !== 'Completed' && batch.status !== 'Cancelled' && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                onCancelBatch && onCancelBatch(batch)
                                                            }}
                                                            className="p-1 hover:bg-red-900/40 rounded transition-all"
                                                            title="Cancel batch"
                                                        >
                                                            <X className="w-4 h-4 text-red-400 hover:text-red-300" />
                                                        </button>
                                                    )}
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
            <div className="bg-gradient-to-b from-emerald-900 via-emerald-950 to-emerald-900 p-5 rounded-3xl shadow-card text-white border border-emerald-700/60">
                <div
                    className="cursor-pointer mb-4 flex items-start justify-between gap-3"
                    onClick={() => setExpandedSections(prev => ({ ...prev, stock: !prev.stock }))}
                >
                    <div>
                        <h3 className="text-xl font-extrabold flex items-center gap-2">
                            <Package className="w-5 h-5" />
                            Ready Stock Orders
                        </h3>
                        <p className="text-sm text-emerald-100/80 mt-1">Fulfill customer orders from produced inventory</p>
                    </div>
                    {expandedSections.stock ? <ChevronUp className="w-5 h-5 text-emerald-200" /> : <ChevronDown className="w-5 h-5 text-emerald-200" />}
                </div>

                {expandedSections.stock && (
                    <>
                        {/* Scan Order/AWB Section */}
                        <form onSubmit={handleScanOrder} className="mb-4 bg-lime-glow/5 border border-lime-glow/30 p-4 rounded-2xl">
                            <label className="text-xs font-bold text-lime-glow uppercase block mb-2">🔍 Scan Order Number / AWB</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={scanInput}
                                    onChange={e => setScanInput(e.target.value)}
                                    placeholder="Scan barcode or type order number..."
                                    autoFocus
                                    className="flex-1 px-4 py-2 rounded-xl bg-white text-emerald-pine border-2 border-lime-glow font-semibold focus:outline-none focus:ring-2 focus:ring-lime-glow"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-lime-glow text-emerald-pine rounded-xl font-bold hover:bg-lime-glow/90 transition-colors"
                                >
                                    Search
                                </button>
                            </div>
                            {scanStatus === 'found' && (
                                <p className="text-xs text-lime-300 mt-2">✅ Order found! Form prefilled.</p>
                            )}
                            {scanStatus === 'notfound' && (
                                <p className="text-xs text-amber-300 mt-2">⚠️ Order not found. Use manual entry below.</p>
                            )}
                        </form>

                        {/* Main Order Form */}
                        <form onSubmit={handleStockOrderSubmit} className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-emerald-100/80 uppercase">Order Number *</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl mt-1 bg-emerald-900/70 text-lime-50 text-sm border border-lime-400/60 font-semibold placeholder-emerald-200/60 focus:outline-none focus:border-lime-200"
                                    value={stockOrderForm.orderNumber}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, orderNumber: e.target.value })}
                                    placeholder="e.g., 1001"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-emerald-100/80 uppercase">Platform *</label>
                                <select
                                    className="w-full px-4 py-3 rounded-xl mt-1 bg-emerald-900/70 text-lime-50 text-sm border border-lime-400/60 font-semibold focus:outline-none focus:border-lime-200"
                                    value={stockOrderForm.platform}
                                    onChange={e => handlePlatformChange(e.target.value)}
                                    required
                                >
                                    <option value="Shopify">Shopify</option>
                                    <option value="Shopdeck">Shopdeck</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-emerald-100/80 uppercase">Select Outfit *</label>
                                <select
                                    className="w-full px-4 py-3 rounded-xl mt-1 bg-emerald-900/70 text-lime-50 text-sm border border-lime-400/60 font-semibold focus:outline-none focus:border-lime-200"
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
                            <div className="bg-emerald-900/70 border border-emerald-700/60 p-3 rounded-xl">
                                <p className="text-xs font-bold text-emerald-100 mb-2 uppercase">Available Stock</p>
                                <div className="flex gap-2 flex-wrap">
                                    {['XS','S', 'M', 'L', 'XL', 'XXL'].map(size => {
                                        const stock = parseInt(selectedOutfit.stockBreakdown?.[size]) || 0
                                        if (stock === 0) return null
                                        return (
                                            <div key={size} className="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-lime-400/80 to-emerald-300/80 text-emerald-900 shadow">
                                                {size}: {stock}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-emerald-100/80 uppercase">Size *</label>
                                <select
                                    className="w-full px-4 py-3 rounded-xl mt-1 bg-emerald-900/70 text-lime-50 text-sm border border-lime-400/60 font-semibold focus:outline-none focus:border-lime-200"
                                    value={stockOrderForm.size}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, size: e.target.value })}
                                    required
                                >
                                    {['XS','S', 'M', 'L', 'XL', 'XXL'].map(size => (
                                        <option key={size} value={size}>
                                            {size} {selectedOutfit && `(${parseInt(selectedOutfit.stockBreakdown?.[size]) || 0} available)`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-emerald-100/80 uppercase">Quantity *</label>
                                <input
                                    type="number"
                                    min="1"
                                    className="w-full px-4 py-3 rounded-xl mt-1 bg-emerald-900/70 text-lime-50 text-sm border border-lime-400/60 font-semibold placeholder-emerald-200/60 focus:outline-none focus:border-lime-200"
                                    value={stockOrderForm.quantity}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, quantity: e.target.value })}
                                    placeholder="1"
                                    required
                                />
                            </div>
                        </div>

                        {/* Production Cost Breakdown */}
                        {selectedOutfit && outfitCostData && (
                            <div className="bg-emerald-900/70 border border-lime-400/40 p-4 rounded-xl space-y-3">
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs font-bold text-emerald-100/80 uppercase">💰 Production Costs</p>
                                    {outfitCostData.batchId && <p className="text-[10px] text-emerald-100/60">From batch</p>}
                                </div>
                                
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                                    <div>
                                        <label className="block text-emerald-100/70 mb-1">Fabric</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full px-2 py-2 rounded-lg bg-emerald-950 text-lime-50 border border-emerald-700/60 text-[11px] font-semibold"
                                            value={stockOrderForm.fabricCost}
                                            onChange={e => setStockOrderForm({ ...stockOrderForm, fabricCost: e.target.value })}
                                        />
                                        <p className="text-[9px] text-emerald-100/50 mt-1">{formatCurrency(stockOrderForm.fabricCost)}</p>
                                    </div>
                                    <div>
                                        <label className="block text-emerald-100/70 mb-1">Stitching</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full px-2 py-2 rounded-lg bg-emerald-950 text-lime-50 border border-emerald-700/60 text-[11px] font-semibold"
                                            value={stockOrderForm.stitchingCost}
                                            onChange={e => setStockOrderForm({ ...stockOrderForm, stitchingCost: e.target.value })}
                                        />
                                        <p className="text-[9px] text-emerald-100/50 mt-1">{formatCurrency(stockOrderForm.stitchingCost)}</p>
                                    </div>
                                    <div>
                                        <label className="block text-emerald-100/70 mb-1">Selling Price</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full px-2 py-2 rounded-lg bg-emerald-950 text-lime-50 border border-emerald-700/60 text-[11px] font-semibold"
                                            value={stockOrderForm.sellingPrice}
                                            onChange={e => setStockOrderForm({ ...stockOrderForm, sellingPrice: e.target.value })}
                                        />
                                        <p className="text-[9px] text-emerald-100/50 mt-1">{formatCurrency(stockOrderForm.sellingPrice)}</p>
                                    </div>
                                </div>

                                {/* Cost Breakdown Summary */}
                                <div className="bg-emerald-950/80 p-2 rounded-lg border border-emerald-700/60 space-y-1">
                                    <div className="flex justify-between text-[10px] text-emerald-100/80">
                                        <span>Total Production Cost/piece:</span>
                                        <span className="font-bold">{formatCurrency(stockOrderForm.productionCost)}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-emerald-100/80">
                                        <span>Selling Price:</span>
                                        <span className="font-bold">{formatCurrency(stockOrderForm.sellingPrice)}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-bold pt-1 border-t border-emerald-700/60">
                                        <span className={parsePrice(stockOrderForm.sellingPrice) - parsePrice(stockOrderForm.productionCost) >= 0 ? 'text-lime-300' : 'text-red-300'}>
                                            Profit/piece:
                                        </span>
                                        <span className={parsePrice(stockOrderForm.sellingPrice) - parsePrice(stockOrderForm.productionCost) >= 0 ? 'text-lime-300' : 'text-red-300'}>
                                            {formatCurrency(parsePrice(stockOrderForm.sellingPrice) - parsePrice(stockOrderForm.productionCost))}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-bold text-emerald-100/80 uppercase">Customer Name</label>
                            <input
                                className="w-full px-4 py-3 rounded-xl mt-1 bg-emerald-900/70 text-lime-50 text-sm border border-lime-400/60 font-semibold placeholder-emerald-200/60 focus:outline-none focus:border-lime-200"
                                value={stockOrderForm.customerName}
                                onChange={e => setStockOrderForm({ ...stockOrderForm, customerName: e.target.value })}
                                placeholder="Customer name"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-emerald-100/80 uppercase">Phone</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl mt-1 bg-emerald-900/70 text-lime-50 text-sm border border-lime-400/60 font-semibold placeholder-emerald-200/60 focus:outline-none focus:border-lime-200"
                                    value={stockOrderForm.phone}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, phone: e.target.value })}
                                    placeholder="Phone number"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-emerald-100/80 uppercase">Address</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl mt-1 bg-emerald-900/70 text-lime-50 text-sm border border-lime-400/60 font-semibold placeholder-emerald-200/60 focus:outline-none focus:border-lime-200"
                                    value={stockOrderForm.address}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, address: e.target.value })}
                                    placeholder="Delivery address"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                type="submit"
                                disabled={isUploading || !stockOrderForm.outfitId}
                                className="w-full bg-gradient-to-r from-lime-400 to-emerald-300 text-emerald-900 font-black py-3 rounded-xl shadow-lg hover:shadow-emerald-700/40 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isUploading ? 'Creating...' : 'Create Order'}
                            </button>
                            <button
                                type="button"
                                onClick={(e) => handleStockOrderSubmit(e, true)}
                                disabled={isUploading || !stockOrderForm.outfitId}
                                className="w-full bg-emerald-900/70 text-lime-50 border border-lime-400/60 font-semibold py-3 rounded-xl hover:border-lime-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isUploading ? 'Saving...' : 'Create & Add Another'}
                            </button>
                        </div>

                        {outfitsWithStock.length === 0 && (
                            <div className="text-center py-4 bg-emerald-900/60 border border-emerald-700/60 rounded-xl">
                                <p className="text-xs text-emerald-100/80">No outfits in stock. Create production batches first!</p>
                            </div>
                        )}
                    </form>
                    </>
                )}
            </div>

            {/* Order List */}
            <div>
                <div className="flex justify-between items-end mb-3">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Clipboard className="w-5 h-5 text-lime-glow" /> Order History
                    </h3>
                    <div className="flex gap-2 flex-wrap items-center">
                        <select className="text-xs bg-white border-2 border-lime-glow rounded-xl px-3 py-2 text-emerald-pine font-semibold shadow-md hover:shadow-lg" value={orderSort} onChange={e => setOrderSort(e.target.value)}>
                            <option value="date_desc">Newest</option>
                            <option value="date_asc">Oldest</option>
                            <option value="value_desc">Value (High)</option>
                            <option value="value_asc">Value (Low)</option>
                            <option value="status">Status (A-Z)</option>
                            <option value="platform">Platform (A-Z)</option>
                        </select>
                        <select className="text-xs bg-white border-2 border-lime-glow rounded-xl px-3 py-2 text-emerald-pine font-semibold shadow-md hover:shadow-lg" value={orderFilterStatus} onChange={e => setOrderFilterStatus(e.target.value)}>
                            <option value="active">Active Only</option>
                            <option value="completed">Completed/Cancelled</option>
                            <option value="cod_overdue">COD Overdue</option>
                        </select>
                        <input type="date" className="text-xs bg-white border-2 border-lime-glow rounded-xl px-3 py-2 text-emerald-pine font-semibold shadow-md" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                        <span className="text-xs text-white/70">to</span>
                        <input type="date" className="text-xs bg-white border-2 border-lime-glow rounded-xl px-3 py-2 text-emerald-pine font-semibold shadow-md" value={toDate} onChange={e => setToDate(e.target.value)} />
                        {(fromDate || toDate) && (
                            <button onClick={() => { setFromDate(''); setToDate('') }} className="text-xs px-3 py-2 rounded-xl bg-white text-emerald-pine font-semibold border-2 border-lime-glow/60">Clear</button>
                        )}
                        <button onClick={handleExportCSV} className="text-xs px-3 py-2 rounded-xl bg-lime-glow text-emerald-pine font-bold border-2 border-lime-glow hover:shadow-lg">Export CSV</button>
                        <button 
                            onClick={handleSyncShiprocket} 
                            disabled={isSyncingShiprocket}
                            className="text-xs px-3 py-2 rounded-xl bg-orange-500 text-white font-bold border-2 border-orange-600 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
                        >
                            <RefreshCw className={`w-3 h-3 ${isSyncingShiprocket ? 'animate-spin' : ''}`} />
                            {isSyncingShiprocket ? 'Syncing...' : 'Sync Shiprocket'}
                        </button>
                    </div>
                </div>

                {/* Sync Status Message */}
                {syncStatus && (
                    <div className={`p-3 rounded-xl border mb-3 flex items-center justify-between ${syncStatus.error ? 'bg-red-900/40 border-red-600/60' : 'bg-orange-900/40 border-orange-600/60'}`}>
                        <span className={`text-sm font-semibold ${syncStatus.error ? 'text-red-300' : 'text-orange-300'}`}>
                            {syncStatus.status}
                        </span>
                        {!syncStatus.error && (
                            <RefreshCw className="w-4 h-4 text-orange-300 animate-spin" />
                        )}
                    </div>
                )}

                <div className="space-y-3">
                    {filteredOrders.length > 0 && (
                        <div className="bg-emerald-pine/20 p-2 md:p-3 rounded-xl border border-lime-glow/60 flex items-center gap-2 md:gap-3 flex-wrap">
                            <input
                                type="checkbox"
                                checked={selectedOrders.size === filteredOrders.length}
                                onChange={() => toggleSelectAll(filteredOrders.map(o => o.id))}
                                className="w-4 h-4 md:w-5 md:h-5 rounded border-2 border-lime-glow cursor-pointer flex-shrink-0"
                            />
                            <span className="text-xs md:text-sm font-bold text-emerald-pine">
                                {selectedOrders.size === filteredOrders.length ? 'Deselect All' : 'Select All'}
                            </span>
                            {selectedOrders.size > 0 && (
                                <div className="ml-auto flex items-center gap-1 md:gap-2">
                                    <span className="text-xs md:text-sm font-bold text-lime-glow">{selectedOrders.size}</span>
                                    <button
                                        onClick={handleBulkDelete}
                                        className="px-2 md:px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1 flex-shrink-0"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                        <span className="hidden md:inline">Delete</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    {filteredOrders.map(order => {
                        const isSelected = selectedOrders.has(order.id)
                        return (
                            <div key={order.id} onClick={() => onViewOrder && onViewOrder(order)} className={`bg-emerald-pine/20 border-2 p-2 md:p-4 rounded-2xl shadow-card relative cursor-pointer transition-all ${isSelected ? 'border-blue-500 bg-blue-50/10' : 'border-lime-glow/40 hover:border-lime-glow/60'} ${order.status === 'Cancelled' ? 'opacity-60 grayscale' : ''}`}>
                            {/* Checkbox */}
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                    e.stopPropagation()
                                    toggleSelectOrder(order.id)
                                }}
                                className="absolute top-2 left-2 md:top-3 md:left-3 w-4 h-4 md:w-5 md:h-5 rounded border-2 border-lime-glow cursor-pointer flex-shrink-0 z-10"
                            />
                            {order.status !== 'Cancelled' && order.status !== 'Order Shipped (Completed)' && (
                                <button onClick={(e) => { e.stopPropagation(); onCancelOrder && onCancelOrder(order) }} className="absolute top-2 right-2 md:top-3 md:right-3 text-white/40 hover:text-red-500 z-20">
                                    <X className="w-4 h-4 md:w-5 md:h-5" />
                                </button>
                            )}
                            {(order.status === 'Cancelled' || order.status === 'Order Shipped (Completed)') && (
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('Delete button clicked for order:', order.id);
                                    onDeleteOrder && onDeleteOrder(order.id);
                                }} className="absolute bottom-2 right-2 md:bottom-3 md:right-3 text-white/40 hover:text-red-500 z-10 p-1">
                                    <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                                </button>
                            )}
                            {/* Main content - 2 rows on mobile */}
                            <div className="flex gap-2 md:gap-3 mt-1">
                                <img src={order.imageUrl} className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gray-800 object-cover flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    {/* Order number and badges - mobile optimized */}
                                    <div className="flex items-center gap-1 md:gap-2 flex-wrap mb-0.5 md:mb-1">
                                        <span className="font-mono text-lime-glow font-bold text-xs md:text-sm">#{order.orderNumber}</span>
                                        {(() => {
                                            // Normalize platform: Shopodeck -> Shopdeck, everything else (including empty) -> Shopify
                                            const normalizedPlatform = (order.platform === 'Shopodeck' || order.platform === 'Shopdeck') ? 'Shopdeck' : 'Shopify'
                                            return (
                                                <span className={`text-[8px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded border whitespace-nowrap ${
                                                    normalizedPlatform === 'Shopify' 
                                                        ? 'bg-green-600/80 text-white border-green-500' 
                                                        : 'bg-blue-600/80 text-white border-blue-500'
                                                }`}>
                                                    {normalizedPlatform === 'Shopify' ? '🛍️ SHOPIFY' : '🏪 SHOPDECK'}
                                                </span>
                                            )
                                        })()}
                                        {order.source && (order.source.includes('Shopify') || order.source.includes('Shiprocket')) && (
                                            <span className="text-[8px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded bg-purple-600/80 text-white border border-purple-500 whitespace-nowrap">
                                                {order.source.includes('Shopify') ? '🛍️ SHOPIFY' : '📦 SHIPROCKET'}
                                            </span>
                                        )}
                                    </div>
                                    {/* Status badge */}
                                    <div className="mb-0.5 md:mb-1">
                                        <span className={`text-[8px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded border inline-block ${order.status === 'Sent to Tailor' ? 'bg-amber-600/80 text-white border-amber-500' : order.status === 'Ready to Ship' ? 'bg-emerald-700/80 text-white border-emerald-600' : order.status.includes('Shipped') ? 'bg-lime-glow/20 text-lime-glow border-lime-glow/50' : 'bg-gray-700 text-white border-gray-600'}`}>
                                            {order.status}
                                        </span>
                                    </div>
                                    {/* Outfit name and size - condensed */}
                                    <h4 className="font-bold text-white text-xs md:text-sm leading-tight">
                                        {order.outfitName || 'Unspecified'}
                                    </h4>
                                    <div className="flex items-center gap-1 text-[10px] md:text-xs text-lime-glow">
                                        <span className="bg-emerald-pine/60 border border-lime-glow/40 px-1 rounded">
                                            {order.quantity ? `${order.quantity}x ` : ''}Size {order.size}
                                        </span>
                                        {order.orderType === 'stock' ? (
                                            <span>₹{(order.productionCostPerPiece || 0).toFixed(0)}/pc</span>
                                        ) : (
                                            <span>₹{order.stitchingCost || 0}</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Action button - mobile optimized */}
                            {order.status !== 'Cancelled' && (
                                <div className="mt-1.5 md:mt-2">
                                    {order.status === 'Sent to Tailor' ? (
                                        <button onClick={(e) => { e.stopPropagation(); handleQuickReceive(order.id) }} className="w-full text-[10px] md:text-xs font-bold text-lime-glow bg-emerald-pine/40 border border-lime-glow/30 rounded px-2 py-1 hover:bg-emerald-pine/60 transition">
                                            Mark Received
                                        </button>
                                    ) : order.status === 'Received from Tailor' || order.status === 'Ready to Ship' ? (
                                        <button onClick={(e) => { e.stopPropagation(); onOpenShipping && onOpenShipping(order.id) }} className="w-full text-[10px] md:text-xs font-bold text-lime-glow bg-emerald-pine/40 border border-lime-glow/30 rounded px-2 py-1 hover:bg-emerald-pine/60 transition flex items-center justify-center gap-1">
                                            <Truck className="w-3 h-3" /> Ship It
                                        </button>
                                    ) : (
                                        <span className="text-[10px] md:text-xs text-lime-glow font-bold block text-center">Done</span>
                                    )}
                                </div>
                            )}

                            {/* Customer info - on mobile, hide if space is tight */}
                            {(order.customerName || order.phone) && (
                                <div className="text-[8px] md:text-[10px] text-white/70 mt-1 pt-1 border-t border-lime-glow/30">
                                    <div className="truncate">{order.customerName}</div>
                                    {order.phone && <div className="truncate text-white/60">{order.phone}</div>}
                                </div>
                            )}
                        </div>
                        )
                    })}
                </div>

            {/* Bulk Delete Confirmation Modal */}
            {deleteConfirm === 'bulk' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Delete {selectedOrders.size} Orders?</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            This will permanently delete <strong>{selectedOrders.size} orders</strong>. This action cannot be undone.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmBulkDelete}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition"
                            >
                                Delete All
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    )
}
