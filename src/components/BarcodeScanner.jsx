import React, { useState, useRef, useEffect } from 'react'
import { X, Loader, AlertCircle, Camera } from 'lucide-react'
import { Html5QrcodeScanner } from 'html5-qrcode'

/**
 * BarcodeScanner Component
 * Provides camera interface for scanning QR codes/barcodes
 * Supports both web (html5-qrcode) and mobile (ML Kit)
 */
export default function BarcodeScanner({ visible, onScanned, onClose, batchMode = false, scannedCount = 0 }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [manualInput, setManualInput] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)
  const [scanSuccess, setScanSuccess] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const lastScannedRef = useRef(null)
  const lastScanTimeRef = useRef(0)
  const scannerRef = useRef(null)
  const cooldownPeriod = 1500 // 1.5 seconds cooldown to prevent duplicates

  // Start camera when modal opens
  useEffect(() => {
    if (visible && !scanning) {
      startCamera()
    }
    return () => {
      // Cleanup scanner on unmount
      if (scannerRef.current) {
        try {
          scannerRef.current.clear()
          scannerRef.current = null
        } catch (err) {
          console.log('Scanner cleanup error:', err)
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [visible])

  const startCamera = async () => {
    setError('')
    setScanning(true)

    try {
      // Clean up existing scanner first
      if (scannerRef.current) {
        try {
          await scannerRef.current.clear()
          scannerRef.current = null
        } catch (err) {
          console.log('Error clearing previous scanner:', err)
        }
      }

      // Small delay to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 100))

      // Initialize Html5QrcodeScanner
      const scanner = new Html5QrcodeScanner(
        'qr-reader', // ID of the element where scanner will render
        { 
          fps: 10,
          qrbox: { width: 250, height: 250 },
          disableFlip: false,
          aspectRatio: 1.0
        },
        /* verbose= */ false
      )

      scannerRef.current = scanner

      scanner.render(
        (decodedText) => {
          // Success callback
          const now = Date.now()
          const timeSinceLastScan = now - lastScanTimeRef.current
          
          // Prevent duplicates
          if (decodedText === lastScannedRef.current && timeSinceLastScan < cooldownPeriod) {
            return // Same code too soon - ignore
          }
          
          lastScannedRef.current = decodedText
          lastScanTimeRef.current = now
          
          setScanSuccess(true)
          setTimeout(() => setScanSuccess(false), 500)
          
          if (batchMode) {
            onScanned(decodedText)
            // Keep scanning
          } else {
            scanner.clear()
            stopCamera()
            onScanned(decodedText)
          }
        },
        (error) => {
          // Error callback - suppress spam
          if (error && !error.toString().includes('NotFoundException')) {
            console.log('Scan error:', error)
          }
        }
      )
    } catch (err) {
      console.error('Scanner init error:', err)
      setError(`Scanner error: ${err.message}. Use manual input.`)
      setScanning(false)
      setShowManualInput(true)
    }
  }

  const startBarcodeDetection = async () => {
    // Html5QrcodeScanner handles detection internally
    // This is kept for backwards compatibility but not used
  }

  const stopCamera = () => {
    if (scannerRef.current) {
      scannerRef.current.clear()
      scannerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    setScanning(false)
  }

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      if (!batchMode) {
        stopCamera()
      }
      onScanned(manualInput.trim())
      setManualInput('')
    }
  }

  const handleClose = () => {
    stopCamera()
    setManualInput('')
    setShowManualInput(false)
    setError('')
    onClose()
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 bg-black z-[80] flex flex-col w-screen h-screen overflow-hidden">
      <style>{`
        body { overflow: hidden; }
        .scanner-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100vw;
          height: 100vh;
          z-index: 80;
        }
      `}</style>
      <div className="w-screen h-screen flex flex-col bg-gray-950 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-emerald-pine border-b border-lime-glow/40 flex justify-between items-center flex-shrink-0 safe-area-top">
          <style>{`
            .safe-area-top {
              padding-top: calc(env(safe-area-inset-top) + 1rem);
            }
            @media (min-width: 640px) {
              .safe-area-top {
                padding-top: 1.25rem;
              }
            }
          `}</style>
          <div className="flex-1">
            <h3 className="text-xl sm:text-lg font-bold text-white flex items-center gap-2">
              <Camera className="w-6 h-6 sm:w-5 sm:h-5" />
              {batchMode ? 'Batch Scan Mode' : 'Scan QR Code'}
            </h3>
            {batchMode && scannedCount > 0 && (
              <p className="text-sm sm:text-xs text-lime-glow mt-1 font-semibold">
                ✓ {scannedCount} scanned • Keep scanning or close to review
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-3 sm:p-2 hover:bg-white/10 active:bg-white/20 rounded-full transition text-white touch-manipulation"
          >
            <X className="w-6 h-6 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Camera View */}
        <div className="relative bg-black flex-1 overflow-hidden flex items-center justify-center">
          <div id="qr-reader" style={{ width: '100%' }} className="flex-1"></div>          
          {/* Scanning Indicator */}
          {scanning && !scanSuccess && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* Larger scanning frame with corner guides */}
              <div className="relative w-64 h-64">
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-lime-glow rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-lime-glow rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-lime-glow rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-lime-glow rounded-br-lg"></div>
                
                {/* Scanning line animation */}
                <div
                  className="absolute inset-x-0 bg-gradient-to-b from-transparent via-lime-glow/70 to-transparent"
                  style={{
                    animation: 'scan 2s linear infinite',
                    height: '3px'
                  }}
                />
                
                {/* Center guide text */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-lime-glow text-xs font-bold bg-black/60 px-3 py-1 rounded-full">
                    {batchMode ? 'Scan QR Codes' : 'Position QR Code'}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Success Flash */}
          {scanSuccess && (
            <div className="absolute inset-0 bg-green-500/40 flex items-center justify-center animate-pulse">
              <div className="bg-green-600 text-white px-6 py-3 rounded-full font-bold text-lg shadow-xl">
                ✓ Scanned!
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && !showManualInput && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-4">
              <div className="bg-red-900/50 border border-red-500/50 rounded-2xl p-4 text-center">
                <AlertCircle className="w-8 h-8 text-red-300 mx-auto mb-2" />
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Manual Input Section */}
        {showManualInput && (
          <div className="p-5 sm:p-4 border-t border-lime-glow/40 bg-emerald-900/20 space-y-3 safe-area-bottom">
            <p className="text-base sm:text-sm text-emerald-100">
              Camera not available? Enter barcode manually:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleManualSubmit()}
                placeholder="Paste barcode data here..."
                className="flex-1 px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm rounded-xl sm:rounded-lg bg-emerald-900/50 border border-lime-glow/50 text-white placeholder-emerald-300/50 focus:outline-none focus:border-lime-glow touch-manipulation"
                autoFocus
              />
            </div>
            <button
              onClick={handleManualSubmit}
              disabled={!manualInput.trim()}
              className="w-full px-6 py-4 sm:px-4 sm:py-3 bg-lime-glow text-emerald-900 font-bold rounded-xl sm:rounded-lg hover:bg-lime-300 active:bg-lime-400 disabled:opacity-50 disabled:cursor-not-allowed transition text-base sm:text-sm touch-manipulation"
            >
              Use This Data
            </button>
          </div>
        )}

        {/* Instructions */}
        {scanning && !error && !showManualInput && (
          <div className="p-5 sm:p-4 bg-emerald-900/20 border-t border-lime-glow/40 safe-area-bottom">
            <p className="text-sm sm:text-xs text-emerald-100 text-center font-medium">
              {batchMode ? 'Keep scanning QR codes or close when done' : 'Point camera at QR code. Auto-detects and closes.'}
            </p>
            <button
              onClick={() => setShowManualInput(true)}
              className="w-full mt-3 sm:mt-2 px-4 py-3 sm:px-3 sm:py-2 text-sm sm:text-xs text-lime-glow hover:text-lime-300 active:text-lime-400 font-bold underline touch-manipulation"
            >
              Or enter manually
            </button>
          </div>
        )}

        {/* Fallback notice */}
        {!scanning && !showManualInput && (
          <div className="p-4 bg-amber-900/20 border-t border-amber-500/40 text-center">
            <p className="text-xs text-amber-200 mb-2">
              Barcode Detection API not available in your browser
            </p>
            <button
              onClick={() => setShowManualInput(true)}
              className="w-full px-3 py-2 bg-amber-600/50 hover:bg-amber-600/70 text-amber-100 rounded-lg text-sm font-semibold transition"
            >
              Enter Barcode Manually
            </button>
          </div>
        )}

        {/* Animation Styles */}
        <style>{`
          @keyframes scan {
            0% {
              top: 0;
            }
            100% {
              top: 100%;
            }
          }
        `}</style>
      </div>
    </div>
  )
}
