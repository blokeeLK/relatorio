import React, { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Receipt } from 'lucide-react'
import { format } from 'date-fns'
import { useExpenseStore } from '@/store/useExpenseStore'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageLoading } from '@/components/LoadingSpinner'
import type { ExpenseFormData } from '@/types'
import { EXPENSE_CATEGORIES } from '@/types'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const emptyForm: ExpenseFormData = { category: '', description: '', value: 0 }

export const Expenses: React.FC = () => {
  const { expenses, loading, fetchExpenses, addExpense, updateExpense, deleteExpense } = useExpenseStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ExpenseFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  const totalExpenses = expenses.reduce((sum, e) => sum + e.value, 0)

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setModalOpen(true)
  }

  const openEdit = (expense: typeof expenses[0]) => {
    setEditingId(expense.id)
    setForm({ category: expense.category, description: expense.description, value: expense.value })
    setError(null)
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.category) {
      setError('Selecione uma categoria')
      return
    }
    if (form.value <= 0) {
      setError('Valor deve ser maior que zero')
      return
    }

    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        await updateExpense(editingId, form)
      } else {
        await addExpense(form)
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
      await deleteExpense(deleteId)
      setDeleteId(null)
    } catch (err) {
      console.error(err)
    }
  }

  if (loading && expenses.length === 0) return <PageLoading />

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-dark-400 text-sm">
          {expenses.length} despesa(s) • Total:{' '}
          <span className="text-danger-400 font-semibold">{formatCurrency(totalExpenses)}</span>
        </p>
        <button onClick={openCreate} className="btn-primary" id="btn-add-expense">
          <Plus className="w-4 h-4" />
          Nova Despesa
        </button>
      </div>

      {expenses.length > 0 ? (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Data</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <span className="badge-info">{expense.category}</span>
                  </td>
                  <td className="text-dark-200">{expense.description || '—'}</td>
                  <td className="font-bold text-danger-400">
                    {formatCurrency(expense.value)}
                  </td>
                  <td className="text-dark-400 text-xs">
                    {format(new Date(expense.created_at), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(expense)} className="btn-icon" title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(expense.id)}
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
          title="Nenhuma despesa registrada"
          description="Registre despesas para controlar os custos operacionais e calcular o lucro real."
          icon={<Receipt className="w-8 h-8 text-dark-500" />}
          action={
            <button onClick={openCreate} className="btn-primary">
              <Plus className="w-4 h-4" />
              Registrar Despesa
            </button>
          }
        />
      )}

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar Despesa' : 'Nova Despesa'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="input-label">Categoria *</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="select-field"
            >
              <option value="">Selecione uma categoria</option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="input-label">Descrição</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input-field"
              placeholder="Detalhes da despesa"
            />
          </div>

          <div>
            <label className="input-label">Valor (R$) *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.value || ''}
              onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
              className="input-field"
              placeholder="0,00"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Registrar'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Despesa"
        message="Tem certeza que deseja excluir esta despesa?"
        confirmText="Excluir"
      />
    </div>
  )
}
