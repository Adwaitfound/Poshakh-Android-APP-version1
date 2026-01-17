import React, { useEffect, useRef, useState } from 'react'
import { collection, query, orderBy, onSnapshot, limit, doc, updateDoc } from 'firebase/firestore'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import { getDb } from '../firebase'
import { Bell, X } from 'lucide-react'

export default function NotificationsCenter() {
    const [notifications, setNotifications] = useState([])
    const [isOpen, setIsOpen] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)
    const deliveredRef = useRef(new Set())

    // Request local notification permissions on native platforms
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return
        LocalNotifications.requestPermissions().catch(err => console.warn('LocalNotifications permission error', err))
    }, [])

    useEffect(() => {
        const db = getDb()
        const q = query(
            collection(db, 'notifications'),
            orderBy('createdAt', 'desc'),
            limit(50)
        )

        const unsubscribe = onSnapshot(q, snapshot => {
            const allNotifs = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
                createdAt: d.data().createdAt?.toDate?.() || new Date()
            }))
            const unreadNotifs = allNotifs.filter(n => !n.read)
            setNotifications(unreadNotifs)
            const unread = unreadNotifs.length
            setUnreadCount(unread)

            // Trigger native/local notifications for new unread items on device
            if (Capacitor.isNativePlatform()) {
                const fresh = unreadNotifs.filter(n => !deliveredRef.current.has(n.id))
                if (fresh.length > 0) {
                    LocalNotifications.schedule({
                        notifications: fresh.map((n, idx) => ({
                            id: Math.floor(Math.random() * 1_000_000) + idx,
                            title: n.title || 'Update',
                            body: n.message || '',
                            schedule: { at: new Date(Date.now() + 500) },
                            smallIcon: 'ic_launcher',
                            iconColor: '#16a34a',
                            extra: { notificationId: n.id }
                        }))
                    }).catch(err => console.warn('LocalNotifications schedule error', err))
                    fresh.forEach(n => deliveredRef.current.add(n.id))
                }
            }
        }, err => {
            console.error('Error listening to notifications:', err)
        })

        return () => unsubscribe()
    }, [])

    const formatTime = (date) => {
        if (!date) return 'now'
        const now = new Date()
        const diff = Math.floor((now - date) / 1000)
        if (diff < 60) return 'just now'
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
        return date.toLocaleDateString()
    }

    const getTypeColor = (type) => {
        const colors = {
            login: 'bg-blue-100 text-blue-800 border-blue-300',
            order: 'bg-green-100 text-green-800 border-green-300',
            inventory: 'bg-amber-100 text-amber-800 border-amber-300',
            stock: 'bg-purple-100 text-purple-800 border-purple-300',
            warning: 'bg-red-100 text-red-800 border-red-300',
        }
        return colors[type] || 'bg-gray-100 text-gray-800 border-gray-300'
    }

    const handleNotificationClick = async (notif) => {
        try {
            const db = getDb()
            await updateDoc(doc(db, 'notifications', notif.id), { read: true })
        } catch (e) {
            console.error('Failed to mark notification read', e)
        } finally {
            // Optimistically remove from UI
            setNotifications(prev => prev.filter(n => n.id !== notif.id))
            setUnreadCount(prev => Math.max(0, prev - 1))
        }
    }

    const markAllRead = async () => {
        const current = notifications
        setNotifications([])
        setUnreadCount(0)
        try {
            const db = getDb()
            await Promise.all(current.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true })))
        } catch (e) {
            console.error('Failed to mark all read', e)
        }
    }

    return (
        <div className="relative">
            {/* Bell Icon Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-lime-glow hover:bg-emerald-700 rounded-lg transition"
                title="Notifications"
            >
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Notifications Panel */}
            {isOpen && (
                <div className="fixed inset-x-2 sm:right-4 sm:left-auto top-16 sm:top-12 w-[92vw] sm:w-96 max-w-md mx-auto bg-gray-900 rounded-xl shadow-2xl border-2 border-lime-glow z-50 max-h-[70vh] sm:max-h-96 overflow-y-auto">
                    <div className="p-4 border-b border-lime-glow/30 sticky top-0 bg-emerald-pine flex justify-between items-center gap-2">
                        <h3 className="text-lg font-bold text-lime-glow">Activity Log</h3>
                        <div className="flex items-center gap-2">
                            {notifications.length > 0 && (
                                <button
                                    onClick={markAllRead}
                                    className="text-xs font-semibold text-white/80 hover:text-lime-glow transition"
                                >
                                    Mark all read
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-lime-glow hover:text-red-400 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {notifications.length === 0 ? (
                        <div className="p-6 text-center text-gray-500">
                            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No unread notifications</p>
                        </div>
                    ) : (
                        <div className="space-y-2 p-3">
                            {notifications.map(notif => (
                                <button
                                    key={notif.id}
                                    onClick={() => handleNotificationClick(notif)}
                                    className={`w-full text-left p-3 rounded-lg border-l-4 ${getTypeColor(notif.type)} transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-lime-glow/60`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <p className="font-semibold text-sm">{notif.title}</p>
                                            <p className="text-xs opacity-75 mt-1">{notif.message}</p>
                                            <p className="text-xs opacity-60 mt-1">{formatTime(notif.createdAt)}</p>
                                        </div>
                                        {notif.user && (
                                            <span className="text-xs font-mono opacity-75 ml-2">
                                                {notif.user}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
