-- ============================================================
-- HONESTY STORE - FIX ROW LEVEL SECURITY (RLS) POLICIES
-- Run this script in your Supabase SQL Editor:
-- Supabase Dashboard > SQL Editor > New Query > Paste & Run
-- ============================================================

-- 1. PRODUCTS TABLE POLICIES
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select products" ON public.products;
DROP POLICY IF EXISTS "Allow public insert products" ON public.products;
DROP POLICY IF EXISTS "Allow public update products" ON public.products;
DROP POLICY IF EXISTS "Allow update stock on products" ON public.products;
DROP POLICY IF EXISTS "Public can view active products" ON public.products;

CREATE POLICY "Allow public select products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Allow public insert products" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update products" ON public.products FOR UPDATE USING (true) WITH CHECK (true);

-- 2. ORDERS TABLE POLICIES
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public update orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can read own orders" ON public.orders;
DROP POLICY IF EXISTS "Service role or checkout can insert orders" ON public.orders;

CREATE POLICY "Allow public select orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Allow public insert orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update orders" ON public.orders FOR UPDATE USING (true) WITH CHECK (true);

-- 3. PROFILES TABLE POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Customers can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Customers can update own profile" ON public.profiles;

CREATE POLICY "Allow public select profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow public insert profiles" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update profiles" ON public.profiles FOR UPDATE USING (true) WITH CHECK (true);

-- 4. STOCK AUDITS TABLE POLICIES
ALTER TABLE public.stock_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select stock_audits" ON public.stock_audits;
DROP POLICY IF EXISTS "Allow public insert stock_audits" ON public.stock_audits;

CREATE POLICY "Allow public select stock_audits" ON public.stock_audits FOR SELECT USING (true);
CREATE POLICY "Allow public insert stock_audits" ON public.stock_audits FOR INSERT WITH CHECK (true);

-- 5. COMMUNITY METRICS TABLE POLICIES
ALTER TABLE public.community_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select community_metrics" ON public.community_metrics;
DROP POLICY IF EXISTS "Allow public insert community_metrics" ON public.community_metrics;
DROP POLICY IF EXISTS "Allow public update community_metrics" ON public.community_metrics;
DROP POLICY IF EXISTS "Allow public read community metrics" ON public.community_metrics;

CREATE POLICY "Allow public select community_metrics" ON public.community_metrics FOR SELECT USING (true);
CREATE POLICY "Allow public insert community_metrics" ON public.community_metrics FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update community_metrics" ON public.community_metrics FOR UPDATE USING (true) WITH CHECK (true);
