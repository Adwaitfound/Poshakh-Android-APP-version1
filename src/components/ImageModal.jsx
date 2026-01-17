import React from 'react'
import { X } from 'lucide-react'

export default function ImageModal({ url, onClose }) {
    if (!url) return null

    return (
        <div
            className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-sm modal-enter"
            onClick={onClose}
        >
            <img
                src={url}
                className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl"
                alt="Full size"
                onClick={e => e.stopPropagation()}
            />
            <button
                className="absolute top-6 right-6 text-white p-3 bg-white rounded-full hover:bg-white active:bg-white dark:bg-gray-950/40"
                onClick={onClose}
            >
                <X className="w-6 h-6" />
            </button>
        </div>
    )
}
