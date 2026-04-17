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

  // Retorna todos os lotes com saldo > 0 para produto+tamanho (para seleção na venda)
  async getAvailableLotes(productId: string, tamanho: Size): Promise<StockEntry[]> {
    const { data, error } = await supabase
      .from('stock_entries')
      .select('*')
      .eq('product_id', productId)
      .eq('tamanho', tamanho)
      .gt('remaining_quantity', 0)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []) as StockEntry[]
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

    // 1. Cria o lote
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

    // 2. Atualiza saldo consolidado em stock
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
    const { data: existing, error: getErr } = await supabase
      .from('stock_entries')
      .select('*')
      .eq('id', id)
      .single()
    if (getErr) throw getErr
    if (!existing) throw new Error('Entrada não encontrada.')

    const newQuantidade = Number(data.quantidade)
    const newCusto = Number(data.custo_unitario)
    if (newQuantidade <= 0) throw new Error('Quantidade inválida.')
    if (newCusto <= 0) throw new Error('Custo unitário inválido.')

    const consumed = (existing.quantidade ?? 0) - (existing.remaining_quantity ?? 0)
    if (newQuantidade < consumed) {
      throw new Error(`Não é possível reduzir abaixo de ${consumed} unidades (já consumidas em vendas).`)
    }

    const newRemaining = newQuantidade - consumed
    const productChanged = existing.product_id !== data.product_id || existing.tamanho !== data.tamanho

    const { error: updErr } = await supabase
      .from('stock_entries')
      .update({
        product_id: data.product_id,
        tamanho: data.tamanho,
        quantidade: newQuantidade,
        custo_unitario: newCusto,
        remaining_quantity: newRemaining,
      })
      .eq('id', id)
    if (updErr) throw updErr

    if (productChanged) {
      await this.recomputeStock(existing.product_id, existing.tamanho)
      await this.recomputeStock(data.product_id, data.tamanho)
    } else {
      await this.recomputeStock(data.product_id, data.tamanho)
    }
  },

  async deleteEntry(id: string): Promise<void> {
    const { data: existing, error: getErr } = await supabase
      .from('stock_entries')
      .select('*')
      .eq('id', id)
      .single()
    if (getErr) throw getErr
    if (!existing) throw new Error('Entrada não encontrada.')

    const consumed = (existing.quantidade ?? 0) - (existing.remaining_quantity ?? 0)
    if (consumed > 0) {
      // Zera snapshot de custo nas vendas vinculadas a este lote
      await supabase
        .from('sales')
        .update({ custo_unitario_snapshot: 0, stock_entry_id: null })
        .eq('stock_entry_id', existing.id)
    }

    const { error: delErr } = await supabase
      .from('stock_entries')
      .delete()
      .eq('id', id)
    if (delErr) throw delErr

    await this.recomputeStock(existing.product_id, existing.tamanho)
  },

  async recomputeStock(productId: string, tamanho: Size): Promise<void> {
    const { data: entries, error: entriesErr } = await supabase
      .from('stock_entries')
      .select('remaining_quantity')
      .eq('product_id', productId)
      .eq('tamanho', tamanho)
    if (entriesErr) throw entriesErr

    const total = (entries || []).reduce((sum, e: any) => sum + (e.remaining_quantity ?? 0), 0)

    const { data: existing, error: stockErr } = await supabase
      .from('stock')
      .select('*')
      .eq('product_id', productId)
      .eq('tamanho', tamanho)
      .single()
    if (stockErr && stockErr.code !== 'PGRST116') throw stockErr

    if (existing) {
      const { error } = await supabase
        .from('stock')
        .update({ quantidade: total })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('stock')
        .insert({ product_id: productId, tamanho, quantidade: total })
      if (error) throw error
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
    const { data, error } = await supabase
      .from('stock_entries')
      .select('remaining_quantity, custo_unitario')
    if (error) throw error
    return (data || []).reduce(
      (total, item) => total + (item.remaining_quantity ?? 0) * (item.custo_unitario ?? 0),
      0
    )
  },
}
