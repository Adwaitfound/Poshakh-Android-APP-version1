import React, { useState, useMemo } from 'react'
import { Plus, X, Phone, Mail, MapPin, Package, TrendingUp, Clock } from 'lucide-react'
import { collection, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, getDocs, query, where, increment } from 'firebase/firestore'
import { getDb } from '../firebase'
import { useNotification } from '../context/NotificationProvider'
import { FABRICS_COLLECTION, STOCK_BREAKDOWN_TEMPLATE, generatePlaceholderImage, parsePrice, formatCurrency, calculateActualCost } from '../lib/utils'

export default function Vendors({ vendors = [], inventoryItems = [], onDataChanged, userProfile }) {
    const [showAddVendor, setShowAddVendor] = useState(false)
    const [selectedVendor, setSelectedVendor] = useState(null)
    const [editingVendor, setEditingVendor] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [showAddFabric, setShowAddFabric] = useState(false)
    const [fabricForm, setFabricForm] = useState({
        name: '', totalLength: '', costPerMeter: '', lengthRequiredPerOutfit: '',
        transportCost: '', otherCosts: '', location: '', invoiceNumber: '', purchaseDate: ''
    })
    const [existingFabricId, setExistingFabricId] = useState('')
    const [vendorOrders, setVendorOrders] = useState({}) // vendorId -> list
    const [orderForm, setOrderForm] = useState({ fabricName: '', fabricId: '', quantityMeters: '', costPerMeter: '', status: 'Placed', etaDate: '', etaDays: '', notes: '' })
    const [editingPoId, setEditingPoId] = useState(null)
    const [poFormOpen, setPoFormOpen] = useState({}) // vendorId -> bool
    const { notify } = useNotification()

    const [vendorForm, setVendorForm] = useState({
        name: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
        paymentTerms: 'Cash',
        leadTimeDays: '',
        notes: ''
    })

    // Parse date values from Firestore or string formats
    const parseDateValue = (value) => {
        if (!value) return null
        if (value.toDate) return value.toDate()
        const d = new Date(value)
        return Number.isNaN(d.getTime()) ? null : d
    }

    const vendorStats = useMemo(() => {
        return vendors.map(vendor => {
                const vendorFabrics = inventoryItems.filter(item => item?.type === 'fabric' && item?.linkedVendors?.includes(vendor.id))
            const totalFabrics = vendorFabrics.length
            const totalValue = vendorFabrics.reduce((sum, fabric) => {
                const currentLength = parsePrice(fabric.currentLength)
                const costPerMeter = parsePrice(fabric.costPerMeter)
                return sum + (currentLength * costPerMeter)
            }, 0)
            const totalMeters = vendorFabrics.reduce((sum, fabric) => sum + parsePrice(fabric.currentLength), 0)
            const lowStockFabrics = vendorFabrics.filter(f => (parseFloat(f.currentLength) || 0) <= 10)
            const primaryFabric = vendorFabrics.sort((a, b) => (parseFloat(a.currentLength) || 0) - (parseFloat(b.currentLength) || 0))[0]
            
            return {
                ...vendor,
                totalFabrics,
                totalValue,
                totalMeters,
                lowStockFabrics,
                primaryFabric,
                avgCostPerMeter: totalMeters > 0 ? totalValue / totalMeters : 0
            }
        })
    }, [vendors, inventoryItems])

    const vendorFabrics = useMemo(() => {
        const items = Array.isArray(inventoryItems) ? inventoryItems : []
        if (!selectedVendor) return []
           return items.filter(item => item?.type === 'fabric' && item?.linkedVendors?.includes(selectedVendor.id))
    }, [inventoryItems, selectedVendor])

    const allFabrics = useMemo(() => {
        const items = Array.isArray(inventoryItems) ? inventoryItems : []
        return items.filter(item => item?.type === 'fabric')
    }, [inventoryItems])

    const vendorPriceStats = useMemo(() => {
        if (!selectedVendor) return null
        const list = vendorOrders[selectedVendor.id] || []
        if (!list.length) return null
        const prices = list
            .map(po => parsePrice(po.costPerMeter))
            .filter(v => v > 0)
        if (!prices.length) return null
        const lastPrice = prices[0]
        const avg = prices.reduce((s, v) => s + v, 0) / prices.length
        const best = Math.min(...prices)
        const worst = Math.max(...prices)
        const deltaPercent = avg ? ((lastPrice - avg) / avg) * 100 : 0
        return { lastPrice, avg, best, worst, deltaPercent }
    }, [vendorOrders, selectedVendor])

    const etaPreview = useMemo(() => {
        if (orderForm.etaDate) return orderForm.etaDate
        const days = parseInt(orderForm.etaDays || selectedVendor?.leadTimeDays || 0, 10)
        if (!days) return ''
        const d = new Date()
        d.setDate(d.getDate() + days)
        return d.toISOString().slice(0, 10)
    }, [orderForm.etaDate, orderForm.etaDays, selectedVendor?.leadTimeDays])

    const vendorFollowUps = useMemo(() => {
        if (!selectedVendor) return []
        const list = vendorOrders[selectedVendor.id] || []
        const leadDays = parseInt(selectedVendor.leadTimeDays || 0, 10)
        const now = new Date()
        return list
            .filter(po => po.status !== 'Received' && po.status !== 'Cancelled')
            .map(po => {
                const eta = parseDateValue(po.etaDate) || (leadDays > 0 && po.placedAt?.toDate ? (() => {
                    const d = po.placedAt.toDate()
                    d.setDate(d.getDate() + leadDays)
                    return d
                })() : null)
                if (!eta) return null
                const diffDays = Math.ceil((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                return {
                    id: po.id,
                    fabricName: po.fabricName,
                    status: po.status,
                    eta,
                    daysUntil: diffDays,
                    vendorName: selectedVendor.name
                }
            })
            .filter(Boolean)
            .filter(item => item.daysUntil <= 2) // Due soon or overdue
            .sort((a, b) => a.daysUntil - b.daysUntil)
    }, [vendorOrders, selectedVendor])

    const filteredVendors = useMemo(() => {
        if (!searchTerm) return vendorStats
        const term = searchTerm.toLowerCase()
        return vendorStats.filter(v => 
            v.name?.toLowerCase().includes(term) ||
            v.contactPerson?.toLowerCase().includes(term) ||
            v.phone?.includes(term)
        )
    }, [vendorStats, searchTerm])

    const dashboardSummary = useMemo(() => {
        const totalVendors = vendorStats.length
        const totalFabrics = vendorStats.reduce((sum, v) => sum + (v.totalFabrics || 0), 0)
        const lowStock = vendorStats.reduce((sum, v) => sum + (v.lowStockFabrics?.length || 0), 0)
        const allOrders = Object.values(vendorOrders || {}).reduce((arr, list) => arr.concat(list || []), [])
        const pendingOrders = allOrders.filter(po => po.status !== 'Received').length
        return { totalVendors, totalFabrics, lowStock, pendingOrders }
    }, [vendorStats, vendorOrders])

    const applyInventoryReceipt = async (fabricId, qty) => {
        const amount = parseFloat(qty)
        if (!fabricId || !amount || amount <= 0) return
        const db = getDb()
        await updateDoc(doc(db, FABRICS_COLLECTION, fabricId), {
            currentLength: increment(amount),
            totalLength: increment(amount),
            updatedAt: serverTimestamp()
        })
    }

    const loadVendorOrders = async (vendorId) => {
        try {
            const db = getDb()
            const q = query(collection(db, 'vendor_orders'), where('vendorId', '==', vendorId))
            const snap = await getDocs(q)
            const list = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => {
                    const ta = a.placedAt?.toDate ? a.placedAt.toDate().getTime() : 0
                    const tb = b.placedAt?.toDate ? b.placedAt.toDate().getTime() : 0
                    return tb - ta
                })
            setVendorOrders(prev => ({ ...prev, [vendorId]: list }))
        } catch (error) {
            console.error('Error loading vendor orders:', error)
            notify.error('Failed to load vendor orders')
        }
    }

    const unlinkedFabrics = useMemo(() => {
        const list = Array.isArray(inventoryItems) ? inventoryItems : []
        // Show all fabrics - same fabric can be linked to multiple vendors
        return list.filter(item => item?.type === 'fabric')
    }, [inventoryItems])

    const resetVendorForm = () => setVendorForm({
        name: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
        paymentTerms: 'Cash',
        leadTimeDays: '',
        notes: ''
    })

    const startAddVendor = () => {
        setEditingVendor(null)
        resetVendorForm()
        setShowAddVendor(true)
    }

    const handleSaveVendor = async (e) => {
        e.preventDefault()
        try {
            const db = getDb()
            if (editingVendor) {
                await updateDoc(doc(db, 'vendors', editingVendor.id), {
                    ...vendorForm,
                    updatedAt: serverTimestamp(),
                    updatedBy: userProfile?.email || 'Unknown'
                })
                notify.success(`✅ Vendor "${vendorForm.name}" updated`)
            } else {
                await addDoc(collection(db, 'vendors'), {
                    ...vendorForm,
                    createdAt: serverTimestamp(),
                    createdBy: userProfile?.email || 'Unknown'
                })
                notify.success(`✅ Vendor "${vendorForm.name}" added successfully!`)
            }

            resetVendorForm()
            setEditingVendor(null)
            setShowAddVendor(false)
            if (onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Error saving vendor:', error)
            notify.error('Failed to save vendor: ' + error.message)
        }
    }

    const handleAddFabricFromVendor = async (e) => {
        e.preventDefault()
        
        if (!fabricForm.name.trim()) {
            notify.error('Fabric name is required')
            return
        }
        if (!fabricForm.totalLength || parseFloat(fabricForm.totalLength) <= 0) {
            notify.error('Total length must be greater than 0')
            return
        }
        if (!fabricForm.costPerMeter || parseFloat(fabricForm.costPerMeter) <= 0) {
            notify.error('Cost per meter must be greater than 0')
            return
        }

        try {
            const db = getDb()
            const imgUrl = generatePlaceholderImage(fabricForm.name, ['2e7d32', '1565c0', 'f57c00', 'c2185b'][Math.floor(Math.random() * 4)])
            
            const baseCost = parseFloat(fabricForm.costPerMeter) || 0
            const transport = parseFloat(fabricForm.transportCost) || 0
            const other = parseFloat(fabricForm.otherCosts) || 0
            const totalLength = parseFloat(fabricForm.totalLength) || 1
            
            await addDoc(collection(db, FABRICS_COLLECTION), {
                name: fabricForm.name.trim(),
                type: 'fabric',
                vendorId: selectedVendor.id,
                vendorName: selectedVendor.name,
                totalLength: parsePrice(fabricForm.totalLength),
                currentLength: parsePrice(fabricForm.totalLength),
                unit: 'meters',
                costPerMeter: baseCost,
                lengthRequiredPerOutfit: parsePrice(fabricForm.lengthRequiredPerOutfit),
                transportCost: transport,
                otherCosts: other,
                actualCostPerMeter: calculateActualCost(fabricForm.costPerMeter, fabricForm.transportCost, fabricForm.otherCosts, fabricForm.totalLength),
                location: fabricForm.location || '',
                invoiceNumber: fabricForm.invoiceNumber || '',
                purchaseDate: fabricForm.purchaseDate || '',
                currentOrderStatus: 'None',
                imageUrl: imgUrl,
                stockBreakdown: { ...STOCK_BREAKDOWN_TEMPLATE },
                createdAt: serverTimestamp(),
                createdBy: userProfile?.email || 'Unknown'
            })
            
            notify.success(`✅ Fabric "${fabricForm.name}" added for ${selectedVendor.name}!`)
            setFabricForm({
                name: '', totalLength: '', costPerMeter: '', lengthRequiredPerOutfit: '',
                transportCost: '', otherCosts: '', location: '', invoiceNumber: '', purchaseDate: ''
            })
            setShowAddFabric(false)
            if (onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Error adding fabric:', error)
            notify.error('Failed to add fabric: ' + error.message)
        }
    }

    const handleLinkExistingFabric = async () => {
        if (!existingFabricId) {
            notify.error('Select a fabric to link')
            return
        }
        if (!selectedVendor) {
            notify.error('Open a vendor first')
            return
        }

        try {
            const db = getDb()
            const fabricDoc = inventoryItems.find(f => f.id === existingFabricId)
            const currentVendors = fabricDoc?.linkedVendors || []
            
            // Add vendor to the array if not already linked
            if (!currentVendors.includes(selectedVendor.id)) {
                currentVendors.push(selectedVendor.id)
            }
            
            await updateDoc(doc(db, FABRICS_COLLECTION, existingFabricId), {
                linkedVendors: currentVendors,
                updatedAt: serverTimestamp()
            })

            notify.success('✅ Fabric linked to vendor')
            setExistingFabricId('')
            if (onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Error linking fabric:', error)
            notify.error('Failed to link fabric: ' + error.message)
        }
    }

    const handleLinkFabric = async (fabricId, vendorId) => {
        if (!fabricId || !vendorId) return
        try {
            const db = getDb()
            const fabricDoc = inventoryItems.find(f => f.id === fabricId)
            const currentVendors = fabricDoc?.linkedVendors || []
            
            // Add vendor to the array if not already linked
            if (!currentVendors.includes(vendorId)) {
                currentVendors.push(vendorId)
            }
            
            await updateDoc(doc(db, FABRICS_COLLECTION, fabricId), {
                linkedVendors: currentVendors,
                updatedAt: serverTimestamp()
            })

            notify.success('✅ Fabric linked to vendor')
            setExistingFabricId('')
            if (onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Error linking fabric:', error)
            notify.error('Failed to link fabric: ' + error.message)
        }
    }

    const handleAddVendorOrder = async (e) => {
        e.preventDefault()
        if (!selectedVendor) {
            notify.error('Select a vendor first')
            return
        }
        // If user picked a linked fabric, auto-fill name
        if (orderForm.fabricId && !orderForm.fabricName.trim()) {
            const linked = vendorFabrics.find(f => f.id === orderForm.fabricId)
            if (linked) {
                orderForm.fabricName = linked.name
            }
        }
        if (!orderForm.fabricName.trim()) {
            notify.error('Fabric name is required')
            return
        }
        if (!orderForm.quantityMeters || parseFloat(orderForm.quantityMeters) <= 0) {
            notify.error('Quantity must be greater than 0')
            return
        }
        if (!orderForm.costPerMeter || parseFloat(orderForm.costPerMeter) <= 0) {
            notify.error('Cost per meter must be greater than 0')
            return
        }

        try {
            const db = getDb()
            const quantity = parseFloat(orderForm.quantityMeters)
            const costPerMeter = parseFloat(orderForm.costPerMeter)
            const fallbackLead = parseInt(selectedVendor?.leadTimeDays || 0, 10)
            const etaDays = parseInt(orderForm.etaDays || fallbackLead || 0, 10)
            const autoEta = orderForm.etaDate || (etaDays > 0 ? (() => {
                const d = new Date()
                d.setDate(d.getDate() + etaDays)
                return d.toISOString().slice(0, 10)
            })() : '')
            const reminderDate = autoEta || ''
            let needsRefresh = false

            if (editingPoId) {
                const existing = (vendorOrders[selectedVendor.id] || []).find(po => po.id === editingPoId)
                const wasStocked = existing?.stockUpdated
                const payload = {
                    fabricName: orderForm.fabricName.trim(),
                    fabricId: orderForm.fabricId || null,
                    quantityMeters: quantity,
                    costPerMeter,
                    totalCost: quantity * costPerMeter,
                    status: orderForm.status,
                    etaDate: autoEta,
                    etaDays: etaDays || '',
                    reminderDate,
                    notes: orderForm.notes || '',
                    updatedAt: serverTimestamp()
                }

                // If moved to Received and not previously stocked, update inventory once
                if (orderForm.status === 'Received' && orderForm.fabricId && !wasStocked) {
                    await applyInventoryReceipt(orderForm.fabricId, quantity)
                    payload.stockUpdated = true
                    payload.receivedAt = serverTimestamp()
                    needsRefresh = true
                } else {
                    payload.stockUpdated = wasStocked || false
                }

                await updateDoc(doc(db, 'vendor_orders', editingPoId), payload)
                notify.success('✅ Purchase order updated')
            } else {
                const payload = {
                    vendorId: selectedVendor.id,
                    vendorName: selectedVendor.name,
                    fabricName: orderForm.fabricName.trim(),
                    fabricId: orderForm.fabricId || null,
                    quantityMeters: quantity,
                    costPerMeter,
                    totalCost: quantity * costPerMeter,
                    status: orderForm.status,
                    etaDate: autoEta,
                    etaDays: etaDays || '',
                    reminderDate,
                    notes: orderForm.notes || '',
                    placedAt: serverTimestamp(),
                    createdBy: userProfile?.email || 'Unknown',
                    stockUpdated: false
                }

                if (orderForm.status === 'Received' && orderForm.fabricId) {
                    await applyInventoryReceipt(orderForm.fabricId, quantity)
                    payload.stockUpdated = true
                    payload.receivedAt = serverTimestamp()
                    needsRefresh = true
                }

                await addDoc(collection(db, 'vendor_orders'), payload)
                notify.success('✅ Purchase order recorded')
            }

            setOrderForm({ fabricName: '', fabricId: '', quantityMeters: '', costPerMeter: '', status: 'Placed', etaDate: '', etaDays: '', notes: '' })
            setEditingPoId(null)
            await loadVendorOrders(selectedVendor.id)
            if (needsRefresh && onDataChanged) {
                await onDataChanged()
            }
        } catch (error) {
            console.error('Error adding vendor order:', error)
            notify.error('Failed to add purchase order: ' + error.message)
        }
    }

    const handleMarkOrderReceived = async (po) => {
        if (!po.fabricId) {
            notify.error('Link this PO to an existing fabric to update stock')
            return
        }
        const qty = parseFloat(po.quantityMeters)
        if (!qty || qty <= 0) {
            notify.error('Invalid quantity for this PO')
            return
        }

        if (po.stockUpdated) {
            notify.error('Inventory already updated for this PO')
            return
        }

        try {
            await applyInventoryReceipt(po.fabricId, qty)
            const db = getDb()
            await updateDoc(doc(db, 'vendor_orders', po.id), {
                status: 'Received',
                receivedAt: serverTimestamp(),
                stockUpdated: true
            })
            notify.success('Inventory updated and PO marked received')
            const reloadId = po.vendorId || selectedVendor?.id
            if (reloadId) await loadVendorOrders(reloadId)
            if (onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Error marking PO received:', error)
            notify.error('Failed to update inventory for this PO')
        }
    }

    const handleCancelVendorOrder = async (po) => {
        try {
            const db = getDb()
            const qty = parseFloat(po.quantityMeters) || 0
            const shouldRollback = po.stockUpdated && po.fabricId && qty > 0

            if (shouldRollback) {
                // Roll back inventory if this PO had already been received
                await updateDoc(doc(db, 'fabrics', po.fabricId), {
                    currentLength: increment(-qty),
                    totalLength: increment(-qty),
                    updatedAt: serverTimestamp()
                })
            }

            await updateDoc(doc(db, 'vendor_orders', po.id), {
                status: 'Cancelled',
                stockUpdated: shouldRollback ? false : po.stockUpdated,
                cancelledAt: serverTimestamp()
            })

            notify.success(shouldRollback ? 'PO cancelled and inventory rolled back' : 'PO cancelled')
            const reloadId = po.vendorId || selectedVendor?.id
            if (reloadId) await loadVendorOrders(reloadId)
            if (shouldRollback && onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Error cancelling PO:', error)
            notify.error('Failed to cancel PO')
        }
    }

    const handleDeleteVendorOrder = async (po) => {
        if (!confirm('Delete this purchase order?')) return
        try {
            const db = getDb()
            await deleteDoc(doc(db, 'vendor_orders', po.id))
            notify.success('PO deleted')
            const reloadId = po.vendorId || selectedVendor?.id
            if (reloadId) await loadVendorOrders(reloadId)
        } catch (error) {
            console.error('Error deleting PO:', error)
            notify.error('Failed to delete PO')
        }
    }

    const handleDeleteVendor = async (vendorId) => {
        const vendor = vendors.find(v => v.id === vendorId)
            const linkedFabrics = inventoryItems.filter(item => item?.type === 'fabric' && item?.linkedVendors?.includes(vendorId))
        
        if (linkedFabrics.length > 0) {
            if (!confirm(`This vendor has ${linkedFabrics.length} linked fabric(s). Deleting will remove the vendor link. Continue?`)) {
                return
            }
        } else {
            if (!confirm(`Delete vendor "${vendor.name}"?`)) {
                return
            }
        }

        try {
            const db = getDb()
            
            // Remove vendor link from fabrics
            for (const fabric of linkedFabrics) {
                    const updated = fabric.linkedVendors.filter(v => v !== vendorId)
                await updateDoc(doc(db, 'fabrics', fabric.id), {
                        linkedVendors: updated,
                    updatedAt: serverTimestamp()
                })
            }
            
            // Delete vendor
            await deleteDoc(doc(db, 'vendors', vendorId))
            
            notify.success('Vendor deleted successfully')
            if (onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Error deleting vendor:', error)
            notify.error('Failed to delete vendor: ' + error.message)
        }
    }

    return (
        <div className="space-y-6 fade-in pb-20">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-white">Vendor Management</h2>
                    <p className="text-sm text-lime-glow/70 mt-1">Track suppliers and fabric sources</p>
                </div>
                <button
                    onClick={startAddVendor}
                    className="bg-lime-glow text-emerald-pine px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg hover:shadow-xl active:scale-95 transition-all"
                >
                    <Plus className="w-4 h-4" /> Add Vendor
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <input
                    className="w-full p-3 pl-10 bg-white rounded-xl border-2 border-lime-glow shadow-sm text-sm text-gray-900 placeholder-gray-400"
                    placeholder="Search vendors..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            </div>

            {/* At-a-glance summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-emerald-900/50 border border-lime-glow/30 shadow-sm">
                    <p className="text-[11px] uppercase text-lime-glow/70 font-bold">Vendors</p>
                    <p className="text-2xl font-extrabold text-white">{dashboardSummary.totalVendors}</p>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-900/50 border border-lime-glow/30 shadow-sm">
                    <p className="text-[11px] uppercase text-lime-glow/70 font-bold">Linked Fabrics</p>
                    <p className="text-2xl font-extrabold text-white">{dashboardSummary.totalFabrics}</p>
                </div>
                <div className="p-4 rounded-2xl bg-amber-900/50 border border-amber-400/40 shadow-sm">
                    <p className="text-[11px] uppercase text-amber-200/80 font-bold">Low Stock (≤10m)</p>
                    <p className="text-2xl font-extrabold text-amber-100">{dashboardSummary.lowStock}</p>
                </div>
                <div className="p-4 rounded-2xl bg-indigo-900/40 border border-indigo-400/30 shadow-sm">
                    <p className="text-[11px] uppercase text-indigo-200/80 font-bold">Pending POs</p>
                    <p className="text-2xl font-extrabold text-white">{dashboardSummary.pendingOrders}</p>
                </div>
            </div>

            {/* Vendor Grid - Square Layout */}
            <div className="grid grid-cols-2 gap-4 p-2">
                {filteredVendors.map(vendor => {
                    const poList = vendorOrders[vendor.id] || []
                    const pendingCount = poList.filter(po => po.status !== 'Received').length
                    const fabricCount = vendor.totalFabrics || 0
                    const vendorFabricList = inventoryItems.filter(item => item?.type === 'fabric' && item?.linkedVendors?.includes(vendor.id))
                    const availableMeters = vendorFabricList.reduce((sum, f) => sum + (parseFloat(f.currentLength) || 0), 0)
                    const fabricThumbs = vendorFabricList.filter(f => f.imageUrl).slice(0, 3)
                    
                    return (
                        <div
                            key={vendor.id}
                            className="relative aspect-square rounded-2xl overflow-hidden shadow-md bg-gradient-to-br from-emerald-900 to-emerald-950 cursor-pointer hover:shadow-lg transition-all border-2 border-lime-glow/30 hover:border-lime-glow/60"
                            onClick={async () => {
                                const isSame = selectedVendor?.id === vendor.id
                                setSelectedVendor(isSame ? null : vendor)
                                if (!isSame) {
                                    await loadVendorOrders(vendor.id)
                                }
                            }}
                        >
                            {/* Background accent */}
                            <div className="absolute top-0 right-0 w-20 h-20 bg-lime-glow/10 rounded-full -mr-8 -mt-8"></div>
                            
                            {/* Content */}
                            <div className="absolute inset-0 p-4 flex flex-col justify-between z-10">
                                {/* Top section - Vendor name and badges */}
                                <div>
                                    <h3 className="text-lg font-bold text-lime-glow truncate">{vendor.name}</h3>
                                    <p className="text-xs text-white/70 mt-1 line-clamp-2">{vendor.contactPerson || 'No contact'}</p>

                                    {/* Fabric thumbnails */}
                                    {(fabricThumbs.length > 0 || vendorFabricList.length > 0) && (
                                        <div className="flex gap-2 mt-3">
                                            {(fabricThumbs.length ? fabricThumbs : vendorFabricList.slice(0, 3)).map(f => (
                                                <div key={f.id} className="w-9 h-9 rounded-xl overflow-hidden border border-lime-glow/40 shadow-sm bg-emerald-900/60 flex items-center justify-center text-[11px] font-bold text-white/80">
                                                    {f.imageUrl ? (
                                                        <img src={f.imageUrl} alt={f.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        (f.name || '?').slice(0, 2).toUpperCase()
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Bottom section - Stats */}
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-white/80">📦 Fabrics:</span>
                                        <span className="font-bold text-lime-glow">{fabricCount}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-white/80">🧵 Available:</span>
                                        <span className="font-bold text-white">{availableMeters.toFixed(1)}m</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-white/80">📋 Pending:</span>
                                        <span className={`font-bold ${pendingCount > 0 ? 'text-amber-300' : 'text-white/60'}`}>{pendingCount}</span>
                                    </div>
                                    {vendor.totalValue > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-white/80">Value:</span>
                                            <span className="font-bold text-emerald-200">₹{(vendor.totalValue / 1000).toFixed(0)}k</span>
                                        </div>
                                    )}
                                    <div className="flex gap-1 mt-2">
                                        {vendor.leadTimeDays && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-700/60 text-emerald-100">Lead: {vendor.leadTimeDays}d</span>
                                        )}
                                        {vendor.lowStockFabrics?.length > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-900/60 text-amber-100">Low: {vendor.lowStockFabrics.length}</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Action buttons - Top right */}
                            <div className="absolute top-2 right-2 flex gap-1 z-20">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingVendor(vendor)
                                        setVendorForm({
                                            name: vendor.name || '',
                                            contactPerson: vendor.contactPerson || '',
                                            phone: vendor.phone || '',
                                            email: vendor.email || '',
                                            address: vendor.address || '',
                                            paymentTerms: vendor.paymentTerms || 'Cash',
                                            leadTimeDays: vendor.leadTimeDays || '',
                                            notes: vendor.notes || ''
                                        })
                                        setShowAddVendor(true)
                                    }}
                                    className="p-2 rounded-lg bg-emerald-900/70 hover:bg-emerald-800/90 text-emerald-100 active:scale-95 transition-all"
                                >
                                    ✏️
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleDeleteVendor(vendor.id)
                                    }}
                                    className="p-2 rounded-lg bg-red-900/50 hover:bg-red-900/70 text-red-400 active:scale-95 transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {filteredVendors.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                    {searchTerm ? `No vendors match "${searchTerm}"` : 'No vendors yet. Add one to get started!'}
                </div>
            )}

            {/* Vendor Detail Modal */}
            {selectedVendor && (
                <div className="fixed inset-0 bg-black/70 z-[50] flex items-end sm:items-center justify-center backdrop-blur-sm">
                    <div className="bg-gray-950 w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col border-2 border-lime-glow/40">
                        <div className="p-6 border-b border-lime-glow/40 bg-emerald-pine flex items-center justify-between flex-shrink-0 sticky top-0">
                            <h3 className="text-xl font-bold text-white">{selectedVendor.name}</h3>
                            <button
                                onClick={() => { setSelectedVendor(null); setExistingFabricId('') }}
                                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Contact Information */}
                            <div>
                                <h4 className="text-lg font-bold text-lime-glow mb-3">Contact Information</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {selectedVendor.phone && (
                                        <a
                                            href={`tel:${selectedVendor.phone}`}
                                            className="p-4 rounded-xl bg-emerald-900/40 border border-lime-glow/20 hover:bg-emerald-900/60 transition-all"
                                        >
                                            <p className="text-xs text-white/70 font-semibold uppercase mb-1">📱 Phone</p>
                                            <p className="text-sm font-bold text-lime-glow">{selectedVendor.phone}</p>
                                        </a>
                                    )}
                                    {selectedVendor.email && (
                                        <a
                                            href={`mailto:${selectedVendor.email}`}
                                            className="p-4 rounded-xl bg-emerald-900/40 border border-lime-glow/20 hover:bg-emerald-900/60 transition-all"
                                        >
                                            <p className="text-xs text-white/70 font-semibold uppercase mb-1">📧 Email</p>
                                            <p className="text-sm font-bold text-lime-glow truncate">{selectedVendor.email}</p>
                                        </a>
                                    )}
                                    {selectedVendor.address && (
                                        <div className="p-4 rounded-xl bg-emerald-900/40 border border-lime-glow/20">
                                            <p className="text-xs text-white/70 font-semibold uppercase mb-1">📍 Address</p>
                                            <p className="text-sm text-white font-semibold">{selectedVendor.address}</p>
                                        </div>
                                    )}
                                    {selectedVendor.paymentTerms && (
                                        <div className="p-4 rounded-xl bg-emerald-900/40 border border-lime-glow/20">
                                            <p className="text-xs text-white/70 font-semibold uppercase mb-1">💳 Payment Terms</p>
                                            <p className="text-sm font-bold text-lime-glow">{selectedVendor.paymentTerms}</p>
                                        </div>
                                    )}
                                    {selectedVendor.leadTimeDays && (
                                        <div className="p-4 rounded-xl bg-emerald-900/40 border border-lime-glow/20">
                                            <p className="text-xs text-white/70 font-semibold uppercase mb-1">⏱️ Lead Time</p>
                                            <p className="text-sm font-bold text-lime-glow">{selectedVendor.leadTimeDays} days</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Price history check */}
                            {vendorPriceStats && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="p-4 rounded-xl bg-emerald-900/40 border border-lime-glow/20">
                                        <p className="text-[11px] uppercase text-lime-glow/70 font-bold">Last price</p>
                                        <p className="text-lg font-extrabold text-white">₹{vendorPriceStats.lastPrice.toFixed(0)}/m</p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-emerald-900/40 border border-lime-glow/20">
                                        <p className="text-[11px] uppercase text-lime-glow/70 font-bold">Average</p>
                                        <p className="text-lg font-extrabold text-white">₹{vendorPriceStats.avg.toFixed(0)}/m</p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-emerald-900/40 border border-lime-glow/20">
                                        <p className="text-[11px] uppercase text-lime-glow/70 font-bold">Best rate</p>
                                        <p className="text-lg font-extrabold text-emerald-200">₹{vendorPriceStats.best.toFixed(0)}/m</p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-emerald-900/40 border border-lime-glow/20">
                                        <p className="text-[11px] uppercase text-lime-glow/70 font-bold">Price vs avg</p>
                                        <p className={`text-lg font-extrabold ${vendorPriceStats.deltaPercent > 8 ? 'text-red-300' : vendorPriceStats.deltaPercent < -5 ? 'text-emerald-200' : 'text-white'}`}>
                                            {vendorPriceStats.deltaPercent >= 0 ? '+' : ''}{vendorPriceStats.deltaPercent.toFixed(1)}%
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* New / Edit purchase order */}
                            <div className="p-5 rounded-xl bg-emerald-900/40 border-2 border-lime-glow/30 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-lg font-bold text-lime-glow">{editingPoId ? 'Edit Purchase Order' : 'New Purchase Order'}</h4>
                                        {editingPoId && (
                                            <span className="px-2 py-1 text-[11px] rounded-lg bg-amber-900/50 border border-amber-500/40 text-amber-100">Editing</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] text-white/70">
                                        <span>Auto-saves to history</span>
                                        {editingPoId && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingPoId(null)
                                                    setOrderForm({ fabricName: '', fabricId: '', quantityMeters: '', costPerMeter: '', status: 'Placed', etaDate: '', etaDays: '', notes: '' })
                                                }}
                                                className="px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20"
                                            >
                                                Cancel edit
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <form onSubmit={handleAddVendorOrder} className="space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-lime-glow uppercase">Fabric name *</label>
                                            <input
                                                required
                                                className="w-full p-3 bg-emerald-950/60 text-white rounded-xl border-2 border-lime-glow/30 font-semibold"
                                                placeholder="e.g. Cotton poplin"
                                                value={orderForm.fabricName}
                                                onChange={e => setOrderForm({ ...orderForm, fabricName: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-lime-glow uppercase">Link to existing fabric (linked to this vendor)</label>
                                            <select
                                                className="w-full p-3 bg-emerald-950/60 text-white rounded-xl border-2 border-lime-glow/30 font-semibold"
                                                value={orderForm.fabricId}
                                                onChange={e => {
                                                    const id = e.target.value
                                                    const linked = vendorFabrics.find(f => f.id === id)
                                                    setOrderForm({
                                                        ...orderForm,
                                                        fabricId: id,
                                                        fabricName: linked?.name || orderForm.fabricName
                                                    })
                                                }}
                                                disabled={vendorFabrics.length === 0}
                                            >
                                                <option value="">{vendorFabrics.length ? '(Optional) Choose linked fabric' : 'No linked fabrics yet'}</option>
                                                {vendorFabrics.map(f => (
                                                    <option key={f.id} value={f.id}>
                                                        {f.name} • {(parseFloat(f.currentLength) || 0).toFixed(1)}m @ ₹{(parseFloat(f.costPerMeter) || 0).toFixed(0)}/m
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-lime-glow uppercase">Qty (m) *</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                className="w-full p-3 bg-emerald-950/60 text-white rounded-xl border-2 border-lime-glow/30 font-semibold"
                                                placeholder="e.g. 50"
                                                value={orderForm.quantityMeters}
                                                onChange={e => setOrderForm({ ...orderForm, quantityMeters: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-lime-glow uppercase">Cost per meter *</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                className="w-full p-3 bg-emerald-950/60 text-white rounded-xl border-2 border-lime-glow/30 font-semibold"
                                                placeholder="e.g. 180"
                                                value={orderForm.costPerMeter}
                                                onChange={e => setOrderForm({ ...orderForm, costPerMeter: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-lime-glow uppercase">ETA (days)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full p-3 bg-emerald-950/60 text-white rounded-xl border-2 border-lime-glow/30 font-semibold"
                                                placeholder={`Default ${selectedVendor.leadTimeDays || 0}`}
                                                value={orderForm.etaDays}
                                                onChange={e => setOrderForm({ ...orderForm, etaDays: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-lime-glow uppercase">Status</label>
                                            <select
                                                className="w-full p-3 bg-emerald-950/60 text-white rounded-xl border-2 border-lime-glow/30 font-semibold"
                                                value={orderForm.status}
                                                onChange={e => setOrderForm({ ...orderForm, status: e.target.value })}
                                            >
                                                <option value="Placed">Placed</option>
                                                <option value="Received">Received</option>
                                                <option value="Cancelled">Cancelled</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-lime-glow uppercase">Notes</label>
                                            <textarea
                                                className="w-full p-3 bg-emerald-950/60 text-white rounded-xl border-2 border-lime-glow/30 font-semibold min-h-[72px]"
                                                placeholder="Payment terms, delivery details, etc."
                                                value={orderForm.notes}
                                                onChange={e => setOrderForm({ ...orderForm, notes: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-white/70 text-sm">
                                        <span>ETA preview: {etaPreview || 'Not set'}</span>
                                        <span>Total: ₹{((parseFloat(orderForm.quantityMeters) || 0) * (parseFloat(orderForm.costPerMeter) || 0)).toFixed(0)}</span>
                                    </div>

                                    <button
                                        type="submit"
                                        className="w-full py-3 bg-lime-glow text-emerald-pine rounded-xl font-bold hover:shadow-lg active:scale-95 transition-all"
                                    >
                                        {editingPoId ? 'Update Purchase Order' : 'Save Purchase Order'}
                                    </button>
                                </form>
                            </div>

                            {/* Linked Fabrics */}
                            <div>
                                <h4 className="text-lg font-bold text-lime-glow mb-3">Linked Fabrics ({vendorFabrics.length})</h4>
                                {vendorFabrics.length === 0 ? (
                                    <p className="text-white/70">No fabrics linked yet. Link existing fabrics below.</p>
                                ) : (
                                    <div className="grid grid-cols-1 gap-3">
                                        {vendorFabrics.map(fabric => (
                                            <div key={fabric.id} className="p-4 rounded-xl bg-emerald-900/30 border border-lime-glow/20 flex justify-between items-start">
                                                <div>
                                                    <h5 className="font-bold text-white mb-2">{fabric.name}</h5>
                                                    <div className="text-xs text-white/80 space-y-1">
                                                        <p>📏 <span className="font-semibold">{(parseFloat(fabric.currentLength) || 0).toFixed(1)}m</span> available</p>
                                                        <p>💰 <span className="font-semibold">₹{(parseFloat(fabric.costPerMeter) || 0).toFixed(0)}/m</span></p>
                                                        <p>📍 <span className="font-semibold">{fabric.location || 'N/A'}</span></p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        if (confirm(`Unlink "${fabric.name}" from this vendor?`)) {
                                                            const db = getDb()
                                                            // Get all vendors currently linked to this fabric
                                                            const fabricDoc = inventoryItems.find(f => f.id === fabric.id)
                                                            const linkedVendors = fabricDoc?.linkedVendors || []
                                                            const updated = linkedVendors.filter(v => v !== selectedVendor.id)
                                                            await updateDoc(doc(db, 'fabrics', fabric.id), {
                                                                linkedVendors: updated,
                                                                updatedAt: serverTimestamp()
                                                            })
                                                            await loadVendorOrders(selectedVendor.id)
                                                            if (onDataChanged) await onDataChanged()
                                                        }
                                                    }}
                                                    className="p-2 rounded-lg bg-red-900/50 hover:bg-red-900/70 text-red-400 active:scale-95 transition-all flex-shrink-0"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Link existing fabric */}
                            <div className="p-5 rounded-xl bg-emerald-pine/20 border-2 border-lime-glow/30 space-y-3">
                                <p className="text-sm font-bold text-lime-glow uppercase">Link Fabric to {selectedVendor.name}</p>
                                {unlinkedFabrics.length === 0 ? (
                                    <p className="text-white/70">No fabrics available.</p>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        <select
                                            className="flex-1 p-3 bg-emerald-950/60 text-white rounded-xl border-2 border-lime-glow/40 font-semibold text-sm"
                                            value={existingFabricId}
                                            onChange={e => setExistingFabricId(e.target.value)}
                                        >
                                            <option value="">Select a fabric...</option>
                                            {unlinkedFabrics.map(f => (
                                                <option key={f.id} value={f.id}>
                                                    {f.name} • {(parseFloat(f.currentLength) || 0).toFixed(1)}m @ ₹{(parseFloat(f.costPerMeter) || 0).toFixed(0)}/m
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => handleLinkFabric(existingFabricId, selectedVendor.id)}
                                            disabled={!existingFabricId}
                                            className="px-6 py-3 bg-lime-glow text-emerald-pine rounded-xl font-bold disabled:opacity-50 hover:shadow-lg active:scale-95 transition-all text-sm"
                                        >
                                            Link Fabric
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Purchase Orders */}
                            <div>
                                <h4 className="text-lg font-bold text-lime-glow mb-3">Purchase Orders</h4>
                                {(vendorOrders[selectedVendor.id] || []).length === 0 ? (
                                    <p className="text-white/70">No purchase orders yet.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {(vendorOrders[selectedVendor.id] || []).map(po => (
                                            <div key={po.id} className="p-4 rounded-xl bg-emerald-900/30 border border-lime-glow/20">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <p className="font-bold text-white text-sm">{po.fabricName}</p>
                                                        <p className="text-xs text-white/70">{po.quantityMeters}m @ ₹{po.costPerMeter}/m</p>
                                                    </div>
                                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${po.status === 'Received' ? 'bg-emerald-600/30 text-emerald-100' : 'bg-amber-600/30 text-amber-100'}`}>
                                                        {po.status}
                                                    </span>
                                                </div>
                                                {po.etaDate && (
                                                    <p className="text-xs text-white/60">ETA: {new Date(po.etaDate).toLocaleDateString('en-IN')}</p>
                                                )}
                                                <div className="flex gap-2 mt-3 text-[11px]">
                                                    {po.status !== 'Received' && po.status !== 'Cancelled' && (
                                                        <button
                                                            onClick={() => handleMarkOrderReceived(po)}
                                                            className="px-3 py-1 rounded-lg bg-emerald-700/60 border border-emerald-500/60 text-emerald-100 font-semibold hover:bg-emerald-700/80"
                                                        >
                                                            ✓ Mark Received
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            setEditingPoId(po.id)
                                                            setOrderForm({
                                                                fabricName: po.fabricName || '',
                                                                fabricId: po.fabricId || '',
                                                                quantityMeters: (po.quantityMeters || '').toString(),
                                                                costPerMeter: (po.costPerMeter || '').toString(),
                                                                status: po.status || 'Placed',
                                                                etaDate: po.etaDate || '',
                                                                etaDays: (po.etaDays || '').toString(),
                                                                notes: po.notes || ''
                                                            })
                                                        }}
                                                        className="px-3 py-1 rounded-lg bg-emerald-900/50 border border-lime-glow/30 text-lime-glow font-semibold hover:bg-emerald-800/70"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleCancelVendorOrder(po)}
                                                        className="px-3 py-1 rounded-lg bg-red-900/40 border border-red-500/40 text-red-200 font-semibold hover:bg-red-900/60"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Vendor Modal */}
            {showAddVendor && (
                <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center backdrop-blur-sm">
                    <div className="bg-gray-950 w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col border-2 border-lime-glow/40">
                        <div className="p-6 border-b border-lime-glow/40 bg-emerald-pine flex items-center justify-between flex-shrink-0">
                            <h3 className="text-xl font-bold text-white">{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</h3>
                            <button
                                onClick={() => { setShowAddVendor(false); setEditingVendor(null) }}
                                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveVendor} className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase">Vendor Name *</label>
                                <input
                                    required
                                    className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                    placeholder="e.g. Mumbai Fabrics Ltd"
                                    value={vendorForm.name}
                                    onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase">Contact Person</label>
                                <input
                                    className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                    placeholder="e.g. Rajesh Kumar"
                                    value={vendorForm.contactPerson}
                                    onChange={e => setVendorForm({ ...vendorForm, contactPerson: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Phone</label>
                                    <input
                                        type="tel"
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                        placeholder="+91 98765 43210"
                                        value={vendorForm.phone}
                                        onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Email</label>
                                    <input
                                        type="email"
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                        placeholder="vendor@example.com"
                                        value={vendorForm.email}
                                        onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase">Address</label>
                                <textarea
                                    className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                    placeholder="Full address..."
                                    rows="2"
                                    value={vendorForm.address}
                                    onChange={e => setVendorForm({ ...vendorForm, address: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase">Payment Terms</label>
                                <select
                                    className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                    value={vendorForm.paymentTerms}
                                    onChange={e => setVendorForm({ ...vendorForm, paymentTerms: e.target.value })}
                                >
                                    <option value="Cash">Cash on Delivery</option>
                                    <option value="Net 7">Net 7 Days</option>
                                    <option value="Net 15">Net 15 Days</option>
                                    <option value="Net 30">Net 30 Days</option>
                                    <option value="Advance">Advance Payment</option>
                                    <option value="Credit">On Credit</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase">Lead Time (days)</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                    placeholder="e.g. 7"
                                    value={vendorForm.leadTimeDays}
                                    onChange={e => setVendorForm({ ...vendorForm, leadTimeDays: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase">Notes</label>
                                <textarea
                                    className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                    placeholder="Additional notes about vendor..."
                                    rows="3"
                                    value={vendorForm.notes}
                                    onChange={e => setVendorForm({ ...vendorForm, notes: e.target.value })}
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-lime-glow text-emerald-pine py-3 rounded-xl font-bold shadow-lg hover:bg-lime-glow/90 active:scale-95 transition-all"
                            >
                                {editingVendor ? 'Save Changes' : 'Add Vendor'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Fabric (from Vendor) Modal */}
            {showAddFabric && selectedVendor && (
                <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center backdrop-blur-sm">
                    <div className="bg-gray-950 w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col border-2 border-lime-glow/40">
                        <div className="p-6 border-b border-lime-glow/40 bg-emerald-pine flex items-center justify-between flex-shrink-0">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-emerald-100/80 font-semibold">Add Fabric for Vendor</p>
                                <h3 className="text-xl font-extrabold text-white leading-tight">{selectedVendor.name}</h3>
                            </div>
                            <button
                                onClick={() => setShowAddFabric(false)}
                                className="w-10 h-10 rounded-full bg-emerald-900/50 border border-emerald-700/50 flex items-center justify-center text-emerald-100 hover:bg-emerald-800/80"
                            >
                                <span className="text-2xl leading-none">×</span>
                            </button>
                        </div>

                        <form onSubmit={handleAddFabricFromVendor} className="p-6 space-y-4 overflow-y-auto">
                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase">Fabric Name</label>
                                <input
                                    required
                                    className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                    placeholder="e.g. Green Silk"
                                    value={fabricForm.name}
                                    onChange={e => setFabricForm({ ...fabricForm, name: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Total Length (m)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        required
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                        placeholder="10.5"
                                        value={fabricForm.totalLength}
                                        onChange={e => setFabricForm({ ...fabricForm, totalLength: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Cost per Meter (₹)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                        placeholder="450"
                                        value={fabricForm.costPerMeter}
                                        onChange={e => setFabricForm({ ...fabricForm, costPerMeter: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Length / Outfit (m)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                        placeholder="2.5"
                                        value={fabricForm.lengthRequiredPerOutfit}
                                        onChange={e => setFabricForm({ ...fabricForm, lengthRequiredPerOutfit: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Location</label>
                                    <input
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                        placeholder="Shelf A3"
                                        value={fabricForm.location}
                                        onChange={e => setFabricForm({ ...fabricForm, location: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Transport Cost (₹)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                        placeholder="0.00"
                                        value={fabricForm.transportCost}
                                        onChange={e => setFabricForm({ ...fabricForm, transportCost: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Other Costs (₹)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                        placeholder="0.00"
                                        value={fabricForm.otherCosts}
                                        onChange={e => setFabricForm({ ...fabricForm, otherCosts: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Invoice #</label>
                                    <input
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                        placeholder="INV-001"
                                        value={fabricForm.invoiceNumber}
                                        onChange={e => setFabricForm({ ...fabricForm, invoiceNumber: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Purchase Date</label>
                                    <input
                                        type="date"
                                        className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-lime-glow/40 font-semibold mt-1"
                                        value={fabricForm.purchaseDate}
                                        onChange={e => setFabricForm({ ...fabricForm, purchaseDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            {(fabricForm.costPerMeter && fabricForm.totalLength && (fabricForm.transportCost || fabricForm.otherCosts)) && (
                                <div className="bg-emerald-pine/30 border border-lime-glow/30 p-3 rounded-xl">
                                    <p className="text-[11px] text-lime-200/80 uppercase font-bold mb-1">Actual Cost/Meter</p>
                                    <p className="text-xl font-bold text-lime-200">
                                        ₹{
                                            (
                                                (parseFloat(fabricForm.costPerMeter || 0)) +
                                                ((parseFloat(fabricForm.transportCost || 0) + parseFloat(fabricForm.otherCosts || 0)) / (parseFloat(fabricForm.totalLength || 1)))
                                            ).toFixed(2)
                                        }
                                    </p>
                                    <p className="text-[11px] text-white/60 mt-1">
                                        Base: ₹{parseFloat(fabricForm.costPerMeter || 0).toFixed(2)} + Added: ₹{((parseFloat(fabricForm.transportCost || 0) + parseFloat(fabricForm.otherCosts || 0)) / (parseFloat(fabricForm.totalLength || 1))).toFixed(2)}
                                    </p>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddFabric(false)}
                                    className="flex-1 py-3 rounded-xl border border-emerald-700/60 bg-emerald-900/40 text-emerald-100 font-semibold hover:border-emerald-400/80 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-lime-400 to-emerald-300 text-emerald-900 font-black shadow-lg hover:shadow-xl active:scale-95 transition"
                                >
                                    Save Fabric
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
