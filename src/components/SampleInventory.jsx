import React, { useMemo, useState } from 'react'
import { Search, Plus, Check, X, Clock, CheckCircle, XCircle, Eye, Package, ArrowRight } from 'lucide-react'

import { AlertTriangle, Search as SearchIcon, Palette } from 'lucide-react'

const STATUS_COLORS = {
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', icon: Clock, label: 'Pending' },
    approved: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', icon: CheckCircle, label: 'Approved' },
    rejected: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', icon: XCircle, label: 'Rejected' },
    added: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', icon: Package, label: 'In Inventory' },
    fabric_not_found: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', icon: AlertTriangle, label: 'Fabric Not Found' },
    sourcing: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300', icon: SearchIcon, label: 'Sourcing' },
    design_review: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300', icon: Palette, label: 'Design Review' },
}

export default function SampleInventory({
    sampleItems = [],
    onAddSample,
    onApproveSample,
    onRejectSample,
    onAddToInventory,
    onViewSample,
    onDeleteSample,
    onUpdateSampleStatus,
    userRole = 'admin',
}) {
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [typeFilter, setTypeFilter] = useState('all')

    const filteredSamples = useMemo(() => {
        let list = [...sampleItems]

        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            list = list.filter(s =>
                (s.name && s.name.toLowerCase().includes(term)) ||
                (s.vendorName && s.vendorName.toLowerCase().includes(term)) ||
                (s.notes && s.notes.toLowerCase().includes(term))
            )
        }

        if (statusFilter === 'in_progress') {
            list = list.filter(s => ['fabric_not_found', 'sourcing', 'design_review'].includes(s.sampleStatus))
        } else if (statusFilter !== 'all') {
            list = list.filter(s => s.sampleStatus === statusFilter)
        }

        if (typeFilter !== 'all') {
            list = list.filter(s => s.type === typeFilter)
        }

        // Sort: pending first, then by date
        list.sort((a, b) => {
            const statusOrder = { pending: 0, fabric_not_found: 0.5, sourcing: 0.5, design_review: 0.5, approved: 1, rejected: 2, added: 3 }
            const diff = (statusOrder[a.sampleStatus] || 0) - (statusOrder[b.sampleStatus] || 0)
            if (diff !== 0) return diff
            const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0
            const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0
            return dateB - dateA
        })

        return list
    }, [sampleItems, searchTerm, statusFilter, typeFilter])

    const counts = useMemo(() => {
        const c = { all: sampleItems.length, pending: 0, approved: 0, rejected: 0, added: 0, fabric_not_found: 0, sourcing: 0, design_review: 0, in_progress: 0 }
        sampleItems.forEach(s => {
            c[s.sampleStatus] = (c[s.sampleStatus] || 0) + 1
            if (['fabric_not_found', 'sourcing', 'design_review'].includes(s.sampleStatus)) {
                c.in_progress = (c.in_progress || 0) + 1
            }
        })
        return c
    }, [sampleItems])

    const formatDate = (ts) => {
        if (!ts) return ''
        const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
    }

    return (
        <div className="space-y-4 fade-in">
            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-white">Sample Inventory</h2>
                    <p className="text-xs text-gray-400 mt-1">Review samples before adding to main inventory</p>
                </div>
                {onAddSample && (
                    <button
                        onClick={onAddSample}
                        className="text-sm bg-lime-glow text-emerald-pine px-4 py-2 rounded-full font-bold shadow-lg hover:shadow-xl flex items-center gap-1"
                    >
                        <Plus className="w-4 h-4" /> Add Sample
                    </button>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
                {[
                    { key: 'pending', label: 'Pending', color: 'from-yellow-500 to-amber-500', count: counts.pending },
                    { key: 'in_progress', label: 'In Progress', color: 'from-orange-500 to-purple-500', count: counts.in_progress, filterKeys: ['fabric_not_found', 'sourcing', 'design_review'] },
                    { key: 'approved', label: 'Approved', color: 'from-green-500 to-emerald-500', count: counts.approved },
                ].map(stat => (
                    <button
                        key={stat.key}
                        onClick={() => setStatusFilter(statusFilter === stat.key ? 'all' : stat.key)}
                        className={`p-3 rounded-2xl text-center transition-all ${
                            statusFilter === stat.key
                                ? `bg-gradient-to-br ${stat.color} text-white shadow-lg scale-105`
                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}
                    >
                        <p className="text-xl font-bold">{stat.count}</p>
                        <p className="text-[10px] font-semibold uppercase">{stat.label}</p>
                    </button>
                ))}
            </div>

            {/* Search & Filters */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                        <Search className="w-5 h-5" />
                    </span>
                    <input
                        className="w-full pl-10 p-3 bg-white rounded-xl border-2 border-lime-glow shadow-sm text-sm text-gray-900 placeholder-gray-400"
                        placeholder="Search samples..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <select
                    className="text-xs bg-white border-2 border-lime-glow rounded-lg p-2 text-emerald-pine font-semibold outline-none shadow-sm"
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                >
                    <option value="all">All Types</option>
                    <option value="fabric">Fabrics</option>
                    <option value="outfit">Outfits</option>
                </select>
            </div>

            {/* Filter pills */}
            <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-2">
                {[
                    { key: 'all', label: 'All' },
                    { key: 'pending', label: 'Pending' },
                    { key: 'fabric_not_found', label: '🔍 Fabric Not Found' },
                    { key: 'sourcing', label: '📦 Sourcing' },
                    { key: 'design_review', label: '🎨 Design Review' },
                    { key: 'approved', label: 'Approved' },
                    { key: 'added', label: 'In Inventory' },
                    { key: 'rejected', label: 'Rejected' },
                ].map(f => (
                    <button
                        key={f.key}
                        onClick={() => setStatusFilter(f.key)}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                            statusFilter === f.key
                                ? 'bg-emerald-pine text-lime-glow shadow-lg'
                                : 'bg-lime-glow text-emerald-pine border-2 border-lime-glow'
                        }`}
                    >
                        {f.label} {f.key !== 'all' ? `(${counts[f.key] || 0})` : `(${counts.all})`}
                    </button>
                ))}
            </div>

            {/* Sample Cards */}
            <div className="space-y-3">
                {filteredSamples.map(sample => {
                    const status = STATUS_COLORS[sample.sampleStatus] || STATUS_COLORS.pending
                    const StatusIcon = status.icon
                    const isFabric = sample.type === 'fabric'

                    return (
                        <div
                            key={sample.id}
                            className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-700 shadow-md"
                        >
                            <div className="flex">
                                {/* Image */}
                                <div
                                    className="w-28 h-28 flex-shrink-0 bg-gray-800 cursor-pointer"
                                    onClick={() => onViewSample && onViewSample(sample)}
                                >
                                    {sample.imageUrl ? (
                                        <img src={sample.imageUrl} alt={sample.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-2xl text-gray-500 font-bold">
                                            {(sample.name || '??').substring(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                </div>

                                {/* Details */}
                                <div className="flex-1 p-3 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-white font-bold text-sm truncate">{sample.name}</h4>
                                            <p className="text-[10px] text-gray-400 uppercase font-semibold mt-0.5">
                                                {isFabric ? '🧵 Fabric' : '👗 Outfit'}
                                                {sample.vendorName && ` • ${sample.vendorName}`}
                                            </p>
                                        </div>
                                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${status.bg} ${status.text} whitespace-nowrap`}>
                                            <StatusIcon className="w-3 h-3" />
                                            {status.label}
                                        </span>
                                    </div>

                                    {/* Sample Details */}
                                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-300">
                                        {isFabric && sample.totalLength && (
                                            <span>📏 {sample.totalLength} {sample.unit || 'meters'}</span>
                                        )}
                                        {isFabric && sample.costPerMeter && (
                                            <span>💰 ₹{parseFloat(sample.costPerMeter).toFixed(0)}/m</span>
                                        )}
                                        {!isFabric && sample.sellingPrice && (
                                            <span>💰 ₹{parseFloat(sample.sellingPrice).toFixed(0)}</span>
                                        )}
                                        {!isFabric && sample.stockBreakdown && (
                                            <span>📦 {Object.values(sample.stockBreakdown).reduce((a, b) => a + (parseInt(b) || 0), 0)} pcs</span>
                                        )}
                                        {sample.receivedDate && (
                                            <span>📅 {sample.receivedDate}</span>
                                        )}
                                    </div>

                                    {sample.notes && (
                                        <p className="text-[10px] text-gray-500 mt-1 truncate">📝 {sample.notes}</p>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex gap-2 mt-2 flex-wrap">
                                        {(sample.sampleStatus === 'pending' || sample.sampleStatus === 'fabric_not_found' || sample.sampleStatus === 'sourcing' || sample.sampleStatus === 'design_review') && userRole === 'admin' && (
                                            <>
                                                <button
                                                    onClick={() => onApproveSample && onApproveSample(sample)}
                                                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-[11px] font-bold hover:bg-green-500 transition-all active:scale-95"
                                                >
                                                    <Check className="w-3 h-3" /> Approve
                                                </button>
                                                <button
                                                    onClick={() => onRejectSample && onRejectSample(sample)}
                                                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-[11px] font-bold hover:bg-red-500 transition-all active:scale-95"
                                                >
                                                    <X className="w-3 h-3" /> Reject
                                                </button>
                                            </>
                                        )}
                                        {sample.sampleStatus === 'approved' && userRole === 'admin' && (
                                            <button
                                                onClick={() => onAddToInventory && onAddToInventory(sample)}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-lime-400 to-emerald-400 text-emerald-pine rounded-lg text-[11px] font-bold hover:shadow-lg transition-all active:scale-95"
                                            >
                                                <ArrowRight className="w-3 h-3" /> Add to Inventory
                                            </button>
                                        )}
                                        {sample.sampleStatus === 'rejected' && userRole === 'admin' && (
                                            <button
                                                onClick={() => onDeleteSample && onDeleteSample(sample)}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-[11px] font-bold hover:bg-gray-600 transition-all active:scale-95"
                                            >
                                                <X className="w-3 h-3" /> Delete
                                            </button>
                                        )}
                                        <button
                                            onClick={() => onViewSample && onViewSample(sample)}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-[11px] font-bold hover:bg-gray-600 transition-all active:scale-95 ml-auto"
                                        >
                                            <Eye className="w-3 h-3" /> View
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Rejection reason */}
                            {sample.sampleStatus === 'rejected' && sample.rejectionReason && (
                                <div className="px-3 pb-3">
                                    <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-2">
                                        <p className="text-[10px] text-red-300">
                                            <span className="font-bold">Rejection Reason:</span> {sample.rejectionReason}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Approval note */}
                            {sample.sampleStatus === 'approved' && sample.approvalNote && (
                                <div className="px-3 pb-3">
                                    <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-2">
                                        <p className="text-[10px] text-green-300">
                                            <span className="font-bold">Note:</span> {sample.approvalNote}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {filteredSamples.length === 0 && (
                <div className="text-center py-12">
                    <div className="text-5xl mb-3">🧪</div>
                    <p className="text-gray-400 font-semibold">
                        {searchTerm ? `No samples match "${searchTerm}"` : statusFilter !== 'all' ? `No ${statusFilter} samples` : 'No samples yet'}
                    </p>
                    <p className="text-gray-500 text-sm mt-1">Add a sample to get started</p>
                </div>
            )}
        </div>
    )
}
