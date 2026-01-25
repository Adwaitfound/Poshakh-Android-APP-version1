import React, { useState, useMemo } from 'react'
import { Scissors, Clipboard, X, Trash2, Truck, Package, AlertCircle, ChevronDown, ChevronUp, Download, DollarSign, TrendingUp, Clock, Camera } from 'lucide-react'
import { getDb } from '../firebase'
import { collection, addDoc, serverTimestamp, updateDoc, doc, increment, getDocs, query, where } from 'firebase/firestore'
import { FABRICS_COLLECTION, ORDERS_COLLECTION, parsePrice, formatCurrency } from '../lib/utils'
import { useNotification } from '../context/NotificationProvider'
import { logOrderCreated, logOrderStatusChanged, logStockAdjusted } from '../lib/notificationLogger'
import BarcodeScanner from './BarcodeScanner'
import BarcodeDataReviewModal from './BarcodeDataReviewModal'
import BatchScanQueue from './BatchScanQueue'
import { parseBarcodeData } from '../lib/barcodeParser'


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
    const [stockOrderForm, setStockOrderForm] = useState({ orderNumber: '', invoiceNumber: '', outfitId: '', size: 'M', quantity: '1', customerName: '', phone: '', address: '', sellingPrice: '', stitchingCost: '', fabricCost: '', productionCost: '', platform: 'Shopify' })
    const [orderFilterStatus, setOrderFilterStatus] = useState('active')
    const [orderSort, setOrderSort] = useState('date_desc')
    const [orderSearch, setOrderSearch] = useState('')
    const [orderDateRange, setOrderDateRange] = useState('30d') // 7d | 30d | all
    const [quickStatusFilter, setQuickStatusFilter] = useState('') // '' | 'pending' | 'ready' | 'shipped' | 'cod'
    const [platformFilter, setPlatformFilter] = useState('') // '' | 'shopify' | 'shopdeck'
    const [isUploading, setIsUploading] = useState(false)
    const [expandedSections, setExpandedSections] = useState({ batches: true, stock: false })
    const [selectedOrders, setSelectedOrders] = useState(new Set())
    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
    const [showBarcodeReview, setShowBarcodeReview] = useState(false)
    const [barcodeReviewData, setBarcodeReviewData] = useState(null)
    const [batchMode, setBatchMode] = useState(false)
    const [scanQueue, setScanQueue] = useState([])
    const [currentQueueIndex, setCurrentQueueIndex] = useState(0)
    const [isProcessingQueue, setIsProcessingQueue] = useState(false)
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

    // Auto-generate Shopdeck order number when platform is Shopdeck
    React.useEffect(() => {
        if (stockOrderForm.platform === 'Shopdeck' && !stockOrderForm.orderNumber) {
            setStockOrderForm(prev => ({
                ...prev,
                orderNumber: 'Shpdck18'
            }))
        }
    }, [stockOrderForm.platform])

    // Calculate order metrics
    const orderMetrics = useMemo(() => {
        const activeOrders = allOrders.filter(o => o.status !== 'Imported' && o.status !== 'Cancelled' && o.status !== 'Order Shipped (Completed)' && o.status !== 'In Transit' && o.status !== 'Delivered')
        const completedOrders = allOrders.filter(o => o.status === 'Order Shipped (Completed)' || o.status === 'In Transit' || o.status === 'Delivered')
        
        const shopifyOrders = allOrders.filter(o => {
            const platform = o.platform || 'Shopify'
            const normalized = (platform === 'Shopodeck' || platform === 'Shopdeck') ? 'Shopdeck' : 'Shopify'
            return normalized === 'Shopify' && o.status !== 'Imported'
        }).length
        
        const shopdeckOrders = allOrders.filter(o => {
            const platform = o.platform || 'Shopify'
            const normalized = (platform === 'Shopodeck' || platform === 'Shopdeck') ? 'Shopdeck' : 'Shopify'
            return normalized === 'Shopdeck' && o.status !== 'Imported'
        }).length
        
        const pendingShipments = allOrders.filter(o => o.status === 'Ready to Ship' || o.status === 'Received from Tailor').length
        const codPending = allOrders.filter(o => {
            const paymentMethod = o.paymentMethod || o.paymentMode || 'Prepaid'
            const isShipped = o.status === 'Order Shipped (Completed)' || o.status === 'In Transit' || o.status === 'Delivered'
            if (paymentMethod !== 'COD' || !isShipped) return false
            const remittanceDate = getCodRemittanceDate(o)
            return remittanceDate > new Date()
        }).length
        
        return {
            totalActive: activeOrders.length,
            totalCompleted: completedOrders.length,
            shopifyOrders,
            shopdeckOrders,
            pendingShipments,
            codPending
        }
    }, [allOrders])

    const filteredOrders = useMemo(() => {
        let list = [...allOrders]
        list = list.filter(o => o.status !== 'Imported')

        // Quick status filter
        if (quickStatusFilter === 'pending') {
            list = list.filter(o => o.status === 'Sent to Tailor')
        } else if (quickStatusFilter === 'ready') {
            list = list.filter(o => o.status === 'Ready to Ship' || o.status === 'Received from Tailor')
        } else if (quickStatusFilter === 'shipped') {
            list = list.filter(o => o.status === 'Order Shipped (Completed)' || o.status === 'In Transit' || o.status === 'Delivered')
        } else if (quickStatusFilter === 'cod') {
            list = list.filter(o => {
                const paymentMethod = o.paymentMethod || o.paymentMode || 'Prepaid'
                const isShipped = o.status === 'Order Shipped (Completed)' || o.status === 'In Transit' || o.status === 'Delivered'
                if (paymentMethod !== 'COD' || !isShipped) return false
                return true
            })
        }

        // Date range filter
        if (orderDateRange !== 'all') {
            const now = Date.now()
            const windowMs = orderDateRange === '7d' ? 7*24*60*60*1000 : 30*24*60*60*1000
            list = list.filter(o => {
                const ts = o.createdAt?.toMillis ? o.createdAt.toMillis() : (o.createdAt ? new Date(o.createdAt).getTime() : 0)
                return ts >= now - windowMs
            })
        }

        // Status filter
        if (orderFilterStatus === 'active') {
            list = list.filter(o => o.status !== 'Cancelled' && o.status !== 'Order Shipped (Completed)' && o.status !== 'In Transit' && o.status !== 'Delivered')
        } else if (orderFilterStatus === 'completed') {
            list = list.filter(o => o.status === 'Order Shipped (Completed)' || o.status === 'In Transit' || o.status === 'Delivered' || o.status === 'Cancelled')
        }

        // Platform filter
        if (platformFilter) {
            list = list.filter(o => {
                const platform = o.platform || 'Shopify'
                const normalized = (platform === 'Shopodeck' || platform === 'Shopdeck') ? 'shopdeck' : 'shopify'
                return normalized === platformFilter
            })
        }

        // Text search
        if (orderSearch.trim()) {
            const q = orderSearch.trim().toLowerCase()
            list = list.filter(o =>
                String(o.orderNumber || '').toLowerCase().includes(q) ||
                String(o.customerName || '').toLowerCase().includes(q) ||
                String(o.phone || '').toLowerCase().includes(q) ||
                String(o.outfitName || '').toLowerCase().includes(q)
            )
        }

        // Sort
        list.sort((a, b) => {
            const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
            const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
            if (orderSort === 'date_desc') return dateB - dateA
            if (orderSort === 'date_asc') return dateA - dateB
            return 0
        })
        return list
    }, [allOrders, orderFilterStatus, orderSort, orderSearch, orderDateRange, quickStatusFilter, platformFilter])

    // Export orders to CSV
    const exportOrders = () => {
        if (filteredOrders.length === 0) {
            notify.error('No orders to export')
            return
        }
        
        const headers = ['Order No', 'Date', 'Customer', 'Phone', 'Outfit', 'Size', 'Qty', 'Status', 'Platform', 'Selling Price', 'Production Cost', 'Profit', 'Payment Method']
        const rows = filteredOrders.map(o => [
            o.orderNumber || '',
            parseDate(o.createdAt)?.toLocaleDateString('en-IN') || '',
            o.customerName || '',
            o.phone || '',
            o.outfitName || '',
            o.size || '',
            o.quantity || 1,
            o.status || '',
            o.platform || '',
            parseFloat(o.finalSellingPrice || o.sellingPrice || 0),
            parseFloat(o.productionCostPerPiece || 0) * (o.quantity || 1),
            (parseFloat(o.finalSellingPrice || o.sellingPrice || 0) - parseFloat(o.productionCostPerPiece || 0) * (o.quantity || 1)),
            o.paymentMethod || o.paymentMode || 'Prepaid'
        ])
        
        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `orders_${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        notify.success(`Exported ${filteredOrders.length} orders`)
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

    // ===== BARCODE SCANNING HANDLERS =====
    const handleBarcodeScanned = (rawBarcodeData) => {
        try {
            // Parse the barcode data
            const parsed = parseBarcodeData(rawBarcodeData)
            console.log('Parsed barcode data:', parsed)
            
            if (batchMode) {
                // Add to queue instead of showing review immediately
                setScanQueue(prev => [...prev, parsed])
                notify.success(`✓ Scanned: ${parsed.orderNumber || 'Order ' + (scanQueue.length + 1)}`)
            } else {
                // Original behavior - show review modal
                setBarcodeReviewData(parsed)
                setShowBarcodeReview(true)
                setShowBarcodeScanner(false)
            }
        } catch (error) {
            console.error('Barcode parsing error:', error)
            notify.error('Failed to parse barcode: ' + error.message)
        }
    }

    const handleQueuedOrderReview = (index) => {
        setCurrentQueueIndex(index)
        setBarcodeReviewData(scanQueue[index])
        setShowBarcodeReview(true)
        setShowBarcodeScanner(false)
    }

    const handleDeleteQueuedOrder = (index) => {
        setScanQueue(prev => prev.filter((_, i) => i !== index))
        if (currentQueueIndex >= scanQueue.length - 1) {
            setCurrentQueueIndex(Math.max(0, scanQueue.length - 2))
        }
    }

    const handleExitBatchMode = () => {
        setScanQueue([])
        setCurrentQueueIndex(0)
        setBatchMode(false)
        setShowBarcodeScanner(false)
        notify.info('Exited batch scan mode')
    }

    const handleQueuedOrderConfirm = (reviewedData) => {
        try {
            // Auto-fill the order form with confirmed data
            const { orderNumber, invoiceNumber, customerName, phone, address, totalPrice, items, matchedOutfit } = reviewedData
            
            // Extract selling price from total price
            const sellingPrice = totalPrice ? totalPrice.replace(/[^\d.]/g, '') : ''
            
            // Get size from first item
            const size = (items && items[0] && items[0].size) ? items[0].size : 'M'
            const quantity = (items && items[0] && items[0].quantity) ? items[0].quantity : 1
            
            // Auto-fill form
            setStockOrderForm(prev => ({
                ...prev,
                orderNumber: orderNumber || prev.orderNumber,
                invoiceNumber: invoiceNumber || prev.invoiceNumber,
                customerName: customerName || prev.customerName,
                phone: phone || prev.phone,
                address: address || prev.address,
                size: size || prev.size,
                quantity: quantity.toString() || prev.quantity,
                sellingPrice: sellingPrice || prev.sellingPrice,
                outfitId: matchedOutfit?.id || prev.outfitId // Auto-fill outfit if matched
            }))
            
            // Mark this order as reviewed and auto-submit
            setIsProcessingQueue(true)
            setTimeout(() => {
                // Trigger the form submit
                const form = document.querySelector('[data-stock-order-form]')
                if (form) {
                    form.dispatchEvent(new Event('submit', { bubbles: true }))
                }
            }, 300)
        } catch (error) {
            console.error('Error confirming queued barcode data:', error)
            notify.error('Failed to process order: ' + error.message)
            setIsProcessingQueue(false)
        }
    }

    const handleBarcodeDataConfirm = (reviewedData) => {
        try {
            // Auto-fill the order form with confirmed data
            const { orderNumber, invoiceNumber, customerName, phone, address, totalPrice, items, matchedOutfit } = reviewedData
            
            // Extract selling price from total price
            const sellingPrice = totalPrice ? totalPrice.replace(/[^\d.]/g, '') : ''
            
            // Get size from first item
            const size = (items && items[0] && items[0].size) ? items[0].size : 'M'
            const quantity = (items && items[0] && items[0].quantity) ? items[0].quantity : 1
            
            // Auto-fill form
            setStockOrderForm(prev => ({
                ...prev,
                orderNumber: orderNumber || prev.orderNumber,
                invoiceNumber: invoiceNumber || prev.invoiceNumber,
                customerName: customerName || prev.customerName,
                phone: phone || prev.phone,
                address: address || prev.address,
                size: size || prev.size,
                quantity: quantity.toString() || prev.quantity,
                sellingPrice: sellingPrice || prev.sellingPrice,
                outfitId: matchedOutfit?.id || prev.outfitId // Auto-fill outfit if matched
            }))
            
            if (batchMode) {
                // In batch mode, auto-submit after form is filled
                handleQueuedOrderConfirm(reviewedData)
            } else {
                // Normal mode - scroll to form and close modals
                setShowBarcodeReview(false)
                setBarcodeReviewData(null)
                
                notify.success('✓ Order form auto-filled from barcode')
                
                // Scroll to stock order section
                setTimeout(() => {
                    const element = document.querySelector('[data-stock-order-form]')
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                }, 300)
            }
        } catch (error) {
            console.error('Error confirming barcode data:', error)
            notify.error('Failed to auto-fill form: ' + error.message)
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
            
            // Create or update customer record
            if (customerName && phone) {
                try {
                    const customersRef = collection(db, 'customers')
                    const q = query(customersRef, where('phone', '==', phone))
                    const existingCustomers = await getDocs(q)
                    
                    const customerData = {
                        name: customerName,
                        phone,
                        address: address || '',
                        lastOrderDate: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    }
                    
                    if (existingCustomers.size > 0) {
                        // Update existing customer
                        const customerId = existingCustomers.docs[0].id
                        await updateDoc(doc(db, 'customers', customerId), customerData)
                        console.log('✅ Customer updated:', customerName)
                    } else {
                        // Create new customer
                        await addDoc(customersRef, {
                            ...customerData,
                            createdAt: serverTimestamp()
                        })
                        console.log('✅ New customer created:', customerName)
                    }
                } catch (error) {
                    console.error('Error creating/updating customer:', error)
                    // Don't block order creation if customer creation fails
                }
            }
            
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

            // Handle batch mode - move to next order or exit
            if (batchMode && isProcessingQueue) {
                const nextIndex = currentQueueIndex + 1
                if (nextIndex < scanQueue.length) {
                    // More orders in queue - show next one
                    setCurrentQueueIndex(nextIndex)
                    setBarcodeReviewData(scanQueue[nextIndex])
                    setShowBarcodeReview(true)
                } else {
                    // All orders completed
                    setIsProcessingQueue(false)
                    setScanQueue([])
                    setCurrentQueueIndex(0)
                    setBatchMode(false)
                    setShowBarcodeReview(false)
                    notify.success('🎉 All scanned orders completed!')
                }
            }

            if (onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Stock order error:', error)
            notify.error('Error creating order: ' + error.message)
            setIsProcessingQueue(false)
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
        <div className="space-y-6 fade-in">
            {/* Order Metrics Dashboard */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 p-4 rounded-2xl border border-lime-glow/40 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                        <Package className="w-5 h-5 text-lime-glow" />
                        <span className="text-xs font-bold text-lime-glow/70">ACTIVE</span>
                    </div>
                    <p className="text-3xl font-black text-white">{orderMetrics.totalActive}</p>
                    <p className="text-xs text-lime-glow/80 mt-1">Orders in progress</p>
                </div>
                
                <div className="bg-gradient-to-br from-green-600 to-green-800 p-4 rounded-2xl border border-green-400/40 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                        <Package className="w-5 h-5 text-green-100" />
                        <span className="text-xs font-bold text-green-100/70">SHOPIFY</span>
                    </div>
                    <p className="text-3xl font-black text-white">{orderMetrics.shopifyOrders}</p>
                    <p className="text-xs text-green-100/80 mt-1">🛍️ Shopify orders</p>
                </div>
                
                <div className="bg-gradient-to-br from-purple-600 to-purple-800 p-4 rounded-2xl border border-purple-400/40 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                        <Package className="w-5 h-5 text-purple-100" />
                        <span className="text-xs font-bold text-purple-100/70">SHOPDECK</span>
                    </div>
                    <p className="text-3xl font-black text-white">{orderMetrics.shopdeckOrders}</p>
                    <p className="text-xs text-purple-100/80 mt-1">🏪 Shopdeck orders</p>
                </div>
                
                <div className="bg-gradient-to-br from-amber-700 to-amber-900 p-4 rounded-2xl border border-amber-400/40 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                        <Clock className="w-5 h-5 text-amber-200" />
                        <span className="text-xs font-bold text-amber-200/70">PENDING</span>
                    </div>
                    <p className="text-3xl font-black text-white">{orderMetrics.pendingShipments}</p>
                    <p className="text-xs text-amber-200/80 mt-1">{orderMetrics.codPending} COD due</p>
                </div>
            </div>

            {/* Production Batches Section */}
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
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                setBatchMode(!batchMode)
                                if (!batchMode) {
                                    setShowBarcodeScanner(true)
                                }
                            }}
                            className={`p-2 rounded-lg transition text-sm font-semibold flex items-center gap-1 ${
                                batchMode
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                    : 'hover:bg-emerald-800/50 text-lime-glow hover:text-lime-300'
                            }`}
                            title={batchMode ? 'Exit batch mode' : 'Enable batch scanning'}
                        >
                            <Camera className="w-4 h-4" />
                            <span className="hidden sm:inline text-xs">
                                {batchMode ? `Batch (${scanQueue.length})` : 'Batch Scan'}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                setShowBarcodeScanner(true)
                            }}
                            className="p-2 hover:bg-emerald-800/50 rounded-lg transition text-lime-glow hover:text-lime-300 flex items-center gap-1 text-sm font-semibold"
                            title="Scan QR code from packing slip"
                        >
                            <Camera className="w-4 h-4" />
                            <span className="hidden sm:inline">Scan</span>
                        </button>
                        {expandedSections.stock ? <ChevronUp className="w-5 h-5 text-emerald-200" /> : <ChevronDown className="w-5 h-5 text-emerald-200" />}
                    </div>
                </div>

                {expandedSections.stock && (
                    <>

                        {/* Main Order Form */}
                        <form onSubmit={handleStockOrderSubmit} className="space-y-3" data-stock-order-form>
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
                                <label className="text-xs font-bold text-emerald-100/80 uppercase">Invoice Number</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl mt-1 bg-emerald-900/70 text-lime-50 text-sm border border-lime-400/60 font-semibold placeholder-emerald-200/60 focus:outline-none focus:border-lime-200"
                                    value={stockOrderForm.invoiceNumber || ''}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, invoiceNumber: e.target.value })}
                                    placeholder="e.g., 9096725484"
                                />
                            </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-emerald-100/80 uppercase">Platform *</label>
                                <select
                                    className="w-full px-4 py-3 rounded-xl mt-1 bg-emerald-900/70 text-lime-50 text-sm border border-lime-400/60 font-semibold focus:outline-none focus:border-lime-200"
                                    value={stockOrderForm.platform}
                                    onChange={e => setStockOrderForm({ ...stockOrderForm, platform: e.target.value })}
                                    required
                                >
                                    <option value="Shopify">Shopify</option>
                                    <option value="Shopdeck">Shopdeck</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-emerald-100/80 uppercase flex items-center justify-between">
                                    <span>Select Outfit *</span>
                                    {selectedOutfit && <span className="text-[10px] text-lime-300 font-normal">{selectedOutfit.totalStock} pcs available</span>}
                                </label>
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
                                {outfitsWithStock.length === 0 && (
                                    <p className="text-[10px] text-amber-300 mt-1">⚠️ No outfits in stock. Create production batches first.</p>
                                )}
                            </div>
                            {selectedOutfit && (
                            <div className="bg-emerald-900/70 border border-emerald-700/60 p-3 rounded-xl">
                                <p className="text-xs font-bold text-emerald-100 mb-2 uppercase">Available Stock</p>
                                <div className="flex gap-2 flex-wrap">
                                    {['XS','S', 'M', 'L', 'XL', 'XXL'].map(size => {
                                        const stock = parseInt(selectedOutfit?.stockBreakdown?.[size]) || 0
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
                                <label className="text-xs font-bold text-emerald-100/80 uppercase flex items-center justify-between">
                                    <span>Size *</span>
                                    {selectedOutfit && stockOrderForm.size && (
                                        <span className={`text-[10px] font-normal ${(parseInt(selectedOutfit.stockBreakdown?.[stockOrderForm.size]) || 0) < parseInt(stockOrderForm.quantity || 1) ? 'text-red-400' : 'text-lime-300'}`}>
                                            {parseInt(selectedOutfit.stockBreakdown?.[stockOrderForm.size]) || 0} available
                                        </span>
                                    )}
                                </label>
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
                                <label className="text-xs font-bold text-emerald-100/80 uppercase flex items-center justify-between">
                                    <span>Quantity *</span>
                                    {selectedOutfit && stockOrderForm.size && parseInt(stockOrderForm.quantity || 0) > 0 && (
                                        <span className={`text-[10px] font-normal ${parseInt(stockOrderForm.quantity) > (parseInt(selectedOutfit.stockBreakdown?.[stockOrderForm.size]) || 0) ? 'text-red-400' : 'text-lime-300'}`}>
                                            {parseInt(stockOrderForm.quantity) <= (parseInt(selectedOutfit.stockBreakdown?.[stockOrderForm.size]) || 0) ? '✓ In stock' : '⚠️ Insufficient stock'}
                                        </span>
                                    )}
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max={selectedOutfit ? (parseInt(selectedOutfit.stockBreakdown?.[stockOrderForm.size]) || 999) : 999}
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
                <div className="mb-3 space-y-2">
                    <div className="flex justify-between items-end">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Clipboard className="w-5 h-5 text-lime-glow" /> Order History
                        </h3>
                        <div className="hidden sm:flex gap-2">
                            <button
                                onClick={exportOrders}
                                className="text-xs bg-white border-2 border-lime-glow rounded-xl px-3 py-2 text-emerald-pine font-semibold shadow-md hover:shadow-lg flex items-center gap-1"
                                title="Export to CSV"
                            >
                                <Download className="w-3 h-3" />
                                Export
                            </button>
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
                    
                    {/* Quick Status Filter Chips */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <button
                            onClick={() => setQuickStatusFilter('')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${quickStatusFilter === '' ? 'bg-lime-glow text-emerald-pine shadow-md' : 'bg-emerald-pine/40 text-lime-glow border border-lime-glow/30'}`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setQuickStatusFilter('pending')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${quickStatusFilter === 'pending' ? 'bg-amber-500 text-white shadow-md' : 'bg-emerald-pine/40 text-amber-300 border border-amber-400/30'}`}
                        >
                            🔨 Pending
                        </button>
                        <button
                            onClick={() => setQuickStatusFilter('ready')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${quickStatusFilter === 'ready' ? 'bg-emerald-600 text-white shadow-md' : 'bg-emerald-pine/40 text-emerald-300 border border-emerald-400/30'}`}
                        >
                            📦 Ready to Ship
                        </button>
                        <button
                            onClick={() => setQuickStatusFilter('shipped')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${quickStatusFilter === 'shipped' ? 'bg-lime-glow text-emerald-pine shadow-md' : 'bg-emerald-pine/40 text-lime-glow border border-lime-glow/30'}`}
                        >
                            ✅ Shipped
                        </button>
                        <button
                            onClick={() => setQuickStatusFilter('cod')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${quickStatusFilter === 'cod' ? 'bg-orange-500 text-white shadow-md' : 'bg-emerald-pine/40 text-orange-300 border border-orange-400/30'}`}
                        >
                            💰 COD Pending
                        </button>
                    </div>
                    
                    {/* Platform Filter Chips */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <button
                            onClick={() => setPlatformFilter('')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${platformFilter === '' ? 'bg-white text-emerald-pine shadow-md' : 'bg-emerald-pine/40 text-white border border-white/30'}`}
                        >
                            All Platforms
                        </button>
                        <button
                            onClick={() => setPlatformFilter('shopify')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${platformFilter === 'shopify' ? 'bg-green-500 text-white shadow-md' : 'bg-emerald-pine/40 text-green-300 border border-green-400/30'}`}
                        >
                            🛍️ Shopify
                        </button>
                        <button
                            onClick={() => setPlatformFilter('shopdeck')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${platformFilter === 'shopdeck' ? 'bg-purple-500 text-white shadow-md' : 'bg-emerald-pine/40 text-purple-300 border border-purple-400/30'}`}
                        >
                            🏪 Shopdeck
                        </button>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            className="flex-1 px-3 py-2 rounded-xl bg-white text-emerald-pine text-sm border-2 border-lime-glow placeholder-emerald-700/50"
                            placeholder="Search by order no, customer, phone, outfit"
                            value={orderSearch}
                            onChange={(e) => setOrderSearch(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <select className="text-xs bg-white border-2 border-lime-glow rounded-xl px-3 py-2 text-emerald-pine font-semibold shadow-md hover:shadow-lg sm:hidden" value={orderFilterStatus} onChange={e => setOrderFilterStatus(e.target.value)}>
                                <option value="active">Active Only</option>
                                <option value="completed">Completed/Cancelled</option>
                            </select>
                            <select className="text-xs bg-white border-2 border-lime-glow rounded-xl px-3 py-2 text-emerald-pine font-semibold shadow-md hover:shadow-lg" value={orderDateRange} onChange={e => setOrderDateRange(e.target.value)}>
                                <option value="7d">Last 7 days</option>
                                <option value="30d">Last 30 days</option>
                                <option value="all">All time</option>
                            </select>
                            <select className="text-xs bg-white border-2 border-lime-glow rounded-xl px-3 py-2 text-emerald-pine font-semibold shadow-md hover:shadow-lg sm:hidden" value={orderSort} onChange={e => setOrderSort(e.target.value)}>
                                <option value="date_desc">Newest</option>
                                <option value="date_asc">Oldest</option>
                            </select>
                            <button
                                onClick={exportOrders}
                                className="sm:hidden text-xs bg-white border-2 border-lime-glow rounded-xl px-3 py-2 text-emerald-pine font-semibold shadow-md hover:shadow-lg flex items-center gap-1"
                                title="Export to CSV"
                            >
                                <Download className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                    <div className="text-[11px] text-emerald-200/80">{filteredOrders.length} orders</div>
                </div>
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
                        const profit = (parseFloat(order.finalSellingPrice || order.sellingPrice || 0) - parseFloat(order.productionCostPerPiece || 0) * (order.quantity || 1))
                        const profitPerPiece = (parseFloat(order.finalSellingPrice || order.sellingPrice || 0) - parseFloat(order.productionCostPerPiece || 0))
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
                            {order.status !== 'Cancelled' && order.status !== 'Order Shipped (Completed)' && order.status !== 'In Transit' && order.status !== 'Delivered' && (
                                <button onClick={(e) => { e.stopPropagation(); onCancelOrder && onCancelOrder(order) }} className="absolute top-2 right-2 md:top-3 md:right-3 text-white/40 hover:text-red-500 z-20">
                                    <X className="w-4 h-4 md:w-5 md:h-5" />
                                </button>
                            )}
                            {(order.status === 'Cancelled' || order.status === 'Order Shipped (Completed)' || order.status === 'In Transit' || order.status === 'Delivered') && (
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('Delete button clicked for order:', order.id);
                                    onDeleteOrder && onDeleteOrder(order.id);
                                }} className="absolute bottom-2 right-2 md:bottom-3 md:right-3 text-white/40 hover:text-red-500 z-10 p-1">
                                    <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                                </button>
                            )}
                            {/* Profit badge */}
                            {order.status === 'Order Shipped (Completed)' && profitPerPiece !== 0 && (
                                <div className={`absolute top-2 right-2 md:top-3 md:right-3 px-2 py-1 rounded-lg text-[9px] md:text-[10px] font-bold ${profitPerPiece > 0 ? 'bg-green-600/90 text-white' : 'bg-red-600/90 text-white'}`}>
                                    {profitPerPiece > 0 ? '+' : ''}{formatCurrency(profit, 0)}
                                </div>
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
                                    {/* Status + date + COD badge */}
                                    <div className="mb-0.5 md:mb-1 flex items-center gap-1 md:gap-2 flex-wrap">
                                        <span className={`text-[8px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded border inline-block ${order.status === 'Sent to Tailor' ? 'bg-amber-600/80 text-white border-amber-500' : order.status === 'Ready to Ship' ? 'bg-emerald-700/80 text-white border-emerald-600' : order.status === 'In Transit' ? 'bg-blue-600/80 text-white border-blue-500' : order.status === 'Delivered' ? 'bg-green-600/80 text-white border-green-500' : order.status.includes('Shipped') ? 'bg-lime-glow/20 text-lime-glow border-lime-glow/50' : order.status === 'Cancelled' ? 'bg-red-700/70 text-white border-red-600' : 'bg-gray-700 text-white border-gray-600'}`}>
                                            {order.status}
                                        </span>
                                        {(() => {
                                            const created = parseDate(order.createdAt)
                                            return created ? (
                                                <span className="text-[8px] md:text-[10px] px-1.5 py-0.5 rounded border border-emerald-700/60 bg-emerald-900/50 text-emerald-100 whitespace-nowrap">
                                                    {created.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                </span>
                                            ) : null
                                        })()}
                                        {(() => {
                                            const cod = getCodCountdown(order)
                                            return cod ? (
                                                <span className={`text-[8px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded border ${cod.color}`}>
                                                    {cod.text}
                                                </span>
                                            ) : null
                                        })()}
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


            {/* Barcode Scanner Modal */}
            <BarcodeScanner
                visible={showBarcodeScanner}
                onScanned={handleBarcodeScanned}
                onClose={() => setShowBarcodeScanner(false)}
                batchMode={batchMode}
                scannedCount={scanQueue.length}
            />

            {/* Barcode Data Review Modal */}
            <BarcodeDataReviewModal
                visible={showBarcodeReview}
                data={barcodeReviewData}
                inventoryItems={inventoryItems}
                onConfirm={handleBarcodeDataConfirm}
                onCancel={() => {
                    setShowBarcodeReview(false)
                    setBarcodeReviewData(null)
                }}
            />

            {/* Batch Scan Queue */}
            {batchMode && scanQueue.length > 0 && (
                <BatchScanQueue
                    queue={scanQueue}
                    currentIndex={currentQueueIndex}
                    onReviewItem={handleQueuedOrderReview}
                    onDeleteItem={handleDeleteQueuedOrder}
                    onExitBatchMode={handleExitBatchMode}
                    isProcessing={isProcessingQueue}
                />
            )}

            </div>
        </div>
    )
}
