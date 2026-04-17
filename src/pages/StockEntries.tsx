import React, { useEffect, useState } from 'react'
import { Plus, PackagePlus } from 'lucide-react'
import { format } from 'date-fns'
import { useStockStore } from '@/store/useStockStore'
import { useProductStore } from '@/store/useProductStore'
import { Modal } from '@/components/Modal'
import { EmptyState } from '@/components/EmptyState'
import { PageLoading } from '@/components/LoadingSpinner'
import type { StockEntryFormData, Size } from '@/types'
import { SIZES } from '@/types'
import { friendlySupabaseError } from '@/lib/supabase'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const emptyForm: StockEntryFormData = {
  product_id: '',
  tamanho: 'M',
  quantidade: '',
  custo_unitario: '',
}

export const StockEntries: React.FC = () => {
  const { entries, loading: stockLoading, fetchEntries, addEntry } = useStockStore()
  const { products, fetchProducts } = useProductStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<StockEntryFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchEntries()
    fetchProducts()
  }, [fetchEntries, fetchProducts])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.product_id) {
      setError('Selecione um produto')
      return
    }
    if (Number(form.quantidade) <= 0) {
      setError('Quantidade deve ser maior que zero')
      return
    }
    if (Number(form.custo_unitario) <= 0) {
      setError('Custo unitário deve ser maior que zero')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await addEntry(form)
      setModalOpen(false)
      setForm(emptyForm)
    } catch (err) {
      setError(friendlySupabaseError(err))
    } finally {
      setSaving(false)
    }
  }

  if (stockLoading && entries.length === 0) return <PageLoading />

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-dark-400 text-sm">
          {entries.length} entrada(s) registrada(s)
        </p>
        <button onClick={() => { setForm(emptyForm); setError(null); setModalOpen(true) }} className="btn-primary" id="btn-add-entry">
          <Plus className="w-4 h-4" />
          Nova Entrada
        </button>
      </div>

      {entries.length > 0 ? (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Tamanho</th>
                <th>Qtd</th>
                <th>Custo Unit.</th>
                <th>Total</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="font-medium text-dark-100">
                    {entry.products?.nome || '—'}
                  </td>
                  <td>
                    <span className="size-badge-active">{entry.tamanho}</span>
                  </td>
                  <td className="font-semibold text-success-400">+{entry.quantidade}</td>
                  <td>{formatCurrency(entry.custo_unitario)}</td>
                  <td className="font-semibold text-dark-200">
                    {formatCurrency(entry.quantidade * entry.custo_unitario)}
                  </td>
                  <td className="text-dark-400 text-xs">
                    {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Nenhuma entrada registrada"
          description="Registre a entrada de mercadorias para controlar o estoque e custo médio."
          icon={<PackagePlus className="w-8 h-8 text-dark-500" />}
          action={
            <button onClick={() => setModalOpen(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              Registrar Entrada
            </button>
          }
        />
      )}

      {/* Entry Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova Entrada de Mercadoria"
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
            <div className="flex gap-2">
              {SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setForm({ ...form, tamanho: size as Size })}
                  className={`px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    form.tamanho === size
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                      : 'bg-dark-800/60 text-dark-400 border border-dark-700/50 hover:bg-dark-700/60'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Quantidade *</label>
              <input
                type="text"
                value={form.quantidade}
                onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                className="input-field"
                placeholder="Ex: 10"
              />
            </div>
            <div>
              <label className="input-label">Custo Unitário (R$) *</label>
              <input
                type="text"
                value={form.custo_unitario}
                onChange={(e) => setForm({ ...form, custo_unitario: e.target.value })}
                className="input-field"
                placeholder="Ex: 18,50"
              />
            </div>
          </div>

          {Number(form.quantidade) > 0 && Number(form.custo_unitario) > 0 && (
            <div className="p-3 rounded-xl bg-brand-600/10 border border-brand-500/20">
              <p className="text-xs text-dark-400">Total da entrada</p>
              <p className="text-lg font-bold text-brand-400">
                {formatCurrency(Number(form.quantidade) * Number(form.custo_unitario))}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-success" disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar Entrada'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
