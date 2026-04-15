import React, { useEffect, useMemo } from 'react'
import { Warehouse, AlertTriangle } from 'lucide-react'
import { useStockStore } from '@/store/useStockStore'
import { PageLoading } from '@/components/LoadingSpinner'
import { EmptyState } from '@/components/EmptyState'
import type { StockWithProduct } from '@/types'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const Stock: React.FC = () => {
  const { stock, totalValue, loading, fetchStock } = useStockStore()

  useEffect(() => {
    fetchStock()
  }, [fetchStock])

  // Group stock by product
  const grouped = useMemo(() => {
    const map: Record<string, { product: StockWithProduct['products']; sizes: StockWithProduct[] }> = {}
    stock.forEach((item) => {
      if (!map[item.product_id]) {
        map[item.product_id] = { product: item.products, sizes: [] }
      }
      map[item.product_id].sizes.push(item)
    })
    // Sort sizes within each group
    Object.values(map).forEach((group) => {
      const order = ['P', 'M', 'G', 'GG']
      group.sizes.sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size))
    })
    return Object.values(map)
  }, [stock])

  if (loading && stock.length === 0) return <PageLoading />

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-dark-400 text-sm">
          {grouped.length} produto(s) • Valor total:{' '}
          <span className="text-brand-400 font-semibold">{formatCurrency(totalValue)}</span>
        </p>
      </div>

      {grouped.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {grouped.map(({ product, sizes }) => {
            const totalQty = sizes.reduce((sum, s) => sum + s.quantity, 0)
            const productValue = sizes.reduce((sum, s) => sum + s.quantity * s.average_cost, 0)
            const hasLowStock = sizes.some((s) => s.quantity > 0 && s.quantity < 10)

            return (
              <div
                key={product.id}
                className={`glass-card-hover p-5 ${
                  hasLowStock ? 'border-warning-500/20' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-dark-100">
                      {product.nome}
                    </h3>
                    <p className="text-xs text-dark-500 mt-0.5">
                      {[product.modelo, product.cor].filter(Boolean).join(' • ') || product.sku}
                    </p>
                  </div>
                  {hasLowStock && (
                    <div className="w-7 h-7 rounded-lg bg-warning-500/15 flex items-center justify-center">
                      <AlertTriangle className="w-3.5 h-3.5 text-warning-400" />
                    </div>
                  )}
                </div>

                {/* Size grid */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {sizes.map((s) => (
                    <div
                      key={s.id}
                      className={`text-center p-2.5 rounded-xl border transition-all ${
                        s.quantity === 0
                          ? 'bg-dark-800/30 border-dark-700/20 opacity-40'
                          : s.quantity < 10
                          ? 'bg-warning-500/8 border-warning-500/20'
                          : 'bg-dark-800/40 border-dark-700/30'
                      }`}
                    >
                      <p className="text-[10px] font-bold text-dark-500 uppercase mb-0.5">
                        {s.size}
                      </p>
                      <p
                        className={`text-lg font-bold ${
                          s.quantity === 0
                            ? 'text-dark-600'
                            : s.quantity < 10
                            ? 'text-warning-400'
                            : 'text-dark-200'
                        }`}
                      >
                        {s.quantity}
                      </p>
                      <p className="text-[10px] text-dark-500">
                        {formatCurrency(s.average_cost)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-dark-700/30">
                  <div>
                    <p className="text-[10px] text-dark-500 uppercase font-medium">Total</p>
                    <p className="text-sm font-bold text-dark-200">{totalQty} un.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-dark-500 uppercase font-medium">Valor</p>
                    <p className="text-sm font-bold text-brand-400">{formatCurrency(productValue)}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="Nenhum estoque encontrado"
          description="Cadastre produtos e faça entradas de mercadoria para controlar o estoque."
          icon={<Warehouse className="w-8 h-8 text-dark-500" />}
        />
      )}
    </div>
  )
}
