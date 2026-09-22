import { useState, useEffect } from 'react';
import { ShoppingCart, Package, Barcode, Receipt, TrendingUp, AlertTriangle, XCircle, Boxes, Plus, FileText } from 'lucide-react';
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

  const quickActions = [
    { label: 'New Sale', icon: ShoppingCart, page: 'pos' as Page, color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Add Product', icon: Plus, page: 'products' as Page, color: 'bg-emerald-600 hover:bg-emerald-700' },
    { label: 'Print Barcode Labels', icon: Barcode, page: 'barcodes' as Page, color: 'bg-amber-600 hover:bg-amber-700' },
    { label: 'View Inventory', icon: Package, page: 'products' as Page, color: 'bg-slate-600 hover:bg-slate-700' },
    { label: 'View Sales', icon: Receipt, page: 'sales' as Page, color: 'bg-purple-600 hover:bg-purple-700' },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">AMKS by AMKAS International</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard
          label="Today's Sales"
          value={loading ? '...' : formatPrice(stats.todaySales, currencySymbol)}
          icon={<TrendingUp size={20} />}
          color="bg-blue-50 text-blue-700"
        />
        <StatCard
          label="Today's Invoices"
          value={loading ? '...' : String(stats.todayInvoiceCount)}
          icon={<FileText size={20} />}
          color="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          label="Total Products"
          value={loading ? '...' : String(stats.totalProducts)}
          icon={<Package size={20} />}
          color="bg-slate-50 text-slate-700"
        />
        <StatCard
          label="Total Units"
          value={loading ? '...' : String(stats.totalUnits)}
          icon={<Boxes size={20} />}
          color="bg-indigo-50 text-indigo-700"
        />
        <StatCard
          label="Low Stock"
          value={loading ? '...' : String(stats.lowStockCount)}
          icon={<AlertTriangle size={20} />}
          color="bg-amber-50 text-amber-700"
        />
        <StatCard
          label="Out of Stock"
          value={loading ? '...' : String(stats.outOfStockCount)}
          icon={<XCircle size={20} />}
          color="bg-red-50 text-red-700"
        />
      </div>

      {/* Quick actions */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => onNavigate(action.page)}
                className={`${action.color} text-white px-4 py-3 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors`}
              >
                <Icon size={18} />
                {action.label}
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
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
