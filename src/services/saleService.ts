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
      .select('*, products(*), stock_entries(*)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as SaleWithProduct[]
  },

  async getByDateRange(startDate: string, endDate: string): Promise<SaleWithProduct[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*, products(*), stock_entries(*)')
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
    if (!sale.stock_entry_id) throw new Error('Selecione o lote de origem.')

    // 1. Busca o lote selecionado
    const { data: lote, error: loteErr } = await supabase
      .from('stock_entries')
      .select('*')
      .eq('id', sale.stock_entry_id)
      .single()
    if (loteErr) throw loteErr
    if (!lote) throw new Error('Lote não encontrado.')

    if (lote.product_id !== sale.product_id || lote.tamanho !== sale.tamanho) {
      throw new Error('Lote não pertence ao produto/tamanho selecionado.')
    }
    if (lote.remaining_quantity < quantidade) {
      throw new Error(`Saldo insuficiente no lote! Disponível: ${lote.remaining_quantity} unidades.`)
    }

    // 2. Desconta do lote
    const { error: updErr } = await supabase
      .from('stock_entries')
      .update({ remaining_quantity: lote.remaining_quantity - quantidade })
      .eq('id', lote.id)
    if (updErr) throw updErr

    // 3. Custo real = quantidade * custo unitário do lote
    const custo_total = quantidade * lote.custo_unitario

    // 4. Registra a venda com referência ao lote
    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert({
        product_id: sale.product_id,
        tamanho: sale.tamanho,
        stock_entry_id: lote.id,
        quantidade,
        preco_venda,
        desconto,
        custo_unitario_snapshot: custo_total,
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

    // 5. Recalcula saldo consolidado
    await stockService.recomputeStock(sale.product_id, sale.tamanho)

    return saleData
  },

  async update(id: string, sale: SaleFormData): Promise<void> {
    const { data: original, error: getErr } = await supabase
      .from('sales')
      .select('*')
      .eq('id', id)
      .single()
    if (getErr) throw getErr
    if (!original) throw new Error('Venda não encontrada.')

    // 1. Devolve unidades ao lote original
    if (original.status === 'completed' && original.stock_entry_id) {
      const { data: loteOriginal } = await supabase
        .from('stock_entries')
        .select('remaining_quantity')
        .eq('id', original.stock_entry_id)
        .single()
      if (loteOriginal) {
        await supabase
          .from('stock_entries')
          .update({ remaining_quantity: loteOriginal.remaining_quantity + original.quantidade })
          .eq('id', original.stock_entry_id)
      }
      await stockService.recomputeStock(original.product_id, original.tamanho)
    }

    const quantidade = normalizeQuantity(sale.quantidade)
    const preco_venda = normalizeMoney(sale.preco_venda)
    const desconto = normalizeMoney(sale.desconto || 0)
    const frete_cobrado = normalizeMoney(sale.frete_cobrado || 0)
    const frete_custo = normalizeMoney(sale.frete_custo || 0)

    if (quantidade <= 0) throw new Error('Quantidade inválida para venda.')
    if (!sale.stock_entry_id) throw new Error('Selecione o lote de origem.')

    // 2. Busca novo lote
    const { data: lote, error: loteErr } = await supabase
      .from('stock_entries')
      .select('*')
      .eq('id', sale.stock_entry_id)
      .single()
    if (loteErr) throw loteErr
    if (!lote) throw new Error('Lote não encontrado.')

    if (lote.remaining_quantity < quantidade) {
      // Rollback: devolve ao lote original
      if (original.stock_entry_id) {
        const { data: lo } = await supabase
          .from('stock_entries')
          .select('remaining_quantity')
          .eq('id', original.stock_entry_id)
          .single()
        if (lo) {
          await supabase
            .from('stock_entries')
            .update({ remaining_quantity: lo.remaining_quantity - original.quantidade })
            .eq('id', original.stock_entry_id)
        }
        await stockService.recomputeStock(original.product_id, original.tamanho)
      }
      throw new Error(`Saldo insuficiente no lote! Disponível: ${lote.remaining_quantity} unidades.`)
    }

    // 3. Desconta do novo lote
    await supabase
      .from('stock_entries')
      .update({ remaining_quantity: lote.remaining_quantity - quantidade })
      .eq('id', lote.id)

    const custo_total = quantidade * lote.custo_unitario

    // 4. Atualiza venda
    const { error: saleError } = await supabase
      .from('sales')
      .update({
        product_id: sale.product_id,
        tamanho: sale.tamanho,
        stock_entry_id: lote.id,
        quantidade,
        preco_venda,
        desconto,
        custo_unitario_snapshot: custo_total,
        frete_cobrado,
        frete_custo,
        customer_name: sale.customer_name?.trim() || '',
        customer_phone: sale.customer_phone?.trim() || '',
        payment_method: sale.payment_method,
        status: 'completed',
      })
      .eq('id', id)
    if (saleError) throw saleError

    await stockService.recomputeStock(sale.product_id, sale.tamanho)
    if (original.product_id !== sale.product_id || original.tamanho !== sale.tamanho) {
      await stockService.recomputeStock(original.product_id, original.tamanho)
    }
  },

  async updateStatus(id: string, status: string): Promise<void> {
    const { error } = await supabase.from('sales').update({ status }).eq('id', id)
    if (error) throw error
  },

  async delete(id: string): Promise<void> {
    const { data: sale, error: getError } = await supabase
      .from('sales')
      .select('*')
      .eq('id', id)
      .single()
    if (getError) throw getError

    // Devolve ao lote de origem
    if (sale && sale.status === 'completed' && sale.stock_entry_id) {
      const { data: lote } = await supabase
        .from('stock_entries')
        .select('remaining_quantity')
        .eq('id', sale.stock_entry_id)
        .single()
      if (lote) {
        await supabase
          .from('stock_entries')
          .update({ remaining_quantity: lote.remaining_quantity + sale.quantidade })
          .eq('id', sale.stock_entry_id)
      }
      await stockService.recomputeStock(sale.product_id, sale.tamanho)
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
