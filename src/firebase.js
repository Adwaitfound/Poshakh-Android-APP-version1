import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, signInAnonymously } from 'firebase/auth'
import { getFirestore, collection, onSnapshot, query, doc, setDoc, getDoc, enableNetwork } from 'firebase/firestore'

// Replace values below or use the provided default from your local index.html
export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDUK-H7scDD-9t_yVASmG34ypw7AlKwNTY",
    authDomain: "poshakh-stock.firebaseapp.com",
    projectId: "poshakh-stock",
    storageBucket: "poshakh-stock.firebasestorage.app",
    messagingSenderId: "97524547700",
    appId: "1:97524547700:web:08f8d39ed9be7ec75a9121"
}

let app
export function initFirebase(config) {
    // Allow overriding via Vite env vars (VITE_FIREBASE_*) when running locally
    const env = typeof import.meta !== 'undefined' ? import.meta.env : {}
    const envConfig = {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID
    }

    const finalConfig = config || (Object.values(envConfig).some(v => v) ? { ...FIREBASE_CONFIG, ...Object.fromEntries(Object.entries(envConfig).filter(([, v]) => v)) } : FIREBASE_CONFIG)

    if (!app) app = initializeApp(finalConfig)
    return app
}

export function emailSignIn(email, password) {
    if (!app) initFirebase()
    const auth = getAuth(app)
    return signInWithEmailAndPassword(auth, email, password)
}

export function emailSignUp(email, password) {
    if (!app) initFirebase()
    const auth = getAuth(app)
    return createUserWithEmailAndPassword(auth, email, password)
}

export function googleSignIn() {
    if (!app) initFirebase()
    const auth = getAuth(app)
    const provider = new GoogleAuthProvider()
    return signInWithPopup(auth, provider)
}

export function anonymousSignIn() {
    if (!app) initFirebase()
    const auth = getAuth(app)
    return signInAnonymously(auth)
}

export function signOutUser() {
    if (!app) initFirebase()
    const auth = getAuth(app)
    return signOut(auth)
}

export async function getUserRole(email) {
    if (!app) initFirebase()
    const db = getFirestore(app)
    try {
        // Ensure network is enabled
        await enableNetwork(db)
        const userDoc = await getDoc(doc(db, 'users', email))
        return userDoc.exists() ? userDoc.data() : null
    } catch (error) {
        console.error('Error getting user role:', error)
        // If offline, return null to trigger account creation on reconnect
        if (error.code === 'unavailable' || error.message.includes('offline')) {
            return null
        }
        throw error
    }
}

export async function createUserProfile(email, data) {
    if (!app) initFirebase()
    const db = getFirestore(app)
    try {
        // Ensure network is enabled
        await enableNetwork(db)
        await setDoc(doc(db, 'users', email), data)
    } catch (error) {
        console.error('Error creating user profile:', error)
        throw error
    }
}

export function subscribeCollection(name, cb, onError) {
    if (!app) initFirebase()
    const db = getFirestore(app)
    const q = query(collection(db, name))
    return onSnapshot(q, cb, onError || (error => {
        console.error(`Error in collection '${name}':`, error)
    }))
}

export function getDb() {
    if (!app) initFirebase()
    return getFirestore(app)
}

