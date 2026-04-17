-- ============================================================
-- ERP Atacado — MIGRATION CANÔNICA (idempotente)
-- ============================================================
-- Cole TUDO no SQL Editor do Supabase e clique em "Run".
-- Seguro rodar múltiplas vezes.
--
-- O que esta migration faz:
--  * Cria todas as tabelas necessárias (se não existirem).
--  * Renomeia colunas legadas em inglês (size/quantity/unit_cost/
--    unit_price/discount) para os nomes em português que o
--    frontend espera (tamanho/quantidade/custo_unitario/
--    preco_venda/desconto).
--  * Adiciona colunas que faltavam: remaining_quantity,
--    custo_unitario_snapshot, frete_cobrado, frete_custo.
--  * Atualiza os CHECK constraints de tamanho para aceitar
--    G1, G2, G3.
--  * Habilita RLS com policies permissivas (pronto para auth
--    futura).
--  * Recarrega o cache do PostgREST (resolve o erro
--    "Could not find the table ... in the schema cache").
-- ============================================================


-- ============================================
-- 1) TABELA: products
-- ============================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  modelo TEXT DEFAULT '',
  cor TEXT DEFAULT '',
  sku TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='products' AND column_name='modelo')
    THEN ALTER TABLE public.products ADD COLUMN modelo TEXT DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='products' AND column_name='cor')
    THEN ALTER TABLE public.products ADD COLUMN cor TEXT DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='products' AND column_name='sku')
    THEN ALTER TABLE public.products ADD COLUMN sku TEXT DEFAULT ''; END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku
  ON public.products(sku) WHERE sku != '';


-- ============================================
-- 2) TABELA: stock
-- ============================================
CREATE TABLE IF NOT EXISTS public.stock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tamanho TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0)
);

-- Renomear colunas legadas em inglês → português
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='stock' AND column_name='size')
    THEN ALTER TABLE public.stock RENAME COLUMN size TO tamanho; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='stock' AND column_name='quantity')
    THEN ALTER TABLE public.stock RENAME COLUMN quantity TO quantidade; END IF;
  -- Coluna não usada pelo frontend: remover se existir
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='stock' AND column_name='average_cost')
    THEN ALTER TABLE public.stock DROP COLUMN average_cost; END IF;
  -- Garantir colunas obrigatórias
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='stock' AND column_name='tamanho')
    THEN ALTER TABLE public.stock ADD COLUMN tamanho TEXT NOT NULL DEFAULT 'M'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='stock' AND column_name='quantidade')
    THEN ALTER TABLE public.stock ADD COLUMN quantidade INTEGER NOT NULL DEFAULT 0; END IF;
END $$;

-- UNIQUE(product_id, tamanho)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.stock'::regclass
      AND conname = 'stock_product_tamanho_key'
  ) THEN
    ALTER TABLE public.stock ADD CONSTRAINT stock_product_tamanho_key UNIQUE (product_id, tamanho);
  END IF;
EXCEPTION WHEN others THEN
  -- constraint pode já existir com outro nome, não falhar
  NULL;
END $$;

-- CHECK constraint com todos os tamanhos
ALTER TABLE public.stock DROP CONSTRAINT IF EXISTS stock_size_check;
ALTER TABLE public.stock DROP CONSTRAINT IF EXISTS stock_tamanho_check;
ALTER TABLE public.stock ADD CONSTRAINT stock_tamanho_check
  CHECK (tamanho IN ('P','M','G','GG','G1','G2','G3'));

CREATE INDEX IF NOT EXISTS idx_stock_product_id ON public.stock(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_low
  ON public.stock(quantidade) WHERE quantidade < 10 AND quantidade > 0;


-- ============================================
-- 3) TABELA: stock_entries
-- ============================================
CREATE TABLE IF NOT EXISTS public.stock_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tamanho TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  custo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
  remaining_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  -- Renomear colunas legadas
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='stock_entries' AND column_name='size')
    THEN ALTER TABLE public.stock_entries RENAME COLUMN size TO tamanho; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='stock_entries' AND column_name='quantity')
    THEN ALTER TABLE public.stock_entries RENAME COLUMN quantity TO quantidade; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='stock_entries' AND column_name='unit_cost')
    THEN ALTER TABLE public.stock_entries RENAME COLUMN unit_cost TO custo_unitario; END IF;

  -- Adicionar colunas faltantes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='stock_entries' AND column_name='custo_unitario')
    THEN ALTER TABLE public.stock_entries ADD COLUMN custo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0; END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='stock_entries' AND column_name='remaining_quantity') THEN
    ALTER TABLE public.stock_entries ADD COLUMN remaining_quantity INTEGER NOT NULL DEFAULT 0;
    -- Backfill: entradas antigas começam com todo o saldo disponível
    UPDATE public.stock_entries SET remaining_quantity = quantidade;
  END IF;
