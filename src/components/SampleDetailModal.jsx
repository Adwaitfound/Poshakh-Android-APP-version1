import React, { useState } from 'react'
import { X, Check, XCircle, ArrowRight, Clock, CheckCircle, Package, Trash2, AlertTriangle, Search, Palette } from 'lucide-react'

const STATUS_LABELS = {
    pending: { label: 'Pending Review', color: 'text-yellow-400', bg: 'bg-yellow-900/30', icon: Clock },
    approved: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-900/30', icon: CheckCircle },
    rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-900/30', icon: XCircle },
    added: { label: 'Added to Inventory', color: 'text-blue-400', bg: 'bg-blue-900/30', icon: Package },
    fabric_not_found: { label: 'Fabric Not Found', color: 'text-orange-400', bg: 'bg-orange-900/30', icon: AlertTriangle },
    sourcing: { label: 'Sourcing', color: 'text-purple-400', bg: 'bg-purple-900/30', icon: Search },
    design_review: { label: 'Design Review', color: 'text-pink-400', bg: 'bg-pink-900/30', icon: Palette },
}

const SAMPLE_STAGES = [
    { value: 'pending', label: 'Pending Review', emoji: '⏳' },
    { value: 'fabric_not_found', label: 'Fabric Not Found', emoji: '🔍' },
    { value: 'sourcing', label: 'Sourcing Fabric/Material', emoji: '📦' },
    { value: 'design_review', label: 'Design Review', emoji: '🎨' },
    { value: 'approved', label: 'Approved', emoji: '✅' },
    { value: 'rejected', label: 'Rejected', emoji: '❌' },
]

