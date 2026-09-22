/*
# AMKS POS System - Complete Database Schema

## Overview
Creates the full schema for the AMKS by AMKAS International POS system.

## Tables
- products: Inventory items with barcode support
- sales: Completed sales/invoices
- sale_items: Line items for each sale (with snapshots for historical accuracy)
- inventory_movements: Audit trail for all stock changes
- settings: App configuration

## Security
- RLS enabled on all tables
- No auth/sign-in, policies use TO anon, authenticated (single-tenant shared data)
*/

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_name text NOT NULL,
  product_code text UNIQUE NOT NULL,
  barcode text UNIQUE NOT NULL,
  colour text DEFAULT '',
  quantity integer NOT NULL DEFAULT 0,
  normal_price numeric(12,2) NOT NULL DEFAULT 0,
  sale_price numeric(12,2),
  brand_name text NOT NULL DEFAULT 'AMKS',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE
  TO anon, authenticated USING (true);

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  invoice_printed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sales" ON sales;
CREATE POLICY "anon_select_sales" ON sales FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sales" ON sales;
CREATE POLICY "anon_insert_sales" ON sales FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_sales" ON sales;
CREATE POLICY "anon_update_sales" ON sales FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sales" ON sales;
CREATE POLICY "anon_delete_sales" ON sales FOR DELETE
  TO anon, authenticated USING (true);

-- Sale items table
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  article_name_snapshot text NOT NULL,
  product_code_snapshot text NOT NULL,
  barcode_snapshot text NOT NULL,
  colour_snapshot text DEFAULT '',
  quantity integer NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  price_type text NOT NULL DEFAULT 'normal',
  total numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sale_items" ON sale_items;
CREATE POLICY "anon_select_sale_items" ON sale_items FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sale_items" ON sale_items;
CREATE POLICY "anon_insert_sale_items" ON sale_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_sale_items" ON sale_items;
CREATE POLICY "anon_update_sale_items" ON sale_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sale_items" ON sale_items;
CREATE POLICY "anon_delete_sale_items" ON sale_items FOR DELETE
  TO anon, authenticated USING (true);

-- Inventory movements table
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  invoice_number text,
  previous_quantity integer NOT NULL,
  quantity_change integer NOT NULL,
  remaining_quantity integer NOT NULL,
  movement_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inventory_movements" ON inventory_movements;
CREATE POLICY "anon_select_inventory_movements" ON inventory_movements FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_inventory_movements" ON inventory_movements;
CREATE POLICY "anon_insert_inventory_movements" ON inventory_movements FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_inventory_movements" ON inventory_movements;
CREATE POLICY "anon_update_inventory_movements" ON inventory_movements FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_inventory_movements" ON inventory_movements;
CREATE POLICY "anon_delete_inventory_movements" ON inventory_movements FOR DELETE
  TO anon, authenticated USING (true);

-- Settings table (single row)
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL DEFAULT 'AMKS',
  company_name text NOT NULL DEFAULT 'AMKAS International',
  invoice_footer text NOT NULL DEFAULT 'AMKS by AMKAS International',
  low_stock_threshold integer NOT NULL DEFAULT 5,
  currency_symbol text NOT NULL DEFAULT 'Rs.',
  invoice_counter integer NOT NULL DEFAULT 0
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON settings;
CREATE POLICY "anon_select_settings" ON settings FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_settings" ON settings;
CREATE POLICY "anon_insert_settings" ON settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_settings" ON settings;
CREATE POLICY "anon_update_settings" ON settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_settings" ON settings;
CREATE POLICY "anon_delete_settings" ON settings FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements(created_at);

-- Insert default settings row
INSERT INTO settings (business_name, company_name, invoice_footer, low_stock_threshold, currency_symbol, invoice_counter)
SELECT 'AMKS', 'AMKAS International', 'AMKS by AMKAS International', 5, 'Rs.', 0
WHERE NOT EXISTS (SELECT 1 FROM settings LIMIT 1);

-- Insert demo products
INSERT INTO products (article_name, product_code, barcode, colour, quantity, normal_price, sale_price, brand_name)
SELECT 'Cotton Shirt', '0001', '200000000001', 'Black', 20, 3500.00, 2999.00, 'AMKS'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_code = '0001');

INSERT INTO products (article_name, product_code, barcode, colour, quantity, normal_price, sale_price, brand_name)
SELECT 'Cotton Shirt', '0002', '200000000002', 'White', 15, 3500.00, 2999.00, 'AMKS'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_code = '0002');

INSERT INTO products (article_name, product_code, barcode, colour, quantity, normal_price, sale_price, brand_name)
SELECT 'Mens Jacket', '0003', '200000000003', 'Navy', 10, 7500.00, 6999.00, 'AMKS'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE product_code = '0003');

-- Grant permissions to anon and authenticated roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.products TO anon, authenticated;
GRANT ALL ON TABLE public.sales TO anon, authenticated;
GRANT ALL ON TABLE public.sale_items TO anon, authenticated;
GRANT ALL ON TABLE public.inventory_movements TO anon, authenticated;
GRANT ALL ON TABLE public.settings TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

