import React from 'react'

/**
 * Reusable price/cost input component
 * Handles common patterns: number input, rupee placeholder, parseFloat on change
 */
export default function PriceInput({ 
  label, 
  value, 
  onChange, 
  placeholder = '0', 
  required = false,
  disabled = false,
  className = '',
  name = ''
}) {
  const handleChange = (e) => {
    const numValue = parseFloat(e.target.value) || 0
    onChange(numValue)
  }

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        type="number"
        name={name}
        value={value || ''}
        onChange={handleChange}
        placeholder={`₹${placeholder}`}
        required={required}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        min="0"
        step="0.01"
      />
    </div>
  )
}
