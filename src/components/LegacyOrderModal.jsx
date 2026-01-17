import React, { useState } from 'react'
import { getDb } from '../firebase'
import { doc, updateDoc, serverTimestamp, addDoc, collection, increment } from 'firebase/firestore'
import { FABRICS_COLLECTION, ORDERS_COLLECTION } from '../lib/utils'
import { logOrderCreated, logOrderStatusChanged } from '../lib/notificationLogger'

export default function LegacyOrderModal({ visible, inventoryItems = [], userProfile, onClose, onDataChanged, editOrder = null, initialForm = null }) {
    const defaultForm = {
        orderNumber: '', customerName: '', outfitName: '', size: 'M', fabricId: '',
        status: 'Sent to Tailor', sellingPrice: '', deductStock: false, cutAmount: '',
        notes: '', phone: '', address: '', discount: '', source: '', acquisitionCost: '',
        paymentMethod: 'Prepaid', city: '', state: '', codCharge: '', shippingCost: '',
        codRemittanceDate: '', stitchingCost: '', fabricCost: '', deliveryCost: ''
    }

    const [form, setForm] = useState(defaultForm)
    const [isUploading, setIsUploading] = useState(false)
    const [error, setError] = useState('')

    // Update form when modal becomes visible, editOrder, or initialForm changes
    React.useEffect(() => {
        if (!visible) return

        if (editOrder) {
            setForm({
                orderNumber: editOrder.orderNumber || '',
                customerName: editOrder.customerName || '',
                outfitName: editOrder.outfitName || '',
                size: editOrder.size || 'M',
                fabricId: editOrder.fabricId || '',
                status: editOrder.status || 'Sent to Tailor',
                sellingPrice: editOrder.finalSellingPrice || '',
                deductStock: false,
                cutAmount: editOrder.cutAmount || '',
                notes: editOrder.notes || '',
                phone: editOrder.phone || '',
                address: editOrder.address || '',
                discount: editOrder.discount || '',
                source: editOrder.source || '',
                acquisitionCost: editOrder.acquisitionCost || '',
                paymentMethod: editOrder.paymentMethod || 'Prepaid',
                city: editOrder.city || '',
                state: editOrder.state || '',
                codCharge: editOrder.codCharge || '',
                shippingCost: editOrder.shippingCost || '',
                codRemittanceDate: editOrder.codRemittanceDate || '',
                stitchingCost: editOrder.stitchingCost || '',
                fabricCost: editOrder.fabricCost || '',
                deliveryCost: editOrder.deliveryCost || ''
            })
        } else if (initialForm && Object.keys(initialForm).length > 0) {
            setForm(initialForm)
        } else {
            setForm(defaultForm)
        }
    }, [visible, editOrder, initialForm])

    if (!visible) return null

    const handleSubmit = async (keepOpen = false) => {
        setIsUploading(true)
        setError('')
        try {
            const { orderNumber, customerName, outfitName, size, fabricId, status, sellingPrice, deductStock, cutAmount, notes, phone, address, discount, source, acquisitionCost, paymentMethod, city, state, codCharge, shippingCost, codRemittanceDate, stitchingCost, fabricCost, deliveryCost } = form
            if (!orderNumber || !customerName) throw new Error("Order # and Customer Name are required")
            if (!phone || phone.trim() === '') throw new Error("Phone number is required")
            if (!outfitName || outfitName.trim() === '') throw new Error("Outfit is required")

            // Outfit Validation and Sold Increment
            let linkedOutfit = null
            linkedOutfit = inventoryItems.find(i => i.name.toLowerCase() === outfitName.toLowerCase() && i.type === 'outfit')
            if (!linkedOutfit) {
                throw new Error(`Outfit '${outfitName}' must be an existing outfit in Inventory.`)
            }

            const db = getDb()
            const codDate = (paymentMethod || 'Prepaid') === 'COD' && !codRemittanceDate
                ? (() => {
                    const base = new Date()
                    base.setDate(base.getDate() + 4)
                    return base.toISOString()
                })()
                : codRemittanceDate || ''
            const orderData = {
                orderNumber, customerName, outfitName: linkedOutfit ? linkedOutfit.name : outfitName, size, status, notes, phone, address, discount, source,
                acquisitionCost: parseFloat(acquisitionCost) || 0,
                paymentMethod: paymentMethod || 'Prepaid',
                city: city || '',
                state: state || '',
                codCharge: parseFloat(codCharge) || 0,
                shippingCost: parseFloat(shippingCost) || 0,
                codRemittanceDate: codDate,
                stitchingCost: parseFloat(stitchingCost) || 0,
                fabricCost: parseFloat(fabricCost) || 0,
                deliveryCost: parseFloat(deliveryCost) || 0,
                usedByEmail: userProfile?.name || 'Unknown', createdAt: serverTimestamp()
            }

            if (fabricId) {
                const fabric = inventoryItems.find(f => f.id === fabricId)
                if (fabric) {
                    orderData.fabricId = fabricId
                    orderData.fabricName = fabric.name
                    orderData.imageUrl = fabric.imageUrl
                    const cut = parseFloat(cutAmount)
                    if (deductStock && cut > 0) {
                        orderData.cutAmount = cut
                        const fabricRef = doc(db, FABRICS_COLLECTION, fabricId)
                        await updateDoc(fabricRef, { currentLength: increment(-cut), updatedAt: serverTimestamp() })
                        await addDoc(collection(fabricRef, 'history'), { amountUsed: cut, orderNumber: orderNumber, productName: outfitName, status: 'Manual Entry', type: 'CUT', usedByEmail: userProfile?.name || 'Unknown', usedAt: serverTimestamp() })
                    }
                }
            } else {
                // If no fabric linked, use outfit image if found
                orderData.imageUrl = linkedOutfit ? linkedOutfit.imageUrl : `https://placehold.co/150x150/e2e8f0/64748b?text=${orderNumber}`
            }

            if (status === 'Order Shipped (Completed)') {
                const finalPrice = parseFloat(sellingPrice)
                if (finalPrice > 0) orderData.finalSellingPrice = finalPrice

                // Increment sold count for the outfit if it was found
                if (linkedOutfit) {
                    const outfitRef = doc(db, FABRICS_COLLECTION, linkedOutfit.id)
                    const soldQty = 1 // Assuming 1 unit sold per manual log entry

                    await updateDoc(outfitRef, {
                        manualSoldCount: increment(soldQty),
                        updatedAt: serverTimestamp()
                    })

                    await addDoc(collection(outfitRef, 'history'), {
                        type: 'OUTFIT_SOLD_MANUAL',
                        amountUsed: soldQty,
                        size: size,
                        status: 'Legacy Sold',
                        orderNumber: orderNumber,
                        usedByEmail: userProfile?.name || 'Unknown',
                        usedAt: serverTimestamp()
                    })
                }
            }

            if (!orderData.finalSellingPrice && sellingPrice) orderData.finalSellingPrice = parseFloat(sellingPrice)

            // If editing, update the existing order. Otherwise, create a new one.
            if (editOrder && editOrder.id) {
                await updateDoc(doc(db, ORDERS_COLLECTION, editOrder.id), {
                    ...orderData,
                    updatedAt: serverTimestamp()
                })
                // Log status change if status was updated
                if (editOrder.status !== status) {
                    await logOrderStatusChanged(orderNumber, status, userProfile?.name || 'Unknown')
                }
            } else {
                await addDoc(collection(db, ORDERS_COLLECTION), orderData)
                // Log new order creation
                await logOrderCreated(orderNumber, customerName, userProfile?.name || 'Unknown')
            }

            // Reset form
            if (keepOpen) {
                // Preserve all customer preferences for adding another order
                setForm({
                    orderNumber: '', customerName: form.customerName, outfitName: '', size: 'M', fabricId: '',
                    status: 'Sent to Tailor', sellingPrice: '', deductStock: false, cutAmount: '',
                    notes: '', phone: form.phone, address: form.address, discount: form.discount, source: form.source, acquisitionCost: form.acquisitionCost,
                    paymentMethod: form.paymentMethod, city: form.city, state: form.state, codCharge: form.codCharge, shippingCost: form.shippingCost,
                    codRemittanceDate: '', stitchingCost: form.stitchingCost, fabricCost: form.fabricCost, deliveryCost: form.deliveryCost
                })
            } else {
                // Close modal - reset everything
                setForm({
                    orderNumber: '', customerName: '', outfitName: '', size: 'M', fabricId: '',
                    status: 'Sent to Tailor', sellingPrice: '', deductStock: false, cutAmount: '',
                    notes: '', phone: '', address: '', discount: '', source: '', acquisitionCost: '',
                    paymentMethod: 'Prepaid', city: '', state: '', codCharge: '', shippingCost: '',
                    codRemittanceDate: '', stitchingCost: '', fabricCost: '', deliveryCost: ''
                })
            }
            if (onDataChanged) await onDataChanged()
            if (!keepOpen) onClose()
        } catch (e) {
            console.error(e)
            setError(e.message || 'Failed to add order')
        } finally {
            setIsUploading(false)
        }
    }

    const fabrics = inventoryItems.filter(i => i.type === 'fabric')
    const outfits = inventoryItems.filter(i => i.type === 'outfit')

    return (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm">
            <div className="bg-gray-950 w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl h-[92vh] sm:h-auto flex flex-col border-2 border-lime-glow/40">
                <div className="p-6 border-b border-lime-glow/40 bg-emerald-pine flex items-center justify-between flex-shrink-0">
                    <h3 className="text-xl font-bold text-white">{editOrder ? 'Edit Order' : 'Past Order'}</h3>
                    <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
                        <span className="text-2xl">×</span>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {error && (
                        <div className="m-4 mb-0 p-3 bg-red-900/50 border border-red-500/50 text-red-200 text-sm rounded-xl">{error}</div>
                    )}
                    <div className="space-y-4 p-6 pt-4">
                        <div className="bg-gray-900/80 p-3 rounded-xl border border-emerald-pine/60">
                            <h4 className="text-xs font-bold text-lime-glow uppercase mb-2">Customer Details</h4>
                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <input className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Order # (Required)" value={form.orderNumber} onChange={e => setForm({ ...form, orderNumber: e.target.value })} />
                                <input className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Customer Name (Required)" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <input className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                <input className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                            </div>
                        </div>

                        <div className="bg-gray-900/80 p-3 rounded-xl border border-emerald-pine/60">
                            <h4 className="text-xs font-bold text-lime-glow uppercase mb-2">Product Info</h4>
                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <select className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" value={form.outfitName} onChange={e => setForm({ ...form, outfitName: e.target.value })}>
                                    <option value="">— Select Outfit —</option>
                                    {outfits.map(o => (<option key={o.id} value={o.name}>{o.name}</option>))}
                                </select>
                                <select className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" value={form.size} onChange={e => setForm({ ...form, size: e.target.value })}>
                                    <option>S</option><option>M</option><option>L</option><option>XL</option><option>XXL</option>
                                </select>
                            </div>
                            <select className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm mb-2" value={form.fabricId} onChange={e => setForm({ ...form, fabricId: e.target.value })}>
                                <option value="">— Select Fabric (Optional) —</option>
                                {fabrics.map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}
                            </select>
                            {form.fabricId && (
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-2 text-xs cursor-pointer text-white">
                                        <input type="checkbox" checked={form.deductStock} onChange={e => setForm({ ...form, deductStock: e.target.checked })} />
                                        Deduct Stock
                                    </label>
                                    {form.deductStock && (<input type="number" step="0.1" className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Cut Amount (m)" value={form.cutAmount} onChange={e => setForm({ ...form, cutAmount: e.target.value })} />)}
                                </div>
                            )}
                            <textarea className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm mt-2" rows="2" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}></textarea>
                        </div>

                        <div className="bg-gray-900/80 p-3 rounded-xl border border-emerald-pine/60">
                            <h4 className="text-xs font-bold text-lime-glow uppercase mb-2">Status & Pricing</h4>
                            <select className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm mb-2" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                <option>Sent to Tailor</option>
                                <option>Received from Tailor</option>
                                <option>Order Shipped (Completed)</option>
                                <option>Cancelled</option>
                            </select>
                            <select className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm mb-2" value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
                                <option value="Prepaid">Prepaid</option>
                                <option value="COD">COD</option>
                            </select>
                            {form.paymentMethod === 'COD' && (
                                <input
                                    type="number"
                                    className="w-full p-2 bg-amber-900/30 text-white rounded-lg border-2 border-amber-500/40 text-sm mb-2"
                                    placeholder="COD Charges (₹)"
                                    value={form.codCharge}
                                    onChange={e => setForm({ ...form, codCharge: e.target.value })}
                                />
                            )}
                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <input type="number" className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Selling Price (₹)" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: e.target.value })} />
                                <input type="number" className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Discount (₹)" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} />
                            </div>
                        </div>

                        <div className="bg-gray-900/80 p-3 rounded-xl border border-emerald-pine/60">
                            <h4 className="text-xs font-bold text-lime-glow uppercase mb-2">Costs</h4>
                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <input type="number" className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Stitching Cost (₹)" value={form.stitchingCost} onChange={e => setForm({ ...form, stitchingCost: e.target.value })} />
                                <input type="number" className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Fabric Cost (₹)" value={form.fabricCost} onChange={e => setForm({ ...form, fabricCost: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <input type="number" className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Delivery Cost (₹)" value={form.deliveryCost} onChange={e => setForm({ ...form, deliveryCost: e.target.value })} />
                                <input type="number" className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Shipping Cost (₹)" value={form.shippingCost} onChange={e => setForm({ ...form, shippingCost: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <input type="number" className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="Acquisition Cost (₹)" value={form.acquisitionCost} onChange={e => setForm({ ...form, acquisitionCost: e.target.value })} />
                                <input type="number" className="w-full p-2 bg-gray-800 text-white rounded-lg border-2 border-lime-glow/40 text-sm" placeholder="COD Charge (₹)" value={form.codCharge} onChange={e => setForm({ ...form, codCharge: e.target.value })} />
                            </div>
                        </div>
                    </div>
                    <div className="p-6 pt-4 border-t border-lime-glow/40 flex gap-3 flex-shrink-0 bg-gray-950">
                        <button onClick={() => handleSubmit(false)} disabled={isUploading} className="flex-1 bg-lime-glow text-emerald-pine py-3 rounded-xl font-bold shadow-lg hover:bg-lime-glow/90 active:scale-95 transition-all">
                            {isUploading ? 'Saving...' : (editOrder ? 'Update Order' : 'Add Record')}
                        </button>
                        {!editOrder && (
                            <button
                                onClick={async () => {
                                    // Submit and keep customer info for adding multiple orders
                                    const prevCustomer = {
                                        customerName: form.customerName,
                                        phone: form.phone,
                                        address: form.address,
                                        city: form.city,
                                        state: form.state,
                                        paymentMethod: form.paymentMethod
                                    }
                                    await handleSubmit(true)
                                    // Re-open with preserved customer details
                                    setForm({
                                        orderNumber: '', customerName: prevCustomer.customerName || '', outfitName: '', size: 'M', fabricId: '',
                                        status: 'Sent to Tailor', sellingPrice: '', deductStock: false, cutAmount: '',
                                        notes: '', phone: prevCustomer.phone || '', address: prevCustomer.address || '', discount: '', source: '', acquisitionCost: '',
                                        paymentMethod: prevCustomer.paymentMethod || 'Prepaid', city: prevCustomer.city || '', state: prevCustomer.state || '', codCharge: '', shippingCost: '',
                                        codRemittanceDate: '', stitchingCost: '', fabricCost: '', deliveryCost: ''
                                    })
                                }}
                                disabled={isUploading}
                                className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-white/20 active:scale-95 transition-all border border-lime-glow/40"
                            >
                                {isUploading ? 'Saving...' : 'Add Another for This Customer'}
                            </button>
                        )}
                    </div>
                </div>
            </div >
        </div >
    )
}
