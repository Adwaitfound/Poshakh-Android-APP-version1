import React from 'react'

export default function Spinner({ className = '' }) {
    return (
        <div className={`spinner ${className}`} aria-hidden="true"></div>
    )
}
