/*
# AMKS POS System - Suppliers Table & Product Procurement Schema

## Overview
Adds the suppliers table and links products to their procurement suppliers and costs.

## Tables
- suppliers: Dedicated table for vendor/procurement entities
- products: Added columns for supplier reference and procurement cost tracking

## Security
- RLS enabled with permissive anon/authenticated policies matching rest of AMKS POS
*/

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_suppliers" ON suppliers;
CREATE POLICY "anon_select_suppliers" ON suppliers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_suppliers" ON suppliers;
CREATE POLICY "anon_insert_suppliers" ON suppliers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_suppliers" ON suppliers;
CREATE POLICY "anon_update_suppliers" ON suppliers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_suppliers" ON suppliers;
CREATE POLICY "anon_delete_suppliers" ON suppliers FOR DELETE
  TO anon, authenticated USING (true);

-- Add procurement/supplier fields to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_quantity integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_cost numeric(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price numeric(12,2);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_city ON suppliers(city);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);

-- Permissions
GRANT ALL ON TABLE public.suppliers TO anon, authenticated;
