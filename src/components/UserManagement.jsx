import React, { useState, useEffect } from 'react'
import { getDb } from '../firebase'
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { UserCheck, UserX, Shield, Users as UsersIcon } from 'lucide-react'

export default function UserManagement() {
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const db = getDb()
        const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            setUsers(usersData)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [])

    const handleApprove = async (userEmail, role) => {
        try {
            const db = getDb()
            await updateDoc(doc(db, 'users', userEmail), {
                approved: true,
                role: role,
                approvedAt: new Date().toISOString()
            })
            alert(`User approved as ${role}!`)
        } catch (error) {
            console.error('Error approving user:', error)
            alert('Error approving user: ' + error.message)
        }
    }

    const handleReject = async (userEmail) => {
        if (!confirm('Are you sure you want to reject this user?')) return

        try {
            const db = getDb()
            await updateDoc(doc(db, 'users', userEmail), {
                approved: false,
                rejected: true,
                rejectedAt: new Date().toISOString()
            })
            alert('User rejected')
        } catch (error) {
            console.error('Error rejecting user:', error)
            alert('Error rejecting user: ' + error.message)
        }
    }

    const handleUpdateRole = async (userEmail, newRole) => {
        try {
            const db = getDb()
            await updateDoc(doc(db, 'users', userEmail), {
                role: newRole,
                updatedAt: new Date().toISOString()
            })
            alert(`User role updated to ${newRole}!`)
        } catch (error) {
            console.error('Error updating role:', error)
            alert('Error updating role: ' + error.message)
        }
    }

    const pendingUsers = users.filter(u => !u.approved && !u.rejected)
    const approvedUsers = users.filter(u => u.approved)
    const rejectedUsers = users.filter(u => u.rejected)

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 dark:text-gray-400 dark:text-gray-500 users...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6 pb-20">
            <div className="flex items-center gap-3 mb-6">
                <Shield className="w-8 h-8 text-brand" />
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white Management</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 users and manage roles</p>
                </div>
            </div>

            {/* Pending Approvals */}
            {pendingUsers.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card p-6 border dark:border-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <UserCheck className="w-5 h-5 text-yellow-600" />
                        Pending Approvals ({pendingUsers.length})
                    </h3>
                    <div className="space-y-3">
                        {pendingUsers.map(user => (
                            <div key={user.id} className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-900
                                        <p className="text-sm text-gray-600
                                        <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                                            Requested: {new Date(user.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <button
                                            onClick={() => handleApprove(user.id, 'employee')}
                                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2"
                                        >
                                            <UsersIcon className="w-4 h-4" />
                                            Approve as Employee
                                        </button>
                                        <button
                                            onClick={() => handleApprove(user.id, 'admin')}
                                            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition flex items-center justify-center gap-2"
                                        >
                                            <Shield className="w-4 h-4" />
                                            Approve as Admin
                                        </button>
                                        <button
                                            onClick={() => handleReject(user.id)}
                                            className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-200 transition"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Approved Users */}
            <div className="bg-white rounded-2xl shadow-card p-6 border dark:border-gray-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <UsersIcon className="w-5 h-5 text-green-600" />
                    Approved Users ({approvedUsers.length})
                </h3>
                <div className="space-y-3">
                    {approvedUsers.length === 0 ? (
                        <p className="text-center text-gray-400 dark:text-gray-500 py-4">No approved users yet</p>
                    ) : (
                        approvedUsers.map(user => (
                            <div key={user.id} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-bold text-gray-900
                                            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${user.role === 'admin'
                                                    ? 'bg-purple-100 text-purple-700'
                                                    : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                {user.role === 'admin' ? '👑 Admin' : '👤 Employee'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-600
                                        <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                                            Approved: {user.approvedAt ? new Date(user.approvedAt).toLocaleDateString() : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <select
                                            value={user.role}
                                            onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                                            className="px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium focus:border-brand focus:outline-none"
                                        >
                                            <option value="employee">Employee</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Rejected Users */}
            {rejectedUsers.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card p-6 border dark:border-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <UserX className="w-5 h-5 text-red-600" />
                        Rejected Users ({rejectedUsers.length})
                    </h3>
                    <div className="space-y-3">
                        {rejectedUsers.map(user => (
                            <div key={user.id} className="bg-red-50 border border-red-200 rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-gray-900
                                        <p className="text-sm text-gray-600
                                        <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                                            Rejected: {user.rejectedAt ? new Date(user.rejectedAt).toLocaleDateString() : 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
