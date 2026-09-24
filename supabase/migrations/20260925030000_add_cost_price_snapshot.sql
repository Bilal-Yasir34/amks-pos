-- Migration to add cost_price_snapshot to sale_items if not present
ALTER TABLE IF EXISTS public.sale_items ADD COLUMN IF NOT EXISTS cost_price_snapshot numeric(12,2);
GRANT ALL ON TABLE public.sale_items TO anon, authenticated;
