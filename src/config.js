// API configuration - checks environment variable first, falls back to localhost
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

console.log('🔧 API Base URL:', API_BASE_URL)
