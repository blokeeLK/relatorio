import React, { useEffect, useState, useCallback } from 'react'
import { Plus, ShoppingCart, Trash2, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { useSaleStore } from '@/store/useSaleStore'
import { useProductStore } from '@/store/useProductStore'
import { useStockStore } from '@/store/useStockStore'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageLoading } from '@/components/LoadingSpinner'
import type { SaleFormData, Size, StockEntry } from '@/types'
import { SIZES, PAYMENT_METHODS, SALE_STATUSES } from '@/types'
import { stockService } from '@/services/stockService'
import { friendlySupabaseError } from '@/lib/supabase'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const loteCode = (id: string) => `#${id.slice(-6).toUpperCase()}`

const emptySaleForm: SaleFormData = {
  product_id: '',
  tamanho: 'M',
  stock_entry_id: '',
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

  // Lotes disponíveis para produto+tamanho selecionado
  const [lotesDisponiveis, setLotesDisponiveis] = useState<StockEntry[]>([])
  const [loadingLotes, setLoadingLotes] = useState(false)

  useEffect(() => {
    fetchSales()
    fetchProducts()
  }, [fetchSales, fetchProducts])

  // Busca lotes sempre que produto ou tamanho mudar
  const fetchLotes = useCallback(async (productId: string, tamanho: Size, currentSaleId?: string | null) => {
    if (!productId || !tamanho) { setLotesDisponiveis([]); return }
    setLoadingLotes(true)
    try {
      let lotes = await stockService.getAvailableLotes(productId, tamanho)

      // Se estiver editando, inclui o lote da venda original (mesmo que saldo = 0 nele agora)
      if (currentSaleId) {
        const original = sales.find(s => s.id === currentSaleId)
        if (original?.stock_entry_id && !lotes.find(l => l.id === original.stock_entry_id)) {
          const { data } = await (await import('@/lib/supabase')).supabase
            .from('stock_entries')
            .select('*')
            .eq('id', original.stock_entry_id)
            .single()
          if (data) lotes = [data as StockEntry, ...lotes]
        }
      }
      setLotesDisponiveis(lotes)
    } finally {
      setLoadingLotes(false)
    }
  }, [sales])

  useEffect(() => {
    fetchLotes(form.product_id, form.tamanho as Size, editingId)
    // Reseta lote ao trocar produto/tamanho
    setForm(prev => ({ ...prev, stock_entry_id: '' }))
  }, [form.product_id, form.tamanho]) // eslint-disable-line react-hooks/exhaustive-deps

  const loteAtual = lotesDisponiveis.find(l => l.id === form.stock_entry_id) ?? null
  const parseNum = (v: string | number) => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0
  const parsedQty = parseNum(form.quantidade)
  const parsedPrice = parseNum(form.preco_venda)
  const parsedDiscount = parseNum(form.desconto || 0)
  const parsedFreteCobrado = parseNum(form.frete_cobrado || 0)
  const parsedFreteCusto = parseNum(form.frete_custo || 0)
  const parsedLucroFrete = parsedFreteCobrado - parsedFreteCusto
  const custoPrevisto = loteAtual ? parsedQty * loteAtual.custo_unitario : 0
  const lucroPrevisto = parsedQty * parsedPrice - parsedDiscount - custoPrevisto + parsedLucroFrete

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.product_id) { setError('Selecione um produto'); return }
    if (!form.stock_entry_id) { setError('Selecione o lote de origem'); return }
    if (parsedQty <= 0) { setError('Quantidade deve ser maior que zero'); return }
    if (parsedPrice <= 0) { setError('Preço unitário deve ser maior que zero'); return }
    if (loteAtual && parsedQty > loteAtual.remaining_quantity) {
      setError(`Saldo insuficiente no lote! Disponível: ${loteAtual.remaining_quantity} unidades`); return
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
      setError(friendlySupabaseError(err))
    } finally {
      setSaving(false)
    }
  }

  const openCreate = () => {
    setForm(emptySaleForm)
    setEditingId(null)
    setLotesDisponiveis([])
    setError(null)
    setModalOpen(true)
  }

  const openEdit = (sale: typeof sales[number]) => {
    setEditingId(sale.id)
    setForm({
      product_id: sale.product_id,
      tamanho: sale.tamanho,
      stock_entry_id: sale.stock_entry_id || '',
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
    fetchLotes(sale.product_id, sale.tamanho, sale.id)
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
        <button onClick={openCreate} className="btn-primary" id="btn-add-sale">
          <Plus className="w-4 h-4" />
          Nova Venda
        </button>
      </div>

      {sales.length > 0 ? (
        <div className="table-container overflow-x-auto">
          <table className="min-w-[1080px]">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Tam.</th>
                <th>Lote</th>
                <th>Qtd</th>
                <th>Preço Unit.</th>
                <th>Desc.</th>
                <th>Frete</th>
                <th>Total</th>
                <th>Lucro</th>
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
                const lucro = total - sale.custo_unitario_snapshot + (sale.frete_cobrado ?? 0) - (sale.frete_custo ?? 0)
                const statusInfo = SALE_STATUSES.find((s) => s.value === sale.status)
                return (
                  <tr key={sale.id}>
                    <td className="font-medium text-dark-100">{sale.products?.nome || '—'}</td>
                    <td><span className="size-badge-active">{sale.tamanho}</span></td>
                    <td>
                      {sale.stock_entry_id ? (
                        <span className="font-mono text-xs bg-dark-700/60 px-2 py-1 rounded-lg text-brand-300">
                          {loteCode(sale.stock_entry_id)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="font-semibold">{sale.quantidade}</td>
                    <td>{formatCurrency(sale.preco_venda)}</td>
                    <td className="text-danger-400">
                      {sale.desconto > 0 ? `-${formatCurrency(sale.desconto)}` : '—'}
                    </td>
                    <td className="text-brand-400">
                      {(sale.frete_cobrado ?? 0) > 0 ? formatCurrency(sale.frete_cobrado) : '—'}
                    </td>
                    <td className="font-bold text-success-400">{formatCurrency(total)}</td>
                    <td className={`font-semibold ${lucro >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                      {formatCurrency(lucro)}
                    </td>
                    <td>
                      <div>
                        <p className="text-sm">{sale.customer_name || '—'}</p>
                        {sale.customer_phone && <p className="text-xs text-dark-500">{sale.customer_phone}</p>}
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
            <button onClick={openCreate} className="btn-primary">
              <Plus className="w-4 h-4" />
              Registrar Venda
            </button>
          }
        />
      )}

      {/* Modal de venda */}
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

          {/* 1. Produto */}
          <div>
            <label className="input-label">Produto *</label>
            <select
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value, stock_entry_id: '' })}
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

          {/* 2. Tamanho */}
          <div>
            <label className="input-label">Tamanho *</label>
            <div className="flex gap-2 flex-wrap">
              {SIZES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, tamanho: t as Size, stock_entry_id: '' })}
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
          </div>

          {/* 3. Seleção de Lote */}
          {form.product_id && form.tamanho && (
            <div>
              <label className="input-label">Lote de Origem *</label>
              {loadingLotes ? (
                <p className="text-xs text-dark-500 mt-1">Carregando lotes...</p>
              ) : lotesDisponiveis.length === 0 ? (
                <div className="p-3 rounded-xl bg-warning-500/10 border border-warning-500/20 text-warning-400 text-sm">
                  Nenhum lote com saldo disponível para este produto/tamanho.
                </div>
              ) : (
                <div className="space-y-2 mt-1">
                  {lotesDisponiveis.map((lote) => (
                    <button
                      key={lote.id}
                      type="button"
                      onClick={() => setForm({ ...form, stock_entry_id: lote.id })}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all ${
                        form.stock_entry_id === lote.id
                          ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                          : 'bg-dark-800/40 border-dark-700/30 text-dark-300 hover:bg-dark-700/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs bg-dark-700/80 px-2 py-0.5 rounded text-brand-400">
                          {loteCode(lote.id)}
                        </span>
                        <span className="text-dark-400 text-xs">
                          {format(new Date(lote.created_at), 'dd/MM/yyyy')}
                        </span>
                        <span className="text-dark-300">
                          Custo: {formatCurrency(lote.custo_unitario)}/un
                        </span>
                      </div>
                      <span className={`font-bold ${lote.remaining_quantity < 5 ? 'text-warning-400' : 'text-success-400'}`}>
                        {lote.remaining_quantity} un. disponíveis
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. Quantidade + Preço + Desconto */}
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

          {/* 5. Frete */}
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

          {/* 6. Cliente */}
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

          {/* 7. Pagamento */}
          <div>
            <label className="input-label">Forma de Pagamento *</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value as any })}
              className="select-field"
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* 8. Resumo financeiro */}
          {saleTotal > 0 && loteAtual && (
            <div className="p-4 rounded-xl bg-dark-800/60 border border-dark-700/30 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Total da venda</span>
                <span className="font-bold text-success-400">{formatCurrency(saleTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Custo do lote ({parsedQty} × {formatCurrency(loteAtual.custo_unitario)})</span>
                <span className="text-danger-400">-{formatCurrency(custoPrevisto)}</span>
              </div>
              {(parsedFreteCobrado > 0 || parsedFreteCusto > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-dark-400">Lucro do frete</span>
                  <span className={parsedLucroFrete >= 0 ? 'text-success-400' : 'text-danger-400'}>
                    {formatCurrency(parsedLucroFrete)}
                  </span>
                </div>
              )}
              <div className="border-t border-dark-700/30 pt-2 flex justify-between">
                <span className="text-dark-300 font-semibold">Lucro estimado</span>
                <span className={`font-bold text-lg ${lucroPrevisto >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                  {formatCurrency(lucroPrevisto)}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); setEditingId(null) }} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-success" disabled={saving}>
              {saving ? 'Processando...' : editingId ? 'Salvar Alterações' : 'Confirmar Venda'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Venda"
        message="O saldo do lote será restaurado automaticamente. Deseja continuar?"
        confirmText="Excluir"
      />
    </div>
  )
}
