import { supabase } from './supabase';
import { getSettings, updateSettings } from './settings';
import { generateInvoiceNumber } from './format';
import type { CartItem, Sale, SaleItem, InventoryMovement } from '@/types';

export async function completeSale(
  cart: CartItem[]
): Promise<{ sale: Sale; items: SaleItem[] }> {
  if (!cart.length) {
    throw new Error('Cart is empty. Add products before completing the sale.');
  }

  // Validate inventory for all items
  for (const item of cart) {
    const { data: product, error } = await supabase
      .from('products')
      .select('id, quantity')
      .eq('id', item.product_id)
      .single();

    if (error) throw new Error('Unable to verify product inventory. Please try again.');
    if (!product) throw new Error(`Product ${item.article_name} not found.`);
    if (product.quantity < item.quantity) {
      throw new Error(
        `Insufficient stock for ${item.article_name}. Only ${product.quantity} units are available.`
      );
    }
  }

  // Generate invoice number atomically
  const settings = await getSettings();
  const invoiceNumber = generateInvoiceNumber(settings.invoice_counter);

  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const total = subtotal;

  // Insert the sale
  const { data: saleData, error: saleError } = await supabase
    .from('sales')
    .insert({
      invoice_number: invoiceNumber,
      subtotal,
      total,
      invoice_printed: false,
      status: 'completed',
    })
    .select()
    .single();

  if (saleError) {
    if (saleError.code === '23505') {
      // Unique constraint violation - invoice number collision, retry
      await updateSettings({ invoice_counter: settings.invoice_counter + 1 });
      throw new Error('Invoice number conflict. Please try again.');
    }
    throw new Error('Failed to create sale record. Please try again.');
  }

  const sale = saleData as Sale;

  // Insert sale items
  const saleItemsData = cart.map((item) => ({
    sale_id: sale.id,
    product_id: item.product_id,
    article_name_snapshot: item.article_name,
    product_code_snapshot: item.product_code,
    barcode_snapshot: item.barcode,
    colour_snapshot: item.colour,
    quantity: item.quantity,
    unit_price: item.unit_price,
    cost_price_snapshot: item.cost_price ?? null,
    price_type: item.price_type,
    total: item.unit_price * item.quantity,
  }));

  let insertedItems: any = null;
  let itemsError: any = null;

  // Attempt insert with cost_price_snapshot
  const primaryResult = await supabase
    .from('sale_items')
    .insert(saleItemsData)
    .select();

  insertedItems = primaryResult.data;
  itemsError = primaryResult.error;

  // If primary insert fails (e.g. database schema has not added cost_price_snapshot column yet), retry without it
  if (itemsError) {
    console.warn('Initial sale_items insert failed, retrying without cost_price_snapshot:', itemsError.message);
    const fallbackData = saleItemsData.map(({ cost_price_snapshot, ...rest }) => rest);
    const fallbackResult = await supabase
      .from('sale_items')
      .insert(fallbackData)
      .select();

    if (!fallbackResult.error) {
      insertedItems = fallbackResult.data;
      itemsError = null;
    } else {
      console.error('Fallback sale_items insert also failed:', fallbackResult.error);
      itemsError = fallbackResult.error;
    }
  }

  if (itemsError) {
    // Rollback: delete the sale (cascade will delete items if any)
    await supabase.from('sales').delete().eq('id', sale.id);
    throw new Error(`Failed to save sale items: ${itemsError.message || 'Please try again.'}`);
  }

  // Decrement inventory and record movements
  for (const item of cart) {
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('quantity')
      .eq('id', item.product_id)
      .single();

    if (fetchError || !product) {
      await supabase.from('sales').delete().eq('id', sale.id);
      throw new Error(`Failed to fetch inventory for ${item.article_name}. Sale cancelled.`);
    }

    const previousQuantity = product.quantity;
    const newQuantity = previousQuantity - item.quantity;

    const { error: updateError } = await supabase
      .from('products')
      .update({
        quantity: newQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.product_id);

    if (updateError) {
      await supabase.from('sales').delete().eq('id', sale.id);
      throw new Error(`Failed to update inventory for ${item.article_name}. Sale cancelled.`);
    }

    // Record inventory movement
    const movement: Omit<InventoryMovement, 'id' | 'created_at'> = {
      product_id: item.product_id,
      invoice_number: invoiceNumber,
      previous_quantity: previousQuantity,
      quantity_change: -item.quantity,
      remaining_quantity: newQuantity,
      movement_type: 'SALE',
    };

    const { error: movementError } = await supabase
      .from('inventory_movements')
      .insert(movement);

    if (movementError) {
      // Movement recording failed, but sale + inventory are done
      // Log but don't fail the sale
      console.error('Failed to record inventory movement:', movementError);
    }
  }

  // Increment invoice counter
  await updateSettings({ invoice_counter: settings.invoice_counter + 1 });

  return { sale, items: insertedItems as SaleItem[] };
}

export async function markInvoicePrinted(saleId: string): Promise<void> {
  const { error } = await supabase
    .from('sales')
    .update({ invoice_printed: true })
    .eq('id', saleId);

  if (error) throw new Error('Failed to update invoice printed status.');
}

export async function adjustStock(
  productId: string,
  change: number,
  movementType: 'MANUAL_INCREASE' | 'MANUAL_DECREASE' | 'INITIAL_STOCK'
): Promise<void> {
  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('quantity')
    .eq('id', productId)
    .single();

  if (fetchError || !product) {
    throw new Error('Product not found.');
  }

  const previousQuantity = product.quantity;
  const newQuantity = previousQuantity + change;

  if (newQuantity < 0) {
    throw new Error('Cannot reduce stock below zero.');
  }

  const { error: updateError } = await supabase
    .from('products')
    .update({
      quantity: newQuantity,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId);

  if (updateError) throw new Error('Failed to update stock.');

  const { error: movementError } = await supabase
    .from('inventory_movements')
    .insert({
      product_id: productId,
      previous_quantity: previousQuantity,
      quantity_change: change,
      remaining_quantity: newQuantity,
      movement_type: movementType,
    });

  if (movementError) {
    console.error('Failed to record inventory movement:', movementError);
  }
}
