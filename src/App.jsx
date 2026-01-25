import React, { useState } from 'react'
import { StatusBar, Style } from '@capacitor/status-bar'
import Inventory from './components/Inventory'
import Orders from './components/Orders'
import AddItem from './components/AddItem'
import SheetImport from './components/SheetImport'
import Dashboard from './components/Dashboard'
import Outfits from './components/Outfits'
import Customers from './components/Customers'
import Vendors from './components/Vendors'
import IntegrationsSettings from './components/IntegrationsSettings'
import FinancialInsights from './components/FinancialInsights'
import ProductionModal from './components/ProductionModal'
import ReceiveProductionModal from './components/ReceiveProductionModal'
import { AuthProvider, useAuth } from './context/AuthProvider'
import ErrorBoundary from './components/ErrorBoundary'
import TabBoundary from './components/TabBoundary'
import { NotificationProvider } from './context/NotificationProvider'
import NotificationStack from './components/NotificationStack'
import NotificationsCenter from './components/NotificationsCenter'
import { initFirebase, subscribeCollection, anonymousSignIn } from './firebase'
import InventoryDetailModal from './components/InventoryDetailModal'
import OrderDetailModal from './components/OrderDetailModal'
import CustomerDetailModal from './components/CustomerDetailModal'
import LegacyOrderModal from './components/LegacyOrderModal'
import StockAdjustModal from './components/StockAdjustModal'
import EditItemModal from './components/EditItemModal'
import DeleteConfirmModal from './components/DeleteConfirmModal'
import ShippingModal from './components/ShippingModal'
import ReturnModal from './components/ReturnModal'
import ImageModal from './components/ImageModal'
import HistoryModal from './components/HistoryModal'
import ChangeHistoryModal from './components/ChangeHistoryModal'
import { getDb } from './firebase'
import { collection, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, getDocs, query, where, increment, onSnapshot } from 'firebase/firestore'
import { FABRICS_COLLECTION, ORDERS_COLLECTION, cleanNumber, getOutfitTotal } from './lib/utils'

// Simple icon SVG components
const Icons = {
    Home: () => <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>,
    Box: () => <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>,
    Plus: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
    Clipboard: () => <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h6a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" /></svg>,
    Table: () => <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" /></svg>,
    LogOut: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
    ShoppingBag: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 10a4 4 0 0 1-8 0" /></svg>,
    Users: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>,
    Truck: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1-1V4a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6 0a1 1 0 001 1h2a1 1 0 001-1m0 0h1a1 1 0 001-1v-1a1 1 0 00-1-1h-1a1 1 0 00-1 1v1z" /></svg>,
    TrendingUp: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
    Zap: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    Shield: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
}

function LoginForm({ login }) {
    const [name, setName] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const result = await login(name)
            if (!result.ok) {
                setError(result.message)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div>
                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Your Name</label>
                <input
                    type="text"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-emerald-pine focus:ring-2 focus:ring-emerald-pine/20 focus:outline-none transition"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-lime-glow to-green-tea text-emerald-pine font-bold py-3 rounded-2xl hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
                {loading ? 'Please wait...' : 'Sign In'}
            </button>
        </form>
    )
}

