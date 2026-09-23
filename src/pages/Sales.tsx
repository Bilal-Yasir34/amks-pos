import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Eye,
  Printer,
  X,
  CheckCircle,
  Circle,
  Calendar,
  DollarSign,
  ShoppingBag,
  Receipt,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { formatPrice, formatDateTime, formatDate } from '@/lib/format';
import { markInvoicePrinted } from '@/lib/sales';
import { PosReceipt as InvoiceContent } from '@/components/PosReceipt';
import type { Sale, SaleItem, SaleWithItems, Settings } from '@/types';

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function Sales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<'all' | 'today' | 'yesterday' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [viewingSale, setViewingSale] = useState<SaleWithItems | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('sales')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply search filter
    if (search.trim()) {
      query = query.or(`invoice_number.ilike.%${search}%`);
    }

    // Determine target date string based on active mode
    let targetDateStr: string | null = null;
    if (dateFilterMode === 'today') {
      targetDateStr = getLocalDateString(new Date());
    } else if (dateFilterMode === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      targetDateStr = getLocalDateString(yesterday);
    } else if (dateFilterMode === 'custom' && customDate) {
      targetDateStr = customDate;
    }

    if (targetDateStr) {
      const [year, month, day] = targetDateStr.split('-').map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      query = query
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString());
    } else {
      query = query.limit(200);
    }

    const { data } = await query;
    if (data) {
      const salesList = data as Sale[];
      const saleIds = salesList.map((s) => s.id);

      let countsMap = new Map<string, { items: number; quantity: number }>();
      if (saleIds.length > 0) {
        const { data: allItems } = await supabase
          .from('sale_items')
          .select('sale_id, quantity')
          .in('sale_id', saleIds);

        if (allItems) {
          for (const item of allItems) {
            const current = countsMap.get(item.sale_id) || { items: 0, quantity: 0 };
            current.items += 1;
            current.quantity += Number(item.quantity) || 0;
            countsMap.set(item.sale_id, current);
          }
        }
      }

      const enrichedSales: Sale[] = salesList.map((sale) => {
        const count = countsMap.get(sale.id);
        return {
          ...sale,
          item_count: count?.items ?? 0,
          total_quantity: count?.quantity ?? 0,
        };
      });

      setSales(enrichedSales);
    } else {
      setSales([]);
    }
    setLoading(false);
  }, [search, dateFilterMode, customDate]);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadSales(), 300);
    return () => clearTimeout(timer);
  }, [loadSales]);

  async function viewSale(saleId: string) {
    const { data: items } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', saleId);

    const sale = sales.find((s) => s.id === saleId);
    if (sale && items) {
      setViewingSale({ ...sale, sale_items: items as SaleItem[] });
    }
  }

  async function handlePrint(sale: Sale) {
    await viewSale(sale.id);
    setTimeout(() => {
      markInvoicePrinted(sale.id).then(() => {
        loadSales();
      });
      window.print();
    }, 300);
  }

  // Calculate summary metrics
  const currencySymbol = settings?.currency_symbol ?? 'Rs.';
  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const totalItemsSold = sales.reduce(
    (sum, s) => sum + (s.total_quantity || s.item_count || 0),
    0
  );
  const totalOrders = sales.length;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const printedOrders = sales.filter((s) => s.invoice_printed).length;

  // Active filter label
  let activeFilterLabel = 'All Time';
  if (dateFilterMode === 'today') {
    activeFilterLabel = `Today (${formatDate(new Date().toISOString())})`;
  } else if (dateFilterMode === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    activeFilterLabel = `Yesterday (${formatDate(yesterday.toISOString())})`;
  } else if (dateFilterMode === 'custom' && customDate) {
    const [y, m, d] = customDate.split('-').map(Number);
    activeFilterLabel = formatDate(new Date(y, m - 1, d).toISOString());
  }

  return (
    <>
      <div className={`max-w-7xl mx-auto ${viewingSale ? 'print:hidden' : ''}`}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sales & Invoices</h1>
            <p className="text-sm text-slate-500 mt-1">
              View sales analytics, filter by custom date, and reprint invoices
            </p>
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('all');
                setCustomDate('');
              }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                dateFilterMode === 'all'
                  ? 'bg-white text-blue-600 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => setDateFilterMode('today')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                dateFilterMode === 'today'
                  ? 'bg-white text-blue-600 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilterMode('yesterday')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                dateFilterMode === 'yesterday'
                  ? 'bg-white text-blue-600 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('custom');
                if (!customDate) {
                  setCustomDate(getLocalDateString(new Date()));
                }
              }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                dateFilterMode === 'custom'
                  ? 'bg-white text-blue-600 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Calendar size={13} />
              <span>Custom Date</span>
            </button>
          </div>
        </div>

        {/* Date Filter & Search Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice number..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
            />
          </div>

          {/* Custom Date Picker control */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white px-3 py-2 border border-gray-300 rounded-xl shadow-xs">
              <Calendar size={16} className="text-slate-400 shrink-0" />
              <input
                type="date"
                value={
                  dateFilterMode === 'custom'
                    ? customDate
                    : dateFilterMode === 'today'
                    ? getLocalDateString(new Date())
                    : dateFilterMode === 'yesterday'
                    ? (() => {
                        const y = new Date();
                        y.setDate(y.getDate() - 1);
                        return getLocalDateString(y);
                      })()
                    : ''
                }
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  setDateFilterMode('custom');
                }}
                className="text-xs font-medium text-slate-800 focus:outline-none bg-transparent cursor-pointer"
                title="Pick custom date"
              />
            </div>

            {dateFilterMode !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setDateFilterMode('all');
                  setCustomDate('');
                }}
                className="p-2.5 text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-50 border border-gray-300 rounded-xl shadow-xs transition-colors cursor-pointer"
                title="Clear date filter"
              >
                <RotateCcw size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Summary Performance Metric Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total Revenue Card */}
          <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs hover:border-emerald-200 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Revenue
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatPrice(totalRevenue, currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              From {totalOrders} {totalOrders === 1 ? 'sale' : 'sales'}
            </p>
          </div>

          {/* Total Items Sold Card */}
          <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs hover:border-blue-200 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Items Sold
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <ShoppingBag size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {totalItemsSold.toLocaleString()}{' '}
              <span className="text-sm font-semibold text-slate-500">units</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Total quantity across items
            </p>
          </div>

          {/* Total Invoices / Orders Card */}
          <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs hover:border-purple-200 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Invoices / Orders
              </span>
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Receipt size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {totalOrders.toLocaleString()}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {printedOrders} printed receipts
            </p>
          </div>

          {/* Average Order Value Card */}
          <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs hover:border-amber-200 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Avg. Sale Value
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <TrendingUp size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatPrice(avgOrderValue, currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Average per customer order
            </p>
          </div>
        </div>

        {/* Active Filter Banner */}
        {dateFilterMode !== 'all' && (
          <div className="mb-4 px-4 py-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-center justify-between text-xs text-blue-900">
            <div className="flex items-center gap-2 font-medium">
              <Calendar size={14} className="text-blue-600" />
              <span>
                Filtered by date: <strong>{activeFilterLabel}</strong> ({totalOrders} records found)
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setDateFilterMode('all');
                setCustomDate('');
              }}
              className="text-blue-700 hover:text-blue-900 font-semibold hover:underline cursor-pointer"
            >
              Reset filter
            </button>
          </div>
        )}

        {/* Sales Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Invoice Number</th>
                <th className="px-4 py-3 text-left font-medium">Date & Time</th>
                <th className="px-4 py-3 text-center font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-center font-medium">Printed</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    Loading sales...
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    {dateFilterMode !== 'all' ? (
                      <div className="space-y-2">
                        <p>No sales recorded for {activeFilterLabel}.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setDateFilterMode('all');
                            setCustomDate('');
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium underline cursor-pointer"
                        >
                          View all sales
                        </button>
                      </div>
                    ) : (
                      'No sales found. Complete a sale from the POS to see it here.'
                    )}
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                <tr key={sale.id} className="border-t border-gray-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-medium text-slate-900">
                    {sale.invoice_number}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(sale.created_at)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                      {sale.total_quantity || sale.item_count || 0}{' '}
                      {(sale.total_quantity || sale.item_count || 0) === 1 ? 'item' : 'items'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatPrice(Number(sale.total), settings?.currency_symbol ?? 'Rs.')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {sale.invoice_printed ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                        <CheckCircle size={14} /> Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
                        <Circle size={14} /> No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => viewSale(sale.id)}
                        className="p-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded"
                        title="View"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => handlePrint(sale)}
                        className="p-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded"
                        title="Print"
                      >
                        <Printer size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* View sale modal */}
    {viewingSale && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:p-0 print:static print:bg-transparent print:block print:inset-auto">
        <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[92vh] flex flex-col print:max-w-none print:w-auto print:max-h-none print:shadow-none print:rounded-none print:p-0 print:border-none">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between print:hidden">
            <h3 className="font-semibold text-slate-900">
              Invoice {viewingSale.invoice_number}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  markInvoicePrinted(viewingSale.id).then(() => {
                    loadSales();
                    window.print();
                  });
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
              >
                <Printer size={18} /> Print Receipt
              </button>
              <button
                onClick={() => setViewingSale(null)}
                className="p-2 text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="p-5 overflow-y-auto print:p-0 print:overflow-visible">
            <InvoiceContent
              sale={viewingSale}
              items={viewingSale.sale_items}
              currencySymbol={settings?.currency_symbol ?? 'Rs.'}
              settings={settings}
            />
          </div>
        </div>
      </div>
    )}
  </>
);
}
