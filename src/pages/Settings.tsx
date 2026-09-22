import { useState, useEffect } from 'react';
import { Save, CheckCircle } from 'lucide-react';
import { getSettings, updateSettings, clearSettingsCache } from '@/lib/settings';
import type { Settings as SettingsType } from '@/types';

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateSettings({
        business_name: settings.business_name,
        company_name: settings.company_name,
        invoice_footer: settings.invoice_footer,
        low_stock_threshold: settings.low_stock_threshold,
        currency_symbol: settings.currency_symbol,
      });
      setSettings(updated);
      clearSettingsCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <div className="text-center py-12 text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure your AMKS POS system</p>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        {saved && (
          <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle size={16} /> Settings saved successfully.
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
          <input
            type="text"
            value={settings.business_name}
            onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
          <input
            type="text"
            value={settings.company_name}
            onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Footer</label>
          <input
            type="text"
            value={settings.invoice_footer}
            onChange={(e) => setSettings({ ...settings, invoice_footer: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Low Stock Threshold</label>
          <input
            type="number"
            value={settings.low_stock_threshold}
            onChange={(e) =>
              setSettings({ ...settings, low_stock_threshold: parseInt(e.target.value, 10) || 0 })
            }
            min="0"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 mt-1">
            Products with stock at or below this number will be marked as low stock.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Currency Symbol</label>
          <input
            type="text"
            value={settings.currency_symbol}
            onChange={(e) => setSettings({ ...settings, currency_symbol: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:bg-slate-300 flex items-center gap-2"
          >
            <Save size={18} /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
