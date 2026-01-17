import React, { useState } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { getDb } from '../firebase'
import { FABRICS_COLLECTION, STOCK_BREAKDOWN_TEMPLATE, generatePlaceholderImage, parsePrice, calculateActualCost } from '../lib/utils'
import { logInventoryAdded } from '../lib/notificationLogger'
import { useNotification } from '../context/NotificationProvider'

export default function AddItem({ onSuccess, onDataChanged, userProfile, vendors = [] }) {
    const [addItemType, setAddItemType] = useState('fabric')
    const { notify } = useNotification()
    const [newItem, setNewItem] = useState({
        name: '', websiteProductName: '', totalLength: '', unit: 'meters',
        lengthRequiredPerOutfit: '', costPerMeter: '', parentFabricId: '',
        stockBreakdown: { ...STOCK_BREAKDOWN_TEMPLATE }, location: '',
        stitchingCost: '', sellingPrice: '', vendorId: '', purchaseDate: '',
        invoiceNumber: '', transportCost: '', otherCosts: ''
    })
    const [newImageFile, setNewImageFile] = useState(null)
    const [isUploading, setIsUploading] = useState(false)
    const [error, setError] = useState('')

    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = () => resolve(reader.result)
            reader.onerror = error => reject(error)
        })
    }

    const handleAddItem = async (e) => {
        e.preventDefault()
        
        // Validate required fields
        if (!newItem.name.trim()) {
            setError('Item name is required')
            return
        }
        
        if (addItemType === 'fabric') {
            if (!newItem.totalLength || parsePrice(newItem.totalLength) <= 0) {
                setError('Total length must be greater than 0')
                return
            }
            if (!newItem.lengthRequiredPerOutfit || parsePrice(newItem.lengthRequiredPerOutfit) <= 0) {
                setError('Length per outfit must be greater than 0')
                return
            }
            if (!newItem.costPerMeter || parsePrice(newItem.costPerMeter) <= 0) {
                setError('Cost per meter must be greater than 0')
                return
            }
        } else if (addItemType === 'outfit') {
            if (!newItem.sellingPrice || parsePrice(newItem.sellingPrice) <= 0) {
                setError('Selling price must be greater than 0')
                return
            }
        }
        
        setIsUploading(true)
        setError('')
        try {
            let imgUrl = generatePlaceholderImage(newItem.name, addItemType === 'fabric' ? '2e7d32' : '7c3aed')
            if (newImageFile) {
                const raw = await fileToBase64(newImageFile)
                imgUrl = raw
            }
            const docData = { ...newItem, type: addItemType, imageUrl: imgUrl, createdAt: serverTimestamp() }
            if (addItemType === 'fabric') {
                docData.currentLength = parsePrice(newItem.totalLength)
                docData.lengthRequiredPerOutfit = parsePrice(newItem.lengthRequiredPerOutfit)
                docData.costPerMeter = parsePrice(newItem.costPerMeter)
                docData.totalLength = parsePrice(newItem.totalLength)
                docData.currentOrderStatus = 'None'
                
                // Add vendor tracking
                if (newItem.vendorId) {
                    const vendor = vendors.find(v => v.id === newItem.vendorId)
                    if (vendor) {
                        docData.vendorId = newItem.vendorId
                        docData.vendorName = vendor.name || ''
                    }
                }
                
                // Add purchase details
                if (newItem.purchaseDate) docData.purchaseDate = newItem.purchaseDate
                if (newItem.invoiceNumber) docData.invoiceNumber = newItem.invoiceNumber
                if (newItem.transportCost) docData.transportCost = parsePrice(newItem.transportCost)
                if (newItem.otherCosts) docData.otherCosts = parsePrice(newItem.otherCosts)
                
                // Calculate total cost per meter including additional costs
                docData.actualCostPerMeter = calculateActualCost(
                    newItem.costPerMeter,
                    newItem.transportCost,
                    newItem.otherCosts,
                    newItem.totalLength
                )
            }
            if (addItemType === 'outfit') {
                docData.stitchingCost = parsePrice(newItem.stitchingCost)
                docData.sellingPrice = parsePrice(newItem.sellingPrice)
                docData.lengthRequiredPerOutfit = parsePrice(newItem.lengthRequiredPerOutfit)
            }
            const db = getDb()
            await addDoc(collection(db, FABRICS_COLLECTION), docData)
            // Log inventory item added
            await logInventoryAdded(newItem.name, addItemType, userProfile?.name || 'Unknown')
            
            // Reset form
            setNewItem({ name: '', websiteProductName: '', totalLength: '', unit: 'meters', lengthRequiredPerOutfit: '', costPerMeter: '', parentFabricId: '', stockBreakdown: { ...STOCK_BREAKDOWN_TEMPLATE }, location: '', stitchingCost: '', sellingPrice: '', vendorId: '', purchaseDate: '', invoiceNumber: '', transportCost: '', otherCosts: '' })
            setNewImageFile(null)
            
            // Show success notification
            notify.success(`✅ ${addItemType === 'fabric' ? 'Fabric' : 'Outfit'} "${newItem.name}" added to inventory!`)
            
            // Trigger data refresh
            if (onDataChanged) await onDataChanged()
            
            // Navigate to inventory
            if (onSuccess) onSuccess()
        } catch (err) {
            console.error('Error adding item:', err)
            setError(err.message || 'Failed to add item. Please try again.')
            notify.error(`❌ Error: ${err.message}`)
        }
        setIsUploading(false)
    }

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-6">Add New Item</h2>
            <div className="bg-emerald-pine rounded-3xl p-1 flex gap-1 mb-6 border-2 border-lime-glow">
                <button onClick={() => setAddItemType('fabric')} className={`flex-1 py-2 rounded-2xl text-sm font-bold transition-all ${addItemType === 'fabric' ? 'bg-lime-glow text-emerald-pine shadow' : 'text-lime-glow/60'}`}>
                    Fabric
                </button>
                <button onClick={() => setAddItemType('outfit')} className={`flex-1 py-2 rounded-2xl text-sm font-bold transition-all ${addItemType === 'outfit' ? 'bg-lime-glow text-emerald-pine shadow' : 'text-lime-glow/60'}`}>
                    Outfit
                </button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-4">
                {error && (
                    <div className="p-4 bg-red-100 border-2 border-red-500 text-red-700 text-sm rounded-xl font-bold">
                        🚨 {error}
                    </div>
                )}
                <div className="flex gap-3 items-center">
                    <div className="w-24 h-24 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden">
                        {newImageFile ? (
                            <img src={URL.createObjectURL(newImageFile)} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-4xl text-gray-300">{newItem.name ? newItem.name.substring(0, 2).toUpperCase() : '+'}</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <label className="px-4 py-2 bg-gray-100 text-gray-600 dark:text-gray-400 dark:text-gray-500 rounded-xl text-sm font-bold cursor-pointer hover:bg-gray-200">
                            📷 Camera
                            <input type="file" hidden capture="environment" accept="image/*" onChange={e => setNewImageFile(e.target.files[0])} />
                        </label>
                        <label className="px-4 py-2 bg-gray-100 text-gray-600 dark:text-gray-400 dark:text-gray-500 rounded-xl text-sm font-bold cursor-pointer hover:bg-gray-200">
                            🖼️ Gallery
                            <input type="file" hidden accept="image/*" onChange={e => setNewImageFile(e.target.files[0])} />
                        </label>
                    </div>
                </div>

                <div><label className="text-xs font-bold text-lime-glow uppercase">Item Name</label><input required className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold mt-1" placeholder={addItemType === 'fabric' ? "e.g. Green Silk" : "e.g. Mirae Suit"} value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} /></div>
                <div><label className="text-xs font-bold text-lime-glow uppercase">Website Product Name (Optional)</label><input className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold mt-1" placeholder="Display name for e-commerce" value={newItem.websiteProductName} onChange={e => setNewItem({ ...newItem, websiteProductName: e.target.value })} /></div>

                {addItemType === 'fabric' ? (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="text-xs font-bold text-lime-glow uppercase">Total Length</label><input type="number" step="0.1" required className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold mt-1" placeholder="e.g. 10.5" value={newItem.totalLength} onChange={e => setNewItem({ ...newItem, totalLength: e.target.value })} /></div>
                            <div><label className="text-xs font-bold text-lime-glow uppercase">Unit</label><select className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold mt-1" value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })}><option value="meters">Meters</option><option value="yards">Yards</option></select></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="text-xs font-bold text-lime-glow uppercase">Length per Outfit</label><input type="number" step="0.1" required className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold mt-1" placeholder="e.g. 2.5" value={newItem.lengthRequiredPerOutfit} onChange={e => setNewItem({ ...newItem, lengthRequiredPerOutfit: e.target.value })} /></div>
                            <div><label className="text-xs font-bold text-lime-glow uppercase">Cost per Meter (₹)</label><input type="number" step="0.01" required className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold mt-1" placeholder="e.g. 450" value={newItem.costPerMeter} onChange={e => setNewItem({ ...newItem, costPerMeter: e.target.value })} /></div>
                        </div>
                        <div><label className="text-xs font-bold text-lime-glow uppercase">Location</label><input className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold mt-1" placeholder="e.g. Shelf A3" value={newItem.location} onChange={e => setNewItem({ ...newItem, location: e.target.value })} /></div>
                        
                        {/* Vendor & Purchase Details */}
                        <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 border-2 border-lime-glow/60 p-4 rounded-2xl space-y-3 mt-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">📦</span>
                                <h4 className="text-sm font-bold text-lime-glow uppercase">Vendor & Purchase Details</h4>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase block mb-2">Select Vendor/Supplier</label>
                                {vendors.length === 0 ? (
                                    <div className="p-3 bg-emerald-950 border border-lime-glow/30 rounded-xl text-xs text-yellow-300">
                                        ⚠️ No vendors found. Add vendors from the Vendors tab first.
                                    </div>
                                ) : (
                                    <select 
                                        className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold"
                                        value={newItem.vendorId}
                                        onChange={e => setNewItem({ ...newItem, vendorId: e.target.value })}
                                    >
                                        <option value="">-- No Vendor (Optional) --</option>
                                        {vendors.map(v => (
                                            <option key={v.id} value={v.id}>
                                                {v.name} {v.phone ? `(${v.phone})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {newItem.vendorId && (
                                    <p className="text-[10px] text-lime-300 mt-2">✓ Vendor selected: {vendors.find(v => v.id === newItem.vendorId)?.name}</p>
                                )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase block mb-1">Purchase Date</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold"
                                        value={newItem.purchaseDate}
                                        onChange={e => setNewItem({ ...newItem, purchaseDate: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase block mb-1">Invoice #</label>
                                    <input 
                                        className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold"
                                        placeholder="INV-001"
                                        value={newItem.invoiceNumber}
                                        onChange={e => setNewItem({ ...newItem, invoiceNumber: e.target.value })}
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase block mb-1">Transport Cost (₹)</label>
                                    <input 
                                        type="number"
                                        step="0.01"
                                        className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold"
                                        placeholder="0.00"
                                        value={newItem.transportCost}
                                        onChange={e => setNewItem({ ...newItem, transportCost: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase block mb-1">Other Costs (₹)</label>
                                    <input 
                                        type="number"
                                        step="0.01"
                                        className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold"
                                        placeholder="0.00"
                                        value={newItem.otherCosts}
                                        onChange={e => setNewItem({ ...newItem, otherCosts: e.target.value })}
                                    />
                                </div>
                            </div>
                            
                            {(newItem.costPerMeter && newItem.totalLength && (newItem.transportCost || newItem.otherCosts)) && (
                                <div className="bg-lime-glow/10 border border-lime-glow/30 p-3 rounded-xl">
                                    <p className="text-xs text-lime-glow/70 uppercase font-bold mb-1">Actual Cost/Meter</p>
                                    <p className="text-xl font-bold text-lime-glow">
                                        ₹{calculateActualCost(
                                            newItem.costPerMeter,
                                            newItem.transportCost,
                                            newItem.otherCosts,
                                            newItem.totalLength
                                        ).toFixed(2)}/m
                                    </p>
                                    <p className="text-xs text-white/60 mt-1">
                                        Base: ₹{parsePrice(newItem.costPerMeter).toFixed(2)} + 
                                        Added: ₹{((parsePrice(newItem.transportCost) + parsePrice(newItem.otherCosts)) / parsePrice(newItem.totalLength)).toFixed(2)}
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="text-xs font-bold text-lime-glow uppercase">Selling Price (₹)</label><input type="number" required className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold mt-1" placeholder="e.g. 2999" value={newItem.sellingPrice} onChange={e => setNewItem({ ...newItem, sellingPrice: e.target.value })} /></div>
                            <div><label className="text-xs font-bold text-lime-glow uppercase">Stitching Cost (₹)</label><input type="number" className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold mt-1" placeholder="e.g. 500" value={newItem.stitchingCost} onChange={e => setNewItem({ ...newItem, stitchingCost: e.target.value })} /></div>
                        </div>
                        <div><label className="text-xs font-bold text-lime-glow uppercase">Fabric Length Required</label><input type="number" step="0.1" className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold mt-1" placeholder="e.g. 2.5" value={newItem.lengthRequiredPerOutfit} onChange={e => setNewItem({ ...newItem, lengthRequiredPerOutfit: e.target.value })} /></div>
                        <div><label className="text-xs font-bold text-lime-glow uppercase">Location</label><input className="w-full p-3 bg-white text-emerald-pine rounded-xl border-2 border-lime-glow font-semibold mt-1" placeholder="e.g. Rack B2" value={newItem.location} onChange={e => setNewItem({ ...newItem, location: e.target.value })} /></div>
                    </>
                )}

                <button 
                    type="submit" 
                    disabled={isUploading} 
                    className="w-full py-4 rounded-xl font-bold text-emerald-pine shadow-lg mt-6 bg-gradient-to-r from-lime-400 to-emerald-300 hover:shadow-xl active:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {isUploading ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="animate-spin">⏳</span> Saving...
                        </span>
                    ) : (
                        <span className="flex items-center justify-center gap-2">
                            ✅ Add {addItemType === 'fabric' ? 'Fabric' : 'Outfit'} to Inventory
                        </span>
                    )}
                </button>
            </form>
        </div>
    )
}
