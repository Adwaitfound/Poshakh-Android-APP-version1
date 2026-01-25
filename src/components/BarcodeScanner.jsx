import React, { useState, useRef, useEffect } from 'react'
import { X, Loader, AlertCircle, Camera } from 'lucide-react'

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
  const cooldownPeriod = 1500 // 1.5 seconds cooldown to prevent duplicates

  // Start camera when modal opens
  useEffect(() => {
    if (visible && !scanning) {
      startCamera()
    }
    return () => {
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream

        // Start barcode detection after video loads
        videoRef.current.onloadedmetadata = () => {
          startBarcodeDetection()
        }
      }
    } catch (err) {
      console.error('Camera error:', err)
      setError(`Camera access denied: ${err.message}. Use manual input below.`)
      setScanning(false)
      setShowManualInput(true)
    }
  }

  const startBarcodeDetection = async () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const detectFrame = async () => {
      if (!video.paused && !video.ended) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        try {
          // Try to detect barcode using canvas
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const detected = await detectBarcodeFromImage(imageData)

          if (detected) {
            const now = Date.now()
            const timeSinceLastScan = now - lastScanTimeRef.current
            
            // Prevent duplicates: check if same code scanned within cooldown period
            if (detected === lastScannedRef.current && timeSinceLastScan < cooldownPeriod) {
              // Same code too soon - ignore and continue scanning
              animationRef.current = requestAnimationFrame(detectFrame)
              return
            }
            
            // Valid new scan - update tracking
            lastScannedRef.current = detected
            lastScanTimeRef.current = now
            
            // Show success feedback
            setScanSuccess(true)
            setTimeout(() => setScanSuccess(false), 500)
            
            if (batchMode) {
              // In batch mode, keep camera open and reset for next scan
              onScanned(detected)
              // Continue scanning after brief pause
              animationRef.current = requestAnimationFrame(detectFrame)
              return
            } else {
              // Single mode - stop and close
              stopCamera()
              onScanned(detected)
              return
            }
          }
        } catch (err) {
          console.error('Detection error:', err)
        }

        animationRef.current = requestAnimationFrame(detectFrame)
      }
    }

    animationRef.current = requestAnimationFrame(detectFrame)
  }

  /**
   * Simple barcode detection from image data
   * This is a basic implementation - for production, use a library like:
   * - html5-qrcode (web)
   * - @react-native-ml-kit/barcode-scanning (React Native)
   */
  const detectBarcodeFromImage = async (imageData) => {
    // For this implementation, we'll use the Barcode Detection API if available
    if ('BarcodeDetector' in window) {
      try {
        const barcodes = await new window.BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8']
        }).detect(imageData)

        if (barcodes && barcodes.length > 0) {
          return barcodes[0].rawValue
        }
      } catch (err) {
        console.error('Barcode API error:', err)
      }
    }

    // Fallback: No detection API, user will need to use manual input
    return null
  }

  const stopCamera = () => {
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
    <div className="fixed inset-0 bg-black z-[80] flex flex-col">
      <div className="w-full h-full flex flex-col bg-gray-950">
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
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          <canvas
            ref={canvasRef}
            className="hidden"
          />

          {/* Scanning Indicator */}
          {scanning && !scanSuccess && (
            <div className="absolute inset-0 flex items-center justify-center">
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
