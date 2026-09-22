import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLocalClient } from './localClient';

const getEnvOrStorage = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return String(import.meta.env[key]).trim();
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return (localStorage.getItem(key) || '').trim();
  }
  return '';
};

export const supabaseUrl = getEnvOrStorage('VITE_SUPABASE_URL');
export const supabaseAnonKey = getEnvOrStorage('VITE_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('placeholder')
);

const realClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    })
  : null;

const localClient = createLocalClient();

export const supabase: SupabaseClient = (realClient || localClient) as unknown as SupabaseClient;

export function saveSupabaseConfig(url: string, key: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('VITE_SUPABASE_URL', url.trim());
    localStorage.setItem('VITE_SUPABASE_ANON_KEY', key.trim());
    window.location.reload();
  }
}

export function clearSupabaseConfig() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('VITE_SUPABASE_URL');
    localStorage.removeItem('VITE_SUPABASE_ANON_KEY');
    window.location.reload();
  }
}
