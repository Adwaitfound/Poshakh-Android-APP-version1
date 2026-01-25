import React from 'react'
import { X } from 'lucide-react'

export default function ImageModal({ url, onClose }) {
    if (!url) return null

    const handleDownload = async () => {
        try {
            if (url.startsWith('data:')) {
                const [meta, data] = url.split(',')
                const mimeMatch = /data:(.*?);base64/.exec(meta)
                const mime = mimeMatch ? mimeMatch[1] : 'image/png'
                const binary = atob(data)
                const bytes = new Uint8Array(binary.length)
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                const blob = new Blob([bytes], { type: mime })
                const objectUrl = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = objectUrl
                const ext = mime.split('/')[1] || 'png'
                a.download = `image.${ext}`
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(objectUrl)
                return
            }
            try {
                const res = await fetch(url, { mode: 'cors' })
                const blob = await res.blob()
                const objectUrl = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = objectUrl
                const extGuess = blob.type?.split('/')[1] || 'jpg'
                a.download = `image.${extGuess}`
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(objectUrl)
            } catch {
                const a = document.createElement('a')
                a.href = url
                a.download = 'image'
                document.body.appendChild(a)
                a.click()
                a.remove()
            }
        } catch (e) {
            console.error('Failed to download image', e)
        }
    }

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
            <div className="absolute top-6 right-6 flex gap-2">
                <button
                    className="text-emerald-900 p-3 bg-white rounded-full shadow hover:shadow-md"
                    onClick={(e) => { e.stopPropagation(); handleDownload() }}
                >
                    ⬇️
                </button>
                <button
                    className="text-white p-3 bg-white rounded-full hover:bg-white active:bg-white dark:bg-gray-950/40"
                    onClick={(e) => { e.stopPropagation(); onClose && onClose() }}
                >
                    <X className="w-6 h-6" />
                </button>
            </div>
        </div>
    )
}
