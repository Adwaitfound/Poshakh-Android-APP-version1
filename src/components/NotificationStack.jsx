import React from 'react'
import { useNotification } from '../context/NotificationProvider'

export default function NotificationStack() {
    const { notifications, removeNotification } = useNotification()

    const typeStyles = {
        success: 'bg-green-600 text-white border-green-700',
        error: 'bg-red-600 text-white border-red-700',
        info: 'bg-blue-600 text-white border-blue-700',
        warning: 'bg-amber-600 text-white border-amber-700',
    }

    return (
        <div className="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none">
            {notifications.map(notif => (
                <div
                    key={notif.id}
                    className={`
                        ${typeStyles[notif.type] || typeStyles.info}
                        px-4 py-3 rounded-lg shadow-lg border-l-4 flex items-center justify-between
                        animate-in fade-in slide-in-from-top-2 duration-300
                        pointer-events-auto max-w-sm
                    `}
                >
                    <span className="text-sm font-medium">{notif.message}</span>
                    <button
                        onClick={() => removeNotification(notif.id)}
                        className="ml-3 text-lg leading-none hover:opacity-70 transition"
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    )
}
