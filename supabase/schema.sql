-- ============================================================
-- HONESTY STORE - PRODUCTION SUPABASE DATABASE SCHEMA (IDEMPOTENT)
-- Safe to re-run multiple times without errors
-- Compatible with Supabase PostgreSQL, Auth, and Realtime
-- ============================================================

-- 1. STORES TABLE
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    variant TEXT,
    category TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    stock INTEGER DEFAULT 0,
    expected_stock INTEGER DEFAULT 0,
    physical_stock INTEGER DEFAULT 0,
    image_url TEXT,
    low_stock_threshold INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CUSTOMER PROFILES (Linked to Phone Number Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone TEXT UNIQUE NOT NULL,
    full_name TEXT,
    trust_score NUMERIC(5, 2) DEFAULT 100.00,
    total_orders INTEGER DEFAULT 0,
    total_spent NUMERIC(10, 2) DEFAULT 0.00,
    pledge_signed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ORDERS TABLE (Cashfree Payment Linked)
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY, -- e.g. HS10452
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    customer_phone TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    item_count INTEGER NOT NULL,
    items JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'Paid', -- 'Pending', 'Paid', 'Failed', 'Refunded'
    payment_method TEXT DEFAULT 'UPI',
    payment_gateway TEXT DEFAULT 'Cashfree',
    cashfree_order_id TEXT,
    cashfree_payment_id TEXT,
    time_label TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. STOCK AUDIT LOGS (Reconciliation History)
CREATE TABLE IF NOT EXISTS public.stock_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
    expected_units INTEGER NOT NULL,
    physical_units INTEGER NOT NULL,
    discrepancy INTEGER NOT NULL, -- physical - expected
    shrinkage_value NUMERIC(10, 2) NOT NULL,
    audit_note TEXT,
    audited_by TEXT DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. COMMUNITY / TELEMETRY METRICS
CREATE TABLE IF NOT EXISTS public.community_metrics (
    date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
    sales_today NUMERIC(10, 2) DEFAULT 0.00,
    store_visits INTEGER DEFAULT 0,
    completed_payments INTEGER DEFAULT 0,
    pledges_count INTEGER DEFAULT 0
);

-- ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_metrics ENABLE ROW LEVEL SECURITY;

-- SAFE POLICIES (Drop existing policies first so script can be safely re-run)
DROP POLICY IF EXISTS "Public can view active stores" ON public.stores;
CREATE POLICY "Public can view active stores" ON public.stores FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products" ON public.products FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Allow public read community metrics" ON public.community_metrics;
CREATE POLICY "Allow public read community metrics" ON public.community_metrics FOR SELECT USING (true);

DROP POLICY IF EXISTS "Customers can read own profile" ON public.profiles;
CREATE POLICY "Customers can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Customers can update own profile" ON public.profiles;
CREATE POLICY "Customers can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Customers can read own orders" ON public.orders;
CREATE POLICY "Customers can read own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id OR customer_phone = (auth.jwt() ->> 'phone'));

DROP POLICY IF EXISTS "Service role or checkout can insert orders" ON public.orders;
CREATE POLICY "Service role or checkout can insert orders" ON public.orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update stock on products" ON public.products;
CREATE POLICY "Allow update stock on products" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- ENABLE SUPABASE REALTIME (IDEMPOTENT CHECK)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'products'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'community_metrics'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.community_metrics;
    END IF;
END $$;

-- SEED INITIAL STORE PRODUCTS
INSERT INTO public.products (id, name, variant, category, price, stock, expected_stock, physical_stock, image_url, low_stock_threshold)
VALUES 
    ('lays', 'Lays', 'Classic Potato Chips', 'Chips', 20.00, 18, 18, 15, 'assets/lays.png', 5),
    ('oreo', 'Oreo', 'Chocolate Sandwich Cookies', 'Biscuits', 30.00, 3, 3, 3, 'assets/oreo.png', 5),
    ('parleg', 'Parle-G', 'Glucose Biscuits', 'Biscuits', 10.00, 25, 25, 25, 'assets/parleg.png', 5),
    ('dairymilk', 'Dairy Milk', 'Milk Chocolate Bar', 'Chocolates', 20.00, 0, 0, 0, 'assets/dairymilk.png', 3)
ON CONFLICT (id) DO UPDATE 
SET stock = EXCLUDED.stock, expected_stock = EXCLUDED.expected_stock, physical_stock = EXCLUDED.physical_stock;

-- SEED INITIAL COMMUNITY METRICS
INSERT INTO public.community_metrics (date, sales_today, store_visits, completed_payments, pledges_count)
VALUES (CURRENT_DATE, 1620.00, 127, 81, 342)
ON CONFLICT (date) DO NOTHING;
