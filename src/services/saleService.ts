import { supabase } from '@/lib/supabase'
import type { Sale, SaleFormData, SaleWithProduct } from '@/types'
import { stockService } from './stockService'

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
    // 1. Check stock availability
    const stock = await stockService.getStockForSale(sale.product_id, sale.size)

    if (!stock || stock.quantity < sale.quantity) {
      const available = stock?.quantity || 0
      throw new Error(`Estoque insuficiente! Disponível: ${available} unidades`)
    }

    // 2. Create the sale record
    const { data, error } = await supabase
      .from('sales')
      .insert({
        product_id: sale.product_id,
        size: sale.size,
        quantity: sale.quantity,
        unit_price: sale.unit_price,
        discount: sale.discount || 0,
        customer_name: sale.customer_name,
        customer_phone: sale.customer_phone,
        payment_method: sale.payment_method,
        status: 'completed',
      })
      .select()
      .single()

    if (error) throw error

    // 3. Subtract from stock
    const { error: stockError } = await supabase
      .from('stock')
      .update({
        quantity: stock.quantity - sale.quantity,
      })
      .eq('id', stock.id)

    if (stockError) throw stockError

    return data
  },

  async updateStatus(id: string, status: string): Promise<void> {
    const { error } = await supabase
      .from('sales')
      .update({ status })
      .eq('id', id)

    if (error) throw error
  },

  async delete(id: string): Promise<void> {
    // Get the sale first to restore stock
    const { data: sale, error: getError } = await supabase
      .from('sales')
      .select('*')
      .eq('id', id)
      .single()

    if (getError) throw getError

    if (sale && sale.status === 'completed') {
      // Restore stock
      const stock = await stockService.getStockForSale(sale.product_id, sale.size)
      if (stock) {
        const { error: stockError } = await supabase
          .from('stock')
          .update({ quantity: stock.quantity + sale.quantity })
          .eq('id', stock.id)

        if (stockError) throw stockError
      }
    }

    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  async getRevenue(startDate: string, endDate: string): Promise<number> {
    const sales = await this.getByDateRange(startDate, endDate)
    return sales.reduce((total, sale) => {
      return total + (sale.quantity * sale.unit_price) - sale.discount
    }, 0)
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
