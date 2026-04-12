import React, { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, Package } from 'lucide-react'
import { useProductStore } from '@/store/useProductStore'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageLoading } from '@/components/LoadingSpinner'
import type { ProductFormData } from '@/types'

const emptyForm: ProductFormData = { nome: '', modelo: '', cor: '', sku: '' }

export const Products: React.FC = () => {
  const { products, loading, fetchProducts, addProduct, updateProduct, deleteProduct, searchProducts } = useProductStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductFormData>(emptyForm)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    const timer = setTimeout(() => {
      searchProducts(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, searchProducts])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setModalOpen(true)
  }

  const openEdit = (product: typeof products[0]) => {
    setEditingId(product.id)
    setForm({ nome: product.nome, modelo: product.modelo, cor: product.cor, sku: product.sku })
    setError(null)
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) {
      setError('Nome é obrigatório')
      return
    }

    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        await updateProduct(editingId, form)
      } else {
        await addProduct(form)
      }
      setModalOpen(false)
      setForm(emptyForm)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteProduct(deleteId)
      setDeleteId(null)
    } catch (err) {
      console.error(err)
    }
  }

  if (loading && products.length === 0) return <PageLoading />

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Actions bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Buscar por nome, modelo, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <button onClick={openCreate} className="btn-primary" id="btn-add-product">
          <Plus className="w-4 h-4" />
          Novo Produto
        </button>
      </div>

      {/* Products table */}
      {products.length > 0 ? (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Modelo</th>
                <th>Cor</th>
                <th>SKU</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-brand-600/15 flex items-center justify-center">
                        <Package className="w-4 h-4 text-brand-400" />
                      </div>
                      <span className="font-medium text-dark-100">{product.nome}</span>
                    </div>
                  </td>
                  <td>{product.modelo || '—'}</td>
                  <td>
                    {product.cor ? (
                      <span className="badge-info">{product.cor}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <code className="text-xs bg-dark-800/60 px-2 py-1 rounded font-mono text-dark-300">
                      {product.sku || '—'}
                    </code>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(product)}
                        className="btn-icon"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(product.id)}
                        className="btn-icon text-danger-400 hover:text-danger-300 hover:bg-danger-500/10"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Nenhum produto cadastrado"
          description="Comece cadastrando seus produtos para controlar o estoque e vendas."
          action={
            <button onClick={openCreate} className="btn-primary">
              <Plus className="w-4 h-4" />
              Cadastrar Produto
            </button>
          }
        />
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar Produto' : 'Novo Produto'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="input-label">Nome *</label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="input-field"
              placeholder="Ex: Camiseta Básica"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Modelo</label>
              <input
                type="text"
                value={form.modelo}
                onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                className="input-field"
                placeholder="Ex: Polo"
              />
            </div>
            <div>
              <label className="input-label">Cor</label>
              <input
                type="text"
                value={form.cor}
                onChange={(e) => setForm({ ...form, cor: e.target.value })}
                className="input-field"
                placeholder="Ex: Branco"
              />
            </div>
          </div>

          <div>
            <label className="input-label">SKU</label>
            <input
              type="text"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className="input-field"
              placeholder="Ex: CAM-BAS-BRA-001"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Produto"
        message="Tem certeza? Isso removerá o produto e todo o estoque associado."
        confirmText="Excluir"
      />
    </div>
  )
}
