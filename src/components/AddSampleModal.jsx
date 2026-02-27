import React, { useState } from 'react'
import { X, Camera, Image as ImageIcon } from 'lucide-react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { getDb } from '../firebase'
import { SAMPLES_COLLECTION, STOCK_BREAKDOWN_TEMPLATE, generatePlaceholderImage, parsePrice, calculateActualCost } from '../lib/utils'
import { useNotification } from '../context/NotificationProvider'

export default function AddSampleModal({ visible, onClose, onDataChanged, userProfile, vendors = [] }) {
    const { notify } = useNotification()
    const [sampleType, setSampleType] = useState('fabric')
    const [sample, setSample] = useState({
        name: '', websiteProductName: '', totalLength: '', unit: 'meters',
        lengthRequiredPerOutfit: '', costPerMeter: '', parentFabricId: '',
        stockBreakdown: { ...STOCK_BREAKDOWN_TEMPLATE }, location: '',
        stitchingCost: '', sellingPrice: '', vendorId: '', receivedDate: '',
        notes: '', transportCost: '', otherCosts: ''
    })
    const [imageFile, setImageFile] = useState(null)
    const [isUploading, setIsUploading] = useState(false)
    const [error, setError] = useState('')

    if (!visible) return null

    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = () => resolve(reader.result)
            reader.onerror = error => reject(error)
        })
    }

    const resetForm = () => {
        setSample({
            name: '', websiteProductName: '', totalLength: '', unit: 'meters',
            lengthRequiredPerOutfit: '', costPerMeter: '', parentFabricId: '',
            stockBreakdown: { ...STOCK_BREAKDOWN_TEMPLATE }, location: '',
            stitchingCost: '', sellingPrice: '', vendorId: '', receivedDate: '',
            notes: '', transportCost: '', otherCosts: ''
        })
        setImageFile(null)
        setError('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!sample.name.trim()) {
            setError('Sample name is required')
            return
        }

        setIsUploading(true)
        setError('')

        try {
            let imgUrl = generatePlaceholderImage(sample.name, sampleType === 'fabric' ? '8B5E3C' : '9333EA')
            if (imageFile) {
                imgUrl = await fileToBase64(imageFile)
            }

            const docData = {
                ...sample,
                type: sampleType,
                imageUrl: imgUrl,
                sampleStatus: 'pending',
                addedBy: userProfile?.name || 'Unknown',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }

            // Process numeric fields
            if (sampleType === 'fabric') {
                if (sample.totalLength) docData.totalLength = parsePrice(sample.totalLength)
                if (sample.lengthRequiredPerOutfit) docData.lengthRequiredPerOutfit = parsePrice(sample.lengthRequiredPerOutfit)
                if (sample.costPerMeter) docData.costPerMeter = parsePrice(sample.costPerMeter)
                if (sample.transportCost) docData.transportCost = parsePrice(sample.transportCost)
                if (sample.otherCosts) docData.otherCosts = parsePrice(sample.otherCosts)

                if (sample.costPerMeter && sample.totalLength) {
                    docData.actualCostPerMeter = calculateActualCost(
                        sample.costPerMeter, sample.transportCost, sample.otherCosts, sample.totalLength
                    )
                }
            }

            if (sampleType === 'outfit') {
                if (sample.sellingPrice) docData.sellingPrice = parsePrice(sample.sellingPrice)
                if (sample.stitchingCost) docData.stitchingCost = parsePrice(sample.stitchingCost)
                if (sample.lengthRequiredPerOutfit) docData.lengthRequiredPerOutfit = parsePrice(sample.lengthRequiredPerOutfit)
            }

            // Vendor info
            if (sample.vendorId) {
                const vendor = vendors.find(v => v.id === sample.vendorId)
                if (vendor) {
                    docData.vendorId = sample.vendorId
                    docData.vendorName = vendor.name || ''
                }
            }

            const db = getDb()
            await addDoc(collection(db, SAMPLES_COLLECTION), docData)

            notify.success(`🧪 Sample "${sample.name}" added for review!`)
            resetForm()
            if (onDataChanged) await onDataChanged()
            onClose()
        } catch (err) {
            console.error('Error adding sample:', err)
            setError(err.message || 'Failed to add sample')
            notify.error(`Error: ${err.message}`)
        }
        setIsUploading(false)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl">
                {/* Header */}
                <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
                    <div>
                        <h3 className="text-lg font-bold text-white">Add Sample</h3>
                        <p className="text-xs text-gray-400">Samples need approval before going to inventory</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full bg-gray-800 text-gray-400 hover:text-white transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-900/50 border border-red-700 text-red-300 text-sm rounded-xl font-semibold">
                            🚨 {error}
                        </div>
                    )}

                    {/* Type Toggle */}
                    <div className="bg-emerald-pine rounded-2xl p-1 flex gap-1 border-2 border-lime-glow">
                        <button type="button" onClick={() => setSampleType('fabric')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${sampleType === 'fabric' ? 'bg-lime-glow text-emerald-pine shadow' : 'text-lime-glow/60'}`}>
                            🧵 Fabric
                        </button>
                        <button type="button" onClick={() => setSampleType('outfit')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${sampleType === 'outfit' ? 'bg-lime-glow text-emerald-pine shadow' : 'text-lime-glow/60'}`}>
                            👗 Outfit
                        </button>
                    </div>

                    {/* Image Upload */}
                    <div className="flex gap-3 items-center">
                        <div className="w-20 h-20 bg-gray-800 rounded-xl flex items-center justify-center overflow-hidden border-2 border-gray-700">
                            {imageFile ? (
                                <img src={URL.createObjectURL(imageFile)} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-3xl text-gray-500">{sample.name ? sample.name.substring(0, 2).toUpperCase() : '+'}</span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <label className="px-3 py-2 bg-gray-800 text-gray-300 rounded-xl text-xs font-bold cursor-pointer hover:bg-gray-700 flex items-center gap-1">
                                <Camera className="w-3 h-3" /> Camera
                                <input type="file" hidden capture="environment" accept="image/*" onChange={e => setImageFile(e.target.files[0])} />
                            </label>
                            <label className="px-3 py-2 bg-gray-800 text-gray-300 rounded-xl text-xs font-bold cursor-pointer hover:bg-gray-700 flex items-center gap-1">
                                <ImageIcon className="w-3 h-3" /> Gallery
                                <input type="file" hidden accept="image/*" onChange={e => setImageFile(e.target.files[0])} />
                            </label>
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="text-xs font-bold text-lime-glow uppercase">Sample Name *</label>
                        <input required className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                            placeholder={sampleType === 'fabric' ? "e.g. Silk Brocade Sample" : "e.g. Anarkali Prototype"}
                            value={sample.name} onChange={e => setSample({ ...sample, name: e.target.value })} />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-lime-glow uppercase">Website Product Name (Optional)</label>
                        <input className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                            placeholder="Display name for website"
                            value={sample.websiteProductName} onChange={e => setSample({ ...sample, websiteProductName: e.target.value })} />
                    </div>

                    {sampleType === 'fabric' ? (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Total Length</label>
                                    <input type="number" step="0.1" className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                        placeholder="e.g. 10.5" value={sample.totalLength} onChange={e => setSample({ ...sample, totalLength: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Unit</label>
                                    <select className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                        value={sample.unit} onChange={e => setSample({ ...sample, unit: e.target.value })}>
                                        <option value="meters">Meters</option>
                                        <option value="yards">Yards</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Length per Outfit</label>
                                    <input type="number" step="0.1" className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                        placeholder="e.g. 2.5" value={sample.lengthRequiredPerOutfit} onChange={e => setSample({ ...sample, lengthRequiredPerOutfit: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Cost per Meter (₹)</label>
                                    <input type="number" step="0.01" className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                        placeholder="e.g. 450" value={sample.costPerMeter} onChange={e => setSample({ ...sample, costPerMeter: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase">Location</label>
                                <input className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                    placeholder="e.g. Sample Shelf" value={sample.location} onChange={e => setSample({ ...sample, location: e.target.value })} />
                            </div>

                            {/* Vendor */}
                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase">Vendor (Optional)</label>
                                {vendors.length === 0 ? (
                                    <p className="text-xs text-yellow-400 mt-1">No vendors available</p>
                                ) : (
                                    <select className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                        value={sample.vendorId} onChange={e => setSample({ ...sample, vendorId: e.target.value })}>
                                        <option value="">-- No Vendor --</option>
                                        {vendors.map(v => (
                                            <option key={v.id} value={v.id}>{v.name} {v.phone ? `(${v.phone})` : ''}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Transport Cost (₹)</label>
                                    <input type="number" step="0.01" className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                        placeholder="0" value={sample.transportCost} onChange={e => setSample({ ...sample, transportCost: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Other Costs (₹)</label>
                                    <input type="number" step="0.01" className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                        placeholder="0" value={sample.otherCosts} onChange={e => setSample({ ...sample, otherCosts: e.target.value })} />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Selling Price (₹)</label>
                                    <input type="number" className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                        placeholder="e.g. 2999" value={sample.sellingPrice} onChange={e => setSample({ ...sample, sellingPrice: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-lime-glow uppercase">Stitching Cost (₹)</label>
                                    <input type="number" className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                        placeholder="e.g. 500" value={sample.stitchingCost} onChange={e => setSample({ ...sample, stitchingCost: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase">Fabric Length Required</label>
                                <input type="number" step="0.1" className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                    placeholder="e.g. 2.5" value={sample.lengthRequiredPerOutfit} onChange={e => setSample({ ...sample, lengthRequiredPerOutfit: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase">Location</label>
                                <input className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                                    placeholder="e.g. Sample Rack" value={sample.location} onChange={e => setSample({ ...sample, location: e.target.value })} />
                            </div>

                            {/* Stock Breakdown for outfit samples */}
                            <div>
                                <label className="text-xs font-bold text-lime-glow uppercase mb-2 block">Stock by Size (if available)</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {Object.keys(STOCK_BREAKDOWN_TEMPLATE).map(size => (
                                        <div key={size} className="flex items-center gap-2">
                                            <span className="text-xs text-gray-400 font-bold w-8">{size}</span>
                                            <input type="number" min="0"
                                                className="flex-1 p-2 bg-gray-800 text-white rounded-lg border border-gray-600 text-sm font-semibold outline-none focus:border-lime-glow"
                                                value={sample.stockBreakdown[size] || 0}
                                                onChange={e => setSample({
                                                    ...sample,
                                                    stockBreakdown: { ...sample.stockBreakdown, [size]: parseInt(e.target.value) || 0 }
                                                })}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Received Date */}
                    <div>
                        <label className="text-xs font-bold text-lime-glow uppercase">Sample Received Date</label>
                        <input type="date" className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none"
                            value={sample.receivedDate} onChange={e => setSample({ ...sample, receivedDate: e.target.value })} />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-xs font-bold text-lime-glow uppercase">Notes / Comments</label>
                        <textarea className="w-full p-3 bg-gray-800 text-white rounded-xl border-2 border-gray-600 focus:border-lime-glow font-semibold mt-1 outline-none resize-none"
                            rows={3} placeholder="Any observations about this sample..."
                            value={sample.notes} onChange={e => setSample({ ...sample, notes: e.target.value })} />
                    </div>

                    <button
                        type="submit"
                        disabled={isUploading}
                        className="w-full py-4 rounded-xl font-bold text-emerald-pine shadow-lg bg-gradient-to-r from-lime-400 to-emerald-300 hover:shadow-xl active:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isUploading ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="animate-spin">⏳</span> Saving...
                            </span>
                        ) : (
                            <span className="flex items-center justify-center gap-2">
                                🧪 Add Sample for Review
                            </span>
                        )}
                    </button>
                </form>
            </div>
        </div>
    )
}
