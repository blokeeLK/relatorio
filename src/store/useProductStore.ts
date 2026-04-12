import { create } from 'zustand'
import type { Product, ProductFormData } from '@/types'
import { productService } from '@/services/productService'
import { stockService } from '@/services/stockService'

interface ProductStore {
  products: Product[]
  loading: boolean
  error: string | null
  fetchProducts: () => Promise<void>
  addProduct: (data: ProductFormData) => Promise<Product>
  updateProduct: (id: string, data: Partial<ProductFormData>) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  searchProducts: (query: string) => Promise<void>
}

export const useProductStore = create<ProductStore>((set) => ({
  products: [],
  loading: false,
  error: null,

  fetchProducts: async () => {
    set({ loading: true, error: null })
    try {
      const products = await productService.getAll()
      set({ products, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  addProduct: async (data) => {
    set({ loading: true, error: null })
    try {
      const product = await productService.create(data)
      // Initialize stock entries for all sizes
      await stockService.initializeStockForProduct(product.id)
      set((state) => ({
        products: [product, ...state.products],
        loading: false,
      }))
      return product
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      throw err
    }
  },

  updateProduct: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const updated = await productService.update(id, data)
      set((state) => ({
        products: state.products.map((p) => (p.id === id ? updated : p)),
        loading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      throw err
    }
  },

  deleteProduct: async (id) => {
    set({ loading: true, error: null })
    try {
      await productService.delete(id)
      set((state) => ({
        products: state.products.filter((p) => p.id !== id),
        loading: false,
      }))
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
      throw err
    }
  },

  searchProducts: async (query) => {
    set({ loading: true, error: null })
    try {
      const products = query
        ? await productService.search(query)
        : await productService.getAll()
      set({ products, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },
}))
