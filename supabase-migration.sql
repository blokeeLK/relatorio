-- ============================================================
-- MIGRATION IDEMPOTENTE - ERP Atacado
-- Autor: correção de divergência custo_unitario_snapshot
-- Execute no SQL Editor do Supabase
-- Seguro para rodar múltiplas vezes (idempotente)
-- ============================================================

-- ============================================================
-- STEP 1: Remover coluna fantasma custo_unitario_snapshot
-- (adicionada por engano em versões antigas do código)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'sales'
      AND column_name  = 'custo_unitario_snapshot'
  ) THEN
    ALTER TABLE sales DROP COLUMN custo_unitario_snapshot;
    RAISE NOTICE 'Coluna custo_unitario_snapshot removida de sales';
  ELSE
    RAISE NOTICE 'custo_unitario_snapshot não encontrada em sales (ok)';
  END IF;
END $$;

-- ============================================================
-- STEP 2: Remover outras colunas órfãs comuns em versões antigas
-- (cost_snapshot, unit_cost_at_sale, lucro_unitario, etc.)
-- ============================================================
DO $$
DECLARE
  orphan_cols TEXT[] := ARRAY[
    'cost_snapshot', 'unit_cost_at_sale', 'custo_snapshot',
    'lucro_unitario', 'profit_snapshot', 'cost_at_sale'
  ];
  col TEXT;
BEGIN
  FOREACH col IN ARRAY orphan_cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'sales'
        AND column_name  = col
    ) THEN
      EXECUTE format('ALTER TABLE sales DROP COLUMN %I', col);
      RAISE NOTICE 'Coluna órfã % removida de sales', col;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- STEP 3: Garantir que tabela products existe corretamente
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  modelo TEXT DEFAULT '',
  cor TEXT DEFAULT '',
  sku TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir colunas obrigatórias
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='modelo') THEN
    ALTER TABLE products ADD COLUMN modelo TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='cor') THEN
    ALTER TABLE products ADD COLUMN cor TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='sku') THEN
    ALTER TABLE products ADD COLUMN sku TEXT DEFAULT '';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku != '';

-- ============================================================
-- STEP 4: Garantir que tabela stock existe corretamente
-- ============================================================
CREATE TABLE IF NOT EXISTS stock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL CHECK (size IN ('P', 'M', 'G', 'GG')),
  quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
  average_cost DECIMAL(10,2) DEFAULT 0,
  UNIQUE(product_id, size)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock' AND column_name='average_cost') THEN
    ALTER TABLE stock ADD COLUMN average_cost DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_product_id ON stock(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_low ON stock(quantity) WHERE quantity < 10 AND quantity > 0;

-- ============================================================
-- STEP 5: Garantir que tabela stock_entries existe corretamente
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL CHECK (size IN ('P', 'M', 'G', 'GG')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_entries' AND column_name='unit_cost') THEN
    ALTER TABLE stock_entries ADD COLUMN unit_cost DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_entries_product ON stock_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_entries_date ON stock_entries(created_at);

-- ============================================================
-- STEP 6: Garantir que tabela sales existe corretamente
-- Schema canônico: sem custo_unitario_snapshot ou similares
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL CHECK (size IN ('P', 'M', 'G', 'GG')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) DEFAULT 0,
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  payment_method TEXT DEFAULT 'pix',
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir colunas obrigatórias em sales
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='discount') THEN
    ALTER TABLE sales ADD COLUMN discount DECIMAL(10,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='customer_name') THEN
    ALTER TABLE sales ADD COLUMN customer_name TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='customer_phone') THEN
    ALTER TABLE sales ADD COLUMN customer_phone TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='payment_method') THEN
    ALTER TABLE sales ADD COLUMN payment_method TEXT DEFAULT 'pix';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='status') THEN
    ALTER TABLE sales ADD COLUMN status TEXT DEFAULT 'completed';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

-- ============================================================
-- STEP 7: Garantir que tabela expenses existe corretamente
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  value DECIMAL(10,2) NOT NULL CHECK (value > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='description') THEN
    ALTER TABLE expenses ADD COLUMN description TEXT DEFAULT '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- ============================================================
-- STEP 8: Row Level Security (RLS)
-- ============================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Policies permissivas para acesso anônimo
-- (DROP IF EXISTS + CREATE para idempotência)
DO $$
BEGIN
  -- products
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='Allow all access to products') THEN
    CREATE POLICY "Allow all access to products" ON products FOR ALL USING (true) WITH CHECK (true);
  END IF;
  -- stock
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stock' AND policyname='Allow all access to stock') THEN
    CREATE POLICY "Allow all access to stock" ON stock FOR ALL USING (true) WITH CHECK (true);
  END IF;
  -- stock_entries
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stock_entries' AND policyname='Allow all access to stock_entries') THEN
    CREATE POLICY "Allow all access to stock_entries" ON stock_entries FOR ALL USING (true) WITH CHECK (true);
  END IF;
  -- sales
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sales' AND policyname='Allow all access to sales') THEN
    CREATE POLICY "Allow all access to sales" ON sales FOR ALL USING (true) WITH CHECK (true);
  END IF;
  -- expenses
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='expenses' AND policyname='Allow all access to expenses') THEN
    CREATE POLICY "Allow all access to expenses" ON expenses FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- STEP 9: Verificação final - listar colunas da tabela sales
-- ============================================================
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sales'
ORDER BY ordinal_position;

-- ============================================================
-- FIM DA MIGRATION
-- Schema canônico após execução:
--   products  : id, nome, modelo, cor, sku, created_at
--   stock     : id, product_id, size, quantity, average_cost
--   stock_entries: id, product_id, size, quantity, unit_cost, created_at
--   sales     : id, product_id, size, quantity, unit_price, discount,
--               customer_name, customer_phone, payment_method, status, created_at
--   expenses  : id, category, description, value, created_at
-- ============================================================
