import React from 'react'

export default function OrderDetailModal({ order, onClose, onEdit, onShip, onReturn }) {
    if (!order) return null
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
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <button onClick={() => { onEdit && onEdit(order) }} className="py-3 px-4 bg-lime-glow text-emerald-pine rounded-xl font-semibold text-sm hover:bg-lime-glow/90 active:scale-95 transition">Edit Order</button>
                        <button onClick={() => { onShip && onShip(order) }} className="py-3 px-4 bg-transparent border-2 border-lime-glow text-lime-glow rounded-xl font-semibold text-sm hover:bg-lime-glow/10 active:scale-95 transition">Ship / Complete</button>
                        <button onClick={() => { onReturn && onReturn(order) }} className="py-3 px-4 bg-amber-900/40 border-2 border-amber-500 text-amber-200 rounded-xl font-semibold text-sm hover:bg-amber-900/60 active:scale-95 transition">Return</button>
                    </div>
                    <div className="bg-emerald-pine/40 border border-lime-glow/30 p-4 rounded-xl space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-lime-glow font-semibold">₹{order.finalSellingPrice || order.orderTotal || 0}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-white font-semibold">{order.status}</span></div>
                    </div>
                </div>
            </div>
        </div>
    )
}
