import React, { createContext, useContext, useState, useCallback } from 'react'

const NotificationContext = createContext()

export function useNotification() {
    return useContext(NotificationContext)
}

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([])

    const addNotification = useCallback((message, type = 'info', duration = 4000) => {
        const id = Date.now()
        const notification = { id, message, type }
        setNotifications(prev => [...prev, notification])

        if (duration > 0) {
            setTimeout(() => {
                removeNotification(id)
            }, duration)
        }

        return id
    }, [])

    const removeNotification = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id))
    }, [])

    const notify = {
        success: (msg, duration) => addNotification(msg, 'success', duration),
        error: (msg, duration) => addNotification(msg, 'error', duration),
        info: (msg, duration) => addNotification(msg, 'info', duration),
        warning: (msg, duration) => addNotification(msg, 'warning', duration),
    }

    return (
        <NotificationContext.Provider value={{ addNotification, removeNotification, notify, notifications }}>
            {children}
        </NotificationContext.Provider>
    )
}
