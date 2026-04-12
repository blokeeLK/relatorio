import { supabase } from '@/lib/supabase'
import type { Expense, ExpenseFormData } from '@/types'

export const expenseService = {
  async getAll(): Promise<Expense[]> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async getByDateRange(startDate: string, endDate: string): Promise<Expense[]> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  async create(expense: ExpenseFormData): Promise<Expense> {
    const { data, error } = await supabase
      .from('expenses')
      .insert(expense)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, expense: Partial<ExpenseFormData>): Promise<Expense> {
    const { data, error } = await supabase
      .from('expenses')
      .update(expense)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  async getTotalByRange(startDate: string, endDate: string): Promise<number> {
    const expenses = await this.getByDateRange(startDate, endDate)
    return expenses.reduce((total, expense) => total + expense.value, 0)
  },

  async getByCategory(startDate: string, endDate: string): Promise<Record<string, number>> {
    const expenses = await this.getByDateRange(startDate, endDate)
    return expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.value
      return acc
    }, {} as Record<string, number>)
  },
}
