import React, { useState, useRef } from 'react'
import { X, Upload, Camera, Loader, CheckCircle, AlertCircle, Eye } from 'lucide-react'
import Tesseract from 'tesseract.js'
import { parseShopdeckSlip, validateExtractedData } from '../lib/parseShopdeckSlip'
import { getDb } from '../firebase'
import { collection, getDocs } from 'firebase/firestore'

export default function ShopdeckSlipUploader({ inventoryItems = [], onExtractedData, onBatchSave, onClose }) {
  const [selectedImages, setSelectedImages] = useState([])
  const [processedOrders, setProcessedOrders] = useState([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [imagePreview, setImagePreview] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [extractedData, setExtractedData] = useState(null)
  const [validationErrors, setValidationErrors] = useState([])
  const [ocrText, setOcrText] = useState(null)
  const [progress, setProgress] = useState(0)
  const [showOCRText, setShowOCRText] = useState(false)
  const [editingFields, setEditingFields] = useState({})
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(null)
  const [selectedOrderIds, setSelectedOrderIds] = useState([])
  const [isSavingBatch, setIsSavingBatch] = useState(false)
  const fileInputRef = useRef(null)

  const getNextShopdeckSequenceNumber = async () => {
    try {
      const db = getDb()
      const ordersRef = collection(db, 'production_orders')
      const snapshot = await getDocs(ordersRef)
      
      let highestNum = 1000
      snapshot.forEach(doc => {
        const order = doc.data()
        const orderId = order.orderNumber || ''
        const match = orderId.match(/[Ss]hpdck(\d+)/)
        if (match) {
          const num = parseInt(match[1], 10)
          if (num > highestNum) {
            highestNum = num
          }
        }
      })
      
      return highestNum + 1
    } catch (error) {
      console.warn('Could not fetch highest order number, using fallback:', error)
      return Math.floor(Math.random() * 900000 + 1000)
    }
  }

  const normalizeOrderId = (value) => {
    const trimmed = (value || '').trim()
    if (!trimmed || trimmed.toLowerCase() === 'not available') return ''
    return trimmed
  }

  const sanitizeOrderIdPart = (value) => {
    const cleaned = String(value || '')
      .replace(/^Shpdck/i, '')
      .replace(/\s+/g, '')
      .replace(/[^A-Za-z0-9-]/g, '')
    return cleaned.toUpperCase()
  }

  const handleImageSelect = (files) => {
    if (!files || files.length === 0) return

    const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
    if (validFiles.length === 0) {
      alert('Please select valid image files')
      return
    }

    setSelectedImages(validFiles)
    setCurrentImageIndex(0)
    setProcessedOrders([])
    setSelectedOrderIndex(null)
    setSelectedOrderIds([])
    
    // Preview first image
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target.result)
    reader.readAsDataURL(validFiles[0])
  }

  const handleFileInputChange = (e) => {
    if (e.target.files) {
      handleImageSelect(e.target.files)
    }
  }

  const handleDragDrop = (e) => {
    e.preventDefault()
    handleImageSelect(e.dataTransfer.files)
  }

  const runOCR = async () => {
    if (selectedImages.length === 0) {
      alert('Please select images first')
      return
    }

    setIsProcessing(true)
    setProgress(0)
    const orders = [...processedOrders]
    let nextSequenceNumber = await getNextShopdeckSequenceNumber()

    try {
      for (let i = currentImageIndex; i < selectedImages.length; i++) {
        const file = selectedImages[i]
        const reader = new FileReader()
        
        await new Promise((resolve) => {
          reader.onload = async (e) => {
            try {
              const result = await Tesseract.recognize(e.target.result, 'eng', {
                logger: (m) => {
                  if (m.status === 'recognizing') {
                    setProgress(Math.round((i + m.progress) / selectedImages.length * 100))
                  }
                }
              })

              const text = result.data.text
              const parsed = parseShopdeckSlip(text, inventoryItems)
              const normalizedOrderId = normalizeOrderId(parsed.orderId)
              const baseId = `Shpdck${nextSequenceNumber}`
              const rawSuffix = sanitizeOrderIdPart(normalizedOrderId)
              const baseNumber = String(nextSequenceNumber)
              const shouldAppend = rawSuffix && rawSuffix !== baseId && rawSuffix !== baseNumber

              parsed.orderId = shouldAppend ? `${baseId}-${rawSuffix}` : baseId
              nextSequenceNumber += 1
              const validation = validateExtractedData(parsed)

              orders.push({
                index: i,
                orderId: parsed.orderId,
                customerName: parsed.customerName,
                data: parsed,
                text: text,
                valid: validation.isValid,
                errors: validation.errors
              })

              setCurrentImageIndex(i + 1)
              setProcessedOrders(orders)
            } catch (error) {
              console.error(`OCR Error for image ${i}:`, error)
              orders.push({
                index: i,
                orderId: `Error processing image ${i}`,
                customerName: error.message,
                data: null,
                text: null,
                valid: false,
                errors: [`OCR failed: ${error.message}`]
              })
              setProcessedOrders(orders)
            }
            resolve()
          }
          reader.readAsDataURL(file)
        })
      }

      const validIndexes = orders.filter(order => order.valid).map(order => order.index)
      const firstError = orders.find(order => !order.valid && order.data)
      setSelectedOrderIds(validIndexes)
      setSelectedOrderIndex(firstError ? firstError.index : (orders[0]?.index ?? null))
    } finally {
      setIsProcessing(false)
      setProgress(0)
    }
  }

  const handleConfirm = () => {
    if (processedOrders.length === 0) return

    const selectedValidOrders = processedOrders.filter(
      order => selectedOrderIds.includes(order.index) && order.valid && order.data
    )
    if (selectedValidOrders.length === 0) return

    for (const order of selectedValidOrders) {
      if (onExtractedData) {
        onExtractedData(order.data)
      }
    }

    onClose()
  }

  const handleConfirmSingle = () => {
    if (extractedData && onExtractedData) {
      const finalData = { ...extractedData, ...editingFields }
      onExtractedData(finalData)
      onClose()
    }
  }

  const handleFieldChange = (field, value) => {
    setEditingFields(prev => ({
      ...prev,
      [field]: value
    }))
    setExtractedData(prev => ({
      ...prev,
      [field]: value
    }))
    // Re-validate with updated data
    const updated = { ...extractedData, ...editingFields, [field]: value }
    const validation = validateExtractedData(updated)
    setValidationErrors(validation.errors)
  }

  const handleBatchFieldChange = (index, field, value) => {
    setProcessedOrders(prev => {
      const next = prev.map(order => {
        if (order.index !== index || !order.data) return order

        const updatedData = { ...order.data, [field]: value }
        const validation = validateExtractedData(updatedData)

        return {
          ...order,
          data: updatedData,
          orderId: updatedData.orderId,
          customerName: updatedData.customerName,
          valid: validation.isValid,
          errors: validation.errors
        }
      })

      return next
    })
  }

  const handleSelectAllValid = () => {
    setSelectedOrderIds(processedOrders.filter(order => order.valid).map(order => order.index))
  }

  const handleClearSelection = () => {
    setSelectedOrderIds([])
  }

  const handleBatchSaveOrders = async () => {
    const selectedOrders = processedOrders.filter(
      order => selectedOrderIds.includes(order.index) && order.valid && order.data
    )
    
    if (selectedOrders.length === 0) {
      alert('Please select valid orders to save')
      return
    }

    setIsSavingBatch(true)
    try {
      const ordersData = selectedOrders.map(order => order.data)
      if (onBatchSave) {
        const result = await onBatchSave(ordersData)
        if (result.success) {
          onClose()
        }
      }
    } catch (error) {
      console.error('Batch save error:', error)
      alert('Error saving orders: ' + error.message)
    } finally {
      setIsSavingBatch(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between border-b border-blue-800">
          <div className="flex items-center gap-3">
            <Upload size={24} />
            <h2 className="text-xl font-bold">Scan Shopdeck Packing Slip</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-blue-500 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Image Upload Area */}
          {selectedImages.length === 0 && processedOrders.length === 0 && (
            <div
              onDragEnter={handleDragDrop}
              onDragOver={handleDragDrop}
              onDrop={handleDragDrop}
              className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto mb-3 text-blue-600" size={32} />
              <p className="font-semibold text-gray-800 mb-1">Drop packing slip images here</p>
              <p className="text-sm text-gray-600 mb-4">or click to browse (single or multiple)</p>
              <p className="text-xs text-gray-500">Supports PNG, JPG, WebP</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
          )}

          {/* Files Selected Info */}
          {selectedImages.length > 0 && processedOrders.length === 0 && !isProcessing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="font-semibold text-blue-900 mb-2">
                📁 {selectedImages.length} packing slip image{selectedImages.length !== 1 ? 's' : ''} selected
              </p>
              <p className="text-sm text-blue-700 mb-3">Ready to extract data from all images</p>
              <button
                onClick={runOCR}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-shadow flex items-center justify-center gap-2"
              >
                <Camera size={18} />
                Process {selectedImages.length} Image{selectedImages.length !== 1 ? 's' : ''} with OCR
              </button>
            </div>
          )}

          {/* Batch Processing Progress */}
          {isProcessing && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3">
                <Loader className="animate-spin text-blue-600" size={24} />
                <span className="font-semibold text-gray-700">Processing {selectedImages.length} packing slip{selectedImages.length !== 1 ? 's' : ''}...</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-center text-sm text-gray-600">{progress}% complete</p>
            </div>
          )}

          {/* Batch Results Summary */}
          {processedOrders.length > 0 && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4 border border-green-200">
                <p className="font-semibold text-gray-800 mb-2">
                  ✓ Processed {processedOrders.length} image{processedOrders.length !== 1 ? 's' : ''}
                </p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="bg-white p-2 rounded border border-green-200">
                    <p className="text-xs text-gray-600">Valid Orders</p>
                    <p className="font-bold text-green-600">{processedOrders.filter(o => o.valid).length}</p>
                  </div>
                  <div className="bg-white p-2 rounded border border-yellow-200">
                    <p className="text-xs text-gray-600">With Errors</p>
                    <p className="font-bold text-yellow-600">{processedOrders.filter(o => !o.valid && o.data).length}</p>
                  </div>
                  <div className="bg-white p-2 rounded border border-red-200">
                    <p className="text-xs text-gray-600">Failed</p>
                    <p className="font-bold text-red-600">{processedOrders.filter(o => !o.data).length}</p>
                  </div>
                </div>
              </div>

              {/* Orders List */}
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>{selectedOrderIds.length} selected</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectAllValid}
                    className="text-blue-600 hover:text-blue-700 font-semibold"
                    type="button"
                  >
                    Select valid
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={handleClearSelection}
                    className="text-gray-600 hover:text-gray-700 font-semibold"
                    type="button"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {processedOrders.map((order, idx) => {
                  const isChecked = selectedOrderIds.includes(order.index)
                  const isActive = selectedOrderIndex === order.index

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedOrderIndex(order.index)}
                      className={`p-3 rounded-lg border-l-4 cursor-pointer transition-shadow ${
                        order.valid
                          ? 'bg-green-50 border-green-400'
                          : order.data
                          ? 'bg-yellow-50 border-yellow-400'
                          : 'bg-red-50 border-red-400'
                      } ${isActive ? 'ring-2 ring-blue-400' : ''}`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={isChecked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const nextChecked = e.target.checked
                              setSelectedOrderIds(prev => {
                                if (nextChecked) {
                                  return Array.from(new Set([...prev, order.index]))
                                }
                                return prev.filter(id => id !== order.index)
                              })
                            }}
                          />
                          <div>
                            <p className="font-semibold text-gray-800">{order.orderId || `Image ${order.index + 1}`}</p>
                            {order.customerName && <p className="text-xs text-gray-600">{order.customerName}</p>}
                          </div>
                        </div>
                        {order.valid ? (
                          <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
                        ) : order.data ? (
                          <AlertCircle size={18} className="text-yellow-600 flex-shrink-0" />
                        ) : (
                          <X size={18} className="text-red-600 flex-shrink-0" />
                        )}
                      </div>
                      {order.errors && order.errors.length > 0 && (
                        <p className="text-xs text-gray-600 mt-1">⚠️ {order.errors.join(', ')}</p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Selected Order Editor */}
              {(() => {
                const selectedOrder = processedOrders.find(order => order.index === selectedOrderIndex)
                if (!selectedOrder) return null

                if (!selectedOrder.data) {
                  return (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900">
                      This image failed OCR. Try re-uploading a clearer photo.
                    </div>
                  )
                }

                const statusText = selectedOrder.valid ? 'Valid' : 'Needs fixes'
                const statusClass = selectedOrder.valid ? 'text-green-700' : 'text-yellow-700'

                return (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-4 border border-gray-200">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-700">Review & Edit Selected Order</p>
                      <span className={`text-xs font-semibold ${statusClass}`}>{statusText}</span>
                    </div>

                    {selectedOrder.errors && selectedOrder.errors.length > 0 && (
                      <div className="text-xs text-gray-600">⚠️ {selectedOrder.errors.join(', ')}</div>
                    )}

                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Order ID</label>
                      <input
                        type="text"
                        value={selectedOrder.data.orderId}
                        onChange={(e) => handleBatchFieldChange(selectedOrder.index, 'orderId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Customer Name</label>
                      <input
                        type="text"
                        value={selectedOrder.data.customerName}
                        onChange={(e) => handleBatchFieldChange(selectedOrder.index, 'customerName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Shipping Address</label>
                      <textarea
                        value={selectedOrder.data.shippingAddress}
                        onChange={(e) => handleBatchFieldChange(selectedOrder.index, 'shippingAddress', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        rows="3"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">SKU ID</label>
                        <input
                          type="text"
                          value={selectedOrder.data.skuId}
                          onChange={(e) => handleBatchFieldChange(selectedOrder.index, 'skuId', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Size</label>
                        <select
                          value={selectedOrder.data.size || ''}
                          onChange={(e) => handleBatchFieldChange(selectedOrder.index, 'size', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value="">Select</option>
                          <option value="XS">XS</option>
                          <option value="S">S</option>
                          <option value="M">M</option>
                          <option value="L">L</option>
                          <option value="XL">XL</option>
                          <option value="XXL">XXL</option>
                          <option value="XXXL">XXXL</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Quantity</label>
                        <input
                          type="number"
                          value={selectedOrder.data.quantity}
                          onChange={(e) => handleBatchFieldChange(selectedOrder.index, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Price (Optional)</label>
                      <input
                        type="text"
                        value={selectedOrder.data.totalPrice}
                        onChange={(e) => handleBatchFieldChange(selectedOrder.index, 'totalPrice', e.target.value)}
                        placeholder="e.g., Rs. 1500"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Product Name</label>
                      <select
                        value={selectedOrder.data.outfitId || ''}
                        onChange={(e) => {
                          const selectedId = e.target.value
                          const selectedItem = inventoryItems.find(item => item.id === selectedId)
                          handleBatchFieldChange(selectedOrder.index, 'outfitId', selectedId)
                          handleBatchFieldChange(selectedOrder.index, 'productName', selectedItem?.name || '')
                          if (!selectedOrder.data.skuId && selectedItem?.skuId) {
                            handleBatchFieldChange(selectedOrder.index, 'skuId', selectedItem.skuId)
                          }
                          if (!selectedOrder.data.totalPrice && selectedItem?.sellingPrice) {
                            handleBatchFieldChange(selectedOrder.index, 'totalPrice', `Rs. ${selectedItem.sellingPrice}`)
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Select product</option>
                        {inventoryItems
                          .filter(item => item.type === 'outfit')
                          .map(item => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>
                )
              })()}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => {
                    setSelectedImages([])
                    setProcessedOrders([])
                    setCurrentImageIndex(0)
                    setImagePreview(null)
                    setSelectedOrderIndex(null)
                    setSelectedOrderIds([])
                  }}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  Upload Different
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={processedOrders.filter(o => selectedOrderIds.includes(o.index) && o.valid).length === 0}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-shadow flex items-center justify-center gap-2"
                >
                  <CheckCircle size={18} />
                  Add One-by-One
                </button>
                <button
                  onClick={handleBatchSaveOrders}
                  disabled={processedOrders.filter(o => selectedOrderIds.includes(o.index) && o.valid).length === 0 || isSavingBatch}
                  className="bg-gradient-to-r from-green-600 to-green-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-shadow flex items-center justify-center gap-2"
                >
                  {isSavingBatch ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      Save All {processedOrders.filter(o => selectedOrderIds.includes(o.index) && o.valid).length}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Single Image Preview */}
          {imagePreview && selectedImages.length === 1 && (
            <div className="space-y-3">
              <div className="relative">
                <img src={imagePreview} alt="Packing slip" className="w-full h-auto rounded-lg border border-gray-200" />
              </div>
            </div>
          )}

          {/* Extracted Data from Single Image (Legacy) */}
          {extractedData && selectedImages.length === 1 && (
            <div className="space-y-4">
              {/* Validation Status */}
              {validationErrors.length > 0 ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
                  <div>
                    <p className="font-semibold text-red-900">⚠️ Missing required fields:</p>
                    <ul className="text-red-700 text-sm mt-1 space-y-1">
                      {validationErrors.map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                    </ul>
                    <p className="text-red-700 text-xs mt-2">Review the OCR text and correct as needed</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex gap-3">
                  <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
                  <div>
                    <p className="font-semibold text-green-900">✓ Data extracted successfully</p>
                    <p className="text-green-700 text-sm">Ready to populate form</p>
                  </div>
                </div>
              )}

              {/* Extracted Data Preview - Editable */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-4 border border-gray-200">
                <p className="text-xs font-semibold text-gray-600 uppercase mb-3">✏️ Edit any fields if OCR made mistakes:</p>
                
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Order ID</label>
                  <input
                    type="text"
                    value={extractedData.orderId}
                    onChange={(e) => handleFieldChange('orderId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={extractedData.customerName}
                    onChange={(e) => handleFieldChange('customerName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Shipping Address</label>
                  <textarea
                    value={extractedData.shippingAddress}
                    onChange={(e) => handleFieldChange('shippingAddress', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    rows="3"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">SKU ID</label>
                    <input
                      type="text"
                      value={extractedData.skuId}
                      onChange={(e) => handleFieldChange('skuId', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Size</label>
                    <select
                      value={extractedData.size || ''}
                      onChange={(e) => handleFieldChange('size', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select</option>
                      <option value="XS">XS</option>
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                      <option value="XXL">XXL</option>
                      <option value="XXXL">XXXL</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Quantity</label>
                    <input
                      type="number"
                      value={extractedData.quantity}
                      onChange={(e) => handleFieldChange('quantity', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Price (Optional)</label>
                  <input
                    type="text"
                    value={extractedData.totalPrice}
                    onChange={(e) => handleFieldChange('totalPrice', e.target.value)}
                    placeholder="e.g., Rs. 1500"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Not always visible on packing slip labels</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase block mb-1">Product Name</label>
                  <select
                    value={extractedData.outfitId || ''}
                    onChange={(e) => {
                      const selectedId = e.target.value
                      const selectedItem = inventoryItems.find(item => item.id === selectedId)
                      handleFieldChange('outfitId', selectedId)
                      handleFieldChange('productName', selectedItem?.name || '')
                      if (!extractedData.skuId && selectedItem?.skuId) {
                        handleFieldChange('skuId', selectedItem.skuId)
                      }
                      if (!extractedData.totalPrice && selectedItem?.sellingPrice) {
                        handleFieldChange('totalPrice', `Rs. ${selectedItem.sellingPrice}`)
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select product</option>
                    {inventoryItems
                      .filter(item => item.type === 'outfit')
                      .map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                  </select>
                </div>

                {extractedData.outfitId && (
                  <div className="p-2 bg-blue-100 border border-blue-300 rounded text-xs text-blue-900">
                    ✓ Matched with inventory: <strong>{inventoryItems.find(i => i.id === extractedData.outfitId)?.name}</strong>
                  </div>
                )}
              </div>

              {/* Show OCR Text Button */}
              <button
                onClick={() => setShowOCRText(!showOCRText)}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
              >
                <Eye size={14} />
                {showOCRText ? 'Hide' : 'Show'} raw OCR text
              </button>

              {showOCRText && (
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-xs font-semibold overflow-x-auto max-h-48">
                  <pre className="whitespace-pre-wrap break-words">{ocrText}</pre>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setImagePreview(null)
                    setSelectedImages([])
                    setExtractedData(null)
                    setOcrText(null)
                    setEditingFields({})
                    setSelectedOrderIndex(null)
                    setSelectedOrderIds([])
                  }}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  Try Another Slip
                </button>
                <button
                  onClick={handleConfirmSingle}
                  disabled={validationErrors.length > 0}
                  className="bg-gradient-to-r from-green-600 to-green-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-shadow flex items-center justify-center gap-2"
                >
                  <CheckCircle size={18} />
                  Use This Data
                </button>
              </div>

              {validationErrors.length > 0 && (
                <p className="text-xs text-gray-600 text-center">Fix missing fields to proceed</p>
              )}
            </div>
          )}

          {/* Help Section */}
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded text-sm text-amber-900">
            <p className="font-semibold mb-2">📸 Tips for best results:</p>
            <ul className="text-xs space-y-1">
              <li>✓ Take a clear, well-lit photo of the entire packing slip</li>
              <li>✓ Ensure all text is visible and not blurry</li>
              <li>✓ Position slip flat with no shadows</li>
              <li>✓ Include the data table with Order ID, SKU, Qty, Price</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
