import React, { useState, useEffect } from 'react'
import { getDb } from '../firebase'
import { collection, doc, onSnapshot, query, deleteDoc } from 'firebase/firestore'
import { FABRICS_COLLECTION } from '../lib/utils'
import { Trash2, X } from 'lucide-react'

export default function HistoryModal({ itemId, onClose }) {
    const [transactionHistory, setTransactionHistory] = useState([])
    const [deleteLogConfirmationId, setDeleteLogConfirmationId] = useState(null)

    useEffect(() => {
        if (!itemId) {
            setTransactionHistory([])
            return
        }

        const db = getDb()
        const unsub = onSnapshot(
            query(collection(doc(db, FABRICS_COLLECTION, itemId), 'history')),
            (snap) => {
                const history = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => (b.usedAt?.toMillis() || 0) - (a.usedAt?.toMillis() || 0))
                setTransactionHistory(history)
            },
            (e) => console.error('History fetch error:', e)
        )

        return () => unsub()
    }, [itemId])

    const handleConfirmDeleteLog = async (fid, tid) => {
        const db = getDb()
        await deleteDoc(doc(db, FABRICS_COLLECTION, fid, 'history', tid))
        setDeleteLogConfirmationId(null)
    }

    const formatDate = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return 'N/A'
        const date = timestamp.toDate()
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    if (!itemId) return null

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm">
                <div className="bg-white dark:bg-gray-950 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl h-[90vh] sm:h-[85vh] overflow-hidden flex flex-col shadow-2xl border dark:border-gray-800">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900 flex-shrink-0">
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">History</h3>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 transition">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto flex-1">
                        {transactionHistory.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <p>No transaction history recorded</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {transactionHistory.map(log => (
                                    <div key={log.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 dark:border-gray-700 rounded-xl p-4 hover:shadow-md transition border dark:border-gray-800">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${log.type === 'CUT' ? 'bg-red-100 text-red-700' :
                                                        log.type === 'ADJUST_ADD' || log.type === 'OUTFIT_ADD' ? 'bg-green-100 text-green-700' :
                                                            log.type === 'ADJUST_DEDUCT' || log.type === 'OUTFIT_SOLD' ? 'bg-orange-100 text-orange-700' :
                                                                log.type === 'CANCEL_RETURN' ? 'bg-blue-100 text-blue-700' :
                                                                    'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {log.type}
                                                    </span>
                                                    {log.size && (
                                                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{log.size}</span>
                                                    )}
                                                </div>
                                                <div className="text-sm space-y-1">
                                                    <div className="flex gap-2">
                                                        <span className="text-gray-500">Amount:</span>
                                                        <span className="font-bold text-gray-900 dark:text-white">
                                                            {parseFloat(log.amountUsed || 0).toFixed(2)} {log.size ? 'pcs' : 'm'}
                                                        </span>
                                                    </div>
                                                    {log.orderNumber && (
                                                        <div className="flex gap-2">
                                                            <span className="text-gray-500">Order:</span>
                                                            <span className="font-medium text-gray-700 dark:text-gray-300">{log.orderNumber}</span>
                                                        </div>
                                                    )}
                                                    {log.productName && (
                                                        <div className="flex gap-2">
                                                            <span className="text-gray-500">Product:</span>
                                                            <span className="font-medium text-gray-700 dark:text-gray-300">{log.productName}</span>
                                                        </div>
                                                    )}
                                                    {log.status && (
                                                        <div className="flex gap-2">
                                                            <span className="text-gray-500">Status:</span>
                                                            <span className="font-medium text-gray-700 dark:text-gray-300">{log.status}</span>
                                                        </div>
                                                    )}
                                                    {log.usedByEmail && (
                                                        <div className="flex gap-2">
                                                            <span className="text-gray-500">By:</span>
                                                            <span className="text-xs text-gray-600 dark:text-gray-400">{log.usedByEmail}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex gap-2">
                                                        <span className="text-gray-500">Date:</span>
                                                        <span className="text-xs text-gray-600 dark:text-gray-400">{formatDate(log.usedAt)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setDeleteLogConfirmationId(log.id)}
                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                title="Delete log"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete Confirmation */}
            {deleteLogConfirmationId && (
                <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4 modal-enter">
                    <div className="bg-white dark:bg-gray-950 p-6 rounded-2xl w-full max-w-sm shadow-2xl border dark:border-gray-800 border dark:border-gray-800">
                        <h3 className="text-lg font-bold mb-4 text-red-600 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" /> Delete Log Entry?
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 mb-4">
                            This will permanently remove this transaction from the history.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleConfirmDeleteLog(itemId, deleteLogConfirmationId)}
                                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold"
                            >
                                Delete
                            </button>
                            <button
                                onClick={() => setDeleteLogConfirmationId(null)}
                                className="flex-1 bg-gray-100 text-gray-600 dark:text-gray-400 dark:text-gray-500 py-3 rounded-xl font-bold"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
