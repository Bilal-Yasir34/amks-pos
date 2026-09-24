import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Plus,
  Trash2,
  Edit2,
  Wallet,
  Tag,
  ArrowUpRight,
  Percent,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { formatPrice, formatDateTime, formatDate } from '@/lib/format';
import { markInvoicePrinted } from '@/lib/sales';
import { PosReceipt as InvoiceContent } from '@/components/PosReceipt';
import type { Sale, SaleItem, SaleWithItems, Settings, Expense, Product } from '@/types';

type DateFilterPreset = 'today' | 'this_week' | 'this_month' | 'this_year' | 'custom' | 'all';

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const EXPENSE_CATEGORIES = [
  'General',
  'Utilities (Electricity, Water, Gas)',
  'Rent & Property',
  'Packaging & Bags',
  'Salaries & Wages',
  'Tea & Refreshments',
  'Transport & Delivery',
  'Maintenance & Repairs',
  'Marketing & Advertising',
  'Other',
];

export function Sales() {
  const [activeTab, setActiveTab] = useState<'sales' | 'expenses'>('sales');
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  // Search filters
  const [search, setSearch] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Date filtering
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(getLocalDateString(new Date()));
  const [customEndDate, setCustomEndDate] = useState<string>(getLocalDateString(new Date()));

  // Modals
  const [viewingSale, setViewingSale] = useState<SaleWithItems | null>(null);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Form State for Expense
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    category: 'General',
    amount: '',
    expense_date: getLocalDateString(new Date()),
    description: '',
  });
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);

  // Compute active date boundaries
  const dateRange = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();

    if (datePreset === 'today') {
      const s = new Date(year, month, date, 0, 0, 0, 0);
      const e = new Date(year, month, date, 23, 59, 59, 999);
      const str = getLocalDateString(now);
      return {
        startISO: s.toISOString(),
        endISO: e.toISOString(),
        startDateStr: str,
        endDateStr: str,
        label: `Today (${str})`,
      };
    }

    if (datePreset === 'this_week') {
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(year, month, date + diffToMonday, 0, 0, 0, 0);
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
      const mStr = getLocalDateString(monday);
      const sStr = getLocalDateString(sunday);
      return {
        startISO: monday.toISOString(),
        endISO: sunday.toISOString(),
        startDateStr: mStr,
        endDateStr: sStr,
        label: `This Week (${mStr} to ${sStr})`,
      };
    }

    if (datePreset === 'this_month') {
      const firstDay = new Date(year, month, 1, 0, 0, 0, 0);
      const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999);
      const fStr = getLocalDateString(firstDay);
      const lStr = getLocalDateString(lastDay);
      const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
      return {
        startISO: firstDay.toISOString(),
        endISO: lastDay.toISOString(),
        startDateStr: fStr,
        endDateStr: lStr,
        label: `This Month (${monthName})`,
      };
    }

    if (datePreset === 'this_year') {
      const firstDay = new Date(year, 0, 1, 0, 0, 0, 0);
      const lastDay = new Date(year, 11, 31, 23, 59, 59, 999);
      const fStr = getLocalDateString(firstDay);
      const lStr = getLocalDateString(lastDay);
      return {
        startISO: firstDay.toISOString(),
        endISO: lastDay.toISOString(),
        startDateStr: fStr,
        endDateStr: lStr,
        label: `This Year (${year})`,
      };
    }

    if (datePreset === 'custom') {
      const sStr = customStartDate || customEndDate;
      const eStr = customEndDate || customStartDate;
      if (sStr && eStr) {
        const [sy, sm, sd] = sStr.split('-').map(Number);
        const [ey, em, ed] = eStr.split('-').map(Number);
        const s = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
        const e = new Date(ey, em - 1, ed, 23, 59, 59, 999);
        return {
          startISO: s.toISOString(),
          endISO: e.toISOString(),
          startDateStr: sStr,
          endDateStr: eStr,
          label: sStr === eStr ? `Date: ${sStr}` : `${sStr} to ${eStr}`,
        };
      }
    }

    return {
      startISO: null,
      endISO: null,
      startDateStr: null,
      endDateStr: null,
      label: 'All Time',
    };
  }, [datePreset, customStartDate, customEndDate]);

  // Load Sales and Expenses with complete cost & profit calculation
  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      // 1. Fetch Products for cost price lookup fallback
      const { data: productsData } = await supabase.from('products').select('id, cost_price');
      const productCostMap = new Map<string, number>();
      if (productsData) {
        (productsData as Product[]).forEach((p) => {
          if (p.cost_price != null) {
            productCostMap.set(p.id, Number(p.cost_price));
          }
        });
      }

      // 2. Query Sales
      let salesQuery = supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });

      if (dateRange.startISO && dateRange.endISO) {
        salesQuery = salesQuery
          .gte('created_at', dateRange.startISO)
          .lte('created_at', dateRange.endISO);
      } else {
        salesQuery = salesQuery.limit(300);
      }

      const { data: salesData } = await salesQuery;
      const salesList = (salesData as Sale[]) || [];
      const saleIds = salesList.map((s) => s.id);

      // 3. Fetch Sale Items for Cost of Goods and Items Sold
      let costAndQtyMap = new Map<string, { items: number; quantity: number; cost: number }>();
      if (saleIds.length > 0) {
        const { data: allItems } = await supabase
          .from('sale_items')
          .select('sale_id, product_id, quantity, cost_price_snapshot')
          .in('sale_id', saleIds);

        if (allItems) {
          for (const item of allItems as SaleItem[]) {
            const current = costAndQtyMap.get(item.sale_id) || { items: 0, quantity: 0, cost: 0 };
            const qty = Number(item.quantity) || 1;
            const unitCost =
              item.cost_price_snapshot != null
                ? Number(item.cost_price_snapshot)
                : productCostMap.get(item.product_id) ?? 0;

            current.items += 1;
            current.quantity += qty;
            current.cost += unitCost * qty;
            costAndQtyMap.set(item.sale_id, current);
          }
        }
      }

      const enrichedSales: Sale[] = salesList.map((sale) => {
        const stats = costAndQtyMap.get(sale.id);
        const revenue = Number(sale.total || 0);
        const cost = stats?.cost ?? 0;
        const profit = revenue - cost;
        return {
          ...sale,
          item_count: stats?.items ?? 0,
          total_quantity: stats?.quantity ?? 0,
          total_cost: cost,
          profit: profit,
        };
      });

      setSales(enrichedSales);

      // 4. Query Expenses
      let expensesQuery = supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (dateRange.startDateStr && dateRange.endDateStr) {
        expensesQuery = expensesQuery
          .gte('expense_date', dateRange.startDateStr)
          .lte('expense_date', dateRange.endDateStr);
      } else {
        expensesQuery = expensesQuery.limit(300);
      }

      const { data: expensesData } = await expensesQuery;
      setExpenses((expensesData as Expense[]) || []);
    } catch (err) {
      console.error('Error loading sales and expenses:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Currency
  const currencySymbol = settings?.currency_symbol ?? 'Rs.';

  // Filtered sales for search
  const filteredSales = useMemo(() => {
    if (!search.trim()) return sales;
    const term = search.toLowerCase();
    return sales.filter((s) => s.invoice_number?.toLowerCase().includes(term));
  }, [sales, search]);

  // Filtered expenses for search and category
  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      const matchesSearch =
        !expenseSearch.trim() ||
        exp.title.toLowerCase().includes(expenseSearch.toLowerCase()) ||
        (exp.description && exp.description.toLowerCase().includes(expenseSearch.toLowerCase()));

      const matchesCat =
        selectedCategory === 'all' || exp.category?.toLowerCase() === selectedCategory.toLowerCase();

      return matchesSearch && matchesCat;
    });
  }, [expenses, expenseSearch, selectedCategory]);

  // KPI Calculations across current date range
  const totalRevenue = useMemo(
    () => sales.reduce((sum, s) => sum + Number(s.total || 0), 0),
    [sales]
  );

  const totalItemsSold = useMemo(
    () => sales.reduce((sum, s) => sum + (s.total_quantity || s.item_count || 0), 0),
    [sales]
  );

  const totalCOGS = useMemo(
    () => sales.reduce((sum, s) => sum + Number(s.total_cost || 0), 0),
    [sales]
  );

  const totalExpenses = useMemo(
    () => expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [expenses]
  );

  const grossProfit = totalRevenue - totalCOGS;
  const netProfit = totalRevenue - totalCOGS - totalExpenses;
  const netMarginPercent = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  // Invoice viewing & printing
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
        loadData();
      });
      window.print();
    }, 300);
  }

  // Expense Handlers
  function openAddExpenseModal() {
    setEditingExpense(null);
    setExpenseForm({
      title: '',
      category: 'General',
      amount: '',
      expense_date: getLocalDateString(new Date()),
      description: '',
    });
    setShowAddExpenseModal(true);
  }

  function openEditExpenseModal(exp: Expense) {
    setEditingExpense(exp);
    setExpenseForm({
      title: exp.title,
      category: exp.category || 'General',
      amount: String(exp.amount),
      expense_date: exp.expense_date,
      description: exp.description || '',
    });
    setShowAddExpenseModal(true);
  }

  async function handleSaveExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expenseForm.title.trim()) {
      alert('Please enter an expense title.');
      return;
    }
    const parsedAmount = parseFloat(expenseForm.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Please enter a valid expense amount greater than 0.');
      return;
    }
    if (!expenseForm.expense_date) {
      alert('Please select the expense date.');
      return;
    }

    setExpenseSubmitting(true);
    try {
      if (editingExpense) {
        // Update
        const { error } = await supabase
          .from('expenses')
          .update({
            title: expenseForm.title.trim(),
            category: expenseForm.category,
            amount: parsedAmount,
            expense_date: expenseForm.expense_date,
            description: expenseForm.description.trim() || null,
          })
          .eq('id', editingExpense.id);

        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase.from('expenses').insert({
          title: expenseForm.title.trim(),
          category: expenseForm.category,
          amount: parsedAmount,
          expense_date: expenseForm.expense_date,
          description: expenseForm.description.trim() || null,
        });

        if (error) throw error;
      }

      setShowAddExpenseModal(false);
      setEditingExpense(null);
      await loadData();
    } catch (err: any) {
      console.error('Error saving expense:', err);
      alert(`Failed to save expense: ${err?.message || 'Unknown error'}`);
    } finally {
      setExpenseSubmitting(false);
    }
  }

  async function handleDeleteExpense(id: string, title: string) {
    if (!confirm(`Are you sure you want to delete the expense: "${title}"?`)) {
      return;
    }

    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      console.error('Error deleting expense:', err);
      alert(`Failed to delete expense: ${err?.message || 'Unknown error'}`);
    }
  }

  return (
    <>
      <div className={`max-w-7xl mx-auto ${viewingSale ? 'print:hidden' : ''}`}>
        {/* Header and Date Filter Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sales & Analytics</h1>
            <p className="text-sm text-slate-500 mt-1">
              Track items sold, revenue, product costs, operating expenses, and net profit
            </p>
          </div>

          {/* Quick Date Presets Bar */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 text-xs font-semibold shadow-inner">
            <button
              type="button"
              onClick={() => setDatePreset('today')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                datePreset === 'today'
                  ? 'bg-white text-blue-600 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('this_week')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                datePreset === 'this_week'
                  ? 'bg-white text-blue-600 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('this_month')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                datePreset === 'this_month'
                  ? 'bg-white text-blue-600 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('this_year')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                datePreset === 'this_year'
                  ? 'bg-white text-blue-600 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              This Year
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('custom')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                datePreset === 'custom'
                  ? 'bg-white text-blue-600 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Calendar size={13} />
              <span>Custom Range</span>
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                datePreset === 'all'
                  ? 'bg-white text-blue-600 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              All Time
            </button>
          </div>
        </div>

        {/* Custom Date Range Selector (Active when 'custom' is selected) */}
        {datePreset === 'custom' && (
          <div className="mb-6 p-3 bg-white border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Calendar size={15} className="text-blue-600" />
              <span>Custom Date Range:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-xl text-xs">
                <span className="text-slate-400 font-medium">From:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="font-semibold text-slate-800 focus:outline-none bg-transparent cursor-pointer"
                />
              </div>
              <span className="text-slate-400 font-bold text-xs">to</span>
              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-xl text-xs">
                <span className="text-slate-400 font-medium">To:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="font-semibold text-slate-800 focus:outline-none bg-transparent cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate(getLocalDateString(new Date()));
                  setCustomEndDate(getLocalDateString(new Date()));
                }}
                className="px-2.5 py-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
              >
                Reset Today
              </button>
            </div>
          </div>
        )}

        {/* Executive KPI Performance Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {/* 1. Items Sold Card */}
          <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs hover:border-blue-200 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Items Sold
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <ShoppingBag size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {totalItemsSold.toLocaleString()} <span className="text-xs font-semibold text-slate-500">pcs</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              In {sales.length} {sales.length === 1 ? 'sale invoice' : 'sale invoices'}
            </p>
          </div>

          {/* 2. Total Earned / Revenue Card */}
          <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs hover:border-emerald-200 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Earned (Revenue)
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatPrice(totalRevenue, currencySymbol)}
            </div>
            <p className="text-xs text-emerald-600 mt-1 font-medium flex items-center gap-1">
              <ArrowUpRight size={13} /> Gross earnings
            </p>
          </div>

          {/* 3. Product Cost (COGS) Card */}
          <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs hover:border-amber-200 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Product Cost (COGS)
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Tag size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatPrice(totalCOGS, currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Cost of goods sold (Admin only)
            </p>
          </div>

          {/* 4. Operating Expenses Card */}
          <div className="bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-xs hover:border-rose-200 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Expenses
              </span>
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Wallet size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold text-rose-600 tracking-tight">
              {formatPrice(totalExpenses, currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {expenses.length} operating {expenses.length === 1 ? 'expense' : 'expenses'}
            </p>
          </div>

          {/* 5. Net Profit Card (After subtracting COGS & Expenses) */}
          <div
            className={`rounded-2xl p-4.5 border shadow-xs transition-all ${
              netProfit >= 0
                ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white border-emerald-200/90'
                : 'bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-white border-rose-200/90'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Net Profit
              </span>
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  netProfit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                <TrendingUp size={18} />
              </div>
            </div>
            <div
              className={`text-2xl font-black tracking-tight ${
                netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {formatPrice(netProfit, currencySymbol)}
            </div>
            <div className="flex items-center justify-between mt-1 text-xs font-semibold">
              <span className={netProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'}>
                Margin: {netMarginPercent}%
              </span>
              <span className="text-slate-500 text-[11px] font-medium" title="Gross Profit before expenses">
                Gross: {formatPrice(grossProfit, currencySymbol)}
              </span>
            </div>
          </div>
        </div>

        {/* Active Filter Period Indicator Banner */}
        <div className="mb-6 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-blue-600" />
            <span>
              Active Period: <strong className="text-slate-900 font-semibold">{dateRange.label}</strong>
              <span className="mx-2 text-slate-300">|</span>
              Sales Invoices: <strong className="text-slate-900">{sales.length}</strong>
              <span className="mx-2 text-slate-300">|</span>
              Expenses: <strong className="text-slate-900">{expenses.length}</strong>
            </span>
          </div>
          <div className="text-slate-500">
            Net Profit formula: <span className="font-mono text-slate-700">Revenue ({formatPrice(totalRevenue, currencySymbol)}) - Product Cost ({formatPrice(totalCOGS, currencySymbol)}) - Expenses ({formatPrice(totalExpenses, currencySymbol)})</span>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-gray-200 mb-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              className={`pb-3 px-4 font-semibold text-sm transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                activeTab === 'sales'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Receipt size={17} />
              <span>Sales & Invoices</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 font-bold">
                {sales.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('expenses')}
              className={`pb-3 px-4 font-semibold text-sm transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                activeTab === 'expenses'
                  ? 'border-rose-600 text-rose-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Wallet size={17} />
              <span>Operating Expenses</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-800 font-bold">
                {expenses.length}
              </span>
            </button>
          </div>

          {activeTab === 'expenses' && (
            <button
              type="button"
              onClick={openAddExpenseModal}
              className="mb-2 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus size={15} />
              <span>Add Expense</span>
            </button>
          )}
        </div>

        {/* TAB 1: SALES & INVOICES */}
        {activeTab === 'sales' && (
          <div>
            {/* Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search invoices by invoice number (e.g. INV-)..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                />
              </div>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="px-3 py-2 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Clear Search
                </button>
              )}
            </div>

            {/* Invoices Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3.5 text-left">Invoice No.</th>
                      <th className="px-4 py-3.5 text-left">Date & Time</th>
                      <th className="px-4 py-3.5 text-center">Items Sold</th>
                      <th className="px-4 py-3.5 text-right">Earned (Revenue)</th>
                      <th className="px-4 py-3.5 text-right text-slate-500">Product Cost</th>
                      <th className="px-4 py-3.5 text-right font-bold text-slate-800">Sale Profit</th>
                      <th className="px-4 py-3.5 text-center">Printed</th>
                      <th className="px-4 py-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                          Loading sales analytics...
                        </td>
                      </tr>
                    ) : filteredSales.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                          {search ? (
                            <p>No invoices matching "{search}"</p>
                          ) : (
                            <div className="space-y-2">
                              <p>No sales recorded for this period ({dateRange.label}).</p>
                              <button
                                type="button"
                                onClick={() => setDatePreset('all')}
                                className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline cursor-pointer"
                              >
                                View all sales
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredSales.map((sale) => {
                        const rev = Number(sale.total || 0);
                        const cost = Number(sale.total_cost || 0);
                        const profit = sale.profit ?? rev - cost;
                        const margin = rev > 0 ? ((profit / rev) * 100).toFixed(0) : '0';

                        return (
                          <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                              {sale.invoice_number}
                            </td>
                            <td className="px-4 py-3 text-slate-600 text-xs">
                              {formatDateTime(sale.created_at)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                                {sale.total_quantity || sale.item_count || 0}{' '}
                                {(sale.total_quantity || sale.item_count || 0) === 1 ? 'pc' : 'pcs'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900">
                              {formatPrice(rev, currencySymbol)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-amber-700 text-xs">
                              {formatPrice(cost, currencySymbol)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex flex-col items-end">
                                <span
                                  className={`font-bold ${
                                    profit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                  }`}
                                >
                                  {formatPrice(profit, currencySymbol)}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {margin}% margin
                                </span>
                              </div>
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
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => viewSale(sale.id)}
                                  className="p-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                                  title="View invoice"
                                >
                                  <Eye size={16} />
                                </button>
                                <button
                                  onClick={() => handlePrint(sale)}
                                  className="p-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                                  title="Print invoice"
                                >
                                  <Printer size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: OPERATING EXPENSES */}
        {activeTab === 'expenses' && (
          <div>
            {/* Expense Filter Controls Row */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  placeholder="Search expenses by title or description..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white text-sm"
                />
              </div>

              {/* Category Dropdown */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                >
                  <option value="all">All Expense Categories</option>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={openAddExpenseModal}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap"
                >
                  <Plus size={15} />
                  <span>+ Add Expense</span>
                </button>
              </div>
            </div>

            {/* Expenses Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3.5 text-left">Date</th>
                      <th className="px-4 py-3.5 text-left">Expense Title</th>
                      <th className="px-4 py-3.5 text-left">Category</th>
                      <th className="px-4 py-3.5 text-left">Description / Notes</th>
                      <th className="px-4 py-3.5 text-right font-bold text-slate-800">Amount</th>
                      <th className="px-4 py-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                          Loading expenses...
                        </td>
                      </tr>
                    ) : filteredExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                          <div className="space-y-3">
                            <p className="text-slate-500">No expenses recorded for this period ({dateRange.label}).</p>
                            <button
                              type="button"
                              onClick={openAddExpenseModal}
                              className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Plus size={15} />
                              <span>Add New Expense</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredExpenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 text-slate-700 font-medium text-xs whitespace-nowrap">
                            {formatDate(exp.expense_date)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {exp.title}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-100">
                              {exp.category || 'General'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs max-w-xs truncate" title={exp.description || ''}>
                            {exp.description || <span className="text-slate-400 italic">No notes</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-rose-600 whitespace-nowrap">
                            {formatPrice(Number(exp.amount), currencySymbol)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditExpenseModal(exp)}
                                className="p-1.5 text-slate-600 hover:bg-slate-100 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                                title="Edit expense"
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(exp.id, exp.title)}
                                className="p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Delete expense"
                              >
                                <Trash2 size={15} />
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
          </div>
        )}
      </div>

      {/* MODAL: ADD / EDIT EXPENSE */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <Wallet size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingExpense ? 'Edit Expense' : 'Add Operating Expense'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Record shop overheads, utilities, salaries, or miscellaneous expenses
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddExpenseModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Expense Title / Payee *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shop Electricity Bill, Packaging bags, Staff Tea"
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              {/* Amount & Date Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Amount ({currencySymbol}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="e.g. 5000"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Expense Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Category
                </label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none cursor-pointer"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Custom Description / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Add notes, invoice reference, payment mode or details..."
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 border border-gray-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={expenseSubmitting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {expenseSubmitting ? 'Saving...' : editingExpense ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VIEW INVOICE & PRINT */}
      {viewingSale && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:p-0 print:static print:bg-transparent print:block print:inset-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[92vh] flex flex-col print:max-w-none print:w-auto print:max-h-none print:shadow-none print:rounded-none print:p-0 print:border-none">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between print:hidden">
              <h3 className="font-semibold text-slate-900">
                Invoice {viewingSale.invoice_number}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    markInvoicePrinted(viewingSale.id).then(() => {
                      loadData();
                      window.print();
                    });
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 flex items-center gap-2 cursor-pointer"
                >
                  <Printer size={18} /> Print Receipt
                </button>
                <button
                  onClick={() => setViewingSale(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
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
