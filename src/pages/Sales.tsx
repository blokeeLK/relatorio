import React, { useEffect, useState } from 'react'
import { Plus, ShoppingCart, Trash2, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { useSaleStore } from '@/store/useSaleStore'
import { useProductStore } from '@/store/useProductStore'
import { useStockStore } from '@/store/useStockStore'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageLoading } from '@/components/LoadingSpinner'
import type { SaleFormData, Size } from '@/types'
import { SIZES, PAYMENT_METHODS, SALE_STATUSES } from '@/types'
import { stockService } from '@/services/stockService'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const emptySaleForm: SaleFormData = {
  product_id: '',
  tamanho: 'M',
  quantidade: '',
  preco_venda: '',
  desconto: '',
  frete_cobrado: '',
  frete_custo: '',
  customer_name: '',
  customer_phone: '',
  payment_method: 'pix',
}

export const Sales: React.FC = () => {
  const { sales, loading, fetchSales, addSale, updateSale, deleteSale } = useSaleStore()
  const { products, fetchProducts } = useProductStore()
  const { fetchStock } = useStockStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<SaleFormData>(emptySaleForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [availableQty, setAvailableQty] = useState<number | null>(null)

  useEffect(() => {
    fetchSales()
    fetchProducts()
  }, [fetchSales, fetchProducts])

  // Check stock availability when product/tamanho changes.
  // When editing a sale, add the quantity currently reserved by this sale
  // (if same product/tamanho) to the available stock shown.
  useEffect(() => {
    if (form.product_id && form.tamanho) {
      stockService.getStockForSale(form.product_id, form.tamanho).then((stock) => {
        let base = stock?.quantidade ?? 0
        if (editingId) {
          const original = sales.find((s) => s.id === editingId)
          if (
            original &&
            original.status === 'completed' &&
            original.product_id === form.product_id &&
            original.tamanho === form.tamanho
          ) {
            base += original.quantidade
          }
        }
        setAvailableQty(base)
      })
    } else {
      setAvailableQty(null)
    }
  }, [form.product_id, form.tamanho, editingId, sales])

  const parseNum = (v: string | number) => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0
  const parsedQty = parseNum(form.quantidade)
  const parsedPrice = parseNum(form.preco_venda)
  const parsedDiscount = parseNum(form.desconto || 0)
  const parsedFreteCobrado = parseNum(form.frete_cobrado || 0)
  const parsedFreteCusto = parseNum(form.frete_custo || 0)
  const parsedLucroFrete = parsedFreteCobrado - parsedFreteCusto

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.product_id) {
      setError('Selecione um produto')
      return
    }
    if (parsedQty <= 0) {
      setError('Quantidade deve ser maior que zero')
      return
    }
    if (parsedPrice <= 0) {
      setError('Preço unitário deve ser maior que zero')
      return
    }
    if (availableQty !== null && parsedQty > availableQty) {
      setError(`Estoque insuficiente! Disponível: ${availableQty} unidades`)
      return
    }

    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        await updateSale(editingId, form)
      } else {
        await addSale(form)
      }
      await fetchStock()
      setModalOpen(false)
      setForm(emptySaleForm)
      setEditingId(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (sale: typeof sales[number]) => {
    setEditingId(sale.id)
    setForm({
      product_id: sale.product_id,
      tamanho: sale.tamanho,
      quantidade: String(sale.quantidade),
      preco_venda: String(sale.preco_venda),
      desconto: sale.desconto ? String(sale.desconto) : '',
      frete_cobrado: sale.frete_cobrado ? String(sale.frete_cobrado) : '',
      frete_custo: sale.frete_custo ? String(sale.frete_custo) : '',
      customer_name: sale.customer_name || '',
      customer_phone: sale.customer_phone || '',
      payment_method: sale.payment_method,
    })
    setError(null)
    setModalOpen(true)
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

  const saleTotal = parsedQty * parsedPrice - parsedDiscount

  if (loading && sales.length === 0) return <PageLoading />

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-dark-400 text-sm">{sales.length} venda(s)</p>
        <button
          onClick={() => { setForm(emptySaleForm); setEditingId(null); setError(null); setModalOpen(true) }}
          className="btn-primary"
          id="btn-add-sale"
        >
          <Plus className="w-4 h-4" />
          Nova Venda
        </button>
      </div>

      {sales.length > 0 ? (
        <div className="table-container overflow-x-auto">
          <table className="min-w-[960px]">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Tam.</th>
                <th>Qtd</th>
                <th>Preço Unit.</th>
                <th>Desc.</th>
                <th>Frete Cobrado</th>
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
                const total = sale.quantidade * sale.preco_venda - sale.desconto
                const statusInfo = SALE_STATUSES.find((s) => s.value === sale.status)
                return (
                  <tr key={sale.id}>
                    <td className="font-medium text-dark-100">
                      {sale.products?.nome || '—'}
                    </td>
                    <td><span className="size-badge-active">{sale.tamanho}</span></td>
                    <td className="font-semibold">{sale.quantidade}</td>
                    <td>{formatCurrency(sale.preco_venda)}</td>
                    <td className="text-danger-400">
                      {sale.desconto > 0 ? `-${formatCurrency(sale.desconto)}` : '—'}
                    </td>
                    <td className="text-brand-400">
                      {(sale.frete_cobrado ?? 0) > 0 ? formatCurrency(sale.frete_cobrado) : '—'}
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
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(sale)}
                          className="btn-icon text-brand-400 hover:text-brand-300 hover:bg-brand-500/10"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(sale.id)}
                          className="btn-icon text-danger-400 hover:text-danger-300 hover:bg-danger-500/10"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingId(null) }}
        title={editingId ? 'Editar Venda' : 'Nova Venda'}
        size="lg"
      >
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
            <div className="flex gap-2 flex-wrap">
              {SIZES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, tamanho: t as Size })}
                  className={`px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    form.tamanho === t
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                      : 'bg-dark-800/60 text-dark-400 border border-dark-700/50 hover:bg-dark-700/60'
                  }`}
                >
                  {t}
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
                type="text"
                value={form.quantidade}
                onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                className="input-field"
                placeholder="Ex: 5"
              />
            </div>
            <div>
              <label className="input-label">Preço Unit. (R$) *</label>
              <input
                type="text"
                value={form.preco_venda}
                onChange={(e) => setForm({ ...form, preco_venda: e.target.value })}
                className="input-field"
                placeholder="Ex: 35,90"
              />
            </div>
            <div>
              <label className="input-label">Desconto (R$)</label>
              <input
                type="text"
                value={form.desconto}
                onChange={(e) => setForm({ ...form, desconto: e.target.value })}
                className="input-field"
                placeholder="Ex: 10,00"
              />
            </div>
          </div>

          {/* Frete */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Frete Cobrado do Cliente (R$)</label>
              <input
                type="text"
                value={form.frete_cobrado}
                onChange={(e) => setForm({ ...form, frete_cobrado: e.target.value })}
                className="input-field"
                placeholder="Ex: 25,00"
              />
            </div>
            <div>
              <label className="input-label">Custo do Frete (R$)</label>
              <input
                type="text"
                value={form.frete_custo}
                onChange={(e) => setForm({ ...form, frete_custo: e.target.value })}
                className="input-field"
                placeholder="Ex: 18,00"
              />
            </div>
          </div>
          {(parsedFreteCobrado > 0 || parsedFreteCusto > 0) && (
            <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-between text-sm">
              <span className="text-dark-400">Lucro do frete:</span>
              <span className={`font-semibold ${parsedLucroFrete >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                {formatCurrency(parsedLucroFrete)}
              </span>
            </div>
          )}

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
                {parsedDiscount > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-dark-500">Subtotal: {formatCurrency(parsedQty * parsedPrice)}</p>
                    <p className="text-xs text-danger-400">Desconto: -{formatCurrency(parsedDiscount)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); setEditingId(null) }} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-success" disabled={saving}>
              {saving ? 'Processando...' : (editingId ? 'Salvar Alterações' : 'Confirmar Venda')}
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
