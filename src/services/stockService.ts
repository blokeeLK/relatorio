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
    const { error } = await supabase.from('stock').insert(stockEntries)
    if (error) throw error
  },

  async addEntry(entry: StockEntryFormData): Promise<StockEntry> {
    const quantidade = Number(entry.quantidade)
    const custo_unitario = Number(entry.custo_unitario)

    const { data: entryData, error: entryError } = await supabase
      .from('stock_entries')
      .insert({ product_id: entry.product_id, tamanho: entry.tamanho, quantidade, custo_unitario, remaining_quantity: quantidade })
      .select()
      .single()
    if (entryError) throw entryError

    const { data: currentStock, error: stockError } = await supabase
      .from('stock')
      .select('*')
      .eq('product_id', entry.product_id)
      .eq('tamanho', entry.tamanho)
      .single()
    if (stockError && stockError.code !== 'PGRST116') throw stockError

    if (currentStock) {
      const { error } = await supabase
        .from('stock')
        .update({ quantidade: (currentStock.quantidade ?? 0) + quantidade })
        .eq('id', currentStock.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('stock')
        .insert({ product_id: entry.product_id, tamanho: entry.tamanho, quantidade })
      if (error) throw error
    }

    return entryData
  },

  async updateEntry(id: string, data: StockEntryFormData): Promise<void> {
    const quantidade = Number(data.quantidade)
    const custo_unitario = Number(data.custo_unitario)

    // 1. Busca a entrada antiga para reverter o estoque
    const { data: oldEntry, error: fetchError } = await supabase
      .from('stock_entries')
      .select('*')
      .eq('id', id)
      .single()
    if (fetchError) throw fetchError

    // 2. Atualiza o registro de entrada
    const { error: updateError } = await supabase
      .from('stock_entries')
      .update({ product_id: data.product_id, tamanho: data.tamanho, quantidade, custo_unitario, remaining_quantity: quantidade })
      .eq('id', id)
    if (updateError) throw updateError

    // 3. Ajusta o estoque
    if (oldEntry.product_id === data.product_id && oldEntry.tamanho === data.tamanho) {
      // Mesmo produto+tamanho: aplica só a diferença
      const { data: currentStock } = await supabase
        .from('stock').select('*').eq('product_id', data.product_id).eq('tamanho', data.tamanho).single()
      if (currentStock) {
        await supabase.from('stock')
          .update({ quantidade: Math.max(0, currentStock.quantidade + (quantidade - oldEntry.quantidade)) })
          .eq('id', currentStock.id)
      }
    } else {
      // Produto ou tamanho diferente: reverte o antigo e adiciona no novo
      const { data: oldStock } = await supabase
        .from('stock').select('*').eq('product_id', oldEntry.product_id).eq('tamanho', oldEntry.tamanho).single()
      if (oldStock) {
        await supabase.from('stock')
          .update({ quantidade: Math.max(0, oldStock.quantidade - oldEntry.quantidade) })
          .eq('id', oldStock.id)
      }
      const { data: newStock } = await supabase
        .from('stock').select('*').eq('product_id', data.product_id).eq('tamanho', data.tamanho).single()
      if (newStock) {
        await supabase.from('stock').update({ quantidade: newStock.quantidade + quantidade }).eq('id', newStock.id)
      } else {
        await supabase.from('stock').insert({ product_id: data.product_id, tamanho: data.tamanho, quantidade })
      }
    }
  },

  async deleteEntry(id: string): Promise<void> {
    // 1. Busca a entrada para saber quanto subtrair do estoque
    const { data: entry, error: fetchError } = await supabase
      .from('stock_entries').select('*').eq('id', id).single()
    if (fetchError) throw fetchError

    // 2. Deleta a entrada
    const { error: deleteError } = await supabase.from('stock_entries').delete().eq('id', id)
    if (deleteError) throw deleteError

    // 3. Subtrai do estoque
    const { data: currentStock } = await supabase
      .from('stock').select('*').eq('product_id', entry.product_id).eq('tamanho', entry.tamanho).single()
    if (currentStock) {
      await supabase.from('stock')
        .update({ quantidade: Math.max(0, currentStock.quantidade - entry.quantidade) })
        .eq('id', currentStock.id)
    }
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
    const { data, error } = await supabase.from('stock').select('quantidade')
    if (error) throw error
    return (data || []).reduce((total, item) => total + (item.quantidade ?? 0), 0)
  },
}
