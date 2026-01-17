import React, { useState, useEffect } from 'react'
import { collection, query, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { getDb } from '../firebase'

export default function ChangeHistoryModal({ visible, onClose }) {
    const [changes, setChanges] = useState([])
    const [loading, setLoading] = useState(false)
    const [filter, setFilter] = useState('all') // all, orders, inventory, customers

    useEffect(() => {
        if (visible) {
            loadChangeHistory()
        }
    }, [visible])

    const loadChangeHistory = async () => {
        setLoading(true)
        try {
            const db = getDb()
            if (!db) return

            const q = query(
                collection(db, 'change_history'),
                orderBy('timestamp', 'desc')
            )
            const snap = await getDocs(q)
            const allChanges = snap.docs.map(d => ({
                id: d.id,
                ...d.data(),
                timestamp: d.data().timestamp?.toDate?.() || new Date()
            }))
            setChanges(allChanges)
        } catch (error) {
            console.error('Error loading change history:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteChange = async (changeId) => {
        if (!window.confirm('Delete this change history record?')) return

        try {
            const db = getDb()
            await deleteDoc(doc(db, 'change_history', changeId))
            setChanges(prev => prev.filter(c => c.id !== changeId))
        } catch (error) {
            console.error('Error deleting change:', error)
            alert('Failed to delete change history')
        }
    }

    const handleClearAll = async () => {
        if (!window.confirm('Are you sure you want to delete ALL change history? This cannot be undone.')) return

        try {
            const db = getDb()
            const deletePromises = changes.map(c => deleteDoc(doc(db, 'change_history', c.id)))
            await Promise.all(deletePromises)
            setChanges([])
        } catch (error) {
            console.error('Error clearing history:', error)
            alert('Failed to clear change history')
        }
    }

    const filteredChanges = filter === 'all'
        ? changes
        : changes.filter(c => c.type === filter)

    const getTypeColor = (type) => {
        switch (type) {
            case 'orders': return 'bg-blue-100 text-blue-800'
            case 'inventory': return 'bg-purple-100 text-purple-800'
            case 'customers': return 'bg-green-100 text-green-800'
            case 'production': return 'bg-orange-100 text-orange-800'
            default: return 'bg-gray-100 text-gray-800'
        }
    }

    const getActionColor = (action) => {
        switch (action) {
            case 'created': return 'text-emerald-600'
            case 'updated': return 'text-blue-600'
            case 'deleted': return 'text-red-600'
            default: return 'text-gray-600'
        }
    }

    if (!visible) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
            <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4 sm:p-6 border-b-2 border-lime-glow">
                    <h2 className="text-xl sm:text-2xl font-bold text-emerald-pine">Change History</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
                </div>

                {/* Filters */}
                <div className="flex gap-2 px-4 sm:px-6 pt-4 flex-wrap">
                    {['all', 'orders', 'inventory', 'customers', 'production'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${filter === f
                                    ? 'bg-emerald-pine text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-32">
                            <div className="animate-spin w-6 h-6 border-3 border-emerald-pine border-t-lime-glow rounded-full"></div>
                        </div>
                    ) : filteredChanges.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-gray-500">No changes recorded</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredChanges.map(change => (
                                <div key={change.id} className="bg-gray-50 p-4 rounded-2xl border-l-4 border-lime-glow hover:shadow-md transition-all">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex gap-2 items-center flex-wrap mb-2">
                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getTypeColor(change.type)}`}>
                                                    {change.type}
                                                </span>
                                                <span className={`text-xs font-semibold ${getActionColor(change.action)}`}>
                                                    {change.action.toUpperCase()}
                                                </span>
                                            </div>
                                            <p className="text-sm font-semibold text-gray-800 break-words">{change.description}</p>
                                            <p className="text-xs text-gray-500 mt-1">By: {change.user || 'Unknown'}</p>
                                            {change.details && (
                                                <details className="mt-2">
                                                    <summary className="text-xs text-emerald-pine cursor-pointer hover:underline">Details</summary>
                                                    <pre className="bg-white p-2 rounded mt-1 text-xs overflow-auto max-h-40 border border-gray-200">
                                                        {typeof change.details === 'string'
                                                            ? change.details
                                                            : JSON.stringify(change.details, null, 2)}
                                                    </pre>
                                                </details>
                                            )}
                                            <p className="text-xs text-gray-400 mt-2">
                                                {change.timestamp.toLocaleString()}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteChange(change.id)}
                                            className="text-red-500 hover:text-red-700 text-sm font-semibold flex-shrink-0"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {changes.length > 0 && (
                    <div className="border-t-2 border-lime-glow p-4 sm:p-6 flex justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition"
                        >
                            Close
                        </button>
                        <button
                            onClick={handleClearAll}
                            className="px-4 py-2 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition"
                        >
                            Clear All
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
