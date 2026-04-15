import { create } from 'zustand'
import type { SaleWithProduct, SaleFormData } from '@/types'
import { saleService } from '@/services/saleService'

interface SaleStore {
  sales: SaleWithProduct[]
  loading: boolean
  error: string | null
  fetchSales: () => Promise<void>
  addSale: (data: SaleFormData) => Promise<void>
  deleteSale: (id: string) => Promise<void>
  updateSaleStatus: (id: string, status: string) => Promise<void>
}

export const useSaleStore = create<SaleStore>((set) => ({
  sales: [],
  loading: false,
  error: null,

  fetchSales: async () => {
    set({ loading: true, error: null })
    try {
      const sales = await saleService.getAll()
      set({ sales, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  addSale: async (data) => {
    set({ loading: true, error: null })
    try {
      await saleService.create(data)
      const sales = await saleService.getAll()
      set({ sales, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      throw err
    }
  },

  deleteSale: async (id) => {
    set({ loading: true, error: null })
    try {
      await saleService.delete(id)
      set((state) => ({
        sales: state.sales.filter((s) => s.id !== id),
        loading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      throw err
    }
  },

  updateSaleStatus: async (id, status) => {
    set({ loading: true, error: null })
    try {
      await saleService.updateStatus(id, status)
      const sales = await saleService.getAll()
      set({ sales, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      throw err
    }
  },
}))
