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
    <div className="fixed inset-0 bg-black/80 z-[75] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      <div className="bg-gray-950 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col border border-lime-glow/40 safe-area-modal">
        <style>{`
          body { overflow: hidden; }
          .safe-area-modal {
            padding-bottom: env(safe-area-inset-bottom);
          }
          .modal-enter {
            animation: slideUp 0.3s ease-out;
          }
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(100%);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .touch-manipulation {
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
          }
          input, textarea {
            font-size: 16px;
            -webkit-appearance: none;
            appearance: none;
          }
        `}</style>
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-pine to-emerald-900 border-b border-lime-glow/40 flex justify-between items-start flex-shrink-0">
          <div className="flex-1">
            <div className="w-12 h-1 bg-white/30 rounded-full mb-3 sm:hidden"></div>
            <h3 className="text-xl sm:text-lg font-bold text-white">
              Review Barcode Data
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-2.5 sm:p-2 hover:bg-white/10 active:bg-white/20 rounded-full transition text-white touch-manipulation"
          >
            <X className="w-6 h-6 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 overscroll-contain">
          
          {/* Info Message */}
          <div className="bg-blue-900/30 border border-blue-500/50 rounded-2xl p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 sm:w-4 sm:h-4 text-blue-300 flex-shrink-0 mt-0.5" />
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
                  className={`w-full px-4 py-3 sm:py-2 text-base sm:text-sm rounded-xl sm:rounded-lg bg-emerald-900/50 border text-white focus:outline-none transition touch-manipulation ${
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
        <div className="p-5 sm:p-6 border-t border-lime-glow/40 bg-emerald-900/10 flex flex-col sm:flex-row gap-3 flex-shrink-0 safe-area-bottom">
          <style>{`
            .safe-area-bottom {
              padding-bottom: calc(env(safe-area-inset-bottom) + 1.25rem);
            }
          `}</style>
          <button
            onClick={handleConfirm}
            className="flex-1 px-6 py-4 sm:py-3 rounded-xl sm:rounded-lg bg-lime-glow hover:bg-lime-300 active:bg-lime-400 text-emerald-900 font-bold text-base sm:text-sm transition touch-manipulation shadow-lg"
          >
            ✓ Use This Data
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-4 sm:py-3 rounded-xl sm:rounded-lg bg-gray-800/50 hover:bg-gray-800 active:bg-gray-700 text-white font-bold text-base sm:text-sm transition touch-manipulation"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
