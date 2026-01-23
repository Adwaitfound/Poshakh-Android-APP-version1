import React, { useRef, useState } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { X, Camera, Image as ImageIcon, Box, Save } from 'lucide-react'

export default function EditItemModal({ item, inventoryItems, db, onClose, onDataChanged }) {
    if (!item) return null

    const [editForm, setEditForm] = useState(item)
    const [editImageFile, setEditImageFile] = useState(null)
    const [isUploading, setIsUploading] = useState(false)
    const editCameraRef = useRef(null)
    const editGalleryRef = useRef(null)

    const calculateOutfitMakingCost = (outfit, inventory) => {
        if (!outfit.parentFabricId) return 0
        const parent = inventory.find(i => i.id === outfit.parentFabricId)
        if (!parent) return 0
        const fabricCost = (parseFloat(parent.costPerMeter) || 0) * (parseFloat(outfit.lengthRequiredPerOutfit) || 0)
        const stitching = parseFloat(outfit.stitchingCost) || 0
        return fabricCost + stitching
    }

    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = () => resolve(reader.result)
            reader.onerror = error => reject(error)
        })
    }

    const handleEditSave = async () => {
        if (!editForm || !db) return
        setIsUploading(true)
        try {
            const docRef = doc(db, 'fabrics', editForm.id)
            const updates = { ...editForm, updatedAt: serverTimestamp() }

            if (editImageFile) {
                const raw = await fileToBase64(editImageFile)
                updates.imageUrl = raw
            }

            if (editForm.type === 'outfit') {
                updates.stitchingCost = parseFloat(editForm.stitchingCost) || 0
                updates.sellingPrice = parseFloat(editForm.sellingPrice) || 0
                updates.lengthRequiredPerOutfit = parseFloat(editForm.lengthRequiredPerOutfit) || 0
                updates.manualSoldCount = parseInt(editForm.manualSoldCount) || 0
            }

            await updateDoc(docRef, updates)
            if (onDataChanged) await onDataChanged()
            onClose()
        } catch (e) {
            console.error("Update Failed:", e.message)
        }
        setIsUploading(false)
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center modal-enter backdrop-blur-sm overflow-y-auto">
            <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl h-[92vh] sm:h-auto overflow-hidden flex flex-col shadow-2xl my-0 sm:my-10 border dark:border-gray-800">
                <div className="bg-gray-50 dark:bg-gray-900 p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center flex-shrink-0">
                    <h3 className="font-bold text-lg">Edit Details</h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white text-gray-400 dark:text-gray-500 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase">Internal Name</label>
                        <input
                            className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl mt-1 border border-transparent focus:bg-white focus:border-brand"
                            value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase">Location</label>
                        <input
                            className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl mt-1 border border-transparent focus:bg-white focus:border-brand"
                            value={editForm.location}
                            onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                        />
                    </div>

                    {editForm.type === 'outfit' ? (
                        <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                            <div className="mb-3">
                                <label className="text-xs font-bold text-purple-800 uppercase block mb-1">Linked Fabric</label>
                                <select
                                    className="w-full p-3 bg-white rounded-lg border border-purple-200 text-sm"
                                    value={editForm.parentFabricId || ''}
                                    onChange={e => setEditForm({ ...editForm, parentFabricId: e.target.value })}
                                >
                                    <option value="">-- No Fabric Linked --</option>
                                    {inventoryItems.filter(i => i.type === 'fabric').map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-3 gap-3 mb-3">
                                <div>
                                    <label className="text-[10px] font-bold text-purple-800 uppercase block mb-1">Fabric Req (m)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full p-2 bg-white rounded-lg border border-purple-200 text-sm"
                                        value={editForm.lengthRequiredPerOutfit}
                                        onChange={e => setEditForm({ ...editForm, lengthRequiredPerOutfit: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-purple-800 uppercase block mb-1">Stitching ₹</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 bg-white rounded-lg border border-purple-200 text-sm"
                                        value={editForm.stitchingCost}
                                        onChange={e => setEditForm({ ...editForm, stitchingCost: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-purple-800 uppercase block mb-1">Sell Price ₹</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 bg-white rounded-lg border border-purple-200 text-sm"
                                        value={editForm.sellingPrice}
                                        onChange={e => setEditForm({ ...editForm, sellingPrice: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="pt-3 border-t border-purple-200 text-xs flex justify-between text-purple-900 mb-3">
                                <span>Raw Cost: ₹{calculateOutfitMakingCost({ ...editForm, stitchingCost: 0 }, inventoryItems).toFixed(0)}</span>
                                <span className="font-bold">Total Make: ₹{calculateOutfitMakingCost(editForm, inventoryItems).toFixed(0)}</span>
                            </div>

                            <div className="pt-3 border-t border-purple-200 mb-3">
                                <p className="text-xs font-bold text-purple-800 uppercase mb-2">Manual Sold Count (Legacy)</p>
                                <input
                                    type="number"
                                    className="w-full p-2 bg-white rounded-lg border border-purple-200 text-sm"
                                    value={editForm.manualSoldCount || 0}
                                    onChange={e => setEditForm({ ...editForm, manualSoldCount: e.target.value })}
                                    placeholder="0"
                                />
                            </div>

                            <div className="pt-3 border-t border-purple-200">
                                <p className="text-xs font-bold text-purple-800 uppercase mb-2">Stock Breakdown</p>
                                <div className="grid grid-cols-6 gap-2">
                                    {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(size => (
                                        <div key={size}>
                                            <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 text-center">{size}</label>
                                            <input
                                                type="number"
                                                className="w-full p-2 text-center bg-white rounded-lg border border-purple-200 text-xs"
                                                value={editForm.stockBreakdown?.[size] || 0}
                                                onChange={e => setEditForm({
                                                    ...editForm,
                                                    stockBreakdown: {
                                                        ...editForm.stockBreakdown,
                                                        [size]: parseInt(e.target.value) || 0
                                                    }
                                                })}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <label className="text-xs font-bold text-blue-800 uppercase flex items-center gap-1 mb-2">
                                <Box className="w-3 h-3" /> Stock Correction
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    step="0.1"
                                    className="flex-1 p-3 bg-white rounded-lg border border-blue-200"
                                    value={editForm.currentLength}
                                    onChange={e => setEditForm({ ...editForm, currentLength: e.target.value })}
                                />
                                <span className="p-3 text-blue-800 font-bold self-center">{editForm.unit}</span>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase block mb-2">Update Image</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div
                                onClick={() => editCameraRef.current?.click()}
                                className="h-20 w-full bg-[#084734] border-2 border-[#084734] rounded-xl flex flex-col items-center justify-center text-[#CEF17B] font-semibold shadow-md cursor-pointer hover:shadow-lg hover:brightness-110 active:scale-95 transition-all"
                            >
                                <Camera className="w-7 h-7 mb-1 text-[#CEF17B]" />
                                <span className="text-xs">Camera</span>
                            </div>
                            <div
                                onClick={() => editGalleryRef.current?.click()}
                                className="h-20 w-full bg-[#084734] border-2 border-[#084734] rounded-xl flex flex-col items-center justify-center text-[#CEF17B] font-semibold shadow-md cursor-pointer hover:shadow-lg hover:brightness-110 active:scale-95 transition-all"
                            >
                                <ImageIcon className="w-7 h-7 mb-1 text-[#CEF17B]" />
                                <span className="text-xs">Gallery</span>
                            </div>
                        </div>
                        <input
                            type="file"
                            hidden
                            ref={editCameraRef}
                            capture="environment"
                            accept="image/*"
                            onChange={e => setEditImageFile(e.target.files[0])}
                        />
                        <input
                            type="file"
                            hidden
                            ref={editGalleryRef}
                            accept="image/*"
                            onChange={e => setEditImageFile(e.target.files[0])}
                        />
                        {editImageFile && (
                            <p className="text-xs text-green-600 font-bold mt-2 text-center">New Image Selected</p>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <button
                        onClick={handleEditSave}
                        disabled={isUploading}
                        className="w-full bg-[#084734] text-[#CEF17B] py-4 rounded-xl font-bold shadow-lg flex justify-center items-center gap-2 active:brightness-110 disabled:opacity-50"
                    >
                        {isUploading ? 'Saving...' : (
                            <>
                                <Save className="w-5 h-5" /> Save Changes
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
