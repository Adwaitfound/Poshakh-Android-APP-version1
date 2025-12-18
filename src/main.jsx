import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

import './styles.css'

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <div className="safe-area-inset-top safe-area-inset-bottom">
            <App />
        </div>
    </React.StrictMode>
)
