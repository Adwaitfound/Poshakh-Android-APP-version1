import React, { useState } from 'react'
import { getDb } from '../firebase'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ORDERS_COLLECTION } from '../lib/utils'
import { logOrderStatusChanged } from '../lib/notificationLogger'

export default function OrderDetailModal({ order, onClose, onEdit, onShip, onReturn, userProfile, onDataChanged }) {
    const [isUpdating, setIsUpdating] = useState(false)

    if (!order) return null

    const isShipped = order.status === 'Order Shipped (Completed)' || order.status === 'In Transit' || order.status === 'Delivered'

    const handleStatusUpdate = async (newStatus) => {
        setIsUpdating(true)
        try {
            const db = getDb()
            await updateDoc(doc(db, ORDERS_COLLECTION, order.id), {
                status: newStatus,
                updatedAt: serverTimestamp()
            })
            await logOrderStatusChanged(order.orderNumber, newStatus, userProfile?.name || 'Unknown')
            if (onDataChanged) await onDataChanged()
            onClose()
        } catch (error) {
            console.error('Failed to update status:', error)
            alert('Failed to update order status')
        }
        setIsUpdating(false)
    }

    return (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm">
            <div className="bg-black w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl h-[85vh] sm:h-auto overflow-hidden flex flex-col shadow-2xl border-2 border-lime-glow/40">
                <div className="bg-emerald-pine p-6 border-b border-lime-glow/40 flex justify-between items-center flex-shrink-0">
                    <h3 className="font-bold text-lg text-white">Order #{order.orderNumber}</h3>
                    <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
                        <span className="text-2xl">×</span>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 bg-gray-950">
                    <div className="flex gap-4 mb-6">
                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-800 flex-shrink-0">
                            {order.imageUrl && <img src={order.imageUrl} className="w-full h-full object-cover" alt={order.outfitName} />}
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-base text-white">{order.customerName}</h4>
                            <p className="text-sm text-lime-glow">{order.outfitName}</p>
                            <p className="text-xs text-white/70 mt-1">Size: {order.size || 'M'}</p>
                        </div>
                    </div>

                    {/* Action buttons for non-shipped orders */}
                    {!isShipped && (
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <button onClick={() => { onEdit && onEdit(order) }} className="py-3 px-4 bg-lime-glow text-emerald-pine rounded-xl font-semibold text-sm hover:bg-lime-glow/90 active:scale-95 transition">Edit Order</button>
                            <button onClick={() => { onShip && onShip(order) }} className="py-3 px-4 bg-transparent border-2 border-lime-glow text-lime-glow rounded-xl font-semibold text-sm hover:bg-lime-glow/10 active:scale-95 transition">Ship / Complete</button>
                            <button onClick={() => { onReturn && onReturn(order) }} className="py-3 px-4 bg-amber-900/40 border-2 border-amber-500 text-amber-200 rounded-xl font-semibold text-sm hover:bg-amber-900/60 active:scale-95 transition">Return</button>
                        </div>
                    )}

                    {/* Status update buttons for shipped orders */}
                    {isShipped && (
                        <div className="mb-4 space-y-2">
                            <p className="text-xs text-lime-glow/70 uppercase font-bold mb-2">Update Order Status</p>
                            <div className="grid grid-cols-3 gap-2">
                                <button 
                                    onClick={() => handleStatusUpdate('Order Shipped (Completed)')}
                                    disabled={isUpdating || order.status === 'Order Shipped (Completed)'}
                                    className={`py-2 px-3 rounded-xl font-semibold text-xs transition ${order.status === 'Order Shipped (Completed)' ? 'bg-lime-glow text-emerald-pine' : 'bg-emerald-pine/40 border-2 border-lime-glow/40 text-lime-glow hover:bg-lime-glow/10'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    📦 Shipped
                                </button>
                                <button 
                                    onClick={() => handleStatusUpdate('In Transit')}
                                    disabled={isUpdating || order.status === 'In Transit'}
                                    className={`py-2 px-3 rounded-xl font-semibold text-xs transition ${order.status === 'In Transit' ? 'bg-blue-500 text-white' : 'bg-emerald-pine/40 border-2 border-blue-400/40 text-blue-300 hover:bg-blue-500/10'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    🚚 In Transit
                                </button>
                                <button 
                                    onClick={() => handleStatusUpdate('Delivered')}
                                    disabled={isUpdating || order.status === 'Delivered'}
                                    className={`py-2 px-3 rounded-xl font-semibold text-xs transition ${order.status === 'Delivered' ? 'bg-green-500 text-white' : 'bg-emerald-pine/40 border-2 border-green-400/40 text-green-300 hover:bg-green-500/10'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    ✅ Delivered
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="bg-emerald-pine/40 border border-lime-glow/30 p-4 rounded-xl space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-lime-glow font-semibold">₹{order.finalSellingPrice || order.orderTotal || 0}</span></div>
                        <div className="flex justify-between text-sm">
                            <span className="text-white/60">Status:</span>
                            <span className={`font-semibold ${order.status === 'Delivered' ? 'text-green-400' : order.status === 'In Transit' ? 'text-blue-400' : 'text-white'}`}>
                                {order.status}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
