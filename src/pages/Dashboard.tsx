import React, { useEffect, useState, useMemo } from 'react'
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Receipt,
  Warehouse,
  AlertTriangle,
  Truck,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, endOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { StatCard } from '@/components/StatCard'
import { DateFilter } from '@/components/DateFilter'
import { PageLoading } from '@/components/LoadingSpinner'
import { useStockStore } from '@/store/useStockStore'
import { saleService } from '@/services/saleService'
import { expenseService } from '@/services/expenseService'
import type { DateRange, SaleWithProduct, Expense, ChartDataPoint } from '@/types'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const Dashboard: React.FC = () => {
  const { totalValue, lowStock, fetchStock, fetchLowStock } = useStockStore()
  const [dateRange, setDateRange] = useState<DateRange>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [sales, setSales] = useState<SaleWithProduct[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  const getDateRange = useMemo(() => {
    const now = new Date()
    let start: Date
    const end = endOfDay(now)

    switch (dateRange) {
      case 'today':
        start = startOfDay(now)
        break
      case 'week':
        start = startOfWeek(now, { locale: ptBR })
        break
      case 'month':
        start = startOfMonth(now)
        break
      case 'year':
        start = startOfYear(now)
        break
      case 'custom':
        start = customStart ? new Date(customStart) : startOfMonth(now)
        return {
          start: start.toISOString(),
          end: customEnd ? endOfDay(new Date(customEnd)).toISOString() : end.toISOString(),
        }
      default:
        start = startOfMonth(now)
    }

    return { start: start.toISOString(), end: end.toISOString() }
  }, [dateRange, customStart, customEnd])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const { start, end } = getDateRange
        const [salesData, expensesData] = await Promise.all([
          saleService.getByDateRange(start, end),
          expenseService.getByDateRange(start, end),
          fetchStock(),
          fetchLowStock(),
        ])
        setSales(salesData)
        setExpenses(expensesData)
      } catch (err) {
        console.error('Dashboard error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [getDateRange, fetchStock, fetchLowStock])

  const metrics = useMemo(() => {
    const totalRevenue = sales.reduce(
      (sum, s) => sum + s.quantidade * s.preco_venda - s.desconto,
      0
    )
    const totalExpenses = expenses.reduce((sum, e) => sum + e.value, 0)
    // Lucro = receita - CMV (custo total registrado via FIFO) - despesas
    const totalCOGS = sales.reduce((sum, s) => sum + (s.custo_unitario_snapshot ?? 0), 0)
    const totalProfit = totalRevenue - totalCOGS - totalExpenses

    // Frete
    const totalFreteCliente = sales.reduce((sum, s) => sum + (s.frete_cobrado ?? 0), 0)
    const totalLucroFrete = sales.reduce(
      (sum, s) => sum + ((s.frete_cobrado ?? 0) - (s.frete_custo ?? 0)),
      0
    )

    return {
      totalRevenue,
      totalProfit,
      totalSales: sales.length,
      totalExpenses,
      totalFreteCliente,
      totalLucroFrete,
    }
  }, [sales, expenses])

  // Chart data - group by day
  const chartData = useMemo((): ChartDataPoint[] => {
    const grouped: Record<string, ChartDataPoint> = {}

    sales.forEach((sale) => {
      const date = format(new Date(sale.created_at), 'dd/MM')
      if (!grouped[date]) {
        grouped[date] = { date, revenue: 0, profit: 0, expenses: 0 }
      }
      grouped[date].revenue += sale.quantidade * sale.preco_venda - sale.desconto
    })

    expenses.forEach((expense) => {
      const date = format(new Date(expense.created_at), 'dd/MM')
      if (!grouped[date]) {
        grouped[date] = { date, revenue: 0, profit: 0, expenses: 0 }
      }
      grouped[date].expenses += expense.value
    })

    // Calculate profit per day
    Object.values(grouped).forEach((point) => {
      point.profit = point.revenue - point.expenses
    })

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date))
  }, [sales, expenses])

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-dark-400 text-sm">Visão geral do seu negócio</p>
        </div>
        <DateFilter
          selected={dateRange}
          onChange={setDateRange}
          startDate={customStart}
          endDate={customEnd}
          onStartDateChange={setCustomStart}
          onEndDateChange={setCustomEnd}
        />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Faturamento"
          value={formatCurrency(metrics.totalRevenue)}
          icon={<DollarSign className="w-5 h-5 text-success-400" />}
          gradient="from-success-600/20 to-success-500/10"
        />
        <StatCard
          title="Lucro"
          value={formatCurrency(metrics.totalProfit)}
          icon={<TrendingUp className="w-5 h-5 text-brand-400" />}
          gradient="from-brand-600/20 to-accent-600/10"
        />
        <StatCard
          title="Vendas"
          value={String(metrics.totalSales)}
          subtitle="transações concluídas"
          icon={<ShoppingCart className="w-5 h-5 text-accent-400" />}
          gradient="from-accent-600/20 to-accent-500/10"
        />
        <StatCard
          title="Despesas"
          value={formatCurrency(metrics.totalExpenses)}
          icon={<Receipt className="w-5 h-5 text-danger-400" />}
          gradient="from-danger-600/20 to-danger-500/10"
        />
        <StatCard
          title="Valor em Estoque"
          value={formatCurrency(totalValue)}
          icon={<Warehouse className="w-5 h-5 text-warning-400" />}
          gradient="from-warning-600/20 to-warning-500/10"
        />
      </div>

      {/* Frete Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="Frete Pago pelos Clientes"
          value={formatCurrency(metrics.totalFreteCliente)}
          subtitle="total cobrado de clientes"
          icon={<Truck className="w-5 h-5 text-brand-400" />}
          gradient="from-brand-600/20 to-brand-500/10"
        />
        <StatCard
          title="Lucro do Frete"
          value={formatCurrency(metrics.totalLucroFrete)}
          subtitle="frete cobrado − custo do frete"
          icon={<TrendingUp className="w-5 h-5 text-success-400" />}
          gradient="from-success-600/20 to-success-500/10"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-dark-200 mb-4">Faturamento x Despesas</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [formatCurrency(value)]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#6366f1"
                  fill="url(#revenueGradient)"
                  strokeWidth={2}
                  name="Faturamento"
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="#ef4444"
                  fill="url(#expenseGradient)"
                  strokeWidth={2}
                  name="Despesas"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-dark-500 text-sm">
              Nenhum dado para o período selecionado
            </div>
          )}
        </div>

        {/* Profit Chart */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-dark-200 mb-4">Lucro por Período</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [formatCurrency(value)]}
                />
                <Bar
                  dataKey="profit"
                  fill="#6366f1"
                  radius={[6, 6, 0, 0]}
                  name="Lucro"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-dark-500 text-sm">
              Nenhum dado para o período selecionado
            </div>
          )}
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="glass-card p-5 border-warning-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-warning-500/15 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-warning-400" />
            </div>
            <h3 className="text-sm font-semibold text-dark-200">
              Alerta de Estoque Baixo ({lowStock.length} itens)
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStock.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-xl bg-dark-800/40 border border-dark-700/30"
              >
                <div>
                  <p className="text-sm font-medium text-dark-200">
                    {item.products.nome}
                  </p>
                  <p className="text-xs text-dark-500">
                    Tamanho {item.tamanho}
                  </p>
                </div>
                <span className="badge-warning">
                  {item.quantidade} un.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
