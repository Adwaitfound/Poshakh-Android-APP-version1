import React, { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import { getDb } from '../firebase'
import { collection, addDoc, serverTimestamp, updateDoc, doc, increment } from 'firebase/firestore'
import { logInventoryAdded } from '../lib/notificationLogger'

export default function ProductionModal({ visible, onClose, inventoryItems = [], onDataChanged, userProfile }) {
    const [form, setForm] = useState({
        fabricId: '',
        outfitId: '',
        fabricPerPiece: '',
        fabricUsed: '',
        estimatedPieces: 0,
        sizeS: '',
        sizeM: '',
        sizeL: '',
        sizeXL: '',
        sizeXXL: '',
        stitchingCostTotal: '',
        tailorName: '',
        notes: '',
        status: 'In Progress',
        sentDate: new Date().toISOString().split('T')[0],
        receivedDate: ''
    })
    const [loading, setLoading] = useState(false)

    const fabricOptions = useMemo(() =>
        inventoryItems.filter(i => i.type === 'fabric' && parseFloat(i.currentLength) > 0),
        [inventoryItems]
    )

    const outfitOptions = useMemo(() =>
        inventoryItems.filter(i => i.type === 'outfit'),
        [inventoryItems]
    )

    const selectedFabric = fabricOptions.find(f => f.id === form.fabricId)
    const selectedOutfit = outfitOptions.find(o => o.id === form.outfitId)

    // Auto-calculate estimated pieces
    const estimatedPieces = useMemo(() => {
        if (!form.fabricUsed || !form.fabricPerPiece) return 0
        const fabricUsed = parseFloat(form.fabricUsed) || 0
        const fabricPerPiece = parseFloat(form.fabricPerPiece) || 0
        if (fabricPerPiece === 0) return 0
        return Math.floor(fabricUsed / fabricPerPiece)
    }, [form.fabricUsed, form.fabricPerPiece])

    // Auto-distribute sizes when estimated pieces changes
    React.useEffect(() => {
        if (estimatedPieces > 0 && !form.sizeS && !form.sizeM && !form.sizeL) {
            // Auto-distribute: 30% S, 40% M, 30% L
            const sCount = Math.floor(estimatedPieces * 0.3)
            const mCount = Math.floor(estimatedPieces * 0.4)
            const lCount = estimatedPieces - sCount - mCount
            setForm(prev => ({
                ...prev,
                estimatedPieces,
                sizeS: sCount.toString(),
                sizeM: mCount.toString(),
                sizeL: lCount.toString(),
                sizeXL: '0',
                sizeXXL: '0'
            }))
        }
    }, [estimatedPieces])

    const totalPieces = [form.sizeS, form.sizeM, form.sizeL, form.sizeXL, form.sizeXXL]
        .reduce((sum, val) => sum + (parseInt(val) || 0), 0)

    const fabricCostPerPiece = useMemo(() => {
        if (!selectedFabric || !form.fabricUsed || totalPieces === 0) return 0
        const fabricUsed = parseFloat(form.fabricUsed) || 0
        const costPerMeter = parseFloat(selectedFabric.costPerMeter) || 0
        return (fabricUsed * costPerMeter) / totalPieces
    }, [selectedFabric, form.fabricUsed, totalPieces])

    const stitchingCostPerPiece = useMemo(() => {
        if (totalPieces === 0) return 0
        return (parseFloat(form.stitchingCostTotal) || 0) / totalPieces
    }, [form.stitchingCostTotal, totalPieces])

    const totalCostPerPiece = fabricCostPerPiece + stitchingCostPerPiece

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!form.fabricId || !form.outfitId || !form.fabricUsed || !form.fabricPerPiece) {
            alert('Please fill all required fields')
            return
        }

        if (totalPieces === 0) {
            alert('Please enter at least one piece in size breakdown')
            return
        }

        const fabricUsed = parseFloat(form.fabricUsed)
        if (fabricUsed > parseFloat(selectedFabric.currentLength)) {
            alert('Not enough fabric available!')
            return
        }

        setLoading(true)
        try {
            const db = getDb()

            const fabricPerPiece = parseFloat(form.fabricPerPiece) || 0
            const actualFabricPerPiece = totalPieces > 0 ? fabricUsed / totalPieces : 0
            const variance = actualFabricPerPiece - fabricPerPiece
            const variancePercent = fabricPerPiece > 0 ? (variance / fabricPerPiece) * 100 : 0

            // Create production batch record
            await addDoc(collection(db, 'production_batches'), {
                fabricId: form.fabricId,
                fabricName: selectedFabric.name,
                fabricUsed: fabricUsed,
                fabricCostPerMeter: parseFloat(selectedFabric.costPerMeter) || 0,
                outfitId: form.outfitId,
                outfitName: selectedOutfit.name,
                outfitImageUrl: selectedOutfit.imageUrl || '',
                fabricPerPiece: fabricPerPiece,
                estimatedPieces: estimatedPieces,
                actualFabricPerPiece: actualFabricPerPiece,
                variance: variance,
                variancePercent: variancePercent,
                sizeBreakdown: {
                    S: parseInt(form.sizeS) || 0,
                    M: parseInt(form.sizeM) || 0,
                    L: parseInt(form.sizeL) || 0,
                    XL: parseInt(form.sizeXL) || 0,
                    XXL: parseInt(form.sizeXXL) || 0
                },
                totalPieces,
                stitchingCostTotal: parseFloat(form.stitchingCostTotal) || 0,
                stitchingCostPerPiece,
                fabricCostPerPiece,
                totalCostPerPiece,
                tailorName: form.tailorName || 'Unknown',
                notes: form.notes || '',
                sentDate: new Date(form.sentDate),
                receivedDate: form.receivedDate ? new Date(form.receivedDate) : null,
                status: form.receivedDate ? 'Completed' : 'In Progress',
                createdAt: serverTimestamp()
            })

            // Deduct fabric from inventory
            await updateDoc(doc(db, 'fabrics', form.fabricId), {
                currentLength: increment(-fabricUsed)
            })

            // Add outfit stock only if received
            if (form.receivedDate) {
                const currentStock = selectedOutfit.stockBreakdown || {}
                await updateDoc(doc(db, 'fabrics', form.outfitId), {
                    stockBreakdown: {
                        S: (parseInt(currentStock.S) || 0) + (parseInt(form.sizeS) || 0),
                        M: (parseInt(currentStock.M) || 0) + (parseInt(form.sizeM) || 0),
                        L: (parseInt(currentStock.L) || 0) + (parseInt(form.sizeL) || 0),
                        XL: (parseInt(currentStock.XL) || 0) + (parseInt(form.sizeXL) || 0),
                        XXL: (parseInt(currentStock.XXL) || 0) + (parseInt(form.sizeXXL) || 0)
                    },
                    productionCostPerPiece: totalCostPerPiece
                })
            }

            // Log production batch created
            await logInventoryAdded(`${selectedOutfit.name} (Production)`, 'outfit', userProfile?.name || 'Unknown')

            const statusMsg = form.receivedDate
                ? `✅ Production batch completed!\n${totalPieces} pieces added to inventory\n${fabricUsed}m deducted from fabric`
                : `📦 Production batch created!\nEstimated: ${estimatedPieces} pieces\nActual: ${totalPieces} pieces (update when received)\n${fabricUsed}m deducted from fabric`

            alert(statusMsg)
            if (onDataChanged) await onDataChanged()
            onClose()

            // Reset form
            setForm({
                fabricId: '',
                outfitId: '',
                fabricPerPiece: '',
                fabricUsed: '',
                estimatedPieces: 0,
                sizeS: '',
                sizeM: '',
                sizeL: '',
                sizeXL: '',
                sizeXXL: '',
                stitchingCostTotal: '',
                tailorName: '',
                notes: '',
                status: 'In Progress',
                sentDate: new Date().toISOString().split('T')[0],
                receivedDate: ''
            })
        } catch (error) {
            console.error('Production batch error:', error)
            alert('Error creating production batch: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    if (!visible) return null

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white dark:bg-gray-950 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto border dark:border-gray-800">
                <div className="sticky top-0 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Production Batch</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Fabric Selection */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Select Fabric *</label>
                        <select
                            value={form.fabricId}
                            onChange={(e) => setForm({ ...form, fabricId: e.target.value })}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl"
                            required
                        >
                            <option value="">Choose fabric...</option>
                            {fabricOptions.map(f => (
                                <option key={f.id} value={f.id}>
                                    {f.name} - {parseFloat(f.currentLength).toFixed(1)}m @ ₹{f.costPerMeter}/m
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Outfit Selection */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Outfit Design *</label>
                        <select
                            value={form.outfitId}
                            onChange={(e) => setForm({ ...form, outfitId: e.target.value })}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl"
                            required
                        >
                            <option value="">Choose outfit design...</option>
                            {outfitOptions.map(o => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Fabric per piece */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Fabric Per Piece (meters) *</label>
                        <input
                            type="number"
                            step="0.01"
                            value={form.fabricPerPiece}
                            onChange={(e) => setForm({ ...form, fabricPerPiece: e.target.value })}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl"
                            placeholder="e.g., 1.5"
                            required
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">How many meters needed per outfit?</p>
                    </div>

                    {/* Fabric Sent to Tailor */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Fabric Sent to Tailor (meters) *</label>
                        <input
                            type="number"
                            step="0.1"
                            value={form.fabricUsed}
                            onChange={(e) => setForm({ ...form, fabricUsed: e.target.value })}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl"
                            placeholder="e.g., 50"
                            required
                        />
                    </div>

                    {/* Estimated Pieces Calculation */}
                    {estimatedPieces > 0 && (
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                            <h4 className="font-bold text-blue-900 mb-2">📊 Estimated Production</h4>
                            <p className="text-sm text-blue-800">
                                {form.fabricUsed}m ÷ {form.fabricPerPiece}m/piece = <span className="font-bold text-lg">~{estimatedPieces} pieces</span>
                            </p>
                            <p className="text-xs text-blue-600 mt-1">Sizes auto-distributed below (you can adjust)</p>
                        </div>
                    )}

                    {/* Size Breakdown */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                            Actual Size Breakdown *
                            {estimatedPieces > 0 && totalPieces !== estimatedPieces && (
                                <span className="ml-2 text-xs font-normal text-orange-600">
                                    (Estimated: {estimatedPieces}, Actual: {totalPieces})
                                </span>
                            )}
                        </label>
                        <div className="grid grid-cols-5 gap-2">
                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">S</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.sizeS}
                                    onChange={(e) => setForm({ ...form, sizeS: e.target.value })}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-center dark:bg-gray-900 dark:text-white"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">M</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.sizeM}
                                    onChange={(e) => setForm({ ...form, sizeM: e.target.value })}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-center dark:bg-gray-900 dark:text-white"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">L</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.sizeL}
                                    onChange={(e) => setForm({ ...form, sizeL: e.target.value })}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-center dark:bg-gray-900 dark:text-white"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">XL</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.sizeXL}
                                    onChange={(e) => setForm({ ...form, sizeXL: e.target.value })}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-center dark:bg-gray-900 dark:text-white"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">XXL</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.sizeXXL}
                                    onChange={(e) => setForm({ ...form, sizeXXL: e.target.value })}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-center dark:bg-gray-900 dark:text-white"
                                    placeholder="0"
                                />
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Total Pieces: <span className="font-bold">{totalPieces}</span></p>
                    </div>

                    {/* Stitching Cost */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Total Stitching Cost *</label>
                        <input
                            type="number"
                            step="0.01"
                            value={form.stitchingCostTotal}
                            onChange={(e) => setForm({ ...form, stitchingCostTotal: e.target.value })}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl"
                            placeholder="e.g., 5400"
                            required
                        />
                    </div>

                    {/* Tailor Name */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Tailor Name</label>
                        <input
                            type="text"
                            value={form.tailorName}
                            onChange={(e) => setForm({ ...form, tailorName: e.target.value })}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl"
                            placeholder="e.g., Ramesh Tailors"
                        />
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Sent Date</label>
                            <input
                                type="date"
                                value={form.sentDate}
                                onChange={(e) => setForm({ ...form, sentDate: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Received Date (Optional)</label>
                            <input
                                type="date"
                                value={form.receivedDate}
                                onChange={(e) => setForm({ ...form, receivedDate: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty if not yet received</p>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Notes</label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl"
                            rows="3"
                            placeholder="Any additional notes..."
                        />
                    </div>

                    {/* Cost Summary */}
                    {totalPieces > 0 && (
                        <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                            <h4 className="font-bold text-green-900 mb-2">Cost Breakdown (Per Piece)</h4>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-green-700">Fabric Cost:</span>
                                    <span className="font-bold text-green-900">₹{fabricCostPerPiece.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-green-700">Stitching Cost:</span>
                                    <span className="font-bold text-green-900">₹{stitchingCostPerPiece.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-t border-green-300 pt-1">
                                    <span className="text-green-800 font-bold">Total Cost/Piece:</span>
                                    <span className="font-bold text-green-900">₹{totalCostPerPiece.toFixed(2)}</span>
                                </div>
                            </div>
                            {estimatedPieces > 0 && totalPieces !== estimatedPieces && (
                                <div className="mt-3 pt-3 border-t border-green-300">
                                    <p className="text-xs text-green-800">
                                        <span className="font-bold">Variance:</span> {totalPieces > estimatedPieces ? '+' : ''}{totalPieces - estimatedPieces} pieces
                                        ({((totalPieces - estimatedPieces) / estimatedPieces * 100).toFixed(1)}%)
                                    </p>
                                    <p className="text-xs text-green-600 mt-1">
                                        This data will improve future predictions
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-4 rounded-xl disabled:opacity-50"
                    >
                        {loading ? 'Creating...' : form.receivedDate ? 'Complete Production Batch' : 'Create Production Batch (In Progress)'}
                    </button>
                </form>
            </div>
        </div>
    )
}
