import { create } from 'zustand'
import type { Expense, ExpenseFormData } from '@/types'
import { expenseService } from '@/services/expenseService'

interface ExpenseStore {
  expenses: Expense[]
  loading: boolean
  error: string | null
  fetchExpenses: () => Promise<void>
  addExpense: (data: ExpenseFormData) => Promise<void>
  updateExpense: (id: string, data: Partial<ExpenseFormData>) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
}

export const useExpenseStore = create<ExpenseStore>((set) => ({
  expenses: [],
  loading: false,
  error: null,

  fetchExpenses: async () => {
    set({ loading: true, error: null })
    try {
      const expenses = await expenseService.getAll()
      set({ expenses, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  addExpense: async (data) => {
    set({ loading: true, error: null })
    try {
      const expense = await expenseService.create(data)
      set((state) => ({
        expenses: [expense, ...state.expenses],
        loading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      throw err
    }
  },

  updateExpense: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const updated = await expenseService.update(id, data)
      set((state) => ({
        expenses: state.expenses.map((e) => (e.id === id ? updated : e)),
        loading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      throw err
    }
  },

  deleteExpense: async (id) => {
    set({ loading: true, error: null })
    try {
      await expenseService.delete(id)
      set((state) => ({
        expenses: state.expenses.filter((e) => e.id !== id),
        loading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      throw err
    }
  },
}))
