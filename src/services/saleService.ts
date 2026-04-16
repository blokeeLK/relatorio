import { supabase } from '@/lib/supabase'
import type { Sale, SaleFormData, SaleWithProduct } from '@/types'
import { stockService } from './stockService'

const normalizeMoney = (value: string | number) => {
  if (typeof value === 'number') return value
  return Number(value.replace(/\./g, '').replace(',', '.'))
}

const normalizeQuantity = (value: string | number) => {
  if (typeof value === 'number') return value
  return parseInt(value.toString().replace(/\D/g, ''), 10) || 0
}

export const saleService = {
  async getAll(): Promise<SaleWithProduct[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*, products(*)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as SaleWithProduct[]
  },

  async getByDateRange(startDate: string, endDate: string): Promise<SaleWithProduct[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*, products(*)')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as SaleWithProduct[]
  },

  async create(sale: SaleFormData): Promise<Sale> {
    const quantidade = normalizeQuantity(sale.quantidade)
    const preco_venda = normalizeMoney(sale.preco_venda)
    const desconto = normalizeMoney(sale.desconto || 0)
    const frete_cobrado = normalizeMoney(sale.frete_cobrado || 0)
    const frete_custo = normalizeMoney(sale.frete_custo || 0)

    if (quantidade <= 0) throw new Error('Quantidade inválida para venda.')
    if (preco_venda < 0) throw new Error('Preço de venda inválido.')

    // 1. Check stock availability dynamically (via stock_entries)
    const stock = await stockService.getStockForSale(sale.product_id, sale.tamanho)

    if (!stock || stock.quantidade < quantidade) {
      const available = stock?.quantidade || 0
      throw new Error(`Estoque insuficiente! Disponível: ${available} unidades`)
    }

    // 2. FIFO Logic - Get available stock_entries in chronological order
    const { data: entries, error: entriesError } = await supabase
      .from('stock_entries')
      .select('*')
      .eq('product_id', sale.product_id)
      .eq('tamanho', sale.tamanho)
      .gt('remaining_quantity', 0)
      .order('created_at', { ascending: true })

    if (entriesError) throw entriesError
    if (!entries || entries.length === 0) throw new Error('Falha de integridade: sem entradas para consumir.')

    let qtyToFulfill = quantidade
    let computedTotalCost = 0
    const updates = []

    // 3. Consume entries FIFO
    for (const entry of entries) {
      if (qtyToFulfill <= 0) break
      const consumed = Math.min(entry.remaining_quantity, qtyToFulfill)
      computedTotalCost += consumed * entry.custo_unitario
      qtyToFulfill -= consumed
      updates.push({ id: entry.id, remaining_quantity: entry.remaining_quantity - consumed })
    }

    if (qtyToFulfill > 0) throw new Error('Estoque das entradas incompatível com o total verificado.')

    // 4. Update consumed stock entries
    for (const update of updates) {
      const { error: updErr } = await supabase
        .from('stock_entries')
        .update({ remaining_quantity: update.remaining_quantity })
        .eq('id', update.id)
      if (updErr) throw updErr
    }

    // 5. Create sale record
    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert({
        product_id: sale.product_id,
        tamanho: sale.tamanho,
        quantidade,
        preco_venda,
        desconto,
        custo_unitario_snapshot: computedTotalCost,
        frete_cobrado,
        frete_custo,
        customer_name: sale.customer_name?.trim() || '',
        customer_phone: sale.customer_phone?.trim() || '',
        payment_method: sale.payment_method,
        status: 'completed',
      })
      .select()
      .single()

    if (saleError) throw saleError
    return saleData
  },

  async updateStatus(id: string, status: string): Promise<void> {
    const { error } = await supabase
      .from('sales')
      .update({ status })
      .eq('id', id)
    if (error) throw error
  },

  async delete(id: string): Promise<void> {
    const { data: sale, error: getError } = await supabase
      .from('sales')
      .select('*')
      .eq('id', id)
      .single()

    if (getError) throw getError

    if (sale && sale.status === 'completed') {
      const restoreUnitCost = sale.quantidade > 0 ? (sale.custo_unitario_snapshot / sale.quantidade) : 0
      const { error: entryError } = await supabase
        .from('stock_entries')
        .insert({
          product_id: sale.product_id,
          tamanho: sale.tamanho,
          quantidade: sale.quantidade,
          remaining_quantity: sale.quantidade,
          custo_unitario: restoreUnitCost,
        })
      if (entryError) throw entryError
    }

    const { error } = await supabase.from('sales').delete().eq('id', id)
    if (error) throw error
  },

  async getRevenue(startDate: string, endDate: string): Promise<number> {
    const sales = await this.getByDateRange(startDate, endDate)
    return sales.reduce((total, sale) => total + (sale.quantidade * sale.preco_venda) - sale.desconto, 0)
  },

  async getTotalSalesCount(startDate: string, endDate: string): Promise<number> {
    const { count, error } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .eq('status', 'completed')
    if (error) throw error
    return count || 0
  },
}
