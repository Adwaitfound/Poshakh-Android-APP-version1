import React, { createContext, useContext, useState } from 'react'
import { logLogin } from '../lib/notificationLogger'

const AuthContext = createContext()

const USERS = {
    'Adwait': { name: 'Adwait', role: 'admin' },
    'Avani': { name: 'Avani', role: 'admin' },
    'Binay': { name: 'Binay', role: 'staff' }
}

export function useAuth() {
    return useContext(AuthContext)
}

export function AuthProvider({ children }) {
    const [userProfile, setUserProfile] = useState(() => {
        const saved = localStorage.getItem('poshakh-user')
        if (!saved) return null
        try {
            return JSON.parse(saved)
        } catch (e) {
            console.warn('Corrupt user in storage, clearing')
            localStorage.removeItem('poshakh-user')
            return null
        }
    })
    const [loading, setLoading] = useState(false)
    const [isTransitioning, setIsTransitioning] = useState(false)

    const login = async (name) => {
        setIsTransitioning(true)
        try {
            const normalizedName = name.trim()
            const user = USERS[normalizedName]

            if (!user) {
                return { ok: false, message: 'User not found. Please use: Adwait, Avani, or Binay' }
            }

            setUserProfile(user)
            localStorage.setItem('poshakh-user', JSON.stringify(user))

            // Log the login
            try {
                await logLogin(normalizedName)
            } catch (e) {
                console.warn('Failed to log login:', e)
            }

            return { ok: true }
        } finally {
            setIsTransitioning(false)
        }
    }

    const logout = async () => {
        setIsTransitioning(true)
        try {
            setUserProfile(null)
            localStorage.removeItem('poshakh-user')
        } finally {
            setIsTransitioning(false)
        }
    }

    const value = {
        userProfile,
        loading,
        login,
        logout,
        isTransitioning,
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}