END $$;

ALTER TABLE public.stock_entries DROP CONSTRAINT IF EXISTS stock_entries_size_check;
ALTER TABLE public.stock_entries DROP CONSTRAINT IF EXISTS stock_entries_tamanho_check;
ALTER TABLE public.stock_entries ADD CONSTRAINT stock_entries_tamanho_check
  CHECK (tamanho IN ('P','M','G','GG','G1','G2','G3'));

CREATE INDEX IF NOT EXISTS idx_stock_entries_product ON public.stock_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_entries_date ON public.stock_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_entries_fifo
  ON public.stock_entries(product_id, tamanho, created_at)
  WHERE remaining_quantity > 0;


-- ============================================
-- 4) TABELA: sales
-- ============================================
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tamanho TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  preco_venda DECIMAL(10,2) NOT NULL DEFAULT 0,
  desconto DECIMAL(10,2) NOT NULL DEFAULT 0,
  custo_unitario_snapshot DECIMAL(10,2) NOT NULL DEFAULT 0,
  frete_cobrado DECIMAL(10,2) NOT NULL DEFAULT 0,
  frete_custo DECIMAL(10,2) NOT NULL DEFAULT 0,
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  payment_method TEXT DEFAULT 'pix',
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  -- Renomear colunas legadas em inglês → português
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='sales' AND column_name='size')
    THEN ALTER TABLE public.sales RENAME COLUMN size TO tamanho; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='sales' AND column_name='quantity')
    THEN ALTER TABLE public.sales RENAME COLUMN quantity TO quantidade; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='sales' AND column_name='unit_price')
    THEN ALTER TABLE public.sales RENAME COLUMN unit_price TO preco_venda; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='sales' AND column_name='discount')
    THEN ALTER TABLE public.sales RENAME COLUMN discount TO desconto; END IF;

  -- Adicionar colunas faltantes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sales' AND column_name='desconto')
    THEN ALTER TABLE public.sales ADD COLUMN desconto DECIMAL(10,2) NOT NULL DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sales' AND column_name='custo_unitario_snapshot')
    THEN ALTER TABLE public.sales ADD COLUMN custo_unitario_snapshot DECIMAL(10,2) NOT NULL DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sales' AND column_name='frete_cobrado')
    THEN ALTER TABLE public.sales ADD COLUMN frete_cobrado DECIMAL(10,2) NOT NULL DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sales' AND column_name='frete_custo')
    THEN ALTER TABLE public.sales ADD COLUMN frete_custo DECIMAL(10,2) NOT NULL DEFAULT 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sales' AND column_name='customer_name')
    THEN ALTER TABLE public.sales ADD COLUMN customer_name TEXT DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sales' AND column_name='customer_phone')
    THEN ALTER TABLE public.sales ADD COLUMN customer_phone TEXT DEFAULT ''; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sales' AND column_name='payment_method')
    THEN ALTER TABLE public.sales ADD COLUMN payment_method TEXT DEFAULT 'pix'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='sales' AND column_name='status')
    THEN ALTER TABLE public.sales ADD COLUMN status TEXT DEFAULT 'completed'; END IF;
END $$;

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_size_check;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_tamanho_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_tamanho_check
  CHECK (tamanho IN ('P','M','G','GG','G1','G2','G3'));

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_status_check
  CHECK (status IN ('completed','pending','cancelled'));

CREATE INDEX IF NOT EXISTS idx_sales_product ON public.sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);


-- ============================================
-- 5) TABELA: expenses
-- ============================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  value DECIMAL(10,2) NOT NULL CHECK (value > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='expenses' AND column_name='description')
    THEN ALTER TABLE public.expenses ADD COLUMN description TEXT DEFAULT ''; END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);


-- ============================================
-- 6) ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses      ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='products' AND policyname='Allow all access to products')
    THEN CREATE POLICY "Allow all access to products" ON public.products FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='stock' AND policyname='Allow all access to stock')
    THEN CREATE POLICY "Allow all access to stock" ON public.stock FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='stock_entries' AND policyname='Allow all access to stock_entries')
    THEN CREATE POLICY "Allow all access to stock_entries" ON public.stock_entries FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='sales' AND policyname='Allow all access to sales')
    THEN CREATE POLICY "Allow all access to sales" ON public.sales FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='expenses' AND policyname='Allow all access to expenses')
    THEN CREATE POLICY "Allow all access to expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true); END IF;
END $$;


-- ============================================
-- 7) RECARREGAR CACHE DO PostgREST
--    (Resolve "Could not find the table ... in the schema cache")
-- ============================================
NOTIFY pgrst, 'reload schema';


-- ============================================
-- 8) EXCLUSÃO FORÇADA DE ENTRADAS
--    Permite excluir stock_entries mesmo com vendas vinculadas.
--    Ao excluir uma entrada, zera custo_unitario_snapshot das
--    vendas órfãs e recalcula o saldo de estoque.
-- ============================================

