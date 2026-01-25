import React, { useState, useMemo } from 'react'
import { X, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'

/**
 * BarcodeDataReviewModal
 * Shows extracted barcode data in editable form
 * Allows user to verify, correct, and confirm before auto-filling order form
 */
export default function BarcodeDataReviewModal({ visible, data, inventoryItems = [], onConfirm, onCancel }) {
  const [editedData, setEditedData] = useState(data)
  const [showRawData, setShowRawData] = useState(false)
  const [errors, setErrors] = useState({})

  // Update editedData when data prop changes
  React.useEffect(() => {
    if (data) {
      setEditedData(data)
      setErrors({})
    }
  }, [data])

  // Find matching outfit from inventory
  const matchedOutfit = useMemo(() => {
    if (!editedData?.items || editedData.items.length === 0) return null
    
    const outfits = inventoryItems.filter(i => i.type === 'outfit')
    const firstItem = editedData.items[0]
    const itemName = firstItem.name?.toLowerCase() || ''
    
    if (!itemName) return null
    
    // Exact match
    let match = outfits.find(o => o.name.toLowerCase() === itemName)
    if (match) return match
    
    // Substring match
    match = outfits.find(o => 
      o.name.toLowerCase().includes(itemName) || 
      itemName.includes(o.name.toLowerCase())
    )
    if (match) return match
    
    // Fuzzy match
    const keywords = itemName.split(/[\s\-:]+/).filter(k => k.length > 2)
    match = outfits.find(o => {
      const outfitLower = o.name.toLowerCase()
      return keywords.some(k => outfitLower.includes(k))
    })
    
    return match
  }, [editedData?.items, inventoryItems])

  const validateForm = () => {
    const newErrors = {}
    
    if (!editedData.orderNumber?.trim()) {
      newErrors.orderNumber = 'Order number is required'
    }
    if (!editedData.customerName?.trim()) {
      newErrors.customerName = 'Customer name is required'
    }
    if (!editedData.phone?.trim()) {
      newErrors.phone = 'Phone number is required'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleConfirm = () => {
    if (validateForm()) {
      onConfirm({
        ...editedData,
        matchedOutfit
      })
    }
  }

  const handleFieldChange = (field, value) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }))
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const handleItemChange = (index, field, value) => {
    setEditedData(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  if (!visible || !editedData) return null

  return (
    <div className="fixed inset-0 bg-black/70 z-[75] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm">
      <div className="bg-gray-950 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col border border-lime-glow/40">
        
        {/* Header */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-emerald-pine to-emerald-900 border-b border-lime-glow/40 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg sm:text-xl font-bold text-white">
            Review Barcode Data
          </h3>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-white/10 rounded-full transition text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* Info Message */}
          <div className="bg-blue-900/30 border border-blue-500/50 rounded-2xl p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-300 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-100">
              Barcode data extracted. Please review and correct any errors before confirming.
            </p>
          </div>

          {/* Order Information Section */}
          <div className="bg-emerald-900/20 rounded-2xl p-4 border border-emerald-600/30 space-y-3">
            <h4 className="font-bold text-lime-glow text-sm uppercase tracking-wide">Order Information</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Order Number */}
              <div>
                <label className="text-xs font-bold text-emerald-100/80 uppercase block mb-1.5">
                  Order Number *
                </label>
                <input
                  type="text"
                  value={editedData.orderNumber || ''}
                  onChange={e => handleFieldChange('orderNumber', e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg bg-emerald-900/50 border text-white text-sm focus:outline-none transition ${
                    errors.orderNumber
                      ? 'border-red-500/70 focus:border-red-400'
                      : 'border-lime-glow/50 focus:border-lime-glow'
                  }`}
                  placeholder="e.g., 1171"
                />
                {errors.orderNumber && (
                  <p className="text-xs text-red-400 mt-1">{errors.orderNumber}</p>
                )}
              </div>

              {/* Invoice Number */}
              <div>
                <label className="text-xs font-bold text-emerald-100/80 uppercase block mb-1.5">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={editedData.invoiceNumber || ''}
                  onChange={e => handleFieldChange('invoiceNumber', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-emerald-900/50 border border-lime-glow/50 text-white text-sm focus:outline-none focus:border-lime-glow transition"
                  placeholder="e.g., 9096725484"
                />
              </div>

              {/* Customer Name */}
              <div>
                <label className="text-xs font-bold text-emerald-100/80 uppercase block mb-1.5">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={editedData.customerName || ''}
                  onChange={e => handleFieldChange('customerName', e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg bg-emerald-900/50 border text-white text-sm focus:outline-none transition ${
                    errors.customerName
                      ? 'border-red-500/70 focus:border-red-400'
                      : 'border-lime-glow/50 focus:border-lime-glow'
                  }`}
                  placeholder="e.g., Jayashree"
                />
                {errors.customerName && (
                  <p className="text-xs text-red-400 mt-1">{errors.customerName}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="text-xs font-bold text-emerald-100/80 uppercase block mb-1.5">
                  Phone *
                </label>
                <input
                  type="tel"
                  value={editedData.phone || ''}
                  onChange={e => handleFieldChange('phone', e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg bg-emerald-900/50 border text-white text-sm focus:outline-none transition ${
                    errors.phone
                      ? 'border-red-500/70 focus:border-red-400'
                      : 'border-lime-glow/50 focus:border-lime-glow'
                  }`}
                  placeholder="e.g., 9967524131"
                />
                {errors.phone && (
                  <p className="text-xs text-red-400 mt-1">{errors.phone}</p>
                )}
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="text-xs font-bold text-emerald-100/80 uppercase block mb-1.5">
                Address
              </label>
              <textarea
                value={editedData.address || ''}
                onChange={e => handleFieldChange('address', e.target.value)}
                rows="2"
                className="w-full px-3 py-2 rounded-lg bg-emerald-900/50 border border-lime-glow/50 text-white text-sm focus:outline-none focus:border-lime-glow transition resize-none"
                placeholder="Full delivery address"
              />
            </div>

            {/* Total Price */}
            <div>
              <label className="text-xs font-bold text-emerald-100/80 uppercase block mb-1.5">
                Total Price
              </label>
              <input
                type="text"
                value={editedData.totalPrice || ''}
                onChange={e => handleFieldChange('totalPrice', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-emerald-900/50 border border-lime-glow/50 text-white text-sm focus:outline-none focus:border-lime-glow transition"
                placeholder="e.g., Rs. 1380.82"
              />
            </div>
          </div>

          {/* Items Section */}
          {editedData.items && editedData.items.length > 0 && (
            <div className="bg-emerald-900/20 rounded-2xl p-4 border border-emerald-600/30 space-y-3">
              <h4 className="font-bold text-lime-glow text-sm uppercase tracking-wide">Items</h4>
              
              {editedData.items.map((item, idx) => (
                <div key={idx} className="bg-emerald-900/30 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-bold text-emerald-100/60 uppercase block mb-1">
                        Item Name
                      </label>
                      <input
                        type="text"
                        value={item.name || ''}
                        onChange={e => handleItemChange(idx, 'name', e.target.value)}
                        className="w-full px-3 py-1.5 rounded text-sm bg-emerald-800/50 border border-lime-glow/30 text-white focus:outline-none focus:border-lime-glow transition"
                        placeholder="Item name"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-bold text-emerald-100/60 uppercase block mb-1">
                          Qty
                        </label>
                        <input
                          type="number"
                          value={item.quantity || 1}
                          onChange={e => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-1.5 rounded text-sm bg-emerald-800/50 border border-lime-glow/30 text-white focus:outline-none focus:border-lime-glow transition"
                          min="1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-emerald-100/60 uppercase block mb-1">
                          Size
                        </label>
                        <select
                          value={item.size || 'M'}
                          onChange={e => handleItemChange(idx, 'size', e.target.value)}
                          className="w-full px-3 py-1.5 rounded text-sm bg-emerald-800/50 border border-lime-glow/30 text-white focus:outline-none focus:border-lime-glow transition"
                        >
                          <option>XS</option>
                          <option>S</option>
                          <option>M</option>
                          <option>L</option>
                          <option>XL</option>
                          <option>XXL</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {matchedOutfit && (
                <div className="bg-lime-glow/10 border border-lime-glow/50 rounded-lg p-3">
                  <p className="text-xs font-bold text-lime-300 uppercase tracking-wide mb-1">
                    ✓ Outfit Matched
                  </p>
                  <p className="text-sm text-lime-200 font-semibold">
                    {matchedOutfit.name}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Raw Data Section */}
          <div>
            <button
              onClick={() => setShowRawData(!showRawData)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-lg hover:bg-gray-900/70 transition text-gray-300"
            >
              <span className="text-sm font-semibold">Raw Barcode Data</span>
              {showRawData ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            
            {showRawData && (
              <div className="mt-2 bg-gray-900/50 border border-gray-700/50 rounded-lg p-3">
                <pre className="text-xs text-gray-400 overflow-auto max-h-40 font-mono whitespace-pre-wrap break-words">
                  {JSON.stringify(editedData.raw || editedData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-lime-glow/40 bg-emerald-900/10 flex gap-3 flex-shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-white font-bold text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2.5 rounded-lg bg-lime-glow hover:bg-lime-300 text-emerald-900 font-bold text-sm transition"
          >
            Use This Data
          </button>
        </div>
      </div>
    </div>
  )
}
