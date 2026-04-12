import React, { useEffect, useState } from 'react'
import { Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { useSaleStore } from '@/store/useSaleStore'
import { useProductStore } from '@/store/useProductStore'
import { useStockStore } from '@/store/useStockStore'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageLoading } from '@/components/LoadingSpinner'
import type { SaleFormData, Size, SaleStatus } from '@/types'
import { SIZES, PAYMENT_METHODS, SALE_STATUSES } from '@/types'
import { stockService } from '@/services/stockService'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const emptySaleForm: SaleFormData = {
  product_id: '',
  size: 'M',
  quantity: 1,
  unit_price: 0,
  discount: 0,
  customer_name: '',
  customer_phone: '',
  payment_method: 'pix',
}

export const Sales: React.FC = () => {
  const { sales, loading, fetchSales, addSale, deleteSale } = useSaleStore()
  const { products, fetchProducts } = useProductStore()
  const { fetchStock } = useStockStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<SaleFormData>(emptySaleForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [availableQty, setAvailableQty] = useState<number | null>(null)

  useEffect(() => {
    fetchSales()
    fetchProducts()
  }, [fetchSales, fetchProducts])

  // Check stock availability when product/size changes
  useEffect(() => {
    if (form.product_id && form.size) {
      stockService.getStockForSale(form.product_id, form.size).then((stock) => {
        setAvailableQty(stock?.quantity ?? 0)
      })
    } else {
      setAvailableQty(null)
    }
  }, [form.product_id, form.size])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.product_id) {
      setError('Selecione um produto')
      return
    }
    if (form.quantity <= 0) {
      setError('Quantidade deve ser maior que zero')
      return
    }
    if (form.unit_price <= 0) {
      setError('Preço unitário deve ser maior que zero')
      return
    }
    if (availableQty !== null && form.quantity > availableQty) {
      setError(`Estoque insuficiente! Disponível: ${availableQty} unidades`)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await addSale(form)
      await fetchStock()
      setModalOpen(false)
      setForm(emptySaleForm)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteSale(deleteId)
      await fetchStock()
      setDeleteId(null)
    } catch (err) {
      console.error(err)
    }
  }

  const saleTotal = form.quantity * form.unit_price - form.discount

  if (loading && sales.length === 0) return <PageLoading />

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-dark-400 text-sm">{sales.length} venda(s)</p>
        <button
          onClick={() => { setForm(emptySaleForm); setError(null); setModalOpen(true) }}
          className="btn-primary"
          id="btn-add-sale"
        >
          <Plus className="w-4 h-4" />
          Nova Venda
        </button>
      </div>

      {sales.length > 0 ? (
        <div className="table-container overflow-x-auto">
          <table className="min-w-[800px]">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Tam.</th>
                <th>Qtd</th>
                <th>Preço Unit.</th>
                <th>Desc.</th>
                <th>Total</th>
                <th>Cliente</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th>Data</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const total = sale.quantity * sale.unit_price - sale.discount
                const statusInfo = SALE_STATUSES.find((s) => s.value === sale.status)
                return (
                  <tr key={sale.id}>
                    <td className="font-medium text-dark-100">
                      {sale.products?.nome || '—'}
                    </td>
                    <td><span className="size-badge-active">{sale.size}</span></td>
                    <td className="font-semibold">{sale.quantity}</td>
                    <td>{formatCurrency(sale.unit_price)}</td>
                    <td className="text-danger-400">
                      {sale.discount > 0 ? `-${formatCurrency(sale.discount)}` : '—'}
                    </td>
                    <td className="font-bold text-success-400">{formatCurrency(total)}</td>
                    <td>
                      <div>
                        <p className="text-sm">{sale.customer_name || '—'}</p>
                        {sale.customer_phone && (
                          <p className="text-xs text-dark-500">{sale.customer_phone}</p>
                        )}
                      </div>
                    </td>
                    <td className="text-xs">
                      {PAYMENT_METHODS.find((p) => p.value === sale.payment_method)?.label || sale.payment_method}
                    </td>
                    <td>
                      <span className={`badge ${
                        sale.status === 'completed' ? 'badge-success' : 
                        sale.status === 'pending' ? 'badge-warning' : 'badge-danger'
                      }`}>
                        {statusInfo?.label || sale.status}
                      </span>
                    </td>
                    <td className="text-dark-400 text-xs whitespace-nowrap">
                      {format(new Date(sale.created_at), 'dd/MM/yy HH:mm')}
                    </td>
                    <td>
                      <button
                        onClick={() => setDeleteId(sale.id)}
                        className="btn-icon text-danger-400 hover:text-danger-300 hover:bg-danger-500/10"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Nenhuma venda registrada"
          description="Registre vendas para acompanhar o faturamento e lucro."
          icon={<ShoppingCart className="w-8 h-8 text-dark-500" />}
          action={
            <button onClick={() => setModalOpen(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              Registrar Venda
            </button>
          }
        />
      )}

      {/* Sale Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nova Venda" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="input-label">Produto *</label>
            <select
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              className="select-field"
            >
              <option value="">Selecione um produto</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} {p.cor ? `- ${p.cor}` : ''} {p.modelo ? `(${p.modelo})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="input-label">Tamanho *</label>
            <div className="flex gap-2">
              {SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setForm({ ...form, size: size as Size })}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    form.size === size
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                      : 'bg-dark-800/60 text-dark-400 border border-dark-700/50 hover:bg-dark-700/60'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            {availableQty !== null && (
              <p className={`text-xs mt-1.5 ${availableQty < 10 ? 'text-warning-400' : 'text-dark-500'}`}>
                Disponível: {availableQty} unidades
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="input-label">Quantidade *</label>
              <input
                type="number"
                min="1"
                max={availableQty ?? undefined}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })}
                className="input-field"
              />
            </div>
            <div>
              <label className="input-label">Preço Unit. (R$) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.unit_price || ''}
                onChange={(e) => setForm({ ...form, unit_price: parseFloat(e.target.value) || 0 })}
                className="input-field"
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="input-label">Desconto (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.discount || ''}
                onChange={(e) => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })}
                className="input-field"
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Nome do Cliente</label>
              <input
                type="text"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className="input-field"
                placeholder="Nome do cliente"
              />
            </div>
            <div>
              <label className="input-label">Telefone</label>
              <input
                type="text"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                className="input-field"
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <div>
            <label className="input-label">Forma de Pagamento *</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value as any })}
              className="select-field"
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {saleTotal > 0 && (
            <div className="p-4 rounded-xl bg-success-500/10 border border-success-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-dark-400">Total da venda</p>
                  <p className="text-2xl font-bold text-success-400">
                    {formatCurrency(saleTotal)}
                  </p>
                </div>
                {form.discount > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-dark-500">Subtotal: {formatCurrency(form.quantity * form.unit_price)}</p>
                    <p className="text-xs text-danger-400">Desconto: -{formatCurrency(form.discount)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-success" disabled={saving}>
              {saving ? 'Processando...' : 'Confirmar Venda'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Venda"
        message="O estoque será restaurado automaticamente. Deseja continuar?"
        confirmText="Excluir"
      />
    </div>
  )
}