-- Função auxiliar: recalcula stock.quantidade somando remaining_quantity
CREATE OR REPLACE FUNCTION public.recompute_stock(p_product_id UUID, p_tamanho TEXT)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COALESCE(SUM(remaining_quantity), 0)
    INTO v_total
    FROM public.stock_entries
   WHERE product_id = p_product_id
     AND tamanho    = p_tamanho;

  UPDATE public.stock
     SET quantidade = v_total
   WHERE product_id = p_product_id
     AND tamanho    = p_tamanho;

  -- Cria linha de estoque se ainda não existir
  IF NOT FOUND THEN
    INSERT INTO public.stock (product_id, tamanho, quantidade)
    VALUES (p_product_id, p_tamanho, v_total)
    ON CONFLICT (product_id, tamanho) DO UPDATE SET quantidade = EXCLUDED.quantidade;
  END IF;
END;
$$;

-- Trigger que executa a exclusão forçada:
-- 1. Zera custo_unitario_snapshot das vendas vinculadas (evita órfãos)
-- 2. Recalcula estoque após deletar a entrada
CREATE OR REPLACE FUNCTION public.before_delete_stock_entry()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_consumed INTEGER;
BEGIN
  v_consumed := COALESCE(OLD.quantidade, 0) - COALESCE(OLD.remaining_quantity, 0);

  IF v_consumed > 0 THEN
    -- Zera snapshot de custo nas vendas do mesmo produto/tamanho
    -- que foram registradas após esta entrada (prováveis consumidoras FIFO)
    UPDATE public.sales
       SET custo_unitario_snapshot = 0
     WHERE product_id = OLD.product_id
       AND tamanho    = OLD.tamanho
       AND status     = 'completed'
       AND created_at >= OLD.created_at;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_before_delete_stock_entry ON public.stock_entries;
CREATE TRIGGER trg_before_delete_stock_entry
  BEFORE DELETE ON public.stock_entries
  FOR EACH ROW EXECUTE FUNCTION public.before_delete_stock_entry();

CREATE OR REPLACE FUNCTION public.after_delete_stock_entry()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.recompute_stock(OLD.product_id, OLD.tamanho);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_delete_stock_entry ON public.stock_entries;
CREATE TRIGGER trg_after_delete_stock_entry
  AFTER DELETE ON public.stock_entries
  FOR EACH ROW EXECUTE FUNCTION public.after_delete_stock_entry();


-- ============================================
-- 9) COLUNA stock_entry_id EM SALES
--    Vincula cada venda ao lote exato de origem.
-- ============================================

-- Adiciona a FK para o lote (nullable: vendas antigas ficam NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'sales'
      AND column_name  = 'stock_entry_id'
  ) THEN
    ALTER TABLE public.sales
      ADD COLUMN stock_entry_id UUID REFERENCES public.stock_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_stock_entry ON public.sales(stock_entry_id);

-- Atualiza o trigger de exclusão de lote para usar a FK direta
CREATE OR REPLACE FUNCTION public.before_delete_stock_entry()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Zera snapshot e desvincula vendas que referenciam este lote
  UPDATE public.sales
     SET custo_unitario_snapshot = 0,
         stock_entry_id          = NULL
   WHERE stock_entry_id = OLD.id;

  RETURN OLD;
END;
$$;


-- ============================================
-- 10) RECALCULAR remaining_quantity DOS LOTES EXISTENTES
--     (garante consistência em dados já cadastrados)
-- ============================================
DO $$
DECLARE
  r RECORD;
  v_vendido INTEGER;
BEGIN
  FOR r IN SELECT id, quantidade FROM public.stock_entries LOOP
    SELECT COALESCE(SUM(s.quantidade), 0)
      INTO v_vendido
      FROM public.sales s
     WHERE s.stock_entry_id = r.id
       AND s.status = 'completed';

    UPDATE public.stock_entries
       SET remaining_quantity = GREATEST(0, r.quantidade - v_vendido)
     WHERE id = r.id;
  END LOOP;
END $$;

-- Recalcula saldo consolidado em stock para todos os produtos/tamanhos
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT product_id, tamanho FROM public.stock_entries
  LOOP
    PERFORM public.recompute_stock(r.product_id, r.tamanho);
  END LOOP;
END $$;


-- ============================================
-- 11) VERIFICAÇÃO — deve listar todas as colunas esperadas
-- ============================================
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('products','stock','stock_entries','sales','expenses')
ORDER BY table_name, ordinal_position;

-- ============================================================
-- FIM — schema sincronizado com o frontend.
-- Se ainda assim vir "schema cache", dê F5 forte no navegador
-- ou espere ~10s (o PostgREST recarrega assincronamente).
-- ============================================================
