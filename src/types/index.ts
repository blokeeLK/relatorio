// ============================================
// TYPES - Sistema ERP Atacado
// ============================================

export type Size = 'P' | 'M' | 'G' | 'GG' | 'G1' | 'G2' | 'G3'

export const SIZES: Size[] = ['P', 'M', 'G', 'GG', 'G1', 'G2', 'G3']

export type PaymentMethod = 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'transferencia'

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
]

export type SaleStatus = 'completed' | 'pending' | 'cancelled'

export const SALE_STATUSES: { value: SaleStatus; label: string; color: string }[] = [
  { value: 'completed', label: 'Concluída', color: 'text-success-400' },
  { value: 'pending', label: 'Pendente', color: 'text-warning-400' },
  { value: 'cancelled', label: 'Cancelada', color: 'text-danger-400' },
]

export const EXPENSE_CATEGORIES = [
  'Aluguel',
  'Energia',
  'Água',
  'Internet',
  'Telefone',
  'Transporte',
  'Embalagens',
  'Marketing',
  'Salários',
  'Impostos',
  'Manutenção',
  'Outros',
]

// ---- Database Row Types ----

export interface Product {
  id: string
  nome: string
  modelo: string
  cor: string
  sku?: string
  created_at: string
}

export interface Stock {
  id: string
  product_id: string
  tamanho: Size
  quantidade: number
}

export interface StockEntry {
  id: string
  product_id: string
  tamanho: Size
  quantidade: number
  remaining_quantity: number
  custo_unitario: number
  created_at: string
}

export interface Sale {
  id: string
  product_id: string
  tamanho: Size
  quantidade: number
  preco_venda: number
  desconto: number
  custo_unitario_snapshot: number
  frete_cobrado: number
  frete_custo: number
  customer_name: string
  customer_phone: string
  payment_method: PaymentMethod
  status: SaleStatus
  created_at: string
}

export interface Expense {
  id: string
  category: string
  description: string
  value: number
  created_at: string
}

// ---- Join Types ----

export interface StockWithProduct extends Stock {
  products: Product
}

export interface StockEntryWithProduct extends StockEntry {
  products: Product
}

export interface SaleWithProduct extends Sale {
  products: Product
}

// ---- Form Types ----

export interface ProductFormData {
  nome: string
  modelo: string
  cor: string
}

export interface StockEntryFormData {
  product_id: string
  tamanho: Size
  quantidade: number | string
  custo_unitario: number | string
}

export interface SaleFormData {
  product_id: string
  tamanho: Size
  quantidade: number | string
  preco_venda: number | string
  desconto: number | string
  frete_cobrado: number | string
  frete_custo: number | string
  customer_name: string
  customer_phone: string
  payment_method: PaymentMethod
}

export interface ExpenseFormData {
  category: string
  description: string
  value: number
}

// ---- Dashboard Types ----

export interface DashboardMetrics {
  totalRevenue: number
  totalProfit: number
  totalSales: number
  totalExpenses: number
  totalStockValue: number
  lowStockItems: StockWithProduct[]
}

export interface ChartDataPoint {
  date: string
  revenue: number
  profit: number
  expenses: number
}

export type DateRange = 'today' | 'week' | 'month' | 'year' | 'custom'
