import React, { useMemo, useState, useEffect } from 'react'
import { TrendingUp, Zap, AlertCircle, CheckCircle, Edit2, X } from 'lucide-react'
import { getDb } from '../firebase'
import { query, collection, orderBy, limit, getDocs } from 'firebase/firestore'

export default function Dashboard({ allOrders = [], inventoryItems = [], userRole = 'admin' }) {
    const [financialViewMode, setFinancialViewMode] = useState('all')
    const [lastSyncLog, setLastSyncLog] = useState(null)
    const [showGoalsEdit, setShowGoalsEdit] = useState(false)
    const [monthlyGoals, setMonthlyGoals] = useState(() => {
        const saved = localStorage.getItem('poshakh_monthly_goals')
        return saved ? JSON.parse(saved) : {}
    })
    const [editingGoals, setEditingGoals] = useState({
        salesGoal: 200000,
        designsGoal: 10
    })

    // Load latest sync status
    useEffect(() => {
        const loadSyncStatus = async () => {
            try {
                const db = getDb()
                const logsQuery = query(
                    collection(db, 'syncLogs'),
                    orderBy('timestamp', 'desc'),
                    limit(1)
                )
                const snapshot = await getDocs(logsQuery)
                if (snapshot.docs.length > 0) {
                    const logData = snapshot.docs[0].data()
                    setLastSyncLog({
                        ...logData,
                        timestamp: logData.timestamp?.toDate?.() || logData.timestamp
                    })
                }
            } catch (error) {
                console.error('Error loading sync status:', error)
            }
        }
        loadSyncStatus()
    }, [])

    // Load goals for current month
    useEffect(() => {
        const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })
        const saved = localStorage.getItem(`poshakh_goals_${currentMonth}`)
        if (saved) {
            const goals = JSON.parse(saved)
            setEditingGoals(goals)
        }
    }, [])

    const saveGoals = () => {
        const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })
        localStorage.setItem(`poshakh_goals_${currentMonth}`, JSON.stringify(editingGoals))
        setShowGoalsEdit(false)
    }

    const cleanNumber = (val) => {
        const n = parseFloat(val)
        return isNaN(n) ? 0 : n
    }

    const getOutfitTotal = (breakdown) => {
        if (!breakdown) return 0
        return Object.values(breakdown).reduce((a, b) => a + (parseInt(b) || 0), 0)
    }

    const calculateOutfitMakingCost = (outfit, inventory) => {
        if (!outfit.parentFabricId) return 0
        const parent = inventory.find(i => i.id === outfit.parentFabricId)
        if (!parent) return 0
        const fabricCost = (parseFloat(parent.costPerMeter) || 0) * (parseFloat(outfit.lengthRequiredPerOutfit) || 0)
        const stitching = parseFloat(outfit.stitchingCost) || 0
        return fabricCost + stitching
    }

    const inventoryStats = useMemo(() => {
        let potentialRevenue = 0
        let totalStockCount = 0
        let totalFabricCostValuation = 0
        let totalOutfitCostValuation = 0

        inventoryItems.forEach(item => {
            if (item.type === 'outfit') {
                const qty = getOutfitTotal(item.stockBreakdown)
                totalStockCount += qty
                potentialRevenue += qty * (item.sellingPrice || 0)
                const unitCost = calculateOutfitMakingCost(item, inventoryItems)
                totalOutfitCostValuation += qty * unitCost
            } else if (item.type === 'fabric') {
                const currentLength = parseFloat(item.currentLength) || 0
                const costPerMeter = parseFloat(item.costPerMeter) || 0
                const lengthPerOutfit = parseFloat(item.lengthRequiredPerOutfit) || 1
                const sellPrice = parseFloat(item.sellingPrice) > 0 ? parseFloat(item.sellingPrice) : 1500

                totalFabricCostValuation += currentLength * costPerMeter
                const potentialOutfits = Math.floor(currentLength / (lengthPerOutfit > 0 ? lengthPerOutfit : 1))
                potentialRevenue += potentialOutfits * sellPrice
            }
        })

        const totalStockValuation = totalFabricCostValuation + totalOutfitCostValuation
        const potentialProfit = potentialRevenue - totalStockValuation
        const percentageIncrease = totalStockValuation > 0 ? (potentialProfit / totalStockValuation) * 100 : 0

        return {
            potentialRevenue,
            totalStockCount,
            totalFabricCostValuation,
            totalOutfitCostValuation,
            totalStockValuation,
            percentageIncrease,
            totalPotentialRevenue: potentialRevenue,
            totalStockValue: totalStockValuation,
            revenuePerMeter: totalStockCount > 0 ? potentialRevenue / totalStockCount : 0
        }
    }, [inventoryItems])

    const financialMetrics = useMemo(() => {
        const currentMonth = new Date().getMonth()
        const currentYear = new Date().getFullYear()

        const relevantOrders = allOrders.filter(o => {
            if (o.status === 'Cancelled') return false

            if (financialViewMode === 'month') {
                let dateObj = null
                if (o.createdAt?.toDate) {
                    dateObj = o.createdAt.toDate()
                } else if (o.dateString) {
                    dateObj = new Date(o.dateString)
                }
                if (!dateObj || isNaN(dateObj.getTime())) return false
                return dateObj.getMonth() === currentMonth && dateObj.getFullYear() === currentYear
            }
            return true
        })

        let totalRevenue = 0
        let totalSold = 0
        let totalProfit = 0
        let dailyProfit = 0
        let totalFabricUsed = 0
        let expenseFabric = 0
        let expenseStitching = 0
        let expenseLogistics = 0
        let expenseOther = 0
        let expenseCOD = 0
        let totalDiscount = 0
        let countCOD = 0
        let countPrepaid = 0
        const customerRevenue = {}

        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)

        relevantOrders.forEach(order => {
            // Skip cancelled orders completely
            if (order.status === 'Cancelled') return

            const fabric = inventoryItems.find(i => i.id === order.fabricId) || { costPerMeter: 0 }
            const outfit = inventoryItems.find(i => i.name === order.outfitName || i.id === order.outfitId)
            const fabricPerOutfit = parseFloat(outfit?.lengthRequiredPerOutfit) || parseFloat(fabric?.lengthRequiredPerOutfit) || 2.5
            const qty = parseInt(order.quantity) || 1
            const cutAmt = parseFloat(order.cutAmount) || fabricPerOutfit
            const matCost = cutAmt * (parseFloat(fabric.costPerMeter) || 0)
            // For past/manual orders, use fabricCost field; default to 0 if not specified
            const fabricExpense = order.fabricCost !== undefined && order.fabricCost !== null ? cleanNumber(order.fabricCost) : 0
            const stitch = cleanNumber(order.stitchingCost)
            const acqCost = cleanNumber(order.acquisitionCost)
            const codFee = cleanNumber(order.codCharge)
            const ship = cleanNumber(order.shippingCost)
            const delivery = cleanNumber(order.deliveryCost)
            const other = cleanNumber(order.otherExpenses)
            const discount = cleanNumber(order.discount)
            const baseRevenue = cleanNumber(order.finalSellingPrice) || cleanNumber(order.orderTotal)
            const revenue = baseRevenue - discount

            if (revenue > 0 || order.status === 'Order Shipped (Completed)') {
                totalRevenue += revenue
                totalSold++
                totalFabricUsed += cutAmt * qty

                // Only accumulate expenses for orders that count toward revenue
                expenseFabric += fabricExpense
                expenseStitching += stitch
                expenseLogistics += (ship + delivery)
                expenseOther += other
                expenseCOD += (acqCost + codFee)
                totalDiscount += discount

                const profit = (revenue - fabricExpense - stitch - acqCost - codFee - ship - delivery - other)
                totalProfit += profit

                if (order.createdAt && typeof order.createdAt.toDate === 'function' && order.createdAt.toDate() >= todayStart) {
                    dailyProfit += profit
                }

                const method = (order.paymentMethod || '').toLowerCase()
                if (method.includes('cod') || method.includes('cash')) countCOD++
                else countPrepaid++

                // Track customer revenue
                if (order.customerName) {
                    const customerKey = order.customerName.toLowerCase().trim()
                    if (!customerRevenue[customerKey]) {
                        customerRevenue[customerKey] = { name: order.customerName, revenue: 0, orders: 0 }
                    }
                    customerRevenue[customerKey].revenue += revenue
                    customerRevenue[customerKey].orders++
                }
            }
        })

        const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
        const revPerMeter = totalFabricUsed > 0 ? totalRevenue / totalFabricUsed : 0
        const avgDailyProfit = totalSold > 0 ? totalProfit / totalSold : 0
        const avgFabricPerOutfit = totalSold > 0 ? totalFabricUsed / totalSold : 0

        // Get top customers by revenue
        const topCustomers = Object.values(customerRevenue)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5)

        const uniqueCustomerCount = Object.keys(customerRevenue).length
        const avgCustomerRevenue = uniqueCustomerCount > 0 ? totalRevenue / uniqueCustomerCount : 0
        const uniqueCustomersAllTime = new Set(
            allOrders
                .filter(o => o.customerName)
                .map(o => o.customerName.toLowerCase().trim())
        ).size

        return {
            totalRevenue: totalRevenue.toFixed(0),
            totalProfit: totalProfit.toFixed(0),
            netProfit: parseInt(totalProfit),
            totalSold,
            totalFabricUsed: totalFabricUsed.toFixed(1),
            avgFabricPerOutfit: avgFabricPerOutfit.toFixed(2),
            dailyProfit: avgDailyProfit.toFixed(0),
            revPerMeter: revPerMeter.toFixed(0),
            profitMargin: profitMargin.toFixed(1),
            breakdown: {
                fabric: expenseFabric,
                stitch: expenseStitching,
                logistics: expenseLogistics,
                other: expenseOther,
                cod: expenseCOD,
                discount: totalDiscount,
                total: expenseFabric + expenseStitching + expenseLogistics + expenseOther + expenseCOD
            },
            paymentSplit: { cod: countCOD, prepaid: countPrepaid },
            customerMetrics: {
                totalCustomers: uniqueCustomersAllTime || uniqueCustomerCount,
                avgRevenue: avgCustomerRevenue,
                topCustomers
            }
        }
    }, [inventoryItems, allOrders, financialViewMode])

    // Calculate goal progress
    const goalProgress = useMemo(() => {
        const currentMonth = new Date().getMonth()
        const currentYear = new Date().getFullYear()

        // Current month's sales
        const currentMonthRevenue = allOrders
            .filter(o => {
                if (o.status !== 'Order Shipped (Completed)') return false
                let dateObj = null
                if (o.createdAt?.toDate) {
                    dateObj = o.createdAt.toDate()
                } else if (o.dateString) {
                    dateObj = new Date(o.dateString)
                }
                if (!dateObj || isNaN(dateObj.getTime())) return false
                return dateObj.getMonth() === currentMonth && dateObj.getFullYear() === currentYear
            })
            .reduce((sum, o) => sum + (cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0), 0)

        // Current month's designs (new outfits created)
        const currentMonthDesigns = inventoryItems
            .filter(item => item.type === 'outfit' && item.createdAt)
            .filter(item => {
                let dateObj = null
                if (item.createdAt?.toDate) {
                    dateObj = item.createdAt.toDate()
                } else if (item.createdAt instanceof Date) {
                    dateObj = item.createdAt
                } else if (typeof item.createdAt === 'number') {
                    dateObj = new Date(item.createdAt)
                }
                if (!dateObj || isNaN(dateObj.getTime())) return false
                return dateObj.getMonth() === currentMonth && dateObj.getFullYear() === currentYear
            }).length

        const salesGoal = editingGoals.salesGoal || 200000
        const designsGoal = editingGoals.designsGoal || 10
        const salesProgress = Math.min((currentMonthRevenue / salesGoal) * 100, 100)
        const designsProgress = Math.min((currentMonthDesigns / designsGoal) * 100, 100)

        return {
            currentMonthRevenue,
            salesProgress,
            salesGoal,
            currentMonthDesigns,
            designsProgress,
            designsGoal
        }
    }, [allOrders, inventoryItems, editingGoals])

    return (
        <>
            {userRole === 'admin' && (
                <div className="flex justify-end mb-6">
                    <div className="bg-transparent p-1 rounded-3xl flex text-xs font-bold shadow-sm border-3 border-lime-glow">
                        <button onClick={() => setFinancialViewMode('all')} className={`px-5 py-2 rounded-2xl transition-all font-semibold ${financialViewMode === 'all' ? 'bg-emerald-pine text-lime-glow shadow-lg' : 'text-emerald-pine/60 hover:text-emerald-pine'}`}>All Time</button>
                        <button onClick={() => setFinancialViewMode('month')} className={`px-5 py-2 rounded-2xl transition-all font-semibold ${financialViewMode === 'month' ? 'bg-emerald-pine text-lime-glow shadow-lg' : 'text-emerald-pine/60 hover:text-emerald-pine'}`}>This Month</button>
                    </div>
                </div>
            )}

            {/* Main Balance Card - Full Width */}
            <div className="mb-6">
                <div className="bg-lime-glow p-3 md:p-8 rounded-3xl shadow-xl relative overflow-hidden w-full">
                    <div className="grid grid-cols-2 md:grid-cols-2 gap-2 md:gap-8">
                        <div>
                            <p className="text-[9px] md:text-xs text-emerald-pine mb-1 md:mb-3 font-medium uppercase tracking-wider">Your Total Revenue</p>
                            {userRole === 'admin' ? (
                                <h3 className="text-xl md:text-5xl font-bold mb-0.5 md:mb-4 text-emerald-pine line-clamp-2 leading-tight">₹{parseInt(financialMetrics.totalRevenue).toLocaleString()}</h3>
                            ) : (
                                <h3 className="text-xl md:text-5xl font-bold mb-0.5 md:mb-4 text-emerald-pine leading-tight">{financialMetrics.totalSold}</h3>
                            )}
                            <p className="text-[9px] md:text-base text-emerald-pine/80">{financialMetrics.totalSold} Orders</p>
                        </div>
                        <div className="flex flex-col justify-end text-right">
                            {userRole === 'admin' && (
                                <>
                                    <p className="text-xl md:text-4xl font-bold text-emerald-pine mb-0 md:mb-2 leading-tight">₹{financialMetrics.netProfit.toLocaleString()}</p>
                                    <p className="text-[9px] md:text-sm text-emerald-pine/80">Net Profit ({financialMetrics.profitMargin}%)</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sync Status Card */}
            {lastSyncLog && (
                <div className="mb-6">
                    <div className={`p-4 rounded-3xl shadow-lg border-2 flex items-center gap-4 ${
                        lastSyncLog.status === 'success' 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-red-50 border-red-200'
                    }`}>
                        <div>
                            {lastSyncLog.status === 'success' ? (
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            ) : (
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            )}
                        </div>
                        <div className="flex-1">
                            <p className={`font-semibold ${lastSyncLog.status === 'success' ? 'text-green-900' : 'text-red-900'}`}>
                                {lastSyncLog.type === 'daily_sync' && lastSyncLog.status === 'success' 
                                    ? `✓ Sync successful: ${lastSyncLog.shopifyOrdersSync || 0} orders, ${lastSyncLog.shiprocketShipmentsSync || 0} shipments`
                                    : lastSyncLog.status === 'success'
                                    ? `✓ ${lastSyncLog.type?.replace('_', ' ')}`
                                    : `✗ Sync failed: ${lastSyncLog.error || 'Unknown error'}`
                                }
                            </p>
                            <p className={`text-xs ${lastSyncLog.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                                {lastSyncLog.timestamp ? `Last sync: ${new Date(lastSyncLog.timestamp).toLocaleString()}` : 'Just now'}
                            </p>
                        </div>
                        <Zap className={`w-5 h-5 ${lastSyncLog.status === 'success' ? 'text-green-600' : 'text-red-600'}`} />
                    </div>
                </div>
            )}

            {/* Key Metrics - Vertical Sections */}
            
            {/* Revenue Section */}
            <div className="mb-6">
                <h3 className="text-xs font-semibold uppercase text-emerald-pine/70 mb-3 pl-1">Revenue Metrics</h3>
                <div className="bg-lime-glow p-5 rounded-3xl shadow-lg border-2 border-lime-glow mb-3">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-xs text-emerald-pine/70 font-semibold uppercase mb-1">Avg Profit per Order</p>
                            <p className="text-3xl font-bold text-emerald-pine">₹{parseInt(financialMetrics.dailyProfit).toLocaleString()}</p>
                        </div>
                        <p className="text-xs font-semibold text-emerald-pine bg-emerald-pine/10 px-2 py-1 rounded-full">{financialMetrics.totalSold} orders</p>
                    </div>
                </div>
                
                <div className="bg-lime-glow p-5 rounded-3xl shadow-lg border-2 border-lime-glow mb-3">
                    <p className="text-xs text-emerald-pine/70 font-semibold uppercase mb-3">Profit Margin</p>
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <div className="w-full bg-emerald-pine/20 rounded-full h-3 overflow-hidden">
                                <div 
                                    className="bg-gradient-to-r from-emerald-pine to-lime-glow h-full rounded-full transition-all"
                                    style={{ width: `${Math.min(parseFloat(financialMetrics.profitMargin), 100)}%` }}
                                ></div>
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-emerald-pine min-w-fit">{parseFloat(financialMetrics.profitMargin).toFixed(1)}%</p>
                    </div>
                </div>

                <div className="bg-lime-glow p-5 rounded-3xl shadow-lg border-2 border-lime-glow">
                    <p className="text-xs text-emerald-pine/70 font-semibold uppercase mb-1">Revenue per Meter</p>
                    <p className="text-3xl font-bold text-emerald-pine mt-2">₹{parseInt(financialMetrics.revPerMeter).toLocaleString()}/m</p>
                </div>
            </div>

            {/* Production Section */}
            <div className="mb-6">
                <h3 className="text-xs font-semibold uppercase text-emerald-pine/70 mb-3 pl-1">Production Metrics</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-lime-glow p-4 rounded-3xl shadow-lg border-2 border-lime-glow">
                        <p className="text-xs text-emerald-pine/70 font-semibold uppercase mb-2">Metres Sold</p>
                        <p className="text-3xl font-bold text-emerald-pine">{parseInt(financialMetrics.totalFabricUsed)}<span className="text-lg">m</span></p>
                    </div>
                    <div className="bg-lime-glow p-4 rounded-3xl shadow-lg border-2 border-lime-glow">
                        <p className="text-xs text-emerald-pine/70 font-semibold uppercase mb-2">Outfits Sold</p>
                        <p className="text-3xl font-bold text-emerald-pine">{financialMetrics.totalSold}</p>
                    </div>
                </div>
                <div className="bg-lime-glow p-5 rounded-3xl shadow-lg border-2 border-lime-glow">
                    <p className="text-xs text-emerald-pine/70 font-semibold uppercase mb-3">Avg Fabric per Outfit</p>
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <p className="text-2xl font-bold text-emerald-pine">{parseFloat(financialMetrics.avgFabricPerOutfit).toFixed(1)}m</p>
                        </div>
                        <div className="text-right text-xs text-emerald-pine/60">
                            <p>Typical range</p>
                            <p className="text-emerald-pine font-semibold">2-3m</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Inventory Section */}
            <div className="mb-6">
                <h3 className="text-xs font-semibold uppercase text-emerald-pine/70 mb-3 pl-1">Stock Health</h3>
                <div className="bg-lime-glow p-6 rounded-3xl shadow-lg border-2 border-lime-glow">
                    {/* Circular Gauge */}
                    <div className="flex flex-col items-center justify-center mb-6">
                        <div className="relative w-32 h-32 flex items-center justify-center">
                            <svg width="140" height="140" viewBox="0 0 140 140" className="transform -rotate-90">
                                {/* Background circle */}
                                <circle cx="70" cy="70" r="60" fill="none" stroke="#10b981" strokeWidth="8" opacity="0.15"/>
                                {/* Progress circle */}
                                <circle 
                                    cx="70" cy="70" r="60" fill="none" 
                                    stroke="url(#gaugeGradient)" strokeWidth="8" 
                                    strokeDasharray={`${2 * Math.PI * 60 * (Math.min(Math.max(inventoryStats.percentageIncrease, 0), 100) / 100)} ${2 * Math.PI * 60}`}
                                    strokeLinecap="round"
                                />
                                <defs>
                                    <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#dcfce7" />
                                        <stop offset="100%" stopColor="#10b981" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            {/* Center text */}
                            <div className="absolute flex flex-col items-center justify-center">
                                <p className="text-3xl font-bold text-emerald-pine">{Math.min(Math.max(inventoryStats.percentageIncrease, 0), 100).toFixed(0)}%</p>
                                <p className="text-xs text-emerald-pine/60 mt-1">Health Score</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Metrics below gauge */}
                    <div className="grid grid-cols-3 gap-3 pt-4 border-t border-emerald-pine/20">
                        <div className="text-center">
                            <p className="text-emerald-pine/70 text-[10px] font-semibold uppercase mb-1">Stock Value</p>
                            <p className="text-lg font-bold text-emerald-pine">₹{(inventoryStats.totalStockValue / 1000).toFixed(0)}k</p>
                        </div>
                        <div className="text-center border-l border-r border-emerald-pine/20">
                            <p className="text-emerald-pine/70 text-[10px] font-semibold uppercase mb-1">Potential</p>
                            <p className="text-lg font-bold text-emerald-pine">₹{(inventoryStats.totalPotentialRevenue / 1000).toFixed(0)}k</p>
                        </div>
                        <div className="text-center">
                            <p className="text-emerald-pine/70 text-[10px] font-semibold uppercase mb-1">Items</p>
                            <p className="text-lg font-bold text-emerald-pine">{inventoryStats.totalStockCount}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Monthly Goals Section */}
            <div className="mb-6">
                <div className="flex justify-between items-center mb-3 pl-1">
                    <h3 className="text-xs font-semibold uppercase text-emerald-pine/70">Monthly Goals</h3>
                    {userRole === 'admin' && (
                        <button
                            onClick={() => setShowGoalsEdit(!showGoalsEdit)}
                            className="text-emerald-pine hover:bg-emerald-pine/10 p-1 rounded"
                        >
                            <Edit2 size={16} />
                        </button>
                    )}
                </div>

                {showGoalsEdit ? (
                    <div className="bg-lime-glow p-5 rounded-3xl shadow-lg border-2 border-lime-glow mb-3">
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-emerald-pine/70 font-semibold uppercase block mb-2">Sales Goal (₹)</label>
                                <input
                                    type="number"
                                    value={editingGoals.salesGoal}
                                    onChange={(e) => setEditingGoals({...editingGoals, salesGoal: parseInt(e.target.value) || 0})}
                                    className="w-full px-3 py-2 bg-white/80 border border-emerald-pine/30 rounded-xl text-emerald-pine font-semibold"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-emerald-pine/70 font-semibold uppercase block mb-2">Designs Goal (Outfits)</label>
                                <input
                                    type="number"
                                    value={editingGoals.designsGoal}
                                    onChange={(e) => setEditingGoals({...editingGoals, designsGoal: parseInt(e.target.value) || 0})}
                                    className="w-full px-3 py-2 bg-white/80 border border-emerald-pine/30 rounded-xl text-emerald-pine font-semibold"
                                />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={saveGoals}
                                    className="flex-1 bg-emerald-pine text-white py-2 rounded-xl font-semibold text-sm hover:bg-emerald-pine/90"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => setShowGoalsEdit(false)}
                                    className="flex-1 bg-emerald-pine/10 text-emerald-pine py-2 rounded-xl font-semibold text-sm hover:bg-emerald-pine/20"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Sales Goal */}
                        <div className="bg-lime-glow p-5 rounded-3xl shadow-lg border-2 border-lime-glow mb-3">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="text-xs text-emerald-pine/70 font-semibold uppercase">Sales Goal</p>
                                    <p className="text-2xl font-bold text-emerald-pine mt-1">₹{(goalProgress.currentMonthRevenue / 1000).toFixed(1)}k</p>
                                    <p className="text-xs text-emerald-pine/60 mt-1">of ₹{(goalProgress.salesGoal / 1000).toFixed(0)}k</p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-2xl font-bold ${goalProgress.salesProgress >= 100 ? 'text-emerald-600' : goalProgress.salesProgress >= 75 ? 'text-emerald-pine' : 'text-orange-600'}`}>
                                        {goalProgress.salesProgress.toFixed(0)}%
                                    </p>
                                    <p className="text-xs text-emerald-pine/60 mt-1">
                                        {goalProgress.salesProgress >= 100 ? '✓ Complete' : `${goalProgress.salesProgress >= 75 ? 'On track' : 'In progress'}`}
                                    </p>
                                </div>
                            </div>
                            <div className="w-full bg-emerald-pine/20 rounded-full h-3 overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all ${goalProgress.salesProgress >= 100 ? 'bg-emerald-600' : 'bg-gradient-to-r from-emerald-pine to-lime-glow'}`}
                                    style={{ width: `${Math.min(goalProgress.salesProgress, 100)}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* Designs Goal */}
                        <div className="bg-lime-glow p-5 rounded-3xl shadow-lg border-2 border-lime-glow">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="text-xs text-emerald-pine/70 font-semibold uppercase">Designs Goal</p>
                                    <p className="text-2xl font-bold text-emerald-pine mt-1">{goalProgress.currentMonthDesigns}</p>
                                    <p className="text-xs text-emerald-pine/60 mt-1">of {goalProgress.designsGoal} outfits</p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-2xl font-bold ${goalProgress.designsProgress >= 100 ? 'text-emerald-600' : goalProgress.designsProgress >= 75 ? 'text-emerald-pine' : 'text-orange-600'}`}>
                                        {goalProgress.designsProgress.toFixed(0)}%
                                    </p>
                                    <p className="text-xs text-emerald-pine/60 mt-1">
                                        {goalProgress.designsProgress >= 100 ? '✓ Complete' : `${goalProgress.designsProgress >= 75 ? 'On track' : 'In progress'}`}
                                    </p>
                                </div>
                            </div>
                            <div className="w-full bg-emerald-pine/20 rounded-full h-3 overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all ${goalProgress.designsProgress >= 100 ? 'bg-emerald-600' : 'bg-gradient-to-r from-emerald-pine to-lime-glow'}`}
                                    style={{ width: `${Math.min(goalProgress.designsProgress, 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Expense and Payment Info - 2 Cards Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-lime-glow p-5 rounded-3xl shadow-lg border-2 border-lime-glow">
                    <p className="text-xs text-emerald-pine font-semibold uppercase mb-3">Expenses Breakdown</p>
                    <div className="text-sm space-y-2">
                        <div className="flex justify-between"><span className="text-emerald-pine/80">Fabric</span> <span className="font-bold text-emerald-pine">₹{(financialMetrics.breakdown.fabric / 1000).toFixed(1)}k</span></div>
                        <div className="flex justify-between"><span className="text-emerald-pine/80">Stitch</span> <span className="font-bold text-emerald-pine">₹{(financialMetrics.breakdown.stitch / 1000).toFixed(1)}k</span></div>
                        <div className="flex justify-between"><span className="text-emerald-pine/80">Logistics</span> <span className="font-bold text-emerald-pine">₹{(financialMetrics.breakdown.logistics / 1000).toFixed(1)}k</span></div>
                        <div className="flex justify-between"><span className="text-emerald-pine/80">Other Fees</span> <span className="font-bold text-emerald-pine">₹{(financialMetrics.breakdown.other / 1000).toFixed(1)}k</span></div>
                        <div className="border-t border-emerald-pine/30 pt-2 flex justify-between"><span className="text-emerald-pine font-semibold">COD/Acq</span> <span className="font-bold text-emerald-pine">₹{(financialMetrics.breakdown.cod / 1000).toFixed(1)}k</span></div>
                        <div className="flex justify-between"><span className="text-emerald-pine/80">Discounts</span> <span className="font-bold text-emerald-pine">-₹{(financialMetrics.breakdown.discount / 1000).toFixed(1)}k</span></div>
                        <div className="border-t border-emerald-pine/20 pt-2 flex justify-between text-emerald-pine font-bold"><span>Total Cost Impact</span> <span>₹{(financialMetrics.breakdown.total / 1000).toFixed(1)}k</span></div>
                    </div>
                </div>
                <div className="bg-lime-glow p-5 rounded-3xl shadow-lg border-2 border-lime-glow">
                    <p className="text-xs text-emerald-pine font-semibold uppercase mb-3">Payment Split</p>
                    <div className="flex items-center justify-around h-24">
                        <div className="text-center">
                            <p className="text-3xl font-bold text-emerald-pine">{financialMetrics.paymentSplit.cod}</p>
                            <p className="text-xs text-emerald-pine/70 mt-1">COD</p>
                        </div>
                        <div className="w-px h-12 bg-emerald-pine/30"></div>
                        <div className="text-center">
                            <p className="text-3xl font-bold text-emerald-pine">{financialMetrics.paymentSplit.prepaid}</p>
                            <p className="text-xs text-emerald-pine/70 mt-1">Prepaid</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Customer Metrics */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-lime-glow p-5 rounded-3xl shadow-lg border-2 border-lime-glow">
                    <p className="text-xs text-emerald-pine font-semibold uppercase mb-3">Customer Metrics</p>
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-3xl font-bold text-emerald-pine">{financialMetrics.customerMetrics.totalCustomers}</p>
                            <p className="text-[10px] text-emerald-pine/70 mt-1">Total Customers</p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold text-emerald-pine">₹{(financialMetrics.customerMetrics.avgRevenue / 1000).toFixed(1)}k</p>
                            <p className="text-[10px] text-emerald-pine/70 mt-1">Avg Revenue</p>
                        </div>
                    </div>
                </div>
                <div className="bg-emerald-pine p-5 rounded-3xl shadow-lg border-2 border-lime-glow">
                    <p className="text-xs text-lime-glow font-semibold uppercase mb-1">⭐ Top Customer</p>
                    {financialMetrics.customerMetrics.topCustomers.length > 0 ? (
                        <div>
                            <p className="text-lg font-bold text-lime-glow mt-2">{financialMetrics.customerMetrics.topCustomers[0].name}</p>
                            <p className="text-2xl font-bold text-lime-glow mt-1">₹{(financialMetrics.customerMetrics.topCustomers[0].revenue / 1000).toFixed(1)}k</p>
                            <p className="text-xs text-lime-glow/80 mt-2">{financialMetrics.customerMetrics.topCustomers[0].orders} orders</p>
                        </div>
                    ) : (
                        <p className="text-xs text-lime-glow/50 mt-2">No customers yet</p>
                    )}
                </div>
            </div>
        </>
    )
}
