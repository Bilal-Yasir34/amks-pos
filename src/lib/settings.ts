import { supabase } from './supabase';
import type { Settings } from '@/types';

const DEFAULT_SETTINGS: Settings = {
  id: '',
  business_name: 'AMKS',
  company_name: 'AMKAS International',
  invoice_footer: 'AMKS by AMKAS International',
  low_stock_threshold: 5,
  currency_symbol: 'Rs.',
  invoice_counter: 0,
};

let cachedSettings: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (cachedSettings) return cachedSettings;

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) return DEFAULT_SETTINGS;
  if (!data) return DEFAULT_SETTINGS;

  cachedSettings = data as Settings;
  return cachedSettings;
}

export async function updateSettings(updates: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  if (!current.id) {
    const { data, error } = await supabase
      .from('settings')
      .insert({
        business_name: updates.business_name ?? 'AMKS',
        company_name: updates.company_name ?? 'AMKAS International',
        invoice_footer: updates.invoice_footer ?? 'AMKS by AMKAS International',
        low_stock_threshold: updates.low_stock_threshold ?? 5,
        currency_symbol: updates.currency_symbol ?? 'Rs.',
        invoice_counter: 0,
      })
      .select()
      .single();
    if (error) throw error;
    cachedSettings = data as Settings;
    return cachedSettings;
  }

  const { data, error } = await supabase
    .from('settings')
    .update(updates)
    .eq('id', current.id)
    .select()
    .single();

  if (error) throw error;
  cachedSettings = data as Settings;
  return cachedSettings;
}

export function clearSettingsCache(): void {
  cachedSettings = null;
}

export function getCurrencySymbol(): string {
  return cachedSettings?.currency_symbol ?? 'Rs.';
}
