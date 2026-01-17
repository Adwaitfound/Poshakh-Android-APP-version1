import React, { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Package, Users, Calendar, PieChart, Crown } from 'lucide-react'
import { collection, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore'
import { getDb } from '../firebase'

export default function FinancialInsights({ inventoryItems = [], allOrders = [] }) {
    const cleanNumber = (val) => {
        if (typeof val === 'number') return val
        if (!val) return 0
        const s = String(val).replace(/[^0-9.-]/g, '')
        return parseFloat(s) || 0
    }

    const metrics = useMemo(() => {
        const now = new Date()
        const currentMonth = now.getMonth()
        const currentYear = now.getFullYear()

        const parseDate = (value) => {
            if (!value) return null
            if (value.toDate) return value.toDate()
            const parsed = new Date(value)
            return Number.isNaN(parsed.getTime()) ? null : parsed
        }

        const getOrderDate = (order) => {
            return parseDate(order.orderDate) || parseDate(order.createdAt) || parseDate(order.updatedAt) || new Date()
        }

        const getPaymentMethod = (order) => (order.paymentMethod || order.paymentMode || 'Prepaid')

        const getCodRemittanceDate = (order) => {
            const explicitDate = parseDate(order.codRemittanceDate)
            if (explicitDate) return explicitDate
            const base = getOrderDate(order)
            const expected = new Date(base)
            expected.setDate(expected.getDate() + 4)
            return expected
        }

        // Filter completed orders only
        const completedOrders = allOrders.filter(o => o.status !== 'Cancelled')

        // Revenue Analytics
        const totalRevenue = completedOrders.reduce((sum, o) => {
            const baseRevenue = cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0
            const discount = cleanNumber(o.discount) || 0
            return sum + (baseRevenue - discount)
        }, 0)

        const monthlyRevenue = completedOrders
            .filter(o => {
                const orderDate = getOrderDate(o)
                return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear
            })
            .reduce((sum, o) => {
                const baseRevenue = cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0
                const discount = cleanNumber(o.discount) || 0
                return sum + (baseRevenue - discount)
            }, 0)

        const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0

        // Revenue by category
        const fabricRevenue = completedOrders
            .filter(o => o.type === 'fabric')
            .reduce((sum, o) => {
                const baseRevenue = cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0
                const discount = cleanNumber(o.discount) || 0
                return sum + (baseRevenue - discount)
            }, 0)

        const outfitRevenue = completedOrders
            .filter(o => o.type === 'outfit' || o.outfitName)
            .reduce((sum, o) => {
                const baseRevenue = cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0
                const discount = cleanNumber(o.discount) || 0
                return sum + (baseRevenue - discount)
            }, 0)

        // Profit Analysis (aligned with Dashboard: includes fabric, stitch, shipping, delivery, acquisition, COD, other expenses)
        const totalCosts = completedOrders.reduce((sum, o) => {
            const fabricCost = cleanNumber(o.fabricCost) || 0
            const stitchCost = cleanNumber(o.stitchingCost) || 0
            const shipCost = cleanNumber(o.shippingCost) || 0
            const deliveryCost = cleanNumber(o.deliveryCost) || 0
            const acquisitionCost = cleanNumber(o.acquisitionCost) || 0
            const codCharge = cleanNumber(o.codCharge) || 0
            const otherExpenses = cleanNumber(o.otherExpenses) || 0
            return sum + fabricCost + stitchCost + shipCost + deliveryCost + acquisitionCost + codCharge + otherExpenses
        }, 0)

        const grossProfit = totalRevenue - totalCosts
        const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

        // Cash Flow
        const codOrders = completedOrders.filter(o => getPaymentMethod(o) === 'COD')
        const sevenDaysAgo = new Date(now)
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        // Pending COD: shipped in last 7 days with future remittance date
        const codPending = codOrders
            .filter(o => {
                const isShipped = o.status === 'Order Shipped (Completed)'
                if (!isShipped) return false
                const orderDate = getOrderDate(o)
                const isRecent = orderDate >= sevenDaysAgo
                if (!isRecent) return false // Ignore old orders
                return getCodRemittanceDate(o) > now
            })
            .reduce((sum, o) => {
                const baseRevenue = cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0
                const discount = cleanNumber(o.discount) || 0
                return sum + (baseRevenue - discount)
            }, 0)

        const prepaidRevenue = completedOrders
            .filter(o => getPaymentMethod(o) === 'Prepaid')
            .reduce((sum, o) => {
                const baseRevenue = cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0
                const discount = cleanNumber(o.discount) || 0
                return sum + (baseRevenue - discount)
            }, 0)

        // COD Revenue: all shipped COD orders (old ones or remittance date passed)
        const codRevenue = codOrders
            .filter(o => {
                const isShipped = o.status === 'Order Shipped (Completed)'
                if (!isShipped) return false
                const orderDate = getOrderDate(o)
                const isOld = orderDate < sevenDaysAgo
                if (isOld) return true // Old orders are always collected
                return getCodRemittanceDate(o) <= now
            })
            .reduce((sum, o) => {
                const baseRevenue = cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0
                const discount = cleanNumber(o.discount) || 0
                return sum + (baseRevenue - discount)
            }, 0)

        // Inventory Financial Health
        const totalInventoryValue = inventoryItems.reduce((sum, item) => {
            if (item.type === 'fabric') {
                const length = parseFloat(item.currentLength) || 0
                const costPerMeter = cleanNumber(item.costPerMeter) || 0
                return sum + (length * costPerMeter)
            } else {
                const stock = Object.values(item.stockBreakdown || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
                const cost = cleanNumber(item.costPerMeter) || 0
                return sum + (stock * cost)
            }
        }, 0)

        const retailInventoryValue = inventoryItems.reduce((sum, item) => {
            if (item.type === 'fabric') {
                const length = parseFloat(item.currentLength) || 0
                const price = cleanNumber(item.sellingPrice) || cleanNumber(item.costPerMeter) || 0
                return sum + (length * price)
            }
            const stock = Object.values(item.stockBreakdown || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
            const price = cleanNumber(item.sellingPrice) || 0
            return sum + (stock * price)
        }, 0)

        const lowStockValue = inventoryItems.reduce((sum, item) => {
            if (item.type === 'fabric') {
                const length = parseFloat(item.currentLength) || 0
                if (length <= 10) {
                    const costPerMeter = cleanNumber(item.costPerMeter) || 0
                    return sum + (length * costPerMeter)
                }
                return sum
            }
            const stock = Object.values(item.stockBreakdown || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
            if (stock <= 2) {
                const cost = cleanNumber(item.costPerMeter) || 0
                return sum + (stock * cost)
            }
            return sum
        }, 0)

        const soldNameSet = new Set(completedOrders.map(o => (o.outfitName || o.productName || o.fabricName || '').toLowerCase()))
        const unsoldSkus = inventoryItems.filter(i => i.name && !soldNameSet.has(i.name.toLowerCase())).length

        // Expense Breakdown (match Dashboard grouping)
        const fabricCosts = completedOrders.reduce((sum, o) => sum + (cleanNumber(o.fabricCost) || 0), 0)
        const stitchingCosts = completedOrders.reduce((sum, o) => sum + (cleanNumber(o.stitchingCost) || 0), 0)
        const shippingCosts = completedOrders.reduce((sum, o) => sum + (cleanNumber(o.shippingCost) || 0), 0)
        const deliveryCosts = completedOrders.reduce((sum, o) => sum + (cleanNumber(o.deliveryCost) || 0), 0)
        const acquisitionCosts = completedOrders.reduce((sum, o) => sum + (cleanNumber(o.acquisitionCost) || 0), 0)
        const codCharges = completedOrders.reduce((sum, o) => sum + (cleanNumber(o.codCharge) || 0), 0)
        const otherCosts = completedOrders.reduce((sum, o) => sum + (cleanNumber(o.otherExpenses) || 0), 0)
        const discountGiven = completedOrders.reduce((sum, o) => sum + (cleanNumber(o.discount) || 0), 0)
        const logisticsCosts = shippingCosts + deliveryCosts

        // Customer Metrics
        const uniqueCustomers = new Set(completedOrders.map(o => o.customerName?.toLowerCase().trim()).filter(Boolean))
        const avgCustomerValue = uniqueCustomers.size > 0 ? totalRevenue / uniqueCustomers.size : 0

        // Top customers by spending
        const customerSpending = {}
        completedOrders.forEach(o => {
            if (o.customerName) {
                const name = o.customerName
                const baseRevenue = cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0
                const discount = cleanNumber(o.discount) || 0
                const revenue = baseRevenue - discount
                customerSpending[name] = (customerSpending[name] || 0) + revenue
            }
        })
        const topCustomers = Object.entries(customerSpending)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)

        // Top products by revenue and by margin
        const productAggregates = {}
        completedOrders.forEach(o => {
            const name = o.outfitName || o.productName || o.fabricName || 'Unknown'
            const baseRevenue = cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0
            const discount = cleanNumber(o.discount) || 0
            const revenue = baseRevenue - discount
            const cost =
                (cleanNumber(o.fabricCost) || 0) +
                (cleanNumber(o.stitchingCost) || 0) +
                (cleanNumber(o.shippingCost) || 0) +
                (cleanNumber(o.deliveryCost) || 0) +
                (cleanNumber(o.acquisitionCost) || 0) +
                (cleanNumber(o.codCharge) || 0) +
                (cleanNumber(o.otherExpenses) || 0)

            if (!productAggregates[name]) {
                productAggregates[name] = { revenue: 0, cost: 0 }
            }
            productAggregates[name].revenue += revenue
            productAggregates[name].cost += cost
        })

        const topProducts = Object.entries(productAggregates)
            .map(([name, agg]) => ({ name, revenue: agg.revenue }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10)

        const topMarginProducts = Object.entries(productAggregates)
            .map(([name, agg]) => {
                const marginValue = agg.revenue - agg.cost
                const marginPct = agg.revenue > 0 ? (marginValue / agg.revenue) * 100 : 0
                return { name, marginValue, marginPct }
            })
            .sort((a, b) => b.marginValue - a.marginValue)
            .slice(0, 5)

        // Monthly trends (last 6 months)
        const monthlyData = []
        for (let i = 5; i >= 0; i--) {
            const date = new Date(currentYear, currentMonth - i, 1)
            const monthOrders = completedOrders.filter(o => {
                const orderDate = getOrderDate(o)
                return orderDate.getMonth() === date.getMonth() && orderDate.getFullYear() === date.getFullYear()
            })
            const monthRevenue = monthOrders.reduce((sum, o) => {
                const baseRevenue = cleanNumber(o.finalSellingPrice) || cleanNumber(o.orderTotal) || 0
                const discount = cleanNumber(o.discount) || 0
                return sum + (baseRevenue - discount)
            }, 0)

            const monthName = date.toLocaleDateString('en-US', { month: 'short' })
            monthlyData.push({
                month: monthName,
                revenue: monthRevenue,
                orderCount: monthOrders.length
            })
        }

        // Calculate growth rate
        const lastMonthRevenue = monthlyData[4]?.revenue || 0
        const currentMonthRevenue = monthlyData[5]?.revenue || 0
        const growthRate = lastMonthRevenue > 0 ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0

        // Customer revenue metrics
        const customerRevenueData = Object.entries(customerSpending)
            .sort((a, b) => b[1] - a[1])
            .map(([name, revenue]) => {
                const orders = completedOrders.filter(o => o.customerName === name)
                return {
                    name,
                    revenue,
                    orderCount: orders.length,
                    avgOrderValue: orders.length > 0 ? revenue / orders.length : 0
                }
            })

        const totalCustomerRevenue = customerRevenueData.reduce((sum, c) => sum + c.revenue, 0)
        const customerRevenuePercentages = customerRevenueData.map(c => ({
            ...c,
            percentage: totalCustomerRevenue > 0 ? (c.revenue / totalCustomerRevenue) * 100 : 0
        }))

        return {
            totalRevenue,
            monthlyRevenue,
            avgOrderValue,
            fabricRevenue,
            outfitRevenue,
            grossProfit,
            profitMargin,
            codPending,
            prepaidRevenue,
            codRevenue,
            totalInventoryValue,
            retailInventoryValue,
            lowStockValue,
            unsoldSkus,
            fabricCosts,
            stitchingCosts,
            logisticsCosts,
            discountGiven,
            codCharges, // COD fee only
            acquisitionCosts,
            otherCosts,
            totalCosts,
            uniqueCustomers: uniqueCustomers.size,
            avgCustomerValue,
            topCustomers,
            topProducts,
            topMarginProducts,
            monthlyData,
            growthRate,
            customerRevenueData: customerRevenuePercentages
        }
    }, [inventoryItems, allOrders])

    const formatCurrency = (amount) => {
        if (!amount || isNaN(amount)) return '₹0k'
        return `₹${(amount / 1000).toFixed(1)}k`
    }
    const formatCurrencyFull = (amount) => {
        if (!amount || isNaN(amount)) return '₹0'
        return `₹${amount.toLocaleString('en-IN')}`
    }
    const [showAllCustomers, setShowAllCustomers] = useState(false)
    const [backfillStatus, setBackfillStatus] = useState('')

    const handleBackfillOrderDates = async () => {
        try {
            setBackfillStatus('Running...')
            const db = getDb()
            const snap = await getDocs(collection(db, 'production_orders'))
            console.log(`[Backfill] Found ${snap.size} total orders`)
            
            const ranges = [
                { min: 1015, max: 1053, start: '2025-10-01', end: '2025-10-31' },
                { min: 1054, max: 1105, start: '2025-11-01', end: '2025-11-30' },
                { min: 1106, max: 1121, start: '2025-12-01', end: '2025-12-31' },
                { min: 1122, max: 99999, start: '2026-01-01', end: '2026-01-02' }
            ]
            const randomTs = (start, end) => {
                const s = new Date(start).getTime()
                const e = new Date(end).getTime()
                const t = s + Math.random() * (e - s)
                return Timestamp.fromDate(new Date(t))
            }
            
            let updated = 0
            
            for (const d of snap.docs) {
                const data = d.data()
                const num = parseInt(String(data.orderNumber || '').replace(/[^0-9]/g, ''), 10)
                if (Number.isNaN(num)) continue
                
                const bucket = ranges.find(r => num >= r.min && num <= r.max)
                if (!bucket) continue
                
                const ts = randomTs(bucket.start, bucket.end)
                await updateDoc(doc(db, 'production_orders', d.id), { orderDate: ts, updatedAt: Timestamp.now() })
                updated++
            }
            
            console.log(`[Backfill] Updated ${updated} orders total`)
            setBackfillStatus(`Done. Updated ${updated} orders. Reloading...`)
            
            // Reload page to fetch fresh data
            setTimeout(() => window.location.reload(), 1500)
        } catch (e) {
            console.error('[Backfill Error]', e)
            setBackfillStatus('Failed. See console logs.')
        }
    }

    return (
        <div className="space-y-6 fade-in pb-20">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
                <h2 className="text-2xl font-bold text-lime-glow">Financial Insights</h2>
                <div className="flex items-center gap-2">
                    {backfillStatus && <span className="text-[11px] text-lime-glow/80">{backfillStatus}</span>}
                    <button
                        onClick={handleBackfillOrderDates}
                        className="px-3 py-1.5 text-[12px] rounded-lg bg-emerald-pine text-lime-glow border border-lime-glow/60 hover:bg-emerald-pine/80 active:scale-95"
                    >
                        Backfill order dates
                    </button>
                    <button
                        onClick={async () => {
                            try {
                                setBackfillStatus('Cleaning COD dates...')
                                const db = getDb()
                                const snap = await getDocs(collection(db, 'production_orders'))
                                let cleaned = 0
                                for (const d of snap.docs) {
                                    const data = d.data()
                                    if (data.codRemittanceDate || data.shippedDate) {
                                        await updateDoc(doc(db, 'production_orders', d.id), {
                                            codRemittanceDate: null,
                                            shippedDate: null,
                                            updatedAt: Timestamp.now()
                                        })
                                        cleaned++
                                    }
                                }
                                setBackfillStatus(`Cleaned ${cleaned} orders. Reloading...`)
                                setTimeout(() => window.location.reload(), 1500)
                            } catch (e) {
                                console.error(e)
                                setBackfillStatus('Cleanup failed')
                            }
                        }}
                        className="px-3 py-1.5 text-[12px] rounded-lg bg-red-900/80 text-lime-glow border border-lime-glow/60 hover:bg-red-900 active:scale-95"
                    >
                        Reset COD dates
                    </button>
                </div>
            </div>

            {/* Key Metrics Overview */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-pine p-4 rounded-2xl shadow-card text-lime-glow border-2 border-lime-glow/60">
                    <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="w-5 h-5 text-lime-glow" />
                        <p className="text-xs opacity-90">Total Revenue</p>
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(metrics.totalRevenue)}</p>
                    <p className="text-xs opacity-80 mt-1">All time</p>
                </div>
                <div className="bg-green-tea p-4 rounded-2xl shadow-card text-emerald-pine border-2 border-lime-glow">
                    <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-5 h-5 text-emerald-pine" />
                        <p className="text-xs font-semibold">This Month</p>
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(metrics.monthlyRevenue)}</p>
                    <div className="flex items-center gap-1 mt-1 text-emerald-pine/80">
                        {metrics.growthRate >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                        ) : (
                            <TrendingDown className="w-3 h-3" />
                        )}
                        <p className="text-xs">{Math.abs(metrics.growthRate).toFixed(1)}% vs last month</p>
                    </div>
                </div>
                <div className="bg-green-tea p-4 rounded-2xl shadow-card text-emerald-pine border-2 border-lime-glow">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-5 h-5 text-emerald-pine" />
                        <p className="text-xs font-semibold">Gross Profit</p>
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(metrics.grossProfit)}</p>
                    <p className="text-xs text-emerald-pine/80 mt-1">Margin: {metrics.profitMargin.toFixed(1)}%</p>
                </div>
                <div className="bg-green-tea p-4 rounded-2xl shadow-card text-emerald-pine border-2 border-lime-glow">
                    <div className="flex items-center gap-2 mb-2">
                        <Package className="w-5 h-5 text-emerald-pine" />
                        <p className="text-xs font-semibold">Avg Order Value</p>
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(metrics.avgOrderValue)}</p>
                    <p className="text-xs text-emerald-pine/80 mt-1">Per transaction</p>
                </div>
            </div>

            {/* Monthly Revenue Trend */}
            <div className="bg-green-tea p-5 rounded-2xl shadow-card border-2 border-lime-glow">
                <h3 className="font-bold text-emerald-pine mb-4">Revenue Trend (Last 6 Months)</h3>
                <div className="flex items-end justify-between gap-2 h-48">
                    {metrics.monthlyData.map((data, idx) => {
                        const maxRevenue = Math.max(...metrics.monthlyData.map(d => d.revenue))
                        const height = maxRevenue > 0 ? (data.revenue / maxRevenue) * 100 : 0
                        return (
                            <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full">
                                <span className="text-xs font-bold text-emerald-pine">{formatCurrency(data.revenue)}</span>
                                <div className="flex-1 w-full bg-emerald-pine/30 rounded-t-lg flex items-end" style={{ minHeight: '4px' }}>
                                    <div className="w-full" style={{ height: `${height}%`, backgroundColor: '#9ade4b' }} />
                                </div>
                                <span className="text-xs text-emerald-pine/70">{data.month}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Expense Breakdown (aligned with Dashboard grouping) */}
            <div className="bg-green-tea p-5 rounded-2xl shadow-card border-2 border-lime-glow">
                <h3 className="font-bold text-emerald-pine mb-4">Expense Breakdown</h3>
                <div className="space-y-3 text-emerald-pine">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-emerald-pine/80">Fabric</span>
                        <span className="text-sm font-bold">{formatCurrency(metrics.fabricCosts)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-emerald-pine/80">Stitch</span>
                        <span className="text-sm font-bold">{formatCurrency(metrics.stitchingCosts)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-emerald-pine/80">Logistics</span>
                        <span className="text-sm font-bold">{formatCurrency(metrics.logisticsCosts)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-emerald-pine/80">Other Fees</span>
                        <span className="text-sm font-bold">{formatCurrency(metrics.otherCosts)}</span>
                    </div>
                    <div className="border-t border-emerald-pine/30 pt-2 flex justify-between items-center">
                        <span className="text-sm text-emerald-pine font-semibold">COD/Acq</span>
                        <span className="text-sm font-bold">{formatCurrency(metrics.codCharges + metrics.acquisitionCosts)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-emerald-pine/80">Discounts</span>
                        <span className="text-sm font-bold text-amber-600">-{formatCurrency(metrics.discountGiven)}</span>
                    </div>
                    <div className="border-t border-emerald-pine/30 pt-2 flex justify-between items-center">
                        <span className="text-sm font-bold">Total Cost Impact</span>
                        <span className="text-sm font-bold text-emerald-pine">{formatCurrency(metrics.totalCosts + metrics.discountGiven)}</span>
                    </div>
                </div>
            </div>

            {/* Cash Flow */}
            <div className="bg-green-tea p-5 rounded-2xl shadow-card border-2 border-lime-glow">
                <h3 className="font-bold text-emerald-pine mb-4">Cash Flow Overview</h3>
                <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-emerald-pine/10 border border-lime-glow rounded-xl text-emerald-pine">
                        <span className="text-sm">Prepaid Revenue</span>
                        <span className="text-sm font-bold">{formatCurrency(metrics.prepaidRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-emerald-pine/10 border border-lime-glow rounded-xl text-emerald-pine">
                        <span className="text-sm">COD Revenue</span>
                        <span className="text-sm font-bold">{formatCurrency(metrics.codRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-emerald-pine/10 border border-lime-glow rounded-xl text-emerald-pine">
                        <span className="text-sm">Pending COD Collections</span>
                        <span className="text-sm font-bold">{formatCurrency(metrics.codPending)}</span>
                    </div>
                </div>
            </div>

            {/* Inventory Value */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-emerald-pine to-lime-glow p-5 rounded-2xl shadow-card text-emerald-pine">
                    <h3 className="font-bold mb-2 flex items-center gap-2 text-emerald-pine">
                        <Package className="w-5 h-5" />
                        Stock @ Cost
                    </h3>
                    <p className="text-3xl font-bold text-emerald-pine">{formatCurrency(metrics.totalInventoryValue)}</p>
                    <p className="text-xs text-emerald-pine/80 mt-1">Current valuation (cost)</p>
                </div>
                <div className="bg-emerald-pine p-5 rounded-2xl shadow-card border-2 border-lime-glow/50 text-lime-glow">
                    <h3 className="font-bold mb-2 flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        Stock @ Retail
                    </h3>
                    <p className="text-3xl font-bold">{formatCurrency(metrics.retailInventoryValue)}</p>
                    <p className="text-xs opacity-80 mt-1">Potential sales value</p>
                </div>
                <div className="bg-amber-900/30 p-5 rounded-2xl shadow-card border-2 border-amber-400/50 text-amber-100">
                    <h3 className="font-bold mb-2 flex items-center gap-2">
                        <TrendingDown className="w-5 h-5" />
                        Low-Stock at Risk
                    </h3>
                    <p className="text-3xl font-bold">{formatCurrency(metrics.lowStockValue)}</p>
                    <p className="text-xs opacity-80 mt-1">Value of items below threshold</p>
                </div>
            </div>

            {/* Product Margin Leaders */}
            <div className="bg-emerald-pine p-5 rounded-2xl shadow-card border-2 border-lime-glow">
                <h3 className="font-bold text-lime-glow mb-3 flex items-center gap-2">
                    <Crown className="w-5 h-5" />
                    Top Margin Products
                </h3>
                <div className="space-y-2 text-white text-sm">
                    {metrics.topMarginProducts.length === 0 && <p className="text-white/70 text-xs">No data yet</p>}
                    {metrics.topMarginProducts.map((p, idx) => (
                        <div key={p.name} className="flex items-center justify-between bg-emerald-900/50 border border-emerald-700/50 rounded-xl px-3 py-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-800/70 border border-lime-glow/40 text-lime-200 font-bold">#{idx + 1}</span>
                                <span className="font-semibold text-lime-glow">{p.name}</span>
                            </div>
                            <div className="text-right text-[12px]">
                                <p className="font-bold text-white">{formatCurrencyFull(Math.round(p.marginValue))}</p>
                                <p className="text-lime-glow/80">{p.marginPct.toFixed(1)}% margin</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Customer Metrics */}
            <div className="bg-green-tea p-5 rounded-2xl shadow-card border-2 border-lime-glow">
                <h3 className="font-bold text-emerald-pine mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-pine" />
                    Customer Insights
                </h3>
                <div className="grid grid-cols-2 gap-4 text-emerald-pine">
                    <div>
                        <p className="text-xs text-emerald-pine/70 mb-1">Total Customers</p>
                        <p className="text-2xl font-bold">{metrics.totalCustomers}</p>
                    </div>
                    <div>
                        <p className="text-xs text-emerald-pine/70 mb-1">Avg Customer Value</p>
                        <p className="text-2xl font-bold">{formatCurrency(metrics.avgCustomerValue)}</p>
                    </div>
                </div>
            </div>

            {/* Customer Revenue Breakdown */}
            <div className="bg-green-tea p-5 rounded-2xl shadow-card border-2 border-lime-glow">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-emerald-pine flex items-center gap-2">
                        <Crown className="w-5 h-5 text-lime-glow" />
                        Customer Revenue Breakdown
                    </h3>
                    {metrics.customerRevenueData.length > 10 && (
                        <button
                            onClick={() => setShowAllCustomers(!showAllCustomers)}
                            className="text-xs text-emerald-pine underline-offset-2 hover:underline"
                        >
                            {showAllCustomers ? 'Show Top 10' : `Show All ${metrics.customerRevenueData.length}`}
                        </button>
                    )}
                </div>
                <div className="space-y-2">
                    {(showAllCustomers ? metrics.customerRevenueData : metrics.customerRevenueData.slice(0, 10)).map((customer, idx) => (
                        <div key={idx} className="p-3 hover:bg-emerald-pine/5 rounded-lg transition-colors">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-lime-glow text-emerald-pine' :
                                        idx === 1 ? 'bg-emerald-pine/20 text-emerald-pine' :
                                            idx === 2 ? 'bg-green-tea text-emerald-pine' :
                                                'bg-emerald-pine/10 text-emerald-pine'
                                        }`}>
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-emerald-pine truncate">{customer.name}</p>
                                        <p className="text-xs text-emerald-pine/70">{customer.orderCount || customer.orders || 0} orders • Avg: ₹{(customer.avgOrderValue / 1000).toFixed(1)}k</p>
                                    </div>
                                </div>
                                <div className="text-right ml-3">
                                    <p className="text-sm font-bold text-emerald-pine">{formatCurrency(customer.revenue)}</p>
                                    <p className="text-xs text-emerald-pine/70">{((customer.revenue / metrics.totalRevenue) * 100).toFixed(1)}%</p>
                                </div>
                            </div>
                            <div className="h-1.5 bg-emerald-pine/10 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-pine to-lime-glow rounded-full transition-all"
                                    style={{ width: `${customer.percentage}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top 10 Products */}
            <div className="bg-green-tea p-5 rounded-2xl shadow-card border-2 border-lime-glow">
                <h3 className="font-bold text-emerald-pine mb-4">Top 10 Products by Revenue</h3>
                <div className="space-y-2">
                    {metrics.topProducts.map((p, idx) => (
                        <div key={p.name || idx} className="flex items-center justify-between p-2 hover:bg-emerald-pine/5 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-lime-glow text-emerald-pine text-xs font-bold flex items-center justify-center border border-emerald-pine/30">
                                    {idx + 1}
                                </div>
                                <span className="text-sm text-emerald-pine truncate">{p.name}</span>
                            </div>
                            <span className="text-sm font-bold text-emerald-pine">{formatCurrency(p.revenue)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
