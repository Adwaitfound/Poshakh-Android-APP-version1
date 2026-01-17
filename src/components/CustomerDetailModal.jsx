import React, { useState, useMemo } from 'react'
import { Edit2, Save, X, AlertTriangle, Package, Trash2 } from 'lucide-react'
import { getDb } from '../firebase'
import { doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { parsePrice, formatCurrency } from '../lib/utils'

export default function CustomerDetailModal({ customer, onClose, allOrders = [], inventoryItems = [], onDataChanged, onAddOrder }) {
    const [isEditing, setIsEditing] = useState(false)
    const [editForm, setEditForm] = useState({
        name: customer?.name || '',
        phone: customer?.phone || '',
        address: customer?.address || '',
        email: customer?.email || '',
        city: customer?.city || '',
        state: customer?.state || ''
    })
    const [saving, setSaving] = useState(false)

    // Get outfit options from inventory
    const outfitOptions = useMemo(() => {
        return inventoryItems.filter(item => item.type === 'outfit')
    }, [inventoryItems])

    // Get customer orders with outfit name matching
    const customerOrders = useMemo(() => {
        if (!customer) return []
        const name = customer.name.toLowerCase().trim()
        return allOrders
            .filter(o => o.customerName && o.customerName.toLowerCase().trim() === name)
            .map(order => {
                const outfitName = order.outfitName || order.productName || ''
                const matchesInventory = outfitOptions.some(o => o.name.toLowerCase() === outfitName.toLowerCase())
                return { ...order, matchesInventory, outfitName }
            })
            .sort((a, b) => {
                const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
                const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
                return dateB - dateA
            })
    }, [customer, allOrders, outfitOptions])

    const unmatchedOrders = customerOrders.filter(o => !o.matchesInventory && o.outfitName)

    // Calculate customer summary statistics
    const customerStats = useMemo(() => {
        const getOrderCost = (order) => {
            // Priority: importedData Order Total > orderTotal > finalSellingPrice > Product Price > Total
            if (order.importedData?.['Order Total']) {
                const orderTotal = String(order.importedData['Order Total']).replace(/[^0-9.-]/g, '')
                const parsed = parseFloat(orderTotal)
                if (!isNaN(parsed) && parsed > 0) return parsed
            }
            if (order.orderTotal) return parseFloat(order.orderTotal)
            if (order.finalSellingPrice) return parseFloat(order.finalSellingPrice)
            if (order.importedData?.['Product Price']) {
                const price = String(order.importedData['Product Price']).replace(/[^0-9.-]/g, '')
                return parseFloat(price) || 0
            }
            if (order.importedData?.['Total']) {
                const total = String(order.importedData['Total']).replace(/[^0-9.-]/g, '')
                return parseFloat(total) || 0
            }
            return 0
        }

        const totalSpent = customerOrders.reduce((sum, order) => sum + getOrderCost(order), 0)
        const totalOrders = customerOrders.length
        const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0
        const completedOrders = customerOrders.filter(o => o.status === 'Order Shipped (Completed)').length

        return { totalSpent, totalOrders, avgOrderValue, completedOrders }
    }, [customerOrders])

    // Calculate average profit percent per outfit
    const outfitProfitStats = useMemo(() => {
        const getOrderCost = (order) => {
            if (order.importedData?.['Order Total']) {
                const orderTotal = String(order.importedData['Order Total']).replace(/[^0-9.-]/g, '')
                const parsed = parseFloat(orderTotal)
                if (!isNaN(parsed) && parsed > 0) return parsed
            }
            if (order.orderTotal) return parseFloat(order.orderTotal)
            if (order.finalSellingPrice) return parseFloat(order.finalSellingPrice)
            if (order.importedData?.['Product Price']) {
                const price = String(order.importedData['Product Price']).replace(/[^0-9.-]/g, '')
                return parseFloat(price) || 0
            }
            if (order.importedData?.['Total']) {
                const total = String(order.importedData['Total']).replace(/[^0-9.-]/g, '')
                return parseFloat(total) || 0
            }
            return 0
        }

        const getTotalCost = (order) => {
            const qty = parseInt(order.quantity) || 1
            const stitch = parseFloat(order.stitchingCost)
            const stitchPer = parseFloat(order.stitchingCostPerPiece)
            const fabric = parseFloat(order.fabricCost)
            const fabricPer = parseFloat(order.fabricCostPerPiece)

            const stitchTotal = (!Number.isNaN(stitch) && stitch > 0) ? stitch : ((!Number.isNaN(stitchPer) && stitchPer > 0) ? stitchPer * qty : 0)
            const fabricTotal = (!Number.isNaN(fabric) && fabric > 0) ? fabric : ((!Number.isNaN(fabricPer) && fabricPer > 0) ? fabricPer * qty : 0)

            const delivery = parseFloat(order.deliveryCost) || 0
            const acquisition = parseFloat(order.acquisitionCost) || 0
            const cod = parseFloat(order.codCharge) || 0

            return stitchTotal + fabricTotal + delivery + acquisition + cod
        }

        const profitByOutfit = {}

        customerOrders.forEach(order => {
            const outfitName = order.outfitName || 'Unknown'
            const sellingPrice = getOrderCost(order)
            const totalCost = getTotalCost(order)
            const profit = sellingPrice - totalCost

            if (!profitByOutfit[outfitName]) {
                profitByOutfit[outfitName] = {
                    orders: [],
                    totalProfit: 0,
                    totalSelling: 0
                }
            }

            profitByOutfit[outfitName].orders.push(order)
            profitByOutfit[outfitName].totalProfit += profit
            profitByOutfit[outfitName].totalSelling += sellingPrice
        })

        // Calculate average profit percent
        const stats = {}
        Object.entries(profitByOutfit).forEach(([outfit, data]) => {
            const avgProfitPercent = data.totalSelling > 0 ? (data.totalProfit / data.totalSelling) * 100 : 0
            stats[outfit] = {
                count: data.orders.length,
                avgProfitPercent: avgProfitPercent,
                totalProfit: data.totalProfit
            }
        })

        return stats
    }, [customerOrders])

    const handleSaveCustomer = async () => {
        if (!editForm.name.trim()) {
            alert('Customer name is required')
            return
        }

        setSaving(true)
        try {
            const db = getDb()
            // Update all orders with this customer's name
            const updates = customerOrders.map(order =>
                updateDoc(doc(db, 'production_orders', order.id), {
                    customerName: editForm.name,
                    phone: editForm.phone || order.phone,
                    address: editForm.address || order.address,
                    email: editForm.email || order.email,
                    city: editForm.city || order.city,
                    state: editForm.state || order.state
                })
            )
            await Promise.all(updates)
            alert('Customer information updated!')
            setIsEditing(false)
        } catch (error) {
            console.error('Error updating customer:', error)
            alert('Error updating customer: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    const handleUpdateOutfitName = async (orderId, newOutfitName, newSize) => {
        if (!newOutfitName) return

        // Find the outfit in inventory to get its image
        const outfit = inventoryItems.find(item =>
            item.type === 'outfit' && item.name.toLowerCase() === newOutfitName.toLowerCase()
        )

        try {
            const db = getDb()
            const updateData = {
                outfitName: newOutfitName,
                imageUrl: outfit?.imageUrl || ''
            }

            // Update size if provided
            if (newSize) {
                updateData.size = newSize
            }

            // Keep the customer's original order total - do not overwrite with default outfit cost

            await updateDoc(doc(db, 'production_orders', orderId), updateData)
            alert(`Order updated!\nOutfit: ${newOutfitName}${newSize ? `\nSize: ${newSize}` : ''}\n\nNote: Original order total has been preserved.`)
        } catch (error) {
            console.error('Error updating order:', error)
            alert('Error: ' + error.message)
        }
    }

    const handleDeleteOrder = async (orderId, orderNumber) => {
        const confirmed = window.confirm(
            `Are you sure you want to delete order #${orderNumber}?\n\nThis action cannot be undone.`
        )

        if (!confirmed) return

        try {
            const db = getDb()
            await deleteDoc(doc(db, 'production_orders', orderId))
            alert(`Order #${orderNumber} has been deleted successfully`)
        } catch (error) {
            console.error('Error deleting order:', error)
            alert('Error deleting order: ' + error.message)
        }
    }

    if (!customer) return null

    return (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm">
            <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-lime-glow/30 bg-black">
                <div className="bg-emerald-pine p-6 border-b border-lime-glow/40 flex justify-between items-center flex-shrink-0 text-white">
                    <h3 className="font-bold text-lg">{isEditing ? 'Edit Customer' : customer.name}</h3>
                    <div className="flex items-center gap-2">
                        {!isEditing && onAddOrder && (
                            <button
                                onClick={() => onAddOrder(customer)}
                                className="px-4 py-2 bg-lime-glow text-emerald-pine text-xs font-bold rounded-lg hover:bg-lime-glow/90 transition"
                                title="Add another order for this customer"
                            >
                                + Order
                            </button>
                        )}
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                            >
                                <Edit2 className="w-5 h-5" />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-white/80">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1 text-white">
                    {/* Edit Form */}
                    {isEditing ? (
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="text-xs font-bold text-lime-glow">Name *</label>
                                <input
                                    value={editForm.name}
                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                    className="w-full p-3 border-2 border-lime-glow/70 rounded-xl mt-1 bg-gray-900/80 text-white"
                                    placeholder="Customer name"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow">Phone *</label>
                                    <input
                                        value={editForm.phone}
                                        onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                                        className="w-full p-3 border-2 border-lime-glow/70 rounded-xl mt-1 bg-gray-900/80 text-white"
                                        placeholder="Phone number"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow">Email</label>
                                    <input
                                        value={editForm.email}
                                        onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                        className="w-full p-3 border-2 border-lime-glow/70 rounded-xl mt-1 bg-gray-900/80 text-white"
                                        placeholder="Email"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-lime-glow">Address</label>
                                <input
                                    value={editForm.address}
                                    onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                                    className="w-full p-3 border-2 border-lime-glow/70 rounded-xl mt-1 bg-gray-900/80 text-white"
                                    placeholder="Street address"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow">City</label>
                                    <input
                                        value={editForm.city}
                                        onChange={e => setEditForm({ ...editForm, city: e.target.value })}
                                        className="w-full p-3 border-2 border-lime-glow/70 rounded-xl mt-1 bg-gray-900/80 text-white"
                                        placeholder="City"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow">State</label>
                                    <input
                                        value={editForm.state}
                                        onChange={e => setEditForm({ ...editForm, state: e.target.value })}
                                        className="w-full p-3 border-2 border-lime-glow/70 rounded-xl mt-1 bg-gray-900/80 text-white"
                                        placeholder="State"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => handleSaveCustomer().catch(err => console.error(err))}
                                    disabled={saving}
                                    className="flex-1 bg-lime-glow text-emerald-pine py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <Save className="w-4 h-4" />
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button
                                    onClick={() => {
                                        setIsEditing(false)
                                        setEditForm({
                                            name: customer.name,
                                            phone: customer.phone || '',
                                            address: customer.address || '',
                                            email: customer.email || '',
                                            city: customer.city || '',
                                            state: customer.state || ''
                                        })
                                    }}
                                    className="px-6 py-3 border-2 border-lime-glow rounded-xl font-bold text-lime-glow hover:bg-lime-glow/10"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Customer Summary */}
                            <div className="bg-emerald-pine p-5 rounded-2xl text-white mb-4 shadow-lg border border-lime-glow/40">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-16 h-16 rounded-full bg-white backdrop-blur-sm flex items-center justify-center font-bold text-xl border-2 border-white/30">
                                        {customer.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-lg text-white">{customer.name}</p>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {customer.phone && (
                                                <span className="text-xs bg-white text-emerald-pine px-2 py-0.5 rounded-full">📞 {customer.phone}</span>
                                            )}
                                            {customer.email && (
                                                <span className="text-xs bg-white text-emerald-pine px-2 py-0.5 rounded-full">✉️ {customer.email}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-emerald-900/80 rounded-xl p-3 text-center border border-lime-glow/30">
                                        <p className="text-2xl font-bold text-white">₹{(customerStats.totalSpent / 1000).toFixed(1)}k</p>
                                        <p className="text-xs text-lime-glow mt-1">Total Spent</p>
                                    </div>
                                    <div className="bg-emerald-900/80 rounded-xl p-3 text-center border border-lime-glow/30">
                                        <p className="text-2xl font-bold text-white">{customerStats.totalOrders}</p>
                                        <p className="text-xs text-lime-glow mt-1">Total Orders</p>
                                    </div>
                                    <div className="bg-emerald-900/80 rounded-xl p-3 text-center border border-lime-glow/30">
                                        <p className="text-2xl font-bold text-white">₹{customerStats.avgOrderValue.toFixed(0)}</p>
                                        <p className="text-xs text-lime-glow mt-1">Avg Order</p>
                                    </div>
                                </div>
                            </div>

                            {/* Address */}
                            {customer.address && (
                                <div className="bg-gray-900/80 border border-emerald-pine/60 p-4 rounded-xl mb-4">
                                    <p className="text-xs font-bold text-lime-glow uppercase mb-1">Address</p>
                                    <p className="text-sm text-white">
                                        {customer.address}
                                        {customer.city && `, ${customer.city}`}
                                        {customer.state && `, ${customer.state}`}
                                    </p>
                                </div>
                            )}

                            {/* Imported Custom Fields */}
                            {customer.customFields && Object.keys(customer.customFields).length > 0 && (
                                <div className="mb-4">
                                    <h4 className="text-xs font-bold text-lime-glow uppercase tracking-wide mb-2 flex items-center gap-2">
                                        <span className="w-1 h-4 bg-lime-glow rounded"></span>
                                        Imported Data
                                    </h4>
                                    <div className="bg-gray-900/80 border border-emerald-pine/60 p-4 rounded-xl">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            {Object.entries(customer.customFields).map(([key, value]) => (
                                                <div key={key} className="">
                                                    <p className="text-xs text-lime-glow font-semibold">{key}</p>
                                                    <p className="text-sm text-white">{value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Unmatched Orders Warning */}
                    {!isEditing && unmatchedOrders.length > 0 && (
                        <div className="bg-amber-100 border-l-4 border-lime-glow p-4 rounded-xl mb-4 text-emerald-pine">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-emerald-pine flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <h4 className="font-bold text-emerald-pine text-sm mb-1">
                                        {unmatchedOrders.length} Order{unmatchedOrders.length > 1 ? 's' : ''} Need Outfit Matching
                                    </h4>
                                    <p className="text-xs text-emerald-pine/80">
                                        Update outfit names below to match your inventory
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Order History */}
                    {!isEditing && (
                        <div>
                            <h4 className="text-sm font-bold text-lime-glow mb-3 flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                Order History ({customerOrders.length})
                            </h4>

                            {/* Outfit Profit Stats */}
                            {Object.keys(outfitProfitStats).length > 0 && (
                                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                    {Object.entries(outfitProfitStats).map(([outfit, stats]) => (
                                        <div
                                            key={outfit}
                                            className="bg-black/50 border border-emerald-pine/60 rounded-lg p-2"
                                        >
                                            <p className="text-xs text-lime-glow/70 font-semibold truncate">{outfit}</p>
                                            <p className="text-xs text-white/70">Orders: {stats.count}</p>
                                            <p className={`text-sm font-bold ${stats.avgProfitPercent >= 0 ? 'text-lime-glow' : 'text-red-400'
                                                }`}>
                                                {stats.avgProfitPercent.toFixed(1)}% profit
                                            </p>
                                            <p className={`text-xs font-semibold ${stats.totalProfit >= 0 ? 'text-lime-glow' : 'text-red-400'
                                                }`}>
                                                ₹{Math.round(stats.totalProfit)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="space-y-3">
                                {customerOrders.map((order, idx) => (
                                    <OrderRow
                                        key={idx}
                                        order={order}
                                        outfitOptions={outfitOptions}
                                        onUpdateOutfit={handleUpdateOutfitName}
                                        onDeleteOrder={handleDeleteOrder}
                                        onDataChanged={onDataChanged}
                                    />
                                ))}
                                {customerOrders.length === 0 && (
                                    <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
                                        No orders yet
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function OrderRow({ order, outfitOptions, onUpdateOutfit, onDeleteOrder, onDataChanged }) {
    const getOrderCost = () => {
        // Priority: importedData Order Total > orderTotal > finalSellingPrice > Product Price > Total
        if (order.importedData?.['Order Total']) {
            const orderTotal = String(order.importedData['Order Total']).replace(/[^0-9.-]/g, '')
            const parsed = parseFloat(orderTotal)
            if (!isNaN(parsed) && parsed > 0) return parsed
        }
        if (order.orderTotal) return order.orderTotal
        if (order.finalSellingPrice) return order.finalSellingPrice
        if (order.importedData?.['Product Price']) {
            const price = String(order.importedData['Product Price']).replace(/[^0-9.-]/g, '')
            return parseFloat(price) || 0
        }
        if (order.importedData?.['Total']) {
            const total = String(order.importedData['Total']).replace(/[^0-9.-]/g, '')
            return parseFloat(total) || 0
        }
        return 0
    }

    const getCostWithFallback = (totalKey, perPieceKey) => {
        const qty = parseInt(order.quantity) || 1
        const total = parseFloat(order[totalKey])
        if (!Number.isNaN(total) && total > 0) return total
        const perPiece = parseFloat(order[perPieceKey])
        if (!Number.isNaN(perPiece) && perPiece > 0) return perPiece * qty
        return 0
    }

    const [editing, setEditing] = useState(false)
    const [selectedOutfit, setSelectedOutfit] = useState(order.outfitName)
    const [selectedSize, setSelectedSize] = useState(order.size || 'M')
    const [editingCosts, setEditingCosts] = useState(false)
    const [costs, setCosts] = useState({
        stitchingCost: getCostWithFallback('stitchingCost', 'stitchingCostPerPiece'),
        fabricCost: getCostWithFallback('fabricCost', 'fabricCostPerPiece'),
        deliveryCost: parseFloat(order.deliveryCost) || 0,
        acquisitionCost: parseFloat(order.acquisitionCost) || 0,
        codCharge: parseFloat(order.codCharge) || 0
    })
    const [savingCosts, setSavingCosts] = useState(false)
    const [editingPrice, setEditingPrice] = useState(false)
    const [editedPrice, setEditedPrice] = useState(getOrderCost().toString())
    const [savingPrice, setSavingPrice] = useState(false)
    const [editingPaymentMethod, setEditingPaymentMethod] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod || 'Prepaid')
    const [savingPaymentMethod, setSavingPaymentMethod] = useState(false)

    const formatDate = (date) => {
        if (!date) return 'N/A'
        const d = date.toDate ? date.toDate() : new Date(date)
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }

    const handleSaveCosts = async () => {
        if (!order || !order.id) {
            alert('Error: Order ID not found')
            return
        }

        setSavingCosts(true)
        try {
            const db = getDb()
            if (!db) {
                alert('Error: Database not initialized')
                return
            }

            await updateDoc(doc(db, 'production_orders', order.id), {
                stitchingCost: parseFloat(costs.stitchingCost) || 0,
                fabricCost: parseFloat(costs.fabricCost) || 0,
                deliveryCost: parseFloat(costs.deliveryCost) || 0,
                acquisitionCost: parseFloat(costs.acquisitionCost) || 0,
                codCharge: parseFloat(costs.codCharge) || 0
            })
            setEditingCosts(false)
            if (onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Error updating costs:', error)
            alert('Error updating costs: ' + error.message)
        } finally {
            setSavingCosts(false)
        }
    }

    const handleSavePrice = async () => {
        if (!order || !order.id) {
            alert('Error: Order ID not found')
            return
        }

        const newPrice = parseFloat(editedPrice)
        if (isNaN(newPrice) || newPrice <= 0) {
            alert('Please enter a valid price')
            return
        }

        setSavingPrice(true)
        try {
            const db = getDb()
            if (!db) {
                alert('Error: Database not initialized')
                return
            }

            await updateDoc(doc(db, 'production_orders', order.id), {
                orderTotal: newPrice
            })
            setEditingPrice(false)
            if (onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Error updating price:', error)
            alert('Error updating price: ' + error.message)
        } finally {
            setSavingPrice(false)
        }
    }

    const handleSavePaymentMethod = async () => {
        if (!order || !order.id) {
            alert('Error: Order ID not found')
            return
        }

        setSavingPaymentMethod(true)
        try {
            const db = getDb()
            if (!db) {
                alert('Error: Database not initialized')
                return
            }

            await updateDoc(doc(db, 'production_orders', order.id), {
                paymentMethod: paymentMethod
            })
            setEditingPaymentMethod(false)
            if (onDataChanged) await onDataChanged()
        } catch (error) {
            console.error('Error updating payment method:', error)
            alert('Error updating payment method: ' + error.message)
        } finally {
            setSavingPaymentMethod(false)
        }
    }

    return (
        <div className={`${order.matchesInventory ? 'bg-gray-900/80 border-emerald-pine/60' : 'bg-gray-900/80 border-amber-500/60'} border-2 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-lime-glow">#{order.orderNumber}</span>
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${order.status === 'Order Shipped (Completed)' ? 'bg-emerald-700 text-white' :
                            order.status === 'Received from Tailor' ? 'bg-emerald-800 text-lime-glow' :
                                order.status === 'Sent to Tailor' ? 'bg-amber-600 text-white' :
                                    'bg-gray-700 text-white'}`}>
                            {order.status}
                        </span>
                        {!order.matchesInventory && order.outfitName && (
                            <span className="text-xs bg-red-700 text-white px-2 py-1 rounded-full font-bold animate-pulse">
                                ⚠️ NEEDS FIX
                            </span>
                        )}
                        <button
                            onClick={() => onDeleteOrder(order.id, order.orderNumber).catch(err => console.error(err))}
                            className="ml-auto text-red-500 p-1.5 hover:bg-red-50/40 rounded-lg transition-colors"
                            title="Delete order"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>

                    {editing ? (
                        <div className="space-y-2 mt-2">
                            <div className="flex items-center gap-2">
                                <select
                                    value={selectedOutfit}
                                    onChange={e => setSelectedOutfit(e.target.value)}
                                    className="flex-1 p-2 border-2 border-lime-glow/50 rounded-lg text-sm font-medium bg-black/20 text-white focus:ring-2 focus:ring-lime-glow/30"
                                >
                                    <option value={order.outfitName}>{order.outfitName} (current)</option>
                                    {outfitOptions.map(outfit => (
                                        <option key={outfit.id} value={outfit.name}>
                                            {outfit.name}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={selectedSize}
                                    onChange={e => setSelectedSize(e.target.value)}
                                    className="p-2 border-2 border-lime-glow/50 rounded-lg text-sm font-medium bg-black/20 text-white focus:ring-2 focus:ring-lime-glow/30 w-20"
                                >
                                    <option value="XS">XS</option>
                                    <option value="S">S</option>
                                    <option value="M">M</option>
                                    <option value="L">L</option>
                                    <option value="XL">XL</option>
                                    <option value="XXL">XXL</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        onUpdateOutfit(order.id, selectedOutfit, selectedSize).catch(err => console.error(err))
                                        setEditing(false)
                                    }}
                                    className="bg-lime-glow text-emerald-pine px-4 py-2 rounded-lg text-xs font-bold hover:bg-lime-glow/90 shadow-sm flex-1"
                                >
                                    ✓ Save
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedOutfit(order.outfitName)
                                        setSelectedSize(order.size || 'M')
                                        setEditing(false)
                                    }}
                                    className="text-white/70 px-4 py-2 hover:bg-white/10 rounded-lg"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 mb-2">
                            <p className="text-base font-bold text-white">{order.outfitName || 'Unknown'}</p>
                            {order.outfitName && (
                                <button
                                    onClick={() => setEditing(true)}
                                    className="text-lime-glow p-1.5 hover:bg-lime-glow/20 rounded-lg transition-colors"
                                    title="Edit outfit name"
                                >
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-white/70 flex-wrap">
                        <span>📅 {formatDate(order.createdAt)}</span>
                        {order.size && <span className="bg-black/20 border border-lime-glow/30 px-2 py-0.5 rounded font-semibold text-white">Size {order.size}</span>}
                        {editingPaymentMethod ? (
                            <div className="flex items-center gap-1">
                                <select
                                    value={paymentMethod}
                                    onChange={e => setPaymentMethod(e.target.value)}
                                    className="p-1 bg-black/50 border border-lime-glow/50 rounded text-xs text-white"
                                >
                                    <option value="Prepaid">Prepaid</option>
                                    <option value="COD">COD</option>
                                </select>
                                <button
                                    onClick={() => handleSavePaymentMethod().catch(err => console.error(err))}
                                    disabled={savingPaymentMethod}
                                    className="bg-lime-glow text-emerald-pine px-1.5 py-0.5 rounded text-xs font-bold hover:bg-lime-glow/90 disabled:opacity-50"
                                >
                                    {savingPaymentMethod ? '...' : '✓'}
                                </button>
                                <button
                                    onClick={() => {
                                        setPaymentMethod(order.paymentMethod || 'Prepaid')
                                        setEditingPaymentMethod(false)
                                    }}
                                    className="border border-lime-glow text-lime-glow px-1.5 py-0.5 rounded text-xs font-bold hover:bg-lime-glow/10"
                                >
                                    ✕
                                </button>
                            </div>
                        ) : (
                            <span
                                className={`px-2 py-0.5 rounded font-semibold cursor-pointer hover:opacity-80 ${(order.paymentMethod || 'Prepaid') === 'COD'
                                    ? 'bg-amber-600/20 border border-amber-600/60 text-amber-300'
                                    : 'bg-emerald-700/20 border border-emerald-700/60 text-emerald-300'
                                    }`}
                                onClick={() => setEditingPaymentMethod(true)}
                                title="Click to edit"
                            >
                                {order.paymentMethod || 'Prepaid'}
                            </span>
                        )}
                    </div>
                </div>

                <div className="text-right flex-shrink-0">
                    {editingPrice ? (
                        <div className="flex flex-col gap-2 items-end">
                            <input
                                type="number"
                                value={editedPrice}
                                onChange={e => setEditedPrice(e.target.value)}
                                className="w-24 p-1 bg-black/50 border border-lime-glow/50 rounded text-xs text-white font-bold text-right"
                                placeholder="₹"
                            />
                            <div className="flex gap-1">
                                <button
                                    onClick={() => handleSavePrice().catch(err => console.error(err))}
                                    disabled={savingPrice}
                                    className="bg-lime-glow text-emerald-pine px-2 py-1 rounded text-xs font-bold hover:bg-lime-glow/90 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {savingPrice ? '...' : '✓'}
                                </button>
                                <button
                                    onClick={() => {
                                        setEditedPrice(getOrderCost().toString())
                                        setEditingPrice(false)
                                    }}
                                    className="border border-lime-glow text-lime-glow px-2 py-1 rounded text-xs font-bold hover:bg-lime-glow/10"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-end gap-1">
                            <p className="text-2xl font-bold text-lime-glow">₹{getOrderCost()}</p>
                            <button
                                onClick={() => setEditingPrice(true)}
                                className="text-lime-glow p-1 hover:bg-lime-glow/20 rounded-lg transition-colors text-xs"
                                title="Edit price"
                            >
                                ✏️
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Show imported data if available */}
            {order.importedData && Object.keys(order.importedData).length > 0 && (
                <div className="mt-3 pt-3 border-t border-emerald-pine/60">
                    <p className="text-xs font-bold text-lime-glow uppercase mb-2">📦 Order Details</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {Object.entries(order.importedData).slice(0, 6).map(([key, value]) => (
                            <div key={key} className="bg-black/50 border border-emerald-pine/60 px-2 py-1 rounded">
                                <p className="text-xs text-lime-glow/80">{key}</p>
                                <p className="text-sm font-semibold text-white truncate">{value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Cost Breakdown */}
            <div className="mt-3 pt-3 border-t border-emerald-pine/60">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold text-lime-glow uppercase">💰 Costs</p>
                    {!editingCosts && (
                        <button
                            onClick={() => setEditingCosts(true)}
                            className="text-lime-glow p-1 hover:bg-lime-glow/20 rounded-lg transition-colors text-xs"
                            title="Edit costs"
                        >
                            ✏️ Edit
                        </button>
                    )}
                </div>
                {editingCosts ? (
                    <div className="space-y-2 mb-2">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-lime-glow/70">Stitching</label>
                                <input
                                    type="number"
                                    value={costs.stitchingCost}
                                    onChange={e => setCosts({ ...costs, stitchingCost: e.target.value })}
                                    className="w-full p-1 bg-black/50 border border-lime-glow/50 rounded text-xs text-white"
                                    placeholder="₹"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-lime-glow/70">Fabric</label>
                                <input
                                    type="number"
                                    value={costs.fabricCost}
                                    onChange={e => setCosts({ ...costs, fabricCost: e.target.value })}
                                    className="w-full p-1 bg-black/50 border border-lime-glow/50 rounded text-xs text-white"
                                    placeholder="₹"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-lime-glow/70">Delivery</label>
                                <input
                                    type="number"
                                    value={costs.deliveryCost}
                                    onChange={e => setCosts({ ...costs, deliveryCost: e.target.value })}
                                    className="w-full p-1 bg-black/50 border border-lime-glow/50 rounded text-xs text-white"
                                    placeholder="₹"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-lime-glow/70">COD Charge</label>
                                <input
                                    type="number"
                                    value={costs.codCharge}
                                    onChange={e => setCosts({ ...costs, codCharge: e.target.value })}
                                    className="w-full p-1 bg-amber-900/30 border border-amber-500/50 rounded text-xs text-white"
                                    placeholder="₹"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-lime-glow/70">Acq/Other</label>
                                <input
                                    type="number"
                                    value={costs.acquisitionCost}
                                    onChange={e => setCosts({ ...costs, acquisitionCost: e.target.value })}
                                    className="w-full p-1 bg-black/50 border border-lime-glow/50 rounded text-xs text-white"
                                    placeholder="₹"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleSaveCosts().catch(err => console.error(err))}
                                disabled={savingCosts}
                                className="flex-1 bg-lime-glow text-emerald-pine px-2 py-1 rounded text-xs font-bold hover:bg-lime-glow/90 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {savingCosts ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                onClick={() => setEditingCosts(false)}
                                className="flex-1 border border-lime-glow text-lime-glow px-2 py-1 rounded text-xs font-bold hover:bg-lime-glow/10"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-black/50 border border-emerald-pine/60 px-2 py-1 rounded">
                            <p className="text-lime-glow/70">Stitching</p>
                            <p className="font-bold text-white">{formatCurrency(costs.stitchingCost)}</p>
                        </div>
                        <div className="bg-black/50 border border-emerald-pine/60 px-2 py-1 rounded">
                            <p className="text-lime-glow/70">Fabric</p>
                            <p className="font-bold text-white">{formatCurrency(costs.fabricCost)}</p>
                        </div>
                        <div className="bg-black/50 border border-emerald-pine/60 px-2 py-1 rounded">
                            <p className="text-lime-glow/70">Delivery</p>
                            <p className="font-bold text-white">{formatCurrency(costs.deliveryCost)}</p>
                        </div>
                        <div className="bg-amber-900/20 border border-amber-500/60 px-2 py-1 rounded">
                            <p className="text-amber-300/70">COD Charge</p>
                            <p className="font-bold text-amber-300">{formatCurrency(costs.codCharge)}</p>
                        </div>
                        <div className="bg-black/50 border border-emerald-pine/60 px-2 py-1 rounded">
                            <p className="text-lime-glow/70">Acq/Other</p>
                            <p className="font-bold text-white">{formatCurrency(costs.acquisitionCost)}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
