/*
# AMKS POS - Customers Schema Migration

Creates the customers table to store customer name, phone number, city, and address.
Also links customer information to sales records.
*/

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_city ON public.customers(city);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_customers" ON public.customers;
CREATE POLICY "anon_select_customers" ON public.customers FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_customers" ON public.customers;
CREATE POLICY "anon_insert_customers" ON public.customers FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_customers" ON public.customers;
CREATE POLICY "anon_update_customers" ON public.customers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_customers" ON public.customers;
CREATE POLICY "anon_delete_customers" ON public.customers FOR DELETE
  TO anon, authenticated USING (true);

-- Add customer columns to sales table
ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS customer_city text;
ALTER TABLE IF EXISTS public.sales ADD COLUMN IF NOT EXISTS customer_address text;

-- Grant permissions to public roles
GRANT ALL ON TABLE public.customers TO anon, authenticated;
GRANT ALL ON TABLE public.sales TO anon, authenticated;
