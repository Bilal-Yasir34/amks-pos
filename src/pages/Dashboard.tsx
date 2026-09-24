import { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Package,
  Barcode,
  Receipt,
  TrendingUp,
  AlertTriangle,
  XCircle,
  Boxes,
  Plus,
  FileText,
  Truck,
  CreditCard,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { formatPrice } from '@/lib/format';
import type { Page } from '@/types';

interface DashboardStats {
  todaySales: number;
  todayInvoiceCount: number;
  totalProducts: number;
  totalUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
}

interface DashboardProps {
  onNavigate: (page: Page) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    todayInvoiceCount: 0,
    totalProducts: 0,
    totalUnits: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  });
  const [currencySymbol, setCurrencySymbol] = useState('Rs.');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const settings = await getSettings();
      setCurrencySymbol(settings.currency_symbol);

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

      const [salesResult, productsResult] = await Promise.all([
        supabase
          .from('sales')
          .select('total, created_at')
          .gte('created_at', startOfDay)
          .lt('created_at', endOfDay),
        supabase
          .from('products')
          .select('quantity, active'),
      ]);

      const todaySales = (salesResult.data || []).reduce((sum, s) => sum + Number(s.total), 0);
      const todayInvoiceCount = (salesResult.data || []).length;
      const products = productsResult.data || [];
      const activeProducts = products.filter((p) => p.active);
      const totalProducts = activeProducts.length;
      const totalUnits = activeProducts.reduce((sum, p) => sum + p.quantity, 0);
      const lowStockCount = activeProducts.filter(
        (p) => p.quantity > 0 && p.quantity <= settings.low_stock_threshold
      ).length;
      const outOfStockCount = activeProducts.filter((p) => p.quantity <= 0).length;

      setStats({
        todaySales,
        todayInvoiceCount,
        totalProducts,
        totalUnits,
        lowStockCount,
        outOfStockCount,
      });
    } catch {
      // Show zeros on error
    } finally {
      setLoading(false);
    }
  }

  const actionCards = [
    {
      title: 'POS Terminal',
      desc: 'Scan barcodes and process sales checkout',
      icon: ShoppingCart,
      page: 'pos' as Page,
      color: 'bg-blue-50 text-blue-600 border-blue-100 hover:border-blue-300',
      badge: 'Counter',
    },
    {
      title: 'Add New Product',
      desc: 'Create product, pricing & supplier details',
      icon: Plus,
      page: 'products' as Page,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:border-emerald-300',
      badge: 'Catalog',
    },
    {
      title: 'Manage Suppliers',
      desc: 'Vendor profiles, cities & contact info',
      icon: Truck,
      page: 'suppliers' as Page,
      color: 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:border-indigo-300',
      badge: 'Procurement',
    },
    {
      title: 'Purchase Vouchers',
      desc: 'Supplier payables, pending dues & payments',
      icon: CreditCard,
      page: 'vouchers' as Page,
      color: 'bg-teal-50 text-teal-600 border-teal-100 hover:border-teal-300',
      badge: 'Ledger',
    },
    {
      title: 'Sales & Expenses',
      desc: 'Invoices, profits, dates & operating costs',
      icon: Receipt,
      page: 'sales' as Page,
      color: 'bg-purple-50 text-purple-600 border-purple-100 hover:border-purple-300',
      badge: 'Analytics',
    },
    {
      title: 'Barcode Printing',
      desc: 'Thermal sticker labels generator',
      icon: Barcode,
      page: 'barcodes' as Page,
      color: 'bg-amber-50 text-amber-600 border-amber-100 hover:border-amber-300',
      badge: 'Labels',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Executive Welcome Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs font-semibold mb-3">
            <Sparkles size={13} />
            <span>AMKS Retail POS • Management Portal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Store Performance Overview
          </h1>
          <p className="text-slate-300 text-sm mt-1 max-w-lg">
            Monitor real-time sales revenue, inventory health, vendor payables, and store expenses.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('pos')}
            className="px-5 py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer"
          >
            <ShoppingCart size={18} />
            <span>Open POS Counter</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <StatCard
          label="Today's Sales"
          value={loading ? '...' : formatPrice(stats.todaySales, currencySymbol)}
          sub="Gross revenue"
          icon={<TrendingUp size={18} />}
          color="bg-emerald-50 text-emerald-600 border-emerald-100"
        />
        <StatCard
          label="Today's Invoices"
          value={loading ? '...' : String(stats.todayInvoiceCount)}
          sub="Customer orders"
          icon={<FileText size={18} />}
          color="bg-blue-50 text-blue-600 border-blue-100"
        />
        <StatCard
          label="Active Products"
          value={loading ? '...' : String(stats.totalProducts)}
          sub="Catalog items"
          icon={<Package size={18} />}
          color="bg-purple-50 text-purple-600 border-purple-100"
        />
        <StatCard
          label="Total Units"
          value={loading ? '...' : stats.totalUnits.toLocaleString()}
          sub="Physical stock"
          icon={<Boxes size={18} />}
          color="bg-indigo-50 text-indigo-600 border-indigo-100"
        />
        <StatCard
          label="Low Stock"
          value={loading ? '...' : String(stats.lowStockCount)}
          sub="Restock needed"
          icon={<AlertTriangle size={18} />}
          color="bg-amber-50 text-amber-600 border-amber-100"
          alert={stats.lowStockCount > 0}
        />
        <StatCard
          label="Out of Stock"
          value={loading ? '...' : String(stats.outOfStockCount)}
          sub="Zero inventory"
          icon={<XCircle size={18} />}
          color="bg-rose-50 text-rose-600 border-rose-100"
          alert={stats.outOfStockCount > 0}
        />
      </div>

      {/* Structured Quick Actions Navigation */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Quick Modules Navigation
          </h2>
          <span className="text-xs text-slate-400">Click any card to jump directly to module</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {actionCards.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.title}
                type="button"
                onClick={() => onNavigate(action.page)}
                className={`p-4.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all text-left flex items-start justify-between group cursor-pointer hover:border-blue-300`}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105 ${action.color}`}
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                        {action.title}
                      </h3>
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                        {action.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{action.desc}</p>
                  </div>
                </div>
                <div className="text-slate-300 group-hover:text-blue-600 transition-colors pt-1">
                  <ArrowRight size={16} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  alert = false,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border p-4 shadow-xs transition-all hover:border-slate-300 ${
        alert ? 'border-amber-200/80' : 'border-slate-200/80'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${color}`}>
          {icon}
        </div>
      </div>
      <div className="text-xl font-black text-slate-900 tracking-tight">{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5 font-medium">{sub}</div>
    </div>
  );
}
