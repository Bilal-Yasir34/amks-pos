/*
# AMKS POS System - Supplier Payments (Purchase Vouchers Ledger) Schema

## Overview
Adds supplier_payments table for tracking purchase voucher disbursements and payment settlements.

## Table
- supplier_payments: Tracks payment installments made to suppliers against goods purchased
*/

-- Create supplier_payments table
CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL DEFAULT 'Cash',
  payment_date timestamptz NOT NULL DEFAULT now(),
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_supplier_payments" ON supplier_payments;
CREATE POLICY "anon_select_supplier_payments" ON supplier_payments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_supplier_payments" ON supplier_payments;
CREATE POLICY "anon_insert_supplier_payments" ON supplier_payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_supplier_payments" ON supplier_payments;
CREATE POLICY "anon_update_supplier_payments" ON supplier_payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_supplier_payments" ON supplier_payments;
CREATE POLICY "anon_delete_supplier_payments" ON supplier_payments FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_payment_date ON supplier_payments(payment_date);

-- Permissions
GRANT ALL ON TABLE public.supplier_payments TO anon, authenticated;