export default function SampleDetailModal({
    sample,
    onClose,
    onApproveSample,
    onRejectSample,
    onAddToInventory,
    onDeleteSample,
    onUpdateSampleStatus,
    userRole = 'admin',
}) {
    const [showRejectForm, setShowRejectForm] = useState(false)
    const [rejectionReason, setRejectionReason] = useState('')
    const [approvalNote, setApprovalNote] = useState('')
    const [showApproveForm, setShowApproveForm] = useState(false)
    const [showStatusChange, setShowStatusChange] = useState(false)

    if (!sample) return null

    const status = STATUS_LABELS[sample.sampleStatus] || STATUS_LABELS.pending
    const StatusIcon = status.icon
    const isFabric = sample.type === 'fabric'

    const formatDate = (ts) => {
        if (!ts) return 'N/A'
        const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    const handleApprove = () => {
        onApproveSample && onApproveSample(sample, approvalNote)
        setShowApproveForm(false)
        setApprovalNote('')
    }

    const handleReject = () => {
        if (!rejectionReason.trim()) return
        onRejectSample && onRejectSample(sample, rejectionReason)
        setShowRejectForm(false)
        setRejectionReason('')
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl">
                {/* Close Button */}
                <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition">
                    <X className="w-5 h-5" />
                </button>

                {/* Image */}
                {sample.imageUrl && (
                    <div className="w-full h-64 bg-gray-800">
                        <img src={sample.imageUrl} alt={sample.name} className="w-full h-full object-cover" />
                    </div>
                )}

                <div className="p-6 space-y-4">
                    {/* Title & Status */}
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] uppercase font-bold text-gray-400">
                                {isFabric ? '🧵 Fabric Sample' : '👗 Outfit Sample'}
                            </span>
                        </div>
                        <h3 className="text-xl font-bold text-white">{sample.name}</h3>
                        {sample.websiteProductName && (
                            <p className="text-sm text-gray-400 mt-0.5">{sample.websiteProductName}</p>
                        )}
                        <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full ${status.bg} ${status.color} text-xs font-bold`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {status.label}
                        </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {isFabric && (
                            <>
                                {sample.totalLength && (
                                    <div className="bg-gray-800 rounded-xl p-3">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Total Length</p>
                                        <p className="text-white font-bold text-lg">{sample.totalLength} {sample.unit || 'meters'}</p>
                                    </div>
                                )}
                                {sample.costPerMeter && (
                                    <div className="bg-gray-800 rounded-xl p-3">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Cost/Meter</p>
                                        <p className="text-white font-bold text-lg">₹{parseFloat(sample.costPerMeter).toFixed(2)}</p>
                                    </div>
                                )}
                                {sample.lengthRequiredPerOutfit && (
                                    <div className="bg-gray-800 rounded-xl p-3">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Per Outfit</p>
                                        <p className="text-white font-bold text-lg">{sample.lengthRequiredPerOutfit} {sample.unit || 'm'}</p>
                                    </div>
                                )}
                                {sample.actualCostPerMeter && (
                                    <div className="bg-gray-800 rounded-xl p-3">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Actual Cost/Meter</p>
                                        <p className="text-lime-glow font-bold text-lg">₹{parseFloat(sample.actualCostPerMeter).toFixed(2)}</p>
                                    </div>
                                )}
                            </>
                        )}
                        {!isFabric && (
                            <>
                                {sample.sellingPrice && (
                                    <div className="bg-gray-800 rounded-xl p-3">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Selling Price</p>
                                        <p className="text-white font-bold text-lg">₹{parseFloat(sample.sellingPrice).toFixed(0)}</p>
                                    </div>
                                )}
                                {sample.stitchingCost && (
                                    <div className="bg-gray-800 rounded-xl p-3">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Stitching Cost</p>
                                        <p className="text-white font-bold text-lg">₹{parseFloat(sample.stitchingCost).toFixed(0)}</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Outfit Stock Breakdown */}
                    {!isFabric && sample.stockBreakdown && (
                        <div className="bg-gray-800 rounded-xl p-3">
                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Stock by Size</p>
                            <div className="flex gap-2 flex-wrap">
                                {Object.entries(sample.stockBreakdown).map(([size, qty]) => (
                                    <div key={size} className={`px-3 py-1.5 rounded-lg text-center min-w-[48px] ${parseInt(qty) > 0 ? 'bg-emerald-pine text-lime-glow' : 'bg-gray-700 text-gray-500'}`}>
                                        <span className="text-[10px] font-bold block">{size}</span>
                                        <span className="text-sm font-bold">{qty || 0}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Additional Info */}
                    <div className="space-y-2">
                        {sample.vendorName && (
                            <div className="flex items-center justify-between bg-gray-800 rounded-xl p-3">
                                <span className="text-xs text-gray-400 font-bold">Vendor</span>
                                <span className="text-sm text-white font-semibold">{sample.vendorName}</span>
                            </div>
                        )}
                        {sample.location && (
                            <div className="flex items-center justify-between bg-gray-800 rounded-xl p-3">
                                <span className="text-xs text-gray-400 font-bold">Location</span>
                                <span className="text-sm text-white font-semibold">{sample.location}</span>
                            </div>
                        )}
                        {sample.receivedDate && (
                            <div className="flex items-center justify-between bg-gray-800 rounded-xl p-3">
                                <span className="text-xs text-gray-400 font-bold">Received</span>
                                <span className="text-sm text-white font-semibold">{sample.receivedDate}</span>
                            </div>
                        )}
                        {sample.addedBy && (
                            <div className="flex items-center justify-between bg-gray-800 rounded-xl p-3">
                                <span className="text-xs text-gray-400 font-bold">Added By</span>
                                <span className="text-sm text-white font-semibold">{sample.addedBy}</span>
                            </div>
                        )}
                        {sample.createdAt && (
                            <div className="flex items-center justify-between bg-gray-800 rounded-xl p-3">
                                <span className="text-xs text-gray-400 font-bold">Created</span>
                                <span className="text-sm text-white font-semibold">{formatDate(sample.createdAt)}</span>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    {sample.notes && (
                        <div className="bg-gray-800 rounded-xl p-3">
                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Notes</p>
                            <p className="text-sm text-gray-200">{sample.notes}</p>
                        </div>
                    )}

                    {/* Rejection / Approval notes */}
                    {sample.sampleStatus === 'rejected' && sample.rejectionReason && (
                        <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-3">
                            <p className="text-[10px] text-red-400 uppercase font-bold mb-1">Rejection Reason</p>
                            <p className="text-sm text-red-200">{sample.rejectionReason}</p>
                            {sample.rejectedBy && <p className="text-[10px] text-red-400/60 mt-1">By {sample.rejectedBy} • {formatDate(sample.rejectedAt)}</p>}
                        </div>
                    )}

                    {sample.sampleStatus === 'approved' && sample.approvalNote && (
                        <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-3">
                            <p className="text-[10px] text-green-400 uppercase font-bold mb-1">Approval Note</p>
                            <p className="text-sm text-green-200">{sample.approvalNote}</p>
                            {sample.approvedBy && <p className="text-[10px] text-green-400/60 mt-1">By {sample.approvedBy} • {formatDate(sample.approvedAt)}</p>}
                        </div>
                    )}

                    {sample.sampleStatus === 'added' && (
                        <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-3">
                            <p className="text-[10px] text-blue-400 uppercase font-bold mb-1">Added to Inventory</p>
                            <p className="text-sm text-blue-200">This sample has been added to the main inventory.</p>
                            {sample.inventoryItemId && <p className="text-[10px] text-blue-400/60 mt-1">Inventory ID: {sample.inventoryItemId}</p>}
                        </div>
                    )}

                    {/* Approve Form */}
                    {showApproveForm && (
                        <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-4 space-y-3">
                            <p className="text-sm font-bold text-green-400">Approve this sample?</p>
                            <textarea
                                className="w-full p-3 bg-gray-800 text-white rounded-xl border border-green-700 text-sm outline-none resize-none"
                                rows={2} placeholder="Optional: Add a note..."
                                value={approvalNote} onChange={e => setApprovalNote(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <button onClick={handleApprove} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-500 transition flex items-center justify-center gap-1">
                                    <Check className="w-4 h-4" /> Confirm Approval
                                </button>
                                <button onClick={() => setShowApproveForm(false)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm font-bold hover:bg-gray-600 transition">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Reject Form */}
                    {showRejectForm && (
                        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4 space-y-3">
                            <p className="text-sm font-bold text-red-400">Reject this sample?</p>
                            <textarea
                                className="w-full p-3 bg-gray-800 text-white rounded-xl border border-red-700 text-sm outline-none resize-none"
                                rows={2} placeholder="Reason for rejection (required)..."
                                value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                                required
                            />
                            <div className="flex gap-2">
                                <button onClick={handleReject} disabled={!rejectionReason.trim()} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-500 transition flex items-center justify-center gap-1 disabled:opacity-50">
                                    <XCircle className="w-4 h-4" /> Confirm Rejection
                                </button>
                                <button onClick={() => setShowRejectForm(false)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm font-bold hover:bg-gray-600 transition">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Status Change Dropdown */}
                    {showStatusChange && userRole === 'admin' && (
                        <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 space-y-3">
                            <p className="text-sm font-bold text-white">Change Sample Stage</p>
                            <div className="grid grid-cols-2 gap-2">
                                {SAMPLE_STAGES.filter(s => s.value !== sample.sampleStatus && s.value !== 'approved' && s.value !== 'rejected').map(stage => (
                                    <button
                                        key={stage.value}
                                        onClick={() => {
                                            onUpdateSampleStatus && onUpdateSampleStatus(sample, stage.value)
                                            setShowStatusChange(false)
                                        }}
                                        className="py-2.5 px-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs font-bold transition text-left flex items-center gap-2"
                                    >
                                        <span>{stage.emoji}</span> {stage.label}
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => setShowStatusChange(false)} className="w-full py-2 bg-gray-700 text-gray-400 rounded-lg text-xs font-bold hover:bg-gray-600 transition">
                                Cancel
                            </button>
                        </div>
                    )}

                    {/* Action Buttons */}
                    {!showApproveForm && !showRejectForm && !showStatusChange && (
                        <div className="space-y-2 pt-2">
                            {(sample.sampleStatus === 'pending' || sample.sampleStatus === 'fabric_not_found' || sample.sampleStatus === 'sourcing' || sample.sampleStatus === 'design_review') && userRole === 'admin' && (
                                <>
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowApproveForm(true)}
                                            className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-500 transition flex items-center justify-center gap-2">
                                            <Check className="w-4 h-4" /> Approve
                                        </button>
                                        <button onClick={() => setShowRejectForm(true)}
                                            className="flex-1 py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-500 transition flex items-center justify-center gap-2">
                                            <XCircle className="w-4 h-4" /> Reject
                                        </button>
                                    </div>
                                    <button onClick={() => setShowStatusChange(true)}
                                        className="w-full py-3 bg-gray-800 border border-gray-600 text-gray-200 rounded-xl text-sm font-bold hover:bg-gray-700 transition flex items-center justify-center gap-2">
                                        🔄 Change Stage
                                    </button>
                                </>
                            )}
                            {sample.sampleStatus === 'approved' && userRole === 'admin' && (
                                <button onClick={() => onAddToInventory && onAddToInventory(sample)}
                                    className="w-full py-3 bg-gradient-to-r from-lime-400 to-emerald-400 text-emerald-pine rounded-xl text-sm font-bold hover:shadow-lg transition flex items-center justify-center gap-2">
                                    <ArrowRight className="w-4 h-4" /> Add to Main Inventory
                                </button>
                            )}
                            {(sample.sampleStatus === 'rejected') && userRole === 'admin' && (
                                <button onClick={() => onDeleteSample && onDeleteSample(sample)}
                                    className="w-full py-3 bg-gray-700 text-red-400 rounded-xl text-sm font-bold hover:bg-gray-600 transition flex items-center justify-center gap-2">
                                    <Trash2 className="w-4 h-4" /> Delete Sample
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
