import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Barcode,
  Receipt,
  Settings as SettingsIcon,
  Menu,
  X,
  Database,
  CheckCircle,
  AlertTriangle,
  Copy,
  Check,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  ArrowLeft,
  ExternalLink,
  Truck,
  CreditCard,
} from 'lucide-react';
import type { Page } from '@/types';
import { Dashboard } from '@/pages/Dashboard';
import { POS } from '@/pages/POS';
import { Products } from '@/pages/Products';
import { Suppliers } from '@/pages/Suppliers';
import { PurchaseVouchers } from '@/pages/PurchaseVouchers';
import { BarcodeLabels } from '@/pages/BarcodeLabels';
import { Sales } from '@/pages/Sales';
import { SettingsPage } from '@/pages/Settings';
import { isSupabaseConfigured, saveSupabaseConfig, supabaseUrl, supabase } from '@/lib/supabase';
import { getIsAdminAuthenticated, clearAdminSessionAuthentication } from '@/lib/auth';
import { LoginScreen } from '@/components/LoginScreen';

type AdminSection = 'dashboard' | 'products' | 'suppliers' | 'vouchers' | 'barcodes' | 'sales' | 'settings';

const ADMIN_NAV_ITEMS: { id: AdminSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Products / Inventory', icon: Package },
  { id: 'suppliers', label: 'Suppliers', icon: Truck },
  { id: 'vouchers', label: 'Purchase Vouchers', icon: CreditCard },
  { id: 'barcodes', label: 'Barcode Labels', icon: Barcode },
  { id: 'sales', label: 'Sales History', icon: Receipt },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

const FIX_PERMISSIONS_SQL = `-- Run this in your Supabase SQL Editor:
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.products TO anon, authenticated;
GRANT ALL ON TABLE public.suppliers TO anon, authenticated;
GRANT ALL ON TABLE public.supplier_payments TO anon, authenticated;
GRANT ALL ON TABLE public.expenses TO anon, authenticated;
GRANT ALL ON TABLE public.sales TO anon, authenticated;
GRANT ALL ON TABLE public.sale_items TO anon, authenticated;
GRANT ALL ON TABLE public.inventory_movements TO anon, authenticated;
GRANT ALL ON TABLE public.settings TO anon, authenticated;
ALTER TABLE IF EXISTS public.sale_items ADD COLUMN IF NOT EXISTS cost_price_snapshot numeric(12,2);
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;`;

function parseRoute(): { isAdmin: boolean; adminPage: AdminSection } {
  if (typeof window === 'undefined') {
    return { isAdmin: false, adminPage: 'dashboard' };
  }
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();

  const isCurrentAdmin =
    path.startsWith('/admin') ||
    hash.startsWith('#/admin') ||
    hash.startsWith('#admin') ||
    search.includes('admin');

  let adminPage: AdminSection = 'dashboard';
  const full = `${path} ${hash} ${search}`;

  if (full.includes('vouchers') || full.includes('purchase-voucher')) {
    adminPage = 'vouchers';
  } else if (full.includes('suppliers')) {
    adminPage = 'suppliers';
  } else if (full.includes('products')) {
    adminPage = 'products';
  } else if (full.includes('barcodes')) {
    adminPage = 'barcodes';
  } else if (full.includes('sales')) {
    adminPage = 'sales';
  } else if (full.includes('settings')) {
    adminPage = 'settings';
  } else if (full.includes('dashboard')) {
    adminPage = 'dashboard';
  }

  return { isAdmin: isCurrentAdmin, adminPage };
}


function App() {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(getIsAdminAuthenticated);
  const [route, setRoute] = useState(parseRoute);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('amks_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('amks_sidebar_collapsed', String(next));
      return next;
    });
  };

  const [showDbModal, setShowDbModal] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [dbError, setDbError] = useState<{ message: string; isPermissionError: boolean } | null>(null);
  const [dbUrl, setDbUrl] = useState(supabaseUrl || '');
  const [dbKey, setDbKey] = useState('');

  // Routing helper
  const navigateTo = useCallback((path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', path);
      setRoute(parseRoute());
      setSidebarOpen(false);
    }
  }, []);

  // Listen to browser navigation (back/forward)
  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRoute());
      setSidebarOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // F2 keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        if (route.isAdmin) {
          e.preventDefault();
          navigateTo('/');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [route.isAdmin, navigateTo]);

  // Check Supabase connection on load
  useEffect(() => {
    if (isSupabaseConfigured) {
      supabase
        .from('products')
        .select('id')
        .limit(1)
        .then(({ error }) => {
          if (error) {
            console.error('Supabase query error:', error);
            const isPerm =
              error.code === '42501' ||
              String(error.message).toLowerCase().includes('permission denied');
            setDbError({
              message: error.message,
              isPermissionError: isPerm,
            });
            if (isPerm) {
              setShowSqlModal(true);
            }
          } else {
            setDbError(null);
          }
        });
    }
  }, []);

  function handleSaveDb(e: React.FormEvent) {
    e.preventDefault();
    if (!dbUrl.trim() || !dbKey.trim()) return;
    saveSupabaseConfig(dbUrl, dbKey);
  }

  function handleCopySql() {
    navigator.clipboard.writeText(FIX_PERMISSIONS_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  }

  function handleLockAdmin() {
    clearAdminSessionAuthentication();
    setIsAdminAuthenticated(false);
  }

  // Dashboard quick-actions handler
  const handleDashboardNavigate = (page: Page) => {
    if (page === 'pos') {
      navigateTo('/');
    } else {
      navigateTo(`/admin/${page}`);
    }
  };

  // Render Admin Section
  if (route.isAdmin) {
    if (!isAdminAuthenticated) {
      return (
        <LoginScreen
          onUnlock={() => setIsAdminAuthenticated(true)}
          onBackToPos={() => navigateTo('/')}
        />
      );
    }

    return (
      <div className="min-h-screen bg-gray-50 flex">
        {/* Admin Sidebar */}
        <aside
          className={`
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            fixed lg:sticky top-0 left-0 z-50 h-screen bg-slate-900 text-white flex flex-col shrink-0
            transition-all duration-300 ease-in-out print:hidden
            ${
              sidebarCollapsed
                ? 'lg:-ml-64 lg:w-64 lg:opacity-0 lg:pointer-events-none'
                : 'lg:translate-x-0 w-64 opacity-100'
            }
          `}
        >
          <div className="px-6 py-5 border-b border-slate-700 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tracking-tight text-white">AMKS</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-600/30 text-blue-400 border border-blue-500/30">
                  Admin
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Management Portal</div>
            </div>
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Hide Sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>

          {/* Quick Exit to POS */}
          <div className="px-3 pt-3">
            <button
              onClick={() => navigateTo('/')}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-900/30 transition-all cursor-pointer group"
            >
              <ShoppingCart size={17} className="group-hover:scale-110 transition-transform" />
              <span>New Sale / POS</span>
              <span className="ml-auto text-[11px] bg-blue-700/60 px-1.5 py-0.5 rounded text-blue-200">
                F2
              </span>
            </button>
          </div>

          {/* Admin Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Administration
            </div>
            {ADMIN_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = route.adminPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(`/admin/${item.id}`)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Lock Admin / Sign out */}
          <div className="px-3 py-2 border-t border-slate-800">
            <button
              onClick={handleLockAdmin}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800/80 transition-colors cursor-pointer"
              title="Lock Admin Portal"
            >
              <Lock size={15} />
              <span>Lock Admin Session</span>
            </button>
          </div>

          {/* Database connection status */}
          <div className="px-4 py-3 border-t border-slate-700 text-xs">
            {isSupabaseConfigured ? (
              <div>
                <div className="flex items-center justify-between text-emerald-400">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Supabase Connected
                  </span>
                </div>
                {dbError && (
                  <button
                    onClick={() => setShowSqlModal(true)}
                    className="mt-1.5 text-red-400 hover:text-red-300 font-medium text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <AlertTriangle size={12} /> Fix Permissions
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1.5 text-amber-400">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Local / Demo Mode
                  </span>
                </div>
                <button
                  onClick={() => setShowDbModal(true)}
                  className="w-full text-center py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium text-[11px] transition-colors cursor-pointer"
                >
                  Connect Supabase
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden print:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Admin content area */}
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          {/* Admin Header */}
          <header className="hidden lg:flex items-center justify-between px-6 py-2.5 bg-white border-b border-gray-200/80 print:hidden shadow-2xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                  sidebarCollapsed
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                }`}
                title={sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
              >
                {sidebarCollapsed ? (
                  <>
                    <PanelLeftOpen size={17} className="text-blue-600" />
                    <span>Show Menu</span>
                  </>
                ) : (
                  <>
                    <PanelLeftClose size={17} />
                    <span>Hide Menu</span>
                  </>
                )}
              </button>
              <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Admin Panel
                </span>
                <span className="text-xs text-slate-400">/</span>
                <span className="text-xs text-slate-500 capitalize">
                  {route.adminPage === 'barcodes'
                    ? 'Barcode Labels'
                    : route.adminPage === 'vouchers'
                    ? 'Purchase Vouchers'
                    : route.adminPage}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigateTo('/')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                title="Go to POS Terminal"
              >
                <ShoppingCart size={14} />
                <span>Go to POS Terminal</span>
              </button>
              <button
                type="button"
                onClick={handleLockAdmin}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                title="Lock Admin Portal"
              >
                <Lock size={13} />
                <span>Lock Admin</span>
              </button>
            </div>
          </header>

          {/* Mobile Admin header */}
          <header className="lg:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between print:hidden">
            <button onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <span className="font-bold text-base flex items-center gap-1.5">
              <span>AMKS Admin</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateTo('/')}
                className="p-1.5 text-blue-400 hover:text-blue-300 transition-colors"
                title="Go to POS"
              >
                <ShoppingCart size={20} />
              </button>
              <button
                onClick={handleLockAdmin}
                className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                title="Lock Admin"
              >
                <Lock size={18} />
              </button>
            </div>
          </header>

          {/* Database Permission Error Banner */}
          {dbError?.isPermissionError && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-xs text-red-900 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 flex-shrink-0" />
                <span>
                  <strong>Database Permission Required:</strong> PostgreSQL tables exist in Supabase,
                  but table permissions (GRANT) have not been granted to the <code>anon</code> role.
                </span>
              </div>
              <button
                onClick={() => setShowSqlModal(true)}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-xs ml-3 transition-colors flex-shrink-0 cursor-pointer"
              >
                Fix in Supabase (View SQL)
              </button>
            </div>
          )}

          {/* Main admin pages */}
          <main className="flex-1 p-4 lg:p-6 print:p-0">
            {route.adminPage === 'dashboard' && <Dashboard onNavigate={handleDashboardNavigate} />}
            {route.adminPage === 'products' && <Products />}
            {route.adminPage === 'suppliers' && <Suppliers />}
            {route.adminPage === 'vouchers' && <PurchaseVouchers />}
            {route.adminPage === 'barcodes' && <BarcodeLabels />}
            {route.adminPage === 'sales' && <Sales />}
            {route.adminPage === 'settings' && <SettingsPage />}
          </main>
        </div>

        {/* Database Modals */}
        {renderModals()}
      </div>
    );
  }

  // Render Main POS Screen (Default / Root view)
  return (
    <div className="min-h-screen bg-slate-100/70 flex flex-col">
      {/* Sleek POS Top Bar */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-2xs print:hidden">
        {/* Brand & Terminal identification */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm tracking-wider shadow-sm">
              A
            </div>
            <div>
              <div className="text-base font-bold text-slate-900 tracking-tight leading-none">
                AMKS POS
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Counter Terminal</div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 pl-4 border-l border-slate-200">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Active Register
            </span>
            {currentTime && (
              <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {currentTime}
              </span>
            )}
          </div>
        </div>

        {/* Center shortcuts hint on medium+ screens */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px] font-mono text-slate-700 font-semibold">
            F2
          </span>
          <span>Focus Scanner</span>
          <span className="text-slate-300">•</span>
          <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px] font-mono text-slate-700 font-semibold">
            F4
          </span>
          <span>Complete Sale</span>
        </div>

        {/* Right actions: DB indicator */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isSupabaseConfigured ? (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg cursor-default"
              title="Cloud Database Connected"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>Supabase</span>
            </div>
          ) : (
            <button
              onClick={() => setShowDbModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
              title="Local demo mode active. Click to connect Supabase."
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              <span>Local Mode</span>
            </button>
          )}
        </div>
      </header>

      {/* Database Permission Error Banner */}
      {dbError?.isPermissionError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-900 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-600 flex-shrink-0" />
            <span>
              <strong>Database Permission Required:</strong> Table permissions not granted to anon role.
            </span>
          </div>
          <button
            onClick={() => setShowSqlModal(true)}
            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-xs ml-3 transition-colors flex-shrink-0 cursor-pointer"
          >
            Fix SQL
          </button>
        </div>
      )}

      {/* Local Mode Notice */}
      {!isSupabaseConfigured && (
        <div className="bg-amber-50/80 border-b border-amber-200/80 px-4 py-1.5 text-xs text-amber-800 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>Data is being saved to local browser storage.</span>
          </div>
          <button
            onClick={() => setShowDbModal(true)}
            className="underline hover:text-amber-950 font-medium cursor-pointer"
          >
            Connect Supabase
          </button>
        </div>
      )}

      {/* Main POS Content */}
      <main className="flex-1 p-3 sm:p-5 print:p-0">
        <POS />
      </main>

      {/* Database Modals */}
      {renderModals()}
    </div>
  );

  function renderModals() {
    return (
      <>
        {/* SQL Permissions Modal */}
        {showSqlModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2 text-red-600 font-bold text-base">
                  <AlertTriangle size={20} />
                  Grant Supabase Table Permissions
                </div>
                <button
                  onClick={() => setShowSqlModal(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Your Supabase database returned <code>permission denied for table products (code 42501)</code>.
                To allow your POS system to read and write data, open your{' '}
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 font-semibold underline inline-flex items-center gap-0.5"
                >
                  Supabase Dashboard <ExternalLink size={11} />
                </a>{' '}
                and run the following SQL query in the SQL Editor:
              </p>

              <div className="relative bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                <pre>{FIX_PERMISSIONS_SQL}</pre>
                <button
                  onClick={handleCopySql}
                  className="absolute top-2 right-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-sans font-medium flex items-center gap-1.5 transition-colors shadow cursor-pointer"
                >
                  {copiedSql ? <Check size={14} /> : <Copy size={14} />}
                  {copiedSql ? 'Copied!' : 'Copy SQL'}
                </button>
              </div>

              <div className="pt-2 flex justify-between items-center text-xs">
                <span className="text-slate-500">
                  After running the SQL in Supabase, click Reload.
                </span>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-xs transition-colors cursor-pointer"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Connect Supabase modal */}
        {showDbModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <Database size={20} className="text-blue-600" />
                  Connect Supabase Database
                </div>
                <button
                  onClick={() => setShowDbModal(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <p className="text-xs text-slate-600">
                Enter your Supabase project credentials to synchronize data with your Supabase
                database. You can also paste them directly into your <code>.env</code> file.
              </p>

              <form onSubmit={handleSaveDb} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Project URL (e.g. https://xyz.supabase.co)
                  </label>
                  <input
                    type="url"
                    required
                    value={dbUrl}
                    onChange={(e) => setDbUrl(e.target.value)}
                    placeholder="https://your-project.supabase.co"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Anon Public Key
                  </label>
                  <input
                    type="password"
                    required
                    value={dbKey}
                    onChange={(e) => setDbKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6Ik..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle size={16} /> Save & Connect
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDbModal(false)}
                    className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-sm transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }
}

export default App;
