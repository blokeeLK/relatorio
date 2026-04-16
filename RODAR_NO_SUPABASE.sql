-- ============================================================
-- MIGRATION — Adicionar G1/G2/G3 e campos de frete
-- Cole TODO o conteúdo deste arquivo no SQL Editor do Supabase
-- É idempotente: seguro rodar mesmo que já tenha rodado antes
-- ============================================================

-- ============================================
-- 1. Atualizar CHECK constraint de tamanho
--    nas tabelas: stock, stock_entries, sales
-- ============================================

-- Tabela: stock
ALTER TABLE public.stock DROP CONSTRAINT IF EXISTS stock_tamanho_check;
ALTER TABLE public.stock ADD CONSTRAINT stock_tamanho_check
  CHECK (tamanho IN ('P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'));

-- Tabela: stock_entries
ALTER TABLE public.stock_entries DROP CONSTRAINT IF EXISTS stock_entries_tamanho_check;
ALTER TABLE public.stock_entries ADD CONSTRAINT stock_entries_tamanho_check
  CHECK (tamanho IN ('P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'));

-- Tabela: sales
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_tamanho_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_tamanho_check
  CHECK (tamanho IN ('P', 'M', 'G', 'GG', 'G1', 'G2', 'G3'));

-- ============================================
-- 2. Adicionar colunas de frete na tabela sales
-- ============================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS frete_cobrado DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frete_custo   DECIMAL(10,2) DEFAULT 0;

-- ============================================
-- 3. Recarregar cache do PostgREST
-- ============================================
NOTIFY pgrst, 'reload schema';

-- ============================================
-- 4. Verificação final
-- ============================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sales'
ORDER BY ordinal_position;
