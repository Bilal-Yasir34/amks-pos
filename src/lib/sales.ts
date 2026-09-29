import { supabase } from './supabase';
import { getSettings, updateSettings } from './settings';
import { generateInvoiceNumber } from './format';
import type { CartItem, Sale, SaleItem, InventoryMovement } from '@/types';

export interface CustomerCheckoutInput {
  name?: string;
  phone?: string;
  city?: string;
  address?: string;
}

export async function completeSale(
  cart: CartItem[],
  customerInput?: CustomerCheckoutInput | null
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

  // Process customer record if provided
  let customerId: string | null = null;
  const custName = customerInput?.name?.trim() || '';
  const custPhone = customerInput?.phone?.trim() || '';
  const custCity = customerInput?.city?.trim() || '';
  const custAddress = customerInput?.address?.trim() || '';

  if (custName || custPhone) {
    try {
      let existingCustomer: any = null;
      if (custPhone) {
        const { data } = await supabase
          .from('customers')
          .select('id, name, city, address, phone')
          .eq('phone', custPhone)
          .maybeSingle();
        existingCustomer = data;
      }
      if (!existingCustomer && custName) {
        const { data } = await supabase
          .from('customers')
          .select('id, name, city, address, phone')
          .eq('name', custName)
          .maybeSingle();
        existingCustomer = data;
      }

      if (existingCustomer) {
        customerId = existingCustomer.id;
        const updates: any = {};
        if (custName && existingCustomer.name !== custName) updates.name = custName;
        if (custCity && !existingCustomer.city) updates.city = custCity;
        if (custAddress && !existingCustomer.address) updates.address = custAddress;
        if (custPhone && !existingCustomer.phone) updates.phone = custPhone;
        if (Object.keys(updates).length > 0) {
          await supabase.from('customers').update(updates).eq('id', customerId);
        }
      } else {
        const { data: newCust, error: custErr } = await supabase
          .from('customers')
          .insert({
            name: custName || 'Valued Customer',
            phone: custPhone,
            city: custCity,
            address: custAddress,
          })
          .select('id')
          .single();

        if (!custErr && newCust) {
          customerId = newCust.id;
        }
      }
    } catch (custError) {
      console.warn('Customer record creation/lookup encountered an issue:', custError);
    }
  }

  // Insert the sale
  const saleInsertPayload: any = {
    invoice_number: invoiceNumber,
    subtotal,
    total,
    invoice_printed: false,
    status: 'completed',
    customer_id: customerId,
    customer_name: custName || null,
    customer_phone: custPhone || null,
    customer_city: custCity || null,
    customer_address: custAddress || null,
  };

  let { data: saleData, error: saleError } = await supabase
    .from('sales')
    .insert(saleInsertPayload)
    .select()
    .single();

  // Graceful fallback if database sales table hasn't added customer columns yet
  if (saleError && (saleError.message?.toLowerCase().includes('customer') || saleError.code === 'PGRST204')) {
    console.warn('Sales table does not have customer columns yet, falling back to base insert:', saleError.message);
    const { customer_id, customer_name, customer_phone, customer_city, customer_address, ...basePayload } = saleInsertPayload;
    const retry = await supabase.from('sales').insert(basePayload).select().single();
    saleData = retry.data;
    saleError = retry.error;
    if (saleData) {
      saleData.customer_id = customerId;
      saleData.customer_name = custName;
      saleData.customer_phone = custPhone;
      saleData.customer_city = custCity;
      saleData.customer_address = custAddress;
    }
  }

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
