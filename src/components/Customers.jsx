import React, { useMemo, useState } from 'react'
import { Search, Users, Trash2, Plus } from 'lucide-react'

export default function Customers({ allOrders = [], onViewCustomer = () => { }, onDeleteCustomer = () => { }, onAddCustomer = () => { }, searchTerm = '', setSearchTerm = () => { } }) {
    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const [showAddModal, setShowAddModal] = useState(false)
    const [sortBy, setSortBy] = useState('name') // 'name', 'orderValue', 'orderDate', 'orderCount'
    const [platformFilter, setPlatformFilter] = useState('all') // 'all', 'shopify', 'shopdeck'
    const [selectedCustomers, setSelectedCustomers] = useState(new Set())
    const [newCustomer, setNewCustomer] = useState({
        name: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        state: '',
        source: 'Manual'
    })

    const resetNewCustomer = () => setNewCustomer({ name: '', phone: '', email: '', address: '', city: '', state: '', source: 'Manual' })

    const toggleSelectCustomer = (customerName) => {
        const newSet = new Set(selectedCustomers)
        if (newSet.has(customerName)) {
            newSet.delete(customerName)
        } else {
            newSet.add(customerName)
        }
        setSelectedCustomers(newSet)
    }

    const toggleSelectAll = () => {
        if (selectedCustomers.size === customerList.length) {
            setSelectedCustomers(new Set())
        } else {
            setSelectedCustomers(new Set(customerList.map(c => c.name)))
        }
    }

    const handleBulkDelete = () => {
        if (selectedCustomers.size === 0) return
        setDeleteConfirm('bulk')
    }

    const confirmBulkDelete = () => {
        selectedCustomers.forEach(customerName => {
            onDeleteCustomer(customerName)
        })
        setSelectedCustomers(new Set())
        setDeleteConfirm(null)
    }

    const handleAddCustomer = () => {
        if (!newCustomer.name.trim()) {
            alert('Name is required')
            return
        }
        onAddCustomer(newCustomer)
        resetNewCustomer()
        setShowAddModal(false)
    }
    const cleanNumber = (val) => {
        if (typeof val === 'number') return val
        if (!val) return 0
        const s = String(val).replace(/[^0-9.-]/g, '')
        return parseFloat(s) || 0
    }

    const getCustomerStats = (customerName) => {
        if (!customerName) return null
        const name = customerName.toLowerCase().trim()
        const history = allOrders.filter(o => o.customerName && o.customerName.toLowerCase().trim() === name)
        const totalSpent = history.reduce((acc, curr) => {
            const val = cleanNumber(curr.orderTotal) || cleanNumber(curr.finalSellingPrice) || cleanNumber(curr.importedData?.['Product Price']) || 0
            return acc + val
        }, 0)
        const totalItems = history.length
        const orderNumbers = history
            .map(o => o.orderNumber)
            .filter(Boolean)
            .sort((a, b) => {
                // Sort numerically
                const numA = parseInt(a) || 0
                const numB = parseInt(b) || 0
                return numA - numB
            })
        return { history, totalSpent, totalItems, orderNumbers }
    }

    const customerList = useMemo(() => {
        const uniqueCustomers = new Map()
        allOrders.forEach(o => {
            if (o.customerName) {
                const key = o.customerName.toLowerCase().trim()
                const existing = uniqueCustomers.get(key) || {
                    name: o.customerName,
                    phone: o.phone || '',
                    address: o.address || '',
                    email: o.email || '',
                    city: o.city || '',
                    state: o.state || '',
                    source: 'Order History',
                    customFields: o.importedData || {}
                }
                if (o.phone) existing.phone = o.phone
                if (o.address) existing.address = o.address
                if (o.city) existing.city = o.city
                if (o.state) existing.state = o.state
                if (o.importedData?.['Customer Email']) existing.email = o.importedData['Customer Email']
                uniqueCustomers.set(key, existing)
            }
        })
        let list = Array.from(uniqueCustomers.values())
        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            list = list.filter(c => c.name.toLowerCase().includes(term) || (c.phone && c.phone.includes(term)))
        }
        
        // Apply platform filter
        if (platformFilter !== 'all') {
            list = list.filter(c => {
                const stats = getCustomerStats(c.name)
                if (!stats?.history || stats.history.length === 0) return platformFilter === 'shopify' // Default to Shopify
                const platform = stats.history[0].platform
                const normalized = (platform === 'Shopodeck' || platform === 'Shopdeck') ? 'shopdeck' : 'shopify'
                return normalized === platformFilter
            })
        }
        
        // Apply sorting
        list.sort((a, b) => {
            const statsA = getCustomerStats(a.name)
            const statsB = getCustomerStats(b.name)
            
            switch(sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name)
                case 'orderNumber':
                    // Sort by order number numerically (1131 before 1132)
                    const getOrderNum = (stats) => {
                        if (!stats?.orderNumbers || stats.orderNumbers.length === 0) return Infinity
                        // Get the most recent (last) order number and parse as integer
                        const orderStr = stats.orderNumbers[stats.orderNumbers.length - 1]
                        return parseInt(orderStr) || Infinity
                    }
                    return getOrderNum(statsA) - getOrderNum(statsB)
                case 'orderValue':
                    return (statsB?.totalSpent || 0) - (statsA?.totalSpent || 0)
                case 'orderDate':
                    // Sort by most recent order date
                    const dateA = statsA?.history?.[0]?.createdAt?.toMillis?.() || 0
                    const dateB = statsB?.history?.[0]?.createdAt?.toMillis?.() || 0
                    return dateB - dateA
                case 'orderCount':
                    return (statsB?.totalItems || 0) - (statsA?.totalItems || 0)
                case 'platform':
                    // Sort by platform: Shopify first, then Shopdeck, then others
                    const platformA = statsA?.history?.[0]?.platform || 'zzz'
                    const platformB = statsB?.history?.[0]?.platform || 'zzz'
                    return platformA.localeCompare(platformB)
                default:
                    return a.name.localeCompare(b.name)
            }
        })
        
        return list
    }, [allOrders, searchTerm, sortBy, platformFilter])

    return (
        <div className="space-y-6 fade-in">
            <div className="flex justify-between items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold text-lime-glow">Customers</h2>
                <div className="flex items-center gap-3">
                    {selectedCustomers.size > 0 && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/20 border border-red-500 rounded-lg">
                            <span className="text-sm font-bold text-red-500">{selectedCustomers.size} selected</span>
                            <button
                                onClick={handleBulkDelete}
                                className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1"
                            >
                                <Trash2 className="w-3 h-3" />
                                Delete
                            </button>
                        </div>
                    )}
                    <div className="text-xs text-emerald-pine font-bold bg-lime-glow px-3 py-1 rounded-full shadow-sm border border-emerald-pine/30">{customerList.length} Total</div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-pine text-lime-glow rounded-xl text-sm font-bold shadow-sm hover:shadow-md border border-lime-glow"
                    >
                        <Plus className="w-4 h-4" />
                        Add Customer
                    </button>
                </div>
            </div>

            <div className="relative mb-4">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-emerald-pine">
                    <Search className="w-5 h-5" />
                </span>
                <input className="w-full pl-10 p-3 bg-white text-black rounded-xl border-2 border-lime-glow shadow-sm text-sm placeholder-gray-400" placeholder="Search customers..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>

            {/* Sort Options */}
            <div className="flex gap-2 flex-wrap mb-4">
                <button
                    onClick={() => setSortBy('name')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        sortBy === 'name'
                            ? 'bg-lime-glow text-emerald-pine border-2 border-emerald-pine'
                            : 'bg-emerald-pine/20 text-lime-glow border-2 border-lime-glow/40 hover:bg-emerald-pine/40'
                    }`}
                >
                    A-Z
                </button>
                <button
                    onClick={() => setSortBy('orderValue')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        sortBy === 'orderValue'
                            ? 'bg-lime-glow text-emerald-pine border-2 border-emerald-pine'
                            : 'bg-emerald-pine/20 text-lime-glow border-2 border-lime-glow/40 hover:bg-emerald-pine/40'
                    }`}
                >
                    💰 Order Value
                </button>
                <button
                    onClick={() => setSortBy('orderDate')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        sortBy === 'orderDate'
                            ? 'bg-lime-glow text-emerald-pine border-2 border-emerald-pine'
                            : 'bg-emerald-pine/20 text-lime-glow border-2 border-lime-glow/40 hover:bg-emerald-pine/40'
                    }`}
                >
                    📅 Order Date
                </button>
                <button
                    onClick={() => setSortBy('orderCount')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        sortBy === 'orderCount'
                            ? 'bg-lime-glow text-emerald-pine border-2 border-emerald-pine'
                            : 'bg-emerald-pine/20 text-lime-glow border-2 border-lime-glow/40 hover:bg-emerald-pine/40'
                    }`}
                >
                    #️⃣ Order Count
                </button>
                <button
                    onClick={() => setSortBy('orderNumber')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        sortBy === 'orderNumber'
                            ? 'bg-lime-glow text-emerald-pine border-2 border-emerald-pine'
                            : 'bg-emerald-pine/20 text-lime-glow border-2 border-lime-glow/40 hover:bg-emerald-pine/40'
                    }`}
                >
                    🔢 Latest Order #
                </button>
                <button
                    onClick={() => setSortBy('platform')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        sortBy === 'platform'
                            ? 'bg-lime-glow text-emerald-pine border-2 border-emerald-pine'
                            : 'bg-emerald-pine/20 text-lime-glow border-2 border-lime-glow/40 hover:bg-emerald-pine/40'
                    }`}
                >
                    🏪 Platform
                </button>
            </div>

            {/* Platform Filter */}
            <div className="flex gap-2 flex-wrap mb-4">
                <span className="text-xs font-bold text-lime-glow self-center">Filter by Platform:</span>
                <button
                    onClick={() => setPlatformFilter('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        platformFilter === 'all'
                            ? 'bg-lime-glow text-emerald-pine border-2 border-emerald-pine'
                            : 'bg-emerald-pine/20 text-lime-glow border-2 border-lime-glow/40 hover:bg-emerald-pine/40'
                    }`}
                >
                    All
                </button>
                <button
                    onClick={() => setPlatformFilter('shopify')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        platformFilter === 'shopify'
                            ? 'bg-green-600 text-white border-2 border-green-500'
                            : 'bg-emerald-pine/20 text-lime-glow border-2 border-lime-glow/40 hover:bg-emerald-pine/40'
                    }`}
                >
                    🛍️ Shopify
                </button>
                <button
                    onClick={() => setPlatformFilter('shopdeck')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        platformFilter === 'shopdeck'
                            ? 'bg-blue-600 text-white border-2 border-blue-500'
                            : 'bg-emerald-pine/20 text-lime-glow border-2 border-lime-glow/40 hover:bg-emerald-pine/40'
                    }`}
                >
                    🏪 Shopdeck
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {customerList.length > 0 && (
                    <div className="bg-emerald-pine/20 p-3 rounded-xl border border-lime-glow/60 flex items-center gap-3">
                        <input
                            type="checkbox"
                            checked={selectedCustomers.size === customerList.length}
                            onChange={toggleSelectAll}
                            className="w-5 h-5 rounded border-2 border-lime-glow cursor-pointer"
                        />
                        <span className="text-sm font-bold text-emerald-pine">
                            {selectedCustomers.size === customerList.length ? 'Deselect All' : 'Select All'}
                        </span>
                    </div>
                )}
                {customerList.map((customer, idx) => {
                    const stats = getCustomerStats(customer.name)
                    const isSelected = selectedCustomers.has(customer.name)
                    return (
                        <div key={idx} className={`bg-green-tea p-4 rounded-2xl shadow-card flex items-center justify-between border-2 transition ${isSelected ? 'border-blue-500 bg-blue-50/10' : 'border-lime-glow/60'}`}>
                            <div className="flex items-center gap-3 flex-1">
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectCustomer(customer.name)}
                                    className="w-5 h-5 rounded border-2 border-lime-glow cursor-pointer"
                                />
                                <div onClick={() => onViewCustomer(customer)} className="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80">
                                    <div className="h-10 w-10 rounded-full bg-emerald-pine/10 border border-lime-glow flex items-center justify-center text-emerald-pine font-bold text-sm">
                                        {customer.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-emerald-pine text-sm">{customer.name}</h4>
                                        <div className="flex items-center gap-2 text-[10px] text-emerald-pine/70">
                                            {customer.phone && <span>📞 {customer.phone}</span>}
                                            {stats?.orderNumbers && stats.orderNumbers.length > 0 && (
                                                <span className="font-mono">Orders: {stats.orderNumbers.join(', ')}</span>
                                            )}
                                            {customer.source === 'Saved' && <span className="bg-lime-glow text-emerald-pine px-1 rounded border border-emerald-pine/40">Imported</span>}
                                            {stats?.history && stats.history.length > 0 && (() => {
                                                // Normalize platform: Shopodeck -> Shopdeck, everything else (including empty) -> Shopify
                                                const platform = stats.history[0].platform
                                                const normalizedPlatform = (platform === 'Shopodeck' || platform === 'Shopdeck') ? 'Shopdeck' : 'Shopify'
                                                return (
                                                    <span className={`font-bold px-1.5 py-0.5 rounded border ${
                                                        normalizedPlatform === 'Shopify' 
                                                            ? 'bg-green-600/80 text-white border-green-500' 
                                                            : 'bg-blue-600/80 text-white border-blue-500'
                                                    }`}>
                                                        {normalizedPlatform === 'Shopify' ? '🛍️' : '🏪'}
                                                    </span>
                                                )
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right flex items-center gap-3">
                                <div>
                                    <p className="text-lg font-bold text-emerald-pine">{stats.totalItems}</p>
                                    <p className="text-[10px] text-emerald-pine/60 uppercase">Orders</p>
                                </div>
                                {!isSelected && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setDeleteConfirm(customer.name)
                                        }}
                                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                                        title="Delete customer and all orders"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
                {customerList.length === 0 && (
                    <div className="text-center py-10 text-emerald-pine/70">
                        <Users className="w-12 h-12 mx-auto mb-2 opacity-20 text-emerald-pine" />
                        <p>No customers found.</p>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            {deleteConfirm === 'bulk' ? `Delete ${selectedCustomers.size} Customers?` : 'Delete Customer?'}
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                            {deleteConfirm === 'bulk' ? (
                                <>This will permanently delete <strong>{selectedCustomers.size} customers</strong> and all their orders. This action cannot be undone.</>
                            ) : (
                                <>This will permanently delete <strong>{deleteConfirm}</strong> and all their orders. This action cannot be undone.</>
                            )}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (deleteConfirm === 'bulk') {
                                        confirmBulkDelete()
                                    } else {
                                        onDeleteCustomer(deleteConfirm)
                                        setDeleteConfirm(null)
                                    }
                                }}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Customer Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAddModal(false)}>
                    <div className="bg-green-tea rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl border-2 border-lime-glow" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-emerald-pine">Add Customer</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-emerald-pine/60 hover:text-emerald-pine font-bold">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="text-xs font-bold text-emerald-pine uppercase">Name *</label>
                                <input
                                    className="w-full p-3 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm"
                                    value={newCustomer.name}
                                    onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                    placeholder="Customer name"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-emerald-pine uppercase">Phone</label>
                                <input
                                    className="w-full p-3 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm"
                                    value={newCustomer.phone}
                                    onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                    placeholder="Phone"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-emerald-pine uppercase">Email</label>
                                <input
                                    className="w-full p-3 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm"
                                    value={newCustomer.email}
                                    onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })}
                                    placeholder="Email"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs font-bold text-emerald-pine uppercase">Address</label>
                                <input
                                    className="w-full p-3 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm"
                                    value={newCustomer.address}
                                    onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                    placeholder="Street address"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-emerald-pine uppercase">City</label>
                                <input
                                    className="w-full p-3 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm"
                                    value={newCustomer.city}
                                    onChange={e => setNewCustomer({ ...newCustomer, city: e.target.value })}
                                    placeholder="City"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-emerald-pine uppercase">State</label>
                                <input
                                    className="w-full p-3 bg-white text-black rounded-xl mt-1 border-2 border-lime-glow font-semibold text-sm"
                                    value={newCustomer.state}
                                    onChange={e => setNewCustomer({ ...newCustomer, state: e.target.value })}
                                    placeholder="State"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-5">
                            <button
                                onClick={() => { resetNewCustomer(); setShowAddModal(false) }}
                                className="flex-1 px-4 py-3 border-2 border-lime-glow text-emerald-pine font-bold rounded-xl"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddCustomer}
                                className="flex-1 px-4 py-3 bg-emerald-pine text-lime-glow font-bold rounded-xl shadow-sm hover:shadow-md"
                            >
                                Save Customer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
