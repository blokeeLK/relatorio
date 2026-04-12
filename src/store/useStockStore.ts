import { create } from 'zustand'
import type { StockWithProduct, StockEntryWithProduct, StockEntryFormData } from '@/types'
import { stockService } from '@/services/stockService'

interface StockStore {
  stock: StockWithProduct[]
  entries: StockEntryWithProduct[]
  lowStock: StockWithProduct[]
  totalValue: number
  loading: boolean
  error: string | null
  fetchStock: () => Promise<void>
  fetchEntries: () => Promise<void>
  fetchLowStock: () => Promise<void>
  addEntry: (data: StockEntryFormData) => Promise<void>
}

export const useStockStore = create<StockStore>((set) => ({
  stock: [],
  entries: [],
  lowStock: [],
  totalValue: 0,
  loading: false,
  error: null,

  fetchStock: async () => {
    set({ loading: true, error: null })
    try {
      const [stock, totalValue] = await Promise.all([
        stockService.getAll(),
        stockService.getTotalStockValue(),
      ])
      set({ stock, totalValue, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  fetchEntries: async () => {
    set({ loading: true, error: null })
    try {
      const entries = await stockService.getEntries()
      set({ entries, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  fetchLowStock: async () => {
    try {
      const lowStock = await stockService.getLowStock(10)
      set({ lowStock })
    } catch (err) {
      console.error('Error fetching low stock:', err)
    }
  },

  addEntry: async (data) => {
    set({ loading: true, error: null })
    try {
      await stockService.addEntry(data)
      // Refresh stock data
      const [stock, totalValue, entries, lowStock] = await Promise.all([
        stockService.getAll(),
        stockService.getTotalStockValue(),
        stockService.getEntries(),
        stockService.getLowStock(10),
      ])
      set({ stock, totalValue, entries, lowStock, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      throw err
    }
  },
}))
