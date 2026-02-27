import React, { useState, useEffect } from 'react'
import { X, Download, Printer, Copy, AlertCircle, QrCode } from 'lucide-react'
import { generateShopdeckQRData, generateShopdeckQRUrl } from '../lib/shopdeckQRGenerator'

export default function ShopdeckQRGenerator({ order, onClose }) {
  const [qrUrl, setQrUrl] = useState(null)
  const [qrData, setQrData] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      // Generate QR data from the order
      const data = generateShopdeckQRData(order)
      setQrData(data)

      // Generate QR URL
      const url = generateShopdeckQRUrl(order)
      setQrUrl(url)
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to generate QR code')
      console.error('QR Generation Error:', err)
    } finally {
      setLoading(false)
    }
  }, [order])

  const handleDownload = async () => {
    if (!qrUrl) return

    try {
      const response = await fetch(qrUrl)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `Shopdeck_QR_${order.orderId || 'order'}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Download error:', err)
      setError('Failed to download QR code')
    }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=600')
    const html = `
      <html>
        <head>
          <title>Shopdeck QR Code - ${order.orderId}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              padding: 20px;
              font-family: Arial, sans-serif;
              background: white;
            }
            .container {
              text-align: center;
            }
            img {
              max-width: 100%;
              height: auto;
              margin: 20px 0;
              border: 2px solid #333;
              padding: 10px;
            }
            .info {
              margin-top: 20px;
              font-size: 14px;
            }
            .order-id {
              font-weight: bold;
              font-size: 18px;
              margin: 10px 0;
            }
            @media print {
              body {
                height: auto;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Shopdeck Order QR Code</h2>
            <div class="order-id">${order.orderId}</div>
            <img src="${qrUrl}" alt="QR Code" />
            <div class="info">
              <p><strong>Customer:</strong> ${order.customerName}</p>
              <p><strong>Phone:</strong> ${order.phone || 'N/A'}</p>
              <p><small>Generated: ${new Date().toLocaleString()}</small></p>
            </div>
          </div>
          <script>
            window.onload = () => window.print()
          </script>
        </body>
      </html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
  }

  const handleCopyData = () => {
    if (qrData) {
      navigator.clipboard.writeText(qrData)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6 flex items-center justify-between border-b border-purple-800">
          <div className="flex items-center gap-3">
            <QrCode size={24} />
            <h2 className="text-xl font-bold">Generate Shopdeck QR Code</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-purple-500 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
              <div>
                <p className="font-semibold text-red-900">Error generating QR code</p>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          ) : qrUrl ? (
            <div className="space-y-6">
              {/* QR Code Display */}
              <div className="flex justify-center">
                <div className="bg-gray-50 p-4 rounded-lg border-2 border-dashed border-purple-300">
                  <img
                    src={qrUrl}
                    alt="Shopdeck QR Code"
                    className="block"
                    onError={() => setError('Failed to load QR code image')}
                  />
                </div>
              </div>

              {/* Order Information */}
              <div className="bg-purple-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-semibold text-purple-900">Order ID:</span>
                  <span className="text-purple-700 font-mono">{order.orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-purple-900">Customer:</span>
                  <span className="text-purple-700">{order.customerName}</span>
                </div>
                {order.phone && (
                  <div className="flex justify-between">
                    <span className="font-semibold text-purple-900">Phone:</span>
                    <span className="text-purple-700">{order.phone}</span>
                  </div>
                )}
                {order.totalPrice && (
                  <div className="flex justify-between">
                    <span className="font-semibold text-purple-900">Price:</span>
                    <span className="text-purple-700">{order.totalPrice}</span>
                  </div>
                )}
              </div>

              {/* QR Data (for reference) */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-600 mb-2">Encoded Data Format (Pipe-Delimited):</p>
                <div className="bg-white p-3 rounded border border-gray-200 font-mono text-xs overflow-x-auto text-gray-700 break-all">
                  {qrData}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={handlePrint}
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                >
                  <Printer size={18} />
                  Print QR Code
                </button>

                <button
                  onClick={handleDownload}
                  className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                >
                  <Download size={18} />
                  Download QR Code (PNG)
                </button>

                <button
                  onClick={handleCopyData}
                  className="flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                >
                  <Copy size={18} />
                  {copied ? 'Copied to Clipboard!' : 'Copy QR Data'}
                </button>
              </div>

              {/* Instructions */}
              <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded text-sm text-amber-900">
                <p className="font-semibold mb-2">📋 How to use this QR code:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Print the QR code or save it to your computer</li>
                  <li>Attach it to the Shopdeck packing slip</li>
                  <li>Scan it with our barcode scanner to auto-fill order details</li>
                  <li>The scanner will extract: Order ID, Customer, Phone, Address, Price, and Items</li>
                </ol>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
