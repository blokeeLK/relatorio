import React, { useEffect, useState, useMemo } from 'react'
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, endOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BarChart3, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { DateFilter } from '@/components/DateFilter'
import { StatCard } from '@/components/StatCard'
import { PageLoading } from '@/components/LoadingSpinner'
import { saleService } from '@/services/saleService'
import { expenseService } from '@/services/expenseService'
import type { DateRange, SaleWithProduct, Expense } from '@/types'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const Reports: React.FC = () => {
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
        ])
        setSales(salesData)
        setExpenses(expensesData)
      } catch (err) {
        console.error('Reports error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [getDateRange])

  const metrics = useMemo(() => {
    const totalRevenue = sales.reduce((sum, s) => sum + s.quantidade * s.preco_venda - s.desconto, 0)
    const totalExpenses = expenses.reduce((sum, e) => sum + e.value, 0)
    const totalProfit = totalRevenue - totalExpenses
    const avgTicket = sales.length > 0 ? totalRevenue / sales.length : 0
    const totalItems = sales.reduce((sum, s) => sum + s.quantidade, 0)

    // Group expenses by category
    const expensesByCategory = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.value
      return acc
    }, {} as Record<string, number>)

    // Group sales by payment method
    const salesByPayment = sales.reduce((acc, s) => {
      const revenue = s.quantidade * s.preco_venda - s.desconto
      acc[s.payment_method] = (acc[s.payment_method] || 0) + revenue
      return acc
    }, {} as Record<string, number>)

    return {
      totalRevenue,
      totalExpenses,
      totalProfit,
      avgTicket,
      totalItems,
      salesCount: sales.length,
      expensesByCategory,
      salesByPayment,
    }
  }, [sales, expenses])

  if (loading) return <PageLoading />

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-dark-400 text-sm">
          Relatório detalhado por período
        </p>
        <DateFilter
          selected={dateRange}
          onChange={setDateRange}
          startDate={customStart}
          endDate={customEnd}
          onStartDateChange={setCustomStart}
          onEndDateChange={setCustomEnd}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Faturamento"
          value={formatCurrency(metrics.totalRevenue)}
          subtitle={`${metrics.salesCount} vendas • ${metrics.totalItems} itens`}
          icon={<DollarSign className="w-5 h-5 text-success-400" />}
          gradient="from-success-600/20 to-success-500/10"
        />
        <StatCard
          title="Despesas"
          value={formatCurrency(metrics.totalExpenses)}
          subtitle={`${Object.keys(metrics.expensesByCategory).length} categorias`}
          icon={<TrendingDown className="w-5 h-5 text-danger-400" />}
          gradient="from-danger-600/20 to-danger-500/10"
        />
        <StatCard
          title="Lucro Líquido"
          value={formatCurrency(metrics.totalProfit)}
          subtitle={metrics.totalRevenue > 0 ? `Margem: ${((metrics.totalProfit / metrics.totalRevenue) * 100).toFixed(1)}%` : undefined}
          icon={<TrendingUp className="w-5 h-5 text-brand-400" />}
          gradient="from-brand-600/20 to-accent-600/10"
        />
        <StatCard
          title="Ticket Médio"
          value={formatCurrency(metrics.avgTicket)}
          subtitle="por venda"
          icon={<BarChart3 className="w-5 h-5 text-accent-400" />}
          gradient="from-accent-600/20 to-accent-500/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Payment Method */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-dark-200 mb-4">Vendas por Forma de Pagamento</h3>
          {Object.keys(metrics.salesByPayment).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(metrics.salesByPayment)
                .sort(([, a], [, b]) => b - a)
                .map(([method, value]) => {
                  const percentage = (value / metrics.totalRevenue) * 100
                  const labels: Record<string, string> = {
                    pix: 'PIX',
                    dinheiro: 'Dinheiro',
                    cartao_credito: 'Cartão de Crédito',
                    cartao_debito: 'Cartão de Débito',
                    boleto: 'Boleto',
                    transferencia: 'Transferência',
                  }
                  return (
                    <div key={method}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-dark-300">{labels[method] || method}</span>
                        <span className="text-sm font-semibold text-dark-200">{formatCurrency(value)}</span>
                      </div>
                      <div className="w-full h-2 bg-dark-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-brand-500 to-accent-500 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-dark-500 mt-0.5">{percentage.toFixed(1)}%</p>
                    </div>
                  )
                })}
            </div>
          ) : (
            <p className="text-dark-500 text-sm text-center py-8">Nenhum dado no período</p>
          )}
        </div>

        {/* Expenses by Category */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-dark-200 mb-4">Despesas por Categoria</h3>
          {Object.keys(metrics.expensesByCategory).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(metrics.expensesByCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([category, value]) => {
                  const percentage = metrics.totalExpenses > 0 ? (value / metrics.totalExpenses) * 100 : 0
                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-dark-300">{category}</span>
                        <span className="text-sm font-semibold text-danger-400">{formatCurrency(value)}</span>
                      </div>
                      <div className="w-full h-2 bg-dark-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-danger-500 to-warning-500 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-dark-500 mt-0.5">{percentage.toFixed(1)}%</p>
                    </div>
                  )
                })}
            </div>
          ) : (
            <p className="text-dark-500 text-sm text-center py-8">Nenhuma despesa no período</p>
          )}
        </div>
      </div>

      {/* Sales History Table */}
      {sales.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-dark-200 mb-4">
            Histórico de Vendas ({sales.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-dark-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-400 uppercase tracking-wider">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-400 uppercase tracking-wider">Produto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-400 uppercase tracking-wider">Tam.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-400 uppercase tracking-wider">Qtd</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-dark-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-dark-400 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-t border-dark-700/30 hover:bg-dark-800/30">
                    <td className="px-4 py-3 text-xs text-dark-400">
                      {format(new Date(sale.created_at), 'dd/MM/yy HH:mm')}
                    </td>
                    <td className="px-4 py-3 text-sm text-dark-200 font-medium">{sale.products?.nome}</td>
                    <td className="px-4 py-3"><span className="size-badge-active text-xs">{sale.tamanho}</span></td>
                    <td className="px-4 py-3 text-sm">{sale.quantidade}</td>
                    <td className="px-4 py-3 text-sm text-dark-300">{sale.customer_name || '—'}</td>
                    <td className="px-4 py-3 text-sm font-bold text-success-400 text-right">
                      {formatCurrency(sale.quantidade * sale.preco_venda - sale.desconto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
