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
-- 8) VERIFICAÇÃO — deve listar todas as colunas esperadas
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
