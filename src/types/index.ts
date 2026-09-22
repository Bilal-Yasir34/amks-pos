export interface Product {
  id: string;
  article_name: string;
  product_code: string;
  barcode: string;
  colour: string;
  quantity: number;
  normal_price: number;
  sale_price: number | null;
  brand_name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  invoice_number: string;
  subtotal: number;
  total: number;
  invoice_printed: boolean;
  status: string;
  created_at: string;
  item_count?: number;
  total_quantity?: number;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  article_name_snapshot: string;
  product_code_snapshot: string;
  barcode_snapshot: string;
  colour_snapshot: string;
  quantity: number;
  unit_price: number;
  price_type: string;
  total: number;
  created_at: string;
}

export interface SaleWithItems extends Sale {
  sale_items: SaleItem[];
}

export interface InventoryMovement {
  id: string;
  product_id: string;
  invoice_number: string | null;
  previous_quantity: number;
  quantity_change: number;
  remaining_quantity: number;
  movement_type: string;
  created_at: string;
}

export interface Settings {
  id: string;
  business_name: string;
  company_name: string;
  invoice_footer: string;
  low_stock_threshold: number;
  currency_symbol: string;
  invoice_counter: number;
}

export interface CartItem {
  product_id: string;
  article_name: string;
  product_code: string;
  barcode: string;
  colour: string;
  unit_price: number;
  price_type: 'sale' | 'normal';
  quantity: number;
  available_stock: number;
}

export type Page = 'dashboard' | 'pos' | 'products' | 'barcodes' | 'sales' | 'settings';
