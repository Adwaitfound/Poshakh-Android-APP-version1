import React, { useState } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { getDb } from '../firebase'
import { FABRICS_COLLECTION } from '../lib/utils'
import { logInventoryAdded } from '../lib/notificationLogger'

export default function AddItem({ onSuccess, onDataChanged, userProfile }) {
    const [addItemType, setAddItemType] = useState('fabric')
    const [newItem, setNewItem] = useState({
        name: '', websiteProductName: '', totalLength: '', unit: 'meters',
        lengthRequiredPerOutfit: '', costPerMeter: '', parentFabricId: '',
        stockBreakdown: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 }, location: '',
        stitchingCost: '', sellingPrice: ''
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
        setIsUploading(true)
        setError('')
        try {
            let imgUrl = `https://placehold.co/150x150/${addItemType === 'fabric' ? '2e7d32' : '7c3aed'}/ffffff?text=${newItem.name.substring(0, 2).toUpperCase()}`
            if (newImageFile) {
                const raw = await fileToBase64(newImageFile)
                imgUrl = raw
            }
            const docData = { ...newItem, type: addItemType, imageUrl: imgUrl, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }
            if (addItemType === 'fabric') {
                docData.currentLength = parseFloat(newItem.totalLength)
                docData.lengthRequiredPerOutfit = parseFloat(newItem.lengthRequiredPerOutfit)
                docData.costPerMeter = parseFloat(newItem.costPerMeter)
                docData.totalLength = parseFloat(newItem.totalLength)
                docData.currentOrderStatus = 'None'
            }
            if (addItemType === 'outfit') {
                docData.stitchingCost = parseFloat(newItem.stitchingCost) || 0
                docData.sellingPrice = parseFloat(newItem.sellingPrice) || 0
                docData.lengthRequiredPerOutfit = parseFloat(newItem.lengthRequiredPerOutfit) || 0
            }
            const db = getDb()
            await addDoc(collection(db, FABRICS_COLLECTION), docData)
            // Log inventory item added
            await logInventoryAdded(newItem.name, addItemType, userProfile?.name || 'Unknown')
            setNewItem({ name: '', websiteProductName: '', totalLength: '', unit: 'meters', lengthRequiredPerOutfit: '', costPerMeter: '', parentFabricId: '', stockBreakdown: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 }, location: '', stitchingCost: '', sellingPrice: '' })
            setNewImageFile(null)
            if (onDataChanged) await onDataChanged()
            if (onSuccess) onSuccess()
        } catch (err) {
            setError(err.message)
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
                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>
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

                <button type="submit" disabled={isUploading} className="w-full py-4 rounded-xl font-bold text-emerald-pine shadow-lg mt-4 bg-lime-glow hover:shadow-xl active:shadow-md disabled:opacity-50">{isUploading ? 'Saving...' : 'Add Item'}</button>
            </form>
        </div>
    )
}
