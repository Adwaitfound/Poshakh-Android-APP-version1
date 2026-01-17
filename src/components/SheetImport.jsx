import React, { useState } from 'react'
import Papa from 'papaparse'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { getDb } from '../firebase'
import { ORDERS_COLLECTION } from '../lib/utils'

export default function SheetImport() {
    const [sheetId, setSheetId] = useState('')
    const [loading, setLoading] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [message, setMessage] = useState('')
    const [parsedData, setParsedData] = useState([])
    const [pasteContent, setPasteContent] = useState('')

    const fetchSheet = () => {
        if (!sheetId) return setMessage('Provide sheet id')
        setLoading(true)
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
        Papa.parse(url, {
            download: true, header: true,
            complete: (res) => {
                const rows = (res.data || []).filter(r => Object.values(r).some(v => v !== undefined && v !== null && v !== ''))
                setParsedData(rows)
                setMessage(`Fetched ${rows.length} rows — preview below. Tap Import to save.`)
                setLoading(false)
            },
            error: (err) => { setMessage('Fetch failed: ' + err.message); setLoading(false) }
        })
    }

    const parsePaste = () => {
        if (!pasteContent) return setMessage('Paste CSV content or fetch a sheet')
        try {
            const res = Papa.parse(pasteContent, { header: true })
            const rows = (res.data || []).filter(r => Object.values(r).some(v => v !== undefined && v !== null && v !== ''))
            setParsedData(rows)
            setMessage(`Parsed ${rows.length} rows from pasted CSV.`)
        } catch (e) { setMessage('Parse failed: ' + e.message) }
    }

    const importData = async () => {
        if (!parsedData || !parsedData.length) return setMessage('No data to import')
        setIsUploading(true)
        try {
            const db = getDb()
            let count = 0
            for (const row of parsedData) {
                await addDoc(collection(db, ORDERS_COLLECTION), { importedData: row, createdAt: serverTimestamp() })
                count++
            }
            setMessage(`Imported ${count} rows`)
            setParsedData([])
            setPasteContent('')
        } catch (e) { setMessage('Import failed: ' + e.message) }
        setIsUploading(false)
    }

    return (
        <div className="p-4 max-w-3xl mx-auto">
            <h3 className="font-bold mb-3 text-lg">Import Google Sheet / CSV</h3>

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input value={sheetId} onChange={e => setSheetId(e.target.value)} placeholder="Google Sheet ID (or leave blank)" className="flex-1 p-3 rounded border bg-white text-sm" />
                <button onClick={fetchSheet} className="w-full sm:w-auto px-4 py-3 bg-green-600 text-white rounded shadow" disabled={loading}>{loading ? 'Fetching…' : 'Fetch Sheet'}</button>
            </div>

            <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Paste raw CSV data</label>
                <textarea rows={6} value={pasteContent} onChange={e => setPasteContent(e.target.value)} placeholder="Paste CSV here" className="w-full mt-2 p-3 rounded border bg-white text-sm font-mono" />
                <div className="flex gap-2 mt-2">
                    <button onClick={parsePaste} className="flex-1 px-4 py-3 bg-blue-600 text-white rounded">Parse Pasted CSV</button>
                    <button onClick={() => { setPasteContent(''); setParsedData([]); setMessage('Cleared') }} className="px-4 py-3 bg-gray-100 rounded">Clear</button>
                </div>
            </div>

            <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold">Preview</h4>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{parsedData.length} rows</div>
                </div>
                {parsedData.length > 0 ? (
                    <div className="overflow-x-auto border rounded-lg bg-white">
                        <table className="w-full text-xs table-auto">
                            <thead className="bg-gray-50 dark:bg-gray-900 text-gray-600">
                                <tr>
                                    {Object.keys(parsedData[0]).slice(0, 10).map((k) => <th key={k} className="p-2 border-b">{k}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {parsedData.slice(0, 5).map((row, i) => (
                                    <tr key={i} className="border-b hover:bg-gray-50">
                                        {Object.values(row).slice(0, 10).map((v, j) => <td key={j} className="p-2 align-top whitespace-nowrap overflow-hidden text-ellipsis max-w-[10rem]">{v}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 dark:text-gray-500 p-2">Showing first 5 rows</div>
                    </div >
                ) : (
                    <div className="text-center py-6 text-gray-400 dark:text-gray-500 bg-white border rounded-lg">No data loaded.</div>
                )
                }
            </div >

            <div className="flex gap-2">
                <button onClick={importData} disabled={isUploading || parsedData.length === 0} className="flex-1 px-4 py-3 bg-green-600 text-white rounded shadow">{isUploading ? 'Importing…' : 'Import Parsed Data'}</button>
                <button onClick={() => { setParsedData([]); setMessage('Cleared parsed data') }} className="px-4 py-3 bg-gray-100 rounded">Reset</button>
            </div>

            {message && <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 mt-3">{message}</p>}
        </div >
    )
}
