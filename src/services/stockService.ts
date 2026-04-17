import { supabase } from '@/lib/supabase'
import type { Stock, StockEntry, StockEntryFormData, StockWithProduct, StockEntryWithProduct, Size } from '@/types'
import { SIZES } from '@/types'

export const stockService = {
  async getAll(): Promise<StockWithProduct[]> {
    const { data, error } = await supabase
      .from('stock')
      .select('*, products(*)')
      .order('quantidade', { ascending: true })

    if (error) throw error
    return (data || []) as StockWithProduct[]
  },

  async getByProduct(productId: string): Promise<Stock[]> {
    const { data, error } = await supabase
      .from('stock')
      .select('*')
      .eq('product_id', productId)

    if (error) throw error
    return data || []
  },

  async getStockForSale(productId: string, size: Size): Promise<Stock | null> {
    const { data, error } = await supabase
      .from('stock')
      .select('*')
      .eq('product_id', productId)
      .eq('tamanho', size)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  async getLowStock(threshold: number = 10): Promise<StockWithProduct[]> {
    const { data, error } = await supabase
      .from('stock')
      .select('*, products(*)')
      .lt('quantidade', threshold)
      .gt('quantidade', 0)
      .order('quantidade', { ascending: true })

    if (error) throw error
    return (data || []) as StockWithProduct[]
  },

  async initializeStockForProduct(productId: string): Promise<void> {
    const stockEntries = SIZES.map(size => ({
      product_id: productId,
      tamanho: size,
      quantidade: 0,
    }))

    const { error } = await supabase
      .from('stock')
      .insert(stockEntries)

    if (error) throw error
  },

  async addEntry(entry: StockEntryFormData): Promise<StockEntry> {
    // 1. Register the entry in stock_entries history
    const quantidade = Number(entry.quantidade)
    const custo_unitario = Number(entry.custo_unitario)

    const { data: entryData, error: entryError } = await supabase
      .from('stock_entries')
      .insert({
        product_id: entry.product_id,
        tamanho: entry.tamanho,
        quantidade,
        custo_unitario,
        remaining_quantity: quantidade,
      })
      .select()
      .single()

    if (entryError) throw entryError

    // 2. Get current stock for this product+size
    const { data: currentStock, error: stockError } = await supabase
      .from('stock')
      .select('*')
      .eq('product_id', entry.product_id)
      .eq('tamanho', entry.tamanho)
      .single()

    if (stockError && stockError.code !== 'PGRST116') throw stockError

    if (currentStock) {
      // 3. Update stock quantity
      const totalQuantidade = (currentStock.quantidade ?? 0) + quantidade

      // 4. Update stock
      const { error: updateError } = await supabase
        .from('stock')
        .update({ quantidade: totalQuantidade })
        .eq('id', currentStock.id)

      if (updateError) throw updateError
    } else {
      // Create stock entry if it doesn't exist
      const { error: insertError } = await supabase
        .from('stock')
        .insert({
          product_id: entry.product_id,
          tamanho: entry.tamanho,
          quantidade,
        })

      if (insertError) throw insertError
    }

    return entryData
  },

  async getEntries(): Promise<StockEntryWithProduct[]> {
    const { data, error } = await supabase
      .from('stock_entries')
      .select('*, products(*)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as StockEntryWithProduct[]
  },

  async getTotalStockValue(): Promise<number> {
    const { data, error } = await supabase
      .from('stock')
      .select('quantidade')

    if (error) throw error
    return (data || []).reduce((total, item) => total + (item.quantidade ?? 0), 0)
  },
}