function InnerApp() {
    const [activeTab, setActiveTab] = useState('home')
    const { userProfile, login, logout, loading, isTransitioning } = useAuth()
    const [nameInput, setNameInput] = useState('')
    const [inventoryItems, setInventoryItems] = useState([])
    const [allOrders, setAllOrders] = useState([])
    const [vendors, setVendors] = useState([])
    const [productionBatches, setProductionBatches] = useState([])
    const [showProductionModal, setShowProductionModal] = useState(false)
    const [receiveBatch, setReceiveBatch] = useState(null)
    const [changeHistoryVisible, setChangeHistoryVisible] = useState(false)
    const [showMobileMenu, setShowMobileMenu] = useState(false)
    // Modal & UI state
    const [viewInventoryItem, setViewInventoryItem] = useState(null)
    const [viewOrder, setViewOrder] = useState(null)
    const [viewCustomer, setViewCustomer] = useState(null)
    const [showLegacyModal, setShowLegacyModal] = useState(false)
    const [editOrder, setEditOrder] = useState(null)
    const [legacyForm, setLegacyForm] = useState(null)
    const [stockAdjustItem, setStockAdjustItem] = useState(null)
    const [stockAdjustType, setStockAdjustType] = useState(null)
    const [editingId, setEditingId] = useState(null)
    const [deleteOrderTargetId, setDeleteOrderTargetId] = useState(null)
    const [deletePassword, setDeletePassword] = useState('')
    const [shippingOrderId, setShippingOrderId] = useState(null)
    const [returnOrderId, setReturnOrderId] = useState(null)
    const [customerSearch, setCustomerSearch] = useState('')
    const [shippingForm, setShippingForm] = useState({ sellingPrice: '', shippingCost: '', otherExpenses: '' })
    const [selectedImageUrl, setSelectedImageUrl] = useState(null)
    const [isUploading, setIsUploading] = useState(false)
    const [db, setDb] = useState(null)
    const [historyItemId, setHistoryItemId] = useState(null)

    // initialize firebase and authenticate - matching working HTML version
    React.useEffect(() => {
        // Style status/navigation bars to match the app theme and avoid overlap
        (async () => {
            try {
                await StatusBar.setOverlaysWebView({ overlay: false })
                await StatusBar.setStyle({ style: Style.Light })
                await StatusBar.setBackgroundColor({ color: '#084734' })
                await StatusBar.show()
            } catch (e) {
                console.warn('StatusBar styling not applied:', e?.message || e)
            }
        })()

        try {
            initFirebase()
            const firestore = getDb()
            setDb(firestore)
            anonymousSignIn().then(() => {
                console.log('Firebase authenticated anonymously')

                // Test direct query to verify database access
                getDocs(collection(firestore, 'fabrics')).then(snap => {
                    console.log('Direct fabrics query result:', snap.size, 'documents')
                    if (!snap.empty) {
                        console.log('Sample fabric:', snap.docs[0].data())
                    }
                }).catch(e => console.error('Direct fabrics query error:', e))

                getDocs(collection(firestore, 'production_orders')).then(snap => {
                    console.log('Direct production_orders query result:', snap.size, 'documents')
                    if (!snap.empty) {
                        console.log('Sample order:', snap.docs[0].data())
                    }
                }).catch(e => console.error('Direct production_orders query error:', e))

                getDocs(collection(firestore, 'customers')).then(snap => {
                    console.log('Direct customers query result:', snap.size, 'documents')
                    if (!snap.empty) {
                        console.log('Sample customer:', snap.docs[0].data())
                    }
                }).catch(e => console.error('Direct customers query error:', e))
            }).catch(e => {
                console.error('Auth error:', e)
            })
        } catch (e) {
            console.error('Firebase init error:', e)
        }
    }, [])

    // Keep active tab consistent with role / logout
    React.useEffect(() => {
        if (!userProfile) {
            setActiveTab('home')
            return
        }
        if (userProfile.role === 'staff') {
            setActiveTab('inventory')
        } else {
            setActiveTab('home')
        }
    }, [userProfile?.role])

    // Load fabrics once db is ready
    React.useEffect(() => {
        if (!db) return
        loadInventory()
    }, [db])

    const loadInventory = async () => {
        try {
            const snap = await getDocs(collection(db, 'fabrics'))
            const validDocs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d && d.name)
            setInventoryItems(validDocs)
            console.log('Loaded', validDocs.length, 'inventory items')
        } catch (error) {
            console.error('Error loading inventory:', error)
        }
    }

    // Load orders once db is ready
    React.useEffect(() => {
        if (!db) return
        loadOrders()
    }, [db])

    const loadOrders = async () => {
        try {
            const snap = await getDocs(collection(db, 'production_orders'))
            // keep rows that have either an orderNumber (orders) or a customerName (manual customers)
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => o && (o.orderNumber || o.customerName))
            setAllOrders(list)
            console.log('Loaded', list.length, 'orders')
        } catch (error) {
            console.error('Error loading orders:', error)
        }
    }

    const handleAddCustomer = async (customer) => {
        if (!db) return
        const payload = {
            customerName: customer.name,
            phone: customer.phone || '',
            address: customer.address || '',
            email: customer.email || '',
            city: customer.city || '',
            state: customer.state || '',
            status: 'Saved',
            orderTotal: 0,
            finalSellingPrice: 0,
            paymentMode: 'Prepaid',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            source: customer.source || 'Manual Customer',
            importedData: {
                'Customer Email': customer.email || '',
                Address: customer.address || '',
                City: customer.city || '',
                State: customer.state || ''
            }
        }
        try {
            const ref = await addDoc(collection(db, ORDERS_COLLECTION), payload)
            setAllOrders(prev => [{ id: ref.id, ...payload, createdAt: new Date(), updatedAt: new Date() }, ...prev])
        } catch (err) {
            console.error('Error adding customer', err)
            alert('Could not add customer: ' + err.message)
        }
    }

    const handleDeleteCustomer = async (customerName) => {
        if (!db || !customerName) return
        try {
            const qDelete = query(collection(db, ORDERS_COLLECTION), where('customerName', '==', customerName))
            const snap = await getDocs(qDelete)
            await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
            setAllOrders(prev => prev.filter(o => (o.customerName || '').toLowerCase().trim() !== customerName.toLowerCase().trim()))
        } catch (err) {
            console.error('Error deleting customer', err)
            alert('Could not delete customer: ' + err.message)
        }
    }

    // Load production batches once db is ready
    React.useEffect(() => {
        if (!db) return
        loadProductionBatches()
        loadVendors()
    }, [db])

    const loadProductionBatches = async () => {
        try {
            const snap = await getDocs(collection(db, 'production_batches'))
            const batches = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setProductionBatches(batches)
            console.log('Loaded', batches.length, 'production batches')
        } catch (error) {
            console.error('Error loading production batches:', error)
        }
    }

    const loadVendors = async () => {
        try {
            const snap = await getDocs(collection(db, 'vendors'))
            const vendorList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setVendors(vendorList)
            console.log('Loaded', vendorList.length, 'vendors')
        } catch (error) {
            console.error('Error loading vendors:', error)
        }
    }

    const refreshAllData = async () => {
        await Promise.all([loadInventory(), loadOrders(), loadProductionBatches(), loadVendors()])
    }

    // Calculate sold counts from orders
    const soldCounts = React.useMemo(() => {
        const counts = {}
        
        allOrders.forEach(order => {
            // Only count completed orders: shipped, in transit, or delivered
            const isCompleted = order.status === 'Order Shipped (Completed)' || 
                               order.status === 'In Transit' || 
                               order.status === 'Delivered'
            if (!isCompleted) return
            
            // Skip imported CSV orders (they're not from our inventory)
            if (order.source === 'Shopify CSV Import' || order.source === 'Shiprocket CSV Import') return
            
            // Skip cancelled or returned orders
            if (order.status === 'Cancelled' || order.status === 'Returned') return
            
            const qty = parseInt(order.quantity) || 1
            
            // Priority 1: Use outfitId for stock orders (most accurate)
            if (order.outfitId) {
                counts[order.outfitId] = (counts[order.outfitId] || 0) + qty
            }
            // Priority 2: Use outfit name for legacy/custom orders
            else if (order.outfitName) {
                counts[order.outfitName] = (counts[order.outfitName] || 0) + qty
            }
        })
        
        return counts
    }, [allOrders])

    const openEditModal = (item) => {
        setEditingId(item.id)
    }

    const openStockModal = (item, type) => { setStockAdjustItem(item); setStockAdjustType(type); }

    const handleLegacySubmit = async () => {
        setIsUploading(true)
        try {
            const data = { ...legacyForm, createdAt: serverTimestamp(), usedByEmail: userProfile?.name }
            const db = getDb()
            if (legacyForm.fabricId && legacyForm.deductStock && parseFloat(legacyForm.cutAmount) > 0) {
                const fref = doc(db, FABRICS_COLLECTION, legacyForm.fabricId)
                await updateDoc(fref, { currentLength: increment(-Math.abs(parseFloat(legacyForm.cutAmount) || 0)), updatedAt: serverTimestamp() })
                await addDoc(collection(fref, 'history'), { amountUsed: parseFloat(legacyForm.cutAmount) || 0, orderNumber: legacyForm.orderNumber, status: 'Manual Entry', type: 'CUT', usedByEmail: userProfile?.name, usedAt: serverTimestamp() })
            }
            await addDoc(collection(db, ORDERS_COLLECTION), data)
            setShowLegacyModal(false)
            await loadOrders() // Refresh orders list
        } catch (e) { console.error(e) }
        setIsUploading(false)
    }

    const handleCancelOrder = async (order) => {
        if (!confirm('Cancel this order?')) return
        try {
            const db = getDb()
            await updateDoc(doc(db, ORDERS_COLLECTION, order.id), { status: 'Cancelled', updatedAt: serverTimestamp() })
            if (order.fabricId && order.cutAmount > 0) {
                const fabricRef = doc(db, FABRICS_COLLECTION, order.fabricId)
                await updateDoc(fabricRef, { currentLength: increment(Math.abs(parseFloat(order.cutAmount) || 0)), updatedAt: serverTimestamp() })
                await addDoc(collection(fabricRef, 'history'), { amountUsed: order.cutAmount, orderNumber: `CANCEL-${order.orderNumber}`, type: 'CANCEL_RETURN', status: 'Cancelled', usedAt: serverTimestamp() })
            }
            await Promise.all([loadOrders(), loadInventory()]) // Refresh data
        } catch (e) { console.error(e) }
    }

    const handleCancelBatch = async (batch) => {
        if (!confirm(`Cancel production batch for ${batch.outfitName}?`)) return
        try {
            const db = getDb()
            const batchRef = doc(db, 'production_batches', batch.id)
            
            // Update batch status to Cancelled
            await updateDoc(batchRef, { 
                status: 'Cancelled', 
                updatedAt: serverTimestamp() 
            })

            // If batch was completed (Received), roll back inventory
            if (batch.status === 'Completed' && batch.outfitId) {
                const outfitRef = doc(db, FABRICS_COLLECTION, batch.outfitId)
                const rollbackBreakdown = batch.receivedBreakdown || batch.sizeBreakdown || {}
                
                // Decrement stock for each size
                const updates = {}
                Object.entries(rollbackBreakdown).forEach(([size, qty]) => {
                    const qtyNum = parseInt(qty) || 0
                    if (qtyNum > 0) {
                        updates[`stockBreakdown.${size}`] = increment(-qtyNum)
                    }
                })
                
                if (Object.keys(updates).length > 0) {
                    await updateDoc(outfitRef, { ...updates, updatedAt: serverTimestamp() })
                }
            }

            // Refresh data
            await refreshAllData()
        } catch (e) { 
            console.error('Error cancelling batch:', e)
            alert('Error cancelling batch: ' + e.message)
        }
    }

    const handleDeleteOrder = async () => {
        if (deletePassword !== 'posh123') { alert('Incorrect Password'); return }
        try {
            const db = getDb()
            await deleteDoc(doc(db, ORDERS_COLLECTION, deleteOrderTargetId))
            setDeleteOrderTargetId(null); setDeletePassword('')
            await loadOrders() // Refresh orders list
        } catch (e) { console.error(e) }
    }

    const submitShipping = async () => {
        if (!shippingOrderId) return
        try {
            const db = getDb()
            await updateDoc(doc(db, ORDERS_COLLECTION, shippingOrderId), { status: 'Order Shipped (Completed)', finalSellingPrice: parseFloat(shippingForm.sellingPrice) || 0, shippingCost: parseFloat(shippingForm.shippingCost) || 0, otherExpenses: parseFloat(shippingForm.otherExpenses) || 0, updatedAt: serverTimestamp() })
            setShippingOrderId(null)
            await loadOrders() // Refresh orders list
        } catch (e) { console.error(e) }
    }

    const handleAddOrderFromCustomer = (customer) => {
        // Find the customer's most recent order to extract all preferences
        const customerOrders = allOrders.filter(o => 
            o.customerName && o.customerName.toLowerCase().trim() === customer.name.toLowerCase().trim()
        ).sort((a, b) => {
            const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
            const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
            return dateB - dateA
        })

        const lastOrder = customerOrders[0] // Most recent order

        // Pre-fill form with ALL customer data from last order
        setLegacyForm({
            orderNumber: '',
            customerName: customer.name,
            outfitName: '',
            size: lastOrder?.size || 'M',
            fabricId: lastOrder?.fabricId || '',
            status: 'Sent to Tailor',
            sellingPrice: '',
            deductStock: false,
            cutAmount: '',
            notes: lastOrder?.notes || '',
            phone: customer.phone || '',
            address: customer.address || '',
            discount: lastOrder?.discount || '',
            source: lastOrder?.source || '',
            acquisitionCost: lastOrder?.acquisitionCost || '',
            paymentMethod: lastOrder?.paymentMethod || 'Prepaid',
            city: customer.city || '',
            state: customer.state || '',
            codCharge: lastOrder?.codCharge || '',
            shippingCost: lastOrder?.shippingCost || '',
            codRemittanceDate: lastOrder?.codRemittanceDate || '',
            stitchingCost: lastOrder?.stitchingCost || '',
            fabricCost: lastOrder?.fabricCost || '',
            deliveryCost: lastOrder?.deliveryCost || ''
        })
        setEditOrder(null)
        setShowLegacyModal(true)
        setViewCustomer(null) // Close customer detail modal
    }

    const handleDeleteItem = async (item) => {
        if (!confirm('Delete this item?')) return
        try { const db = getDb(); await deleteDoc(doc(db, FABRICS_COLLECTION, item.id)); setViewInventoryItem(null); await loadInventory() } catch (e) { console.error(e) }
    }

    if (isTransitioning) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-pine via-emerald-800 to-emerald-900">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-lime-glow border-t-emerald-pine rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-lime-glow font-semibold">Loading...</p>
                </div>
            </div>
        )
    }

    if (!userProfile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-pine via-emerald-800 to-emerald-900 p-4">
                <div className="w-full max-w-sm bg-gray-900 rounded-3xl shadow-2xl p-8">
                    <div className="text-center mb-8">
                        <div className="w-20 h-20 rounded-3xl mx-auto mb-4 shadow-lg overflow-hidden bg-gradient-to-br from-lime-glow to-green-tea flex items-center justify-center">
                            <img src="/brand-icon.png" alt="Poshakh logo" className="w-full h-full object-contain" />
                        </div>
                        <h1 className="text-3xl font-extrabold text-emerald-pine mb-2">Poshakh Manager</h1>
                        <p className="text-gray-500 text-sm">Stock & Production Tracking</p>
                    </div>
                    <LoginForm login={login} />
                </div>
            </div>
        )
    }

    // Only allow Binay (staff) to see inventory tab
    const isStaffOnly = userProfile?.role === 'staff'

    // (Removed redundant force-to-inventory effect; role effect already handles this.)

    const tabs = isStaffOnly ? [
        { id: 'inventory', label: 'Inventory', icon: Icons.Box },
    ] : [
        { id: 'home', label: 'Home', icon: Icons.Home },
        { id: 'inventory', label: 'Inventory', icon: Icons.Box },
        { id: 'vendors', label: 'Vendors', icon: Icons.Truck },
        { id: 'orders', label: 'Orders', icon: Icons.Clipboard },
        { id: 'add', label: 'Add', icon: Icons.Plus },
        { id: 'outfits', label: 'Outfits', icon: Icons.ShoppingBag },
        { id: 'customers', label: 'Customers', icon: Icons.Users },
        ...(userProfile?.role === 'admin' ? [
            { id: 'financial', label: 'Financial', icon: Icons.TrendingUp },
            { id: 'integrations', label: 'Integrations', icon: Icons.Zap }
        ] : []),
    ]

    return (
        <div className="min-h-screen bg-black pb-24">
            {/* Header */}
            <header className="bg-gradient-to-r from-emerald-pine to-emerald-800 border-b border-emerald-900 sticky top-0 z-40 shadow-lg">
                <div className="px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
                    <div className="flex items-center gap-2 sm:gap-3">
                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setShowMobileMenu(!showMobileMenu)}
                            className="lg:hidden h-9 w-9 bg-emerald-600 text-lime-glow rounded-2xl flex items-center justify-center hover:bg-emerald-500 active:scale-95 transition-all"
                            title="Menu"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-lime-glow to-green-tea flex items-center justify-center overflow-hidden">
                            <img src="/brand-icon.png" alt="Poshakh logo" className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <h1 className="text-base sm:text-lg font-bold text-white">Poshakh Manager</h1>
                            <p className="text-[10px] sm:text-xs text-emerald-100">Connected</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4">
                        <button
                            onClick={refreshAllData}
                            className="h-9 w-9 sm:h-10 sm:w-10 bg-emerald-600 text-lime-glow rounded-2xl flex items-center justify-center hover:bg-emerald-500 active:scale-95 transition-all shadow-lg"
                            title="Refresh Data"
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                        {userProfile?.role === 'admin' && (
                            <NotificationsCenter />
                        )}
                        {!isStaffOnly && (userProfile?.name === 'Adwait' || userProfile?.name === 'Avani') && (
                            <button
                                onClick={() => setChangeHistoryVisible(true)}
                                className="h-9 w-9 sm:h-10 sm:w-10 bg-emerald-600 text-lime-glow rounded-2xl flex items-center justify-center hover:bg-emerald-500 active:scale-95 transition-all shadow-lg"
                                title="View Change History"
                            >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </button>
                        )}
                        {!isStaffOnly && userProfile?.role === 'admin' && (
                            <button onClick={() => setActiveTab('import')} className="h-9 w-9 sm:h-10 sm:w-10 bg-emerald-600 text-lime-glow rounded-2xl flex items-center justify-center hover:bg-emerald-500 active:scale-95 transition-all shadow-lg" title="Import">
                                <Icons.Table className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                        )}
                        <div className={!isStaffOnly ? "text-right hidden sm:block" : "text-right hidden sm:block"}>
                            <p className="text-sm font-semibold text-gray-900">{userProfile?.name || ''}</p>
                            <p className="text-xs text-gray-500 capitalize">{userProfile?.role || ''}</p>
                        </div>
                        <button
                            onClick={async () => {
                                try {
                                    await logout()
                                    setActiveTab('home')
                                } catch (e) {
                                    console.error('Logout error:', e)
                                }
                            }}
                            className="p-2 rounded-lg hover:bg-red-50 active:bg-red-100 text-red-600 transition"
                            title="Logout"
                        >
                            <Icons.LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="px-4 sm:px-6 py-4 sm:py-6 max-w-7xl mx-auto pb-24">
                {activeTab === 'home' && (
                    <TabBoundary label="Home">
                        <Dashboard allOrders={allOrders} inventoryItems={inventoryItems} userRole={userProfile?.role} />
                    </TabBoundary>
                )}
                {activeTab === 'inventory' && (
                    <TabBoundary label="Inventory">
                        <Inventory onViewItem={(it) => setViewInventoryItem(it)} inventoryItems={inventoryItems} soldCounts={soldCounts} onAddClick={() => setActiveTab('add')} userRole={userProfile?.role} />
                    </TabBoundary>
                )}
                {activeTab === 'vendors' && (
                    <TabBoundary label="Vendors">
                        <Vendors vendors={vendors} inventoryItems={inventoryItems} onDataChanged={refreshAllData} userProfile={userProfile} />
                    </TabBoundary>
                )}
                {activeTab === 'orders' && (
                    <TabBoundary label="Orders">
                        <Orders allOrders={allOrders} inventoryItems={inventoryItems} productionBatches={productionBatches} onViewOrder={(o) => setViewOrder(o)} onShowLegacyModal={() => setShowLegacyModal(true)} onCancelOrder={handleCancelOrder} onDeleteOrder={(id) => { console.log('onDeleteOrder called with id:', id); setDeleteOrderTargetId(id); }} onOpenShipping={(id) => setShippingOrderId(id)} onCreateProductionBatch={() => setShowProductionModal(true)} onReceiveBatch={(batch) => setReceiveBatch(batch)} onCancelBatch={handleCancelBatch} userProfile={userProfile} onDataChanged={refreshAllData} />
                    </TabBoundary>
                )}
                {activeTab === 'outfits' && (
                    <TabBoundary label="Outfits">
                        <Outfits allOrders={allOrders} inventoryItems={inventoryItems} />
                    </TabBoundary>
                )}
                {activeTab === 'customers' && (
                    <TabBoundary label="Customers">
                        <Customers
                            allOrders={allOrders}
                            onViewCustomer={(c) => setViewCustomer(c)}
                            searchTerm={customerSearch}
                            setSearchTerm={setCustomerSearch}
                            onAddCustomer={handleAddCustomer}
                            onDeleteCustomer={handleDeleteCustomer}
                        />
                    </TabBoundary>
                )}
                {activeTab === 'financial' && (
                    <TabBoundary label="Financial">
                        <FinancialInsights inventoryItems={inventoryItems} allOrders={allOrders} userRole={userProfile?.role} />
                    </TabBoundary>
                )}
                {activeTab === 'integrations' && (
                    <TabBoundary label="Integrations">
                        <IntegrationsSettings onImportSuccess={loadOrders} />
                    </TabBoundary>
                )}
                {activeTab === 'add' && (
                    <TabBoundary label="Add Item">
                        <AddItem onSuccess={() => setActiveTab('inventory')} onDataChanged={refreshAllData} userProfile={userProfile} vendors={vendors} />
                    </TabBoundary>
                )}
                {activeTab === 'import' && userProfile?.role === 'admin' && (
                    <TabBoundary label="Import">
                        <SheetImport />
                    </TabBoundary>
                )}

                {/* Modals wired to state and handlers */}
                <InventoryDetailModal item={viewInventoryItem} soldCounts={soldCounts} allOrders={allOrders} onClose={() => setViewInventoryItem(null)} onOpenEdit={openEditModal} onOpenStock={openStockModal} onViewHistory={(it) => { setViewInventoryItem(null); setHistoryItemId(it.id); }} onDelete={handleDeleteItem} />
                <OrderDetailModal order={viewOrder} onClose={() => setViewOrder(null)} onEdit={(o) => { setViewOrder(null); setEditOrder(o); setShowLegacyModal(true); }} onShip={(o) => { setShippingOrderId(o.id); }} onReturn={(o) => { setReturnOrderId(o.id) }} userProfile={userProfile} onDataChanged={refreshAllData} />
                <CustomerDetailModal customer={viewCustomer} onClose={() => setViewCustomer(null)} allOrders={allOrders} inventoryItems={inventoryItems} userRole={userProfile?.role} onDataChanged={refreshAllData} onAddOrder={handleAddOrderFromCustomer} />
                <LegacyOrderModal visible={showLegacyModal} onClose={() => { setShowLegacyModal(false); setEditOrder(null); setLegacyForm(null); }} inventoryItems={inventoryItems} userProfile={userProfile} onDataChanged={refreshAllData} editOrder={editOrder} initialForm={legacyForm} />
                <StockAdjustModal item={stockAdjustItem} type={stockAdjustType} onClose={() => { setStockAdjustItem(null); setStockAdjustType(null); }} onDataChanged={refreshAllData} userProfile={userProfile} />
                <EditItemModal item={editingId ? inventoryItems.find(i => i.id === editingId) : null} inventoryItems={inventoryItems} db={db} onClose={() => setEditingId(null)} onDataChanged={refreshAllData} />
                <DeleteConfirmModal visible={!!deleteOrderTargetId} orderId={deleteOrderTargetId} orderNumber={allOrders.find(o => o.id === deleteOrderTargetId)?.orderNumber} userProfile={userProfile} onClose={() => { setDeleteOrderTargetId(null); }} onDataChanged={refreshAllData} />
                <ShippingModal visible={!!shippingOrderId} orderId={shippingOrderId} order={allOrders.find(o => o.id === shippingOrderId)} userProfile={userProfile} onClose={() => setShippingOrderId(null)} onDataChanged={refreshAllData} />
                <ReturnModal visible={!!returnOrderId} orderId={returnOrderId} orderNumber={allOrders.find(o => o.id === returnOrderId)?.orderNumber} userProfile={userProfile} onClose={() => setReturnOrderId(null)} onDataChanged={refreshAllData} inventoryItems={inventoryItems} allOrders={allOrders} />
                <ImageModal url={selectedImageUrl} onClose={() => setSelectedImageUrl(null)} />
                <HistoryModal itemId={historyItemId} onClose={() => setHistoryItemId(null)} />
                <ChangeHistoryModal visible={changeHistoryVisible} onClose={() => setChangeHistoryVisible(false)} />
                <ProductionModal visible={showProductionModal} onClose={() => setShowProductionModal(false)} inventoryItems={inventoryItems} onDataChanged={refreshAllData} userProfile={userProfile} />
                <ReceiveProductionModal visible={!!receiveBatch} batch={receiveBatch} onClose={() => setReceiveBatch(null)} onDataChanged={refreshAllData} inventoryItems={inventoryItems} userProfile={userProfile} />
            </main>

            {/* Mobile Menu Drawer */}
            {showMobileMenu && (
                <div className="fixed inset-0 z-30 lg:hidden">
                    {/* Overlay */}
                    <div
                        className="absolute inset-0 bg-black/70"
                        onClick={() => setShowMobileMenu(false)}
                    />
                    {/* Drawer */}
                    <div className="absolute left-0 top-0 bottom-0 w-64 bg-gradient-to-b from-emerald-pine to-emerald-800 shadow-2xl overflow-y-auto pt-20">
                        <div className="px-4 py-4 space-y-2">
                            {tabs.map(tab => {
                                const isActive = activeTab === tab.id
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            setActiveTab(tab.id)
                                            setShowMobileMenu(false)
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                                            isActive
                                                ? 'bg-lime-glow text-emerald-pine font-bold shadow-lg'
                                                : 'text-white hover:bg-emerald-600'
                                        }`}
                                    >
                                        <tab.icon className="w-5 h-5" />
                                        <span>{tab.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Navigation - Desktop Only */}
            <nav className="hidden lg:flex fixed bottom-0 left-0 right-0 bg-black border-t-2 border-lime-glow px-2 sm:px-4 py-2 sm:py-3 justify-around items-center shadow-2xl safe-area-inset-bottom">
                {tabs.map(tab => {
                    const isActive = activeTab === tab.id
                    const isAddTab = tab.id === 'add'

                    return isAddTab ? (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-pine text-lime-glow flex items-center justify-center shadow-2xl hover:scale-110 active:scale-105 transition-all -mt-8 border-4 border-black"
                        >
                            <tab.icon className="w-6 h-6" />
                        </button>
                    ) : (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex flex-col items-center gap-1 py-2 px-2 sm:px-3 rounded-2xl transition-all min-w-[60px] ${isActive
                                ? 'text-emerald-pine bg-lime-glow shadow-lg'
                                : 'text-gray-600 hover:text-lime-glow'
                                }`}
                        >
                            <tab.icon className="w-5 h-5" />
                            <span className="text-[10px] sm:text-xs font-medium">{tab.label}</span>
                        </button>
                    )
                })}
            </nav>
        </div>
    )
}

export default function App() {
    return (
        <NotificationProvider>
            <AuthProvider>
                <ErrorBoundary>
                    <NotificationStack />
                    <InnerApp />
                </ErrorBoundary>
            </AuthProvider>
        </NotificationProvider>
    )
}

