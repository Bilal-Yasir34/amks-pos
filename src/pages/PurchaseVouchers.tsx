import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard,
  DollarSign,
  Calendar,
  Search,
  Filter,
  Truck,
  Package,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Plus,
  ArrowRight,
  Receipt,
  FileText,
  X,
  Save,
  Trash2,
  Building,
  Phone,
  MapPin,
  RefreshCw,
  TrendingDown,
  Layers,
  FileSpreadsheet,
  Printer,
  Download,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { formatPrice, formatDateTime } from '@/lib/format';
import { exportToExcel } from '@/lib/excelExport';
import type { Supplier, Product, SupplierPayment, Settings } from '@/types';

interface SupplierVoucherData {
  supplier: Supplier;
  products: Product[];
  payments: SupplierPayment[];
  totalGoodsCost: number;
  totalUnitsPurchased: number;
  totalPaid: number;
  outstandingBalance: number;
  status: 'paid' | 'partial' | 'pending';
}

export function PurchaseVouchers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_only' | 'paid_only'>('pending_only');
  const [dateFilterPreset, setDateFilterPreset] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Expanded cards
  const [expandedSupplierIds, setExpandedSupplierIds] = useState<Set<string>>(new Set());

  // Payment Modal state
  const [paymentModalSupplier, setPaymentModalSupplier] = useState<SupplierVoucherData | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Print Report Modal state
  const [showPrintReportModal, setShowPrintReportModal] = useState(false);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [supRes, prodRes, payRes, setRes] = await Promise.all([
        supabase.from('suppliers').select('*').order('name', { ascending: true }),
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('supplier_payments').select('*').order('payment_date', { ascending: false }),
        getSettings(),
      ]);

      if (supRes.data) setSuppliers(supRes.data as Supplier[]);
      if (prodRes.data) setProducts(prodRes.data as Product[]);
      if (payRes.data) setPayments(payRes.data as SupplierPayment[]);
      if (setRes) setSettings(setRes);
    } catch (err) {
      console.error('Failed to load purchase voucher data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const currencySymbol = settings?.currency_symbol ?? 'Rs.';

  // Determine active date range based on preset (clean YYYY-MM-DD comparisons)
  const activeDateRange = useMemo(() => {
    if (dateFilterPreset === 'all') return null;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (dateFilterPreset === 'today') {
      const todayStr = toYMD(now);
      return { start: todayStr, end: todayStr, label: 'Today' };
    }
    if (dateFilterPreset === 'this_week') {
      const day = now.getDay() || 7; // monday is 1
      const startDay = new Date(now);
      startDay.setDate(now.getDate() - day + 1);
      return { start: toYMD(startDay), end: toYMD(now), label: 'This Week' };
    }
    if (dateFilterPreset === 'this_month') {
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: toYMD(startMonth), end: toYMD(now), label: 'This Month' };
    }
    if (dateFilterPreset === 'custom') {
      if (!startDate && !endDate) return null;
      return {
        start: startDate || '2000-01-01',
        end: endDate || '2099-12-31',
        label: `${startDate || 'Start'} to ${endDate || 'Now'}`,
      };
    }
    return null;
  }, [dateFilterPreset, startDate, endDate]);

  const isDateInRange = useCallback(
    (dateVal?: string | null) => {
      if (!activeDateRange) return true;
      if (!dateVal) return false;
      const d = dateVal.includes('T') ? dateVal.split('T')[0] : dateVal.trim();
      return d >= activeDateRange.start && d <= activeDateRange.end;
    },
    [activeDateRange]
  );

  // Aggregate voucher data per supplier with strict date range filtering ("nothing before that, nothing after that")
  const voucherDataList: SupplierVoucherData[] = useMemo(() => {
    const list: SupplierVoucherData[] = [];

    suppliers.forEach((supplier) => {
      // Find all products purchased from this supplier
      const supplierProducts = products.filter((p) => p.supplier_id === supplier.id);

      // Find all payments made to this supplier
      const supplierPayments = payments.filter((pay) => pay.supplier_id === supplier.id);

      // Filtered payments by date if date filter active
      const relevantPayments = activeDateRange
        ? supplierPayments.filter((pay) => isDateInRange(pay.payment_date || pay.created_at))
        : supplierPayments;

      // Filtered products by date if date filter active
      const relevantProducts = activeDateRange
        ? supplierProducts.filter((p) => isDateInRange(p.created_at))
        : supplierProducts;

      // When date range is active, omit suppliers that had zero products and zero payments in that period
      if (activeDateRange && relevantProducts.length === 0 && relevantPayments.length === 0) {
        return;
      }

      const targetProducts = activeDateRange ? relevantProducts : supplierProducts;
      const targetPayments = activeDateRange ? relevantPayments : supplierPayments;

      // Calculate total procurement cost of all goods bought from this supplier in selected period
      const totalGoodsCost = targetProducts.reduce((sum, p) => {
        if (p.purchase_cost != null && Number(p.purchase_cost) > 0) {
          return sum + Number(p.purchase_cost);
        }
        if (p.cost_price != null && Number(p.cost_price) > 0) {
          const qty = p.purchase_quantity || p.quantity || 1;
          return sum + Number(p.cost_price) * qty;
        }
        return sum;
      }, 0);

      const totalUnitsPurchased = targetProducts.reduce(
        (sum, p) => sum + (p.purchase_quantity || p.quantity || 0),
        0
      );

      // Total payments recorded in selected period
      const totalPaid = targetPayments.reduce((sum, pay) => sum + Number(pay.amount || 0), 0);

      const outstandingBalance = Math.max(0, totalGoodsCost - totalPaid);

      let status: 'paid' | 'partial' | 'pending' = 'pending';
      if (totalGoodsCost > 0 && totalPaid >= totalGoodsCost) {
        status = 'paid';
      } else if (totalPaid > 0 && totalPaid < totalGoodsCost) {
        status = 'partial';
      } else {
        status = 'pending';
      }

      list.push({
        supplier,
        products: targetProducts,
        payments: targetPayments,
        totalGoodsCost,
        totalUnitsPurchased,
        totalPaid,
        outstandingBalance,
        status,
      });
    });

    return list;
  }, [suppliers, products, payments, activeDateRange, isDateInRange]);

  // Overall universal aggregates
  const universalSummary = useMemo(() => {
    let totalPayable = 0;
    let totalGoodsBilled = 0;
    let totalPaidToDate = 0;
    let pendingSuppliersCount = 0;
    let periodPaymentsSum = 0;

    voucherDataList.forEach((v) => {
      totalGoodsBilled += v.totalGoodsCost;
      totalPaidToDate += v.totalPaid;
      totalPayable += v.outstandingBalance;
      if (v.outstandingBalance > 0) {
        pendingSuppliersCount++;
      }
      // Sum period payments
      periodPaymentsSum += v.payments.reduce((s, p) => s + Number(p.amount), 0);
    });

    return {
      totalPayable,
      totalGoodsBilled,
      totalPaidToDate,
      pendingSuppliersCount,
      periodPaymentsSum,
    };
  }, [voucherDataList]);

  // Filtered voucher list for display
  const filteredVouchers = useMemo(() => {
    return voucherDataList.filter((v) => {
      // Search
      const s = search.toLowerCase();
      const matchesSearch =
        (v.supplier.name || '').toLowerCase().includes(s) ||
        (v.supplier.city || '').toLowerCase().includes(s) ||
        (v.supplier.phone || '').toLowerCase().includes(s) ||
        v.products.some((p) => p.article_name.toLowerCase().includes(s) || p.product_code.toLowerCase().includes(s));

      if (!matchesSearch) return false;

      // Status
      if (statusFilter === 'pending_only') {
        return v.outstandingBalance > 0;
      }
      if (statusFilter === 'paid_only') {
        return v.status === 'paid' && v.totalGoodsCost > 0;
      }
      return true;
    });
  }, [voucherDataList, search, statusFilter]);

  const toggleExpand = (id: string) => {
    setExpandedSupplierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleOpenPayModal = (voucher: SupplierVoucherData) => {
    setPaymentModalSupplier(voucher);
    setPayAmount(voucher.outstandingBalance > 0 ? String(voucher.outstandingBalance) : '');
    setPayMethod('Cash');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNotes('');
    setPaymentError(null);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalSupplier) return;

    const amountNum = parseFloat(payAmount);
    if (!amountNum || amountNum <= 0) {
      setPaymentError('Please enter a valid payment amount greater than zero.');
      return;
    }

    setSavingPayment(true);
    setPaymentError(null);

    try {
      const { error } = await supabase.from('supplier_payments').insert({
        supplier_id: paymentModalSupplier.supplier.id,
        amount: amountNum,
        payment_method: payMethod,
        payment_date: new Date(payDate).toISOString(),
        notes: payNotes.trim(),
      });

      if (error) throw error;

      setPaymentModalSupplier(null);
      await loadAllData();
    } catch (err: any) {
      console.error('Error recording supplier payment:', err);
      setPaymentError(err?.message || 'Failed to save payment. Please try again.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Are you sure you want to remove this payment entry?')) return;
    try {
      await supabase.from('supplier_payments').delete().eq('id', paymentId);
      await loadAllData();
    } catch (err) {
      console.error('Error deleting payment:', err);
    }
  };

  const handleExportExcel = () => {
    const periodLabel = activeDateRange ? activeDateRange.label : 'All_Time';
    const filename = `Purchase_Vouchers_Report_${periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    exportToExcel<SupplierVoucherData>({
      filename,
      sheetName: 'Purchase Vouchers',
      columns: [
        { header: 'Serial No.', key: 'serial_no', width: 12 },
        {
          header: 'Name of the Supplier',
          key: 'supplier_name',
          width: 28,
          formatter: (_, v) => v.supplier.name,
        },
        {
          header: 'City',
          key: 'city',
          width: 18,
          formatter: (_, v) => v.supplier.city || '-',
        },
        {
          header: 'Phone',
          key: 'phone',
          width: 18,
          formatter: (_, v) => v.supplier.phone || '-',
        },
        {
          header: 'Total Payable Amount',
          key: 'totalGoodsCost',
          width: 22,
          formatter: (val) => Number(val || 0),
        },
        {
          header: 'Total Amount Paid',
          key: 'totalPaid',
          width: 20,
          formatter: (val) => Number(val || 0),
        },
        {
          header: 'Pending Payable Amount',
          key: 'outstandingBalance',
          width: 24,
          formatter: (val) => Number(val || 0),
        },
        {
          header: 'Status',
          key: 'status',
          width: 14,
          formatter: (val) => String(val || '').toUpperCase(),
        },
      ],
      data: filteredVouchers,
    });
  };

  return (
    <div className={`max-w-7xl mx-auto space-y-6 ${showPrintReportModal ? 'print:hidden' : ''}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Purchase Vouchers</h1>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Accounts Payable
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
              Admin Only
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track procurement invoices, goods purchased, installment payments, and outstanding supplier balances
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filteredVouchers.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Download Excel Spreadsheet Report"
          >
            <FileSpreadsheet size={15} />
            <span>Export to Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrintReportModal(true)}
            disabled={filteredVouchers.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Print accounts payable report"
          >
            <Printer size={15} />
            <span>Print Report</span>
          </button>

          <button
            type="button"
            onClick={loadAllData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Universal Payment Indicator (Top Highlights Banner) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Main Universal Payment Indicator */}
        <div className="md:col-span-2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-2xl shadow-md border border-slate-700 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <CreditCard size={15} className="text-amber-400" />
                Universal Outstanding Balance
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                {universalSummary.pendingSuppliersCount} Suppliers Pending
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-mono">
              {formatPrice(universalSummary.totalPayable, currencySymbol)}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Total pending payments required to settle all supplier procurement accounts
            </p>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-700/80 flex items-center justify-between text-xs text-slate-300">
            <div>
              <span className="text-slate-400">Total Goods Cost:</span>{' '}
              <strong className="text-white">{formatPrice(universalSummary.totalGoodsBilled, currencySymbol)}</strong>
            </div>
            <div className="text-emerald-400 font-semibold">
              <span>Paid: </span>
              {formatPrice(universalSummary.totalPaidToDate, currencySymbol)}
            </div>
          </div>
        </div>

        {/* Total Paid to Date */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Total Paid to Suppliers
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {formatPrice(universalSummary.totalPaidToDate, currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Disbursed to suppliers</p>
          </div>
          {activeDateRange && (
            <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-emerald-700 font-medium bg-emerald-50/60 px-2 py-1 rounded">
              Paid in selected period: {formatPrice(universalSummary.periodPaymentsSum, currencySymbol)}
            </div>
          )}
        </div>

        {/* Procured Inventory Units & Total Billed */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Total Procured Goods
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Package size={18} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {formatPrice(universalSummary.totalGoodsBilled, currencySymbol)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Across all registered products</p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-slate-500">
            <span>Active Suppliers:</span>
            <strong className="text-slate-800">{suppliers.length}</strong>
          </div>
        </div>
      </div>

      {/* Date Filter Bar & Status Controls */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Calendar size={14} /> Date Filter:
            </span>
            {(
              [
                { id: 'all', label: 'All Time' },
                { id: 'today', label: 'Today' },
                { id: 'this_week', label: 'This Week' },
                { id: 'this_month', label: 'This Month' },
                { id: 'custom', label: 'Custom Range' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDateFilterPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  dateFilterPreset === p.id
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          {dateFilterPreset === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-medium">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 bg-white border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-slate-500 font-medium">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 bg-white border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
              />
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-red-600 hover:text-red-700 text-xs font-semibold underline ml-1"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search & Status Toggles */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-gray-100">
          <div className="flex-1 relative">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by supplier name, city, phone, or product name..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-3.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
            >
              <option value="pending_only">Pending Balance Only ({universalSummary.pendingSuppliersCount})</option>
              <option value="all">All Suppliers ({suppliers.length})</option>
              <option value="paid_only">Settled / Paid in Full</option>
            </select>
          </div>
        </div>
      </div>

      {/* Date Filter Notification Banner */}
      {activeDateRange && (
        <div className="px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-blue-600" />
            <span>
              Showing records filtered by <strong>{activeDateRange.label}</strong>
            </span>
          </div>
          <button
            onClick={() => setDateFilterPreset('all')}
            className="text-blue-700 hover:text-blue-900 font-semibold underline cursor-pointer"
          >
            Show All Time
          </button>
        </div>
      )}

      {/* Vouchers List / Cards */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center bg-white rounded-xl border border-gray-200 text-slate-400">
            <div className="inline-flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span>Loading purchase vouchers and ledger...</span>
            </div>
          </div>
        ) : filteredVouchers.length === 0 ? (
          <div className="p-14 text-center bg-white rounded-xl border border-gray-200">
            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <FileText size={26} />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">No Purchase Vouchers Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
              {statusFilter === 'pending_only'
                ? 'All supplier payments are currently fully settled, or no matching suppliers with pending dues were found.'
                : 'No suppliers match the current search query or date filters.'}
            </p>
            {statusFilter === 'pending_only' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 cursor-pointer"
              >
                View All Suppliers
              </button>
            )}
          </div>
        ) : (
          filteredVouchers.map((voucher) => {
            const isExpanded = expandedSupplierIds.has(voucher.supplier.id);

            return (
              <div
                key={voucher.supplier.id}
                className="bg-white rounded-xl border border-gray-200 shadow-2xs hover:shadow-xs transition-shadow overflow-hidden"
              >
                {/* Voucher Header Card */}
                <div className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  {/* Supplier info */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-800 font-bold text-base flex items-center justify-center shrink-0 border border-slate-200">
                      {voucher.supplier.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900 leading-tight">
                          {voucher.supplier.name}
                        </h3>
                        {voucher.supplier.city && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                            <Building size={11} /> {voucher.supplier.city}
                          </span>
                        )}
                        {voucher.status === 'paid' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} /> Settled / Paid
                          </span>
                        )}
                        {voucher.status === 'partial' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                            <Clock size={12} /> Partially Paid
                          </span>
                        )}
                        {voucher.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                            <AlertCircle size={12} /> Payment Pending
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        {voucher.supplier.phone && (
                          <span className="flex items-center gap-1 font-mono">
                            <Phone size={12} /> {voucher.supplier.phone}
                          </span>
                        )}
                        {voucher.supplier.address && (
                          <span className="flex items-center gap-1 line-clamp-1 max-w-sm">
                            <MapPin size={12} /> {voucher.supplier.address}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Financial Breakdown & Action */}
                  <div className="flex items-center gap-4 sm:gap-6 flex-wrap md:flex-nowrap justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-gray-100">
                    {/* Total Cost */}
                    <div className="text-left md:text-right">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Total Goods Cost
                      </div>
                      <div className="text-sm font-bold text-slate-800 font-mono">
                        {formatPrice(voucher.totalGoodsCost, currencySymbol)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {voucher.totalUnitsPurchased} units bought
                      </div>
                    </div>

                    {/* Paid */}
                    <div className="text-left md:text-right">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Amount Paid
                      </div>
                      <div className="text-sm font-bold text-emerald-600 font-mono">
                        {formatPrice(voucher.totalPaid, currencySymbol)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {voucher.payments.length} installment(s)
                      </div>
                    </div>

                    {/* Outstanding Pending Balance */}
                    <div className="text-left md:text-right bg-slate-50 p-2.5 rounded-xl border border-slate-200 min-w-[130px]">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        Outstanding Balance
                      </div>
                      <div className="text-base font-extrabold text-amber-600 font-mono">
                        {formatPrice(voucher.outstandingBalance, currencySymbol)}
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenPayModal(voucher)}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <CreditCard size={14} />
                        <span>Pay Amount</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpand(voucher.supplier.id)}
                        className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title={isExpanded ? 'Hide Details' : 'View Goods & Payment Ledger'}
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expandable Goods & Payments Ledger */}
                {isExpanded && (
                  <div className="border-t border-gray-200 bg-slate-50/60 p-5 space-y-5 animate-in fade-in duration-150">
                    {/* Section 1: Purchased Goods / Products */}
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Package size={14} className="text-blue-600" />
                          Goods Bought From This Supplier ({voucher.products.length} items)
                        </h4>
                      </div>

                      {voucher.products.length === 0 ? (
                        <div className="p-4 bg-white rounded-lg border border-gray-200 text-xs text-slate-400 text-center">
                          No product procurement items found for this supplier within the active filter.
                        </div>
                      ) : (
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-2xs">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100 text-slate-600 border-b border-gray-200">
                              <tr>
                                <th className="px-3.5 py-2.5 text-left font-semibold">Code</th>
                                <th className="px-3.5 py-2.5 text-left font-semibold">Product Name</th>
                                <th className="px-3.5 py-2.5 text-left font-semibold">Colour</th>
                                <th className="px-3.5 py-2.5 text-center font-semibold">Qty Bought</th>
                                <th className="px-3.5 py-2.5 text-right font-semibold">Unit Cost</th>
                                <th className="px-3.5 py-2.5 text-right font-semibold">Total Cost</th>
                                <th className="px-3.5 py-2.5 text-right font-semibold">Date Added</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {voucher.products.map((p) => {
                                const qty = p.purchase_quantity || p.quantity || 0;
                                const total =
                                  p.purchase_cost != null
                                    ? Number(p.purchase_cost)
                                    : p.cost_price != null
                                    ? Number(p.cost_price) * qty
                                    : 0;

                                return (
                                  <tr key={p.id} className="hover:bg-slate-50/70">
                                    <td className="px-3.5 py-2 font-mono text-slate-700">{p.product_code}</td>
                                    <td className="px-3.5 py-2 font-medium text-slate-900">{p.article_name}</td>
                                    <td className="px-3.5 py-2 text-slate-600">{p.colour || '—'}</td>
                                    <td className="px-3.5 py-2 text-center font-bold text-slate-800">{qty} pcs</td>
                                    <td className="px-3.5 py-2 text-right font-mono text-slate-700">
                                      {p.cost_price != null
                                        ? formatPrice(Number(p.cost_price), currencySymbol)
                                        : '—'}
                                    </td>
                                    <td className="px-3.5 py-2 text-right font-bold font-mono text-slate-900">
                                      {formatPrice(total, currencySymbol)}
                                    </td>
                                    <td className="px-3.5 py-2 text-right text-slate-400">
                                      {new Date(p.created_at).toLocaleDateString()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Section 2: Payments History Ledger */}
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Receipt size={14} className="text-emerald-600" />
                          Payment Installments Recorded ({voucher.payments.length})
                        </h4>

                        <button
                          type="button"
                          onClick={() => handleOpenPayModal(voucher)}
                          className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={13} />
                          <span>Record Another Payment</span>
                        </button>
                      </div>

                      {voucher.payments.length === 0 ? (
                        <div className="p-4 bg-white rounded-lg border border-gray-200 text-xs text-slate-400 text-center">
                          No payments have been recorded for this supplier yet.
                        </div>
                      ) : (
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-2xs">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100 text-slate-600 border-b border-gray-200">
                              <tr>
                                <th className="px-3.5 py-2.5 text-left font-semibold">Payment Date</th>
                                <th className="px-3.5 py-2.5 text-left font-semibold">Method</th>
                                <th className="px-3.5 py-2.5 text-left font-semibold">Notes / Reference</th>
                                <th className="px-3.5 py-2.5 text-right font-semibold">Amount Paid</th>
                                <th className="px-3.5 py-2.5 text-center font-semibold">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {voucher.payments.map((pay) => (
                                <tr key={pay.id} className="hover:bg-slate-50/70">
                                  <td className="px-3.5 py-2 text-slate-800 font-medium">
                                    {new Date(pay.payment_date).toLocaleDateString()}
                                  </td>
                                  <td className="px-3.5 py-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                      {pay.payment_method || 'Cash'}
                                    </span>
                                  </td>
                                  <td className="px-3.5 py-2 text-slate-600">
                                    {pay.notes || <span className="text-slate-400 italic">No notes</span>}
                                  </td>
                                  <td className="px-3.5 py-2 text-right font-bold font-mono text-emerald-600 text-sm">
                                    {formatPrice(Number(pay.amount), currencySymbol)}
                                  </td>
                                  <td className="px-3.5 py-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePayment(pay.id)}
                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                      title="Remove Payment Entry"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Record Payment Modal */}
      {paymentModalSupplier && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <CreditCard size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 leading-tight">Pay Supplier</h3>
                  <p className="text-xs text-slate-500">Record a disbursement or installment payment</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalSupplier(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
              {paymentError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* Supplier and Balance Details */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Supplier:</span>
                  <span className="text-xs font-bold text-slate-900">
                    {paymentModalSupplier.supplier.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Total Goods Cost:</span>
                  <span className="text-xs font-mono font-medium text-slate-800">
                    {formatPrice(paymentModalSupplier.totalGoodsCost, currencySymbol)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Already Paid:</span>
                  <span className="text-xs font-mono font-medium text-emerald-600">
                    {formatPrice(paymentModalSupplier.totalPaid, currencySymbol)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Outstanding Balance:</span>
                  <span className="text-sm font-bold font-mono text-amber-600">
                    {formatPrice(paymentModalSupplier.outstandingBalance, currencySymbol)}
                  </span>
                </div>
              </div>

              {/* Amount to pay */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Payment Amount ({currencySymbol}) *
                  </label>
                  {paymentModalSupplier.outstandingBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => setPayAmount(String(paymentModalSupplier.outstandingBalance))}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline"
                    >
                      Pay Full Balance
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-base font-bold font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  autoFocus
                />
              </div>

              {/* Remaining balance preview */}
              {payAmount && (
                <div className="text-xs text-slate-500 flex items-center justify-between bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100 font-medium">
                  <span>Balance After Payment:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatPrice(
                      Math.max(0, paymentModalSupplier.outstandingBalance - parseFloat(payAmount || '0')),
                      currencySymbol
                    )}
                  </span>
                </div>
              )}

              {/* Payment Method & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Online / Mobile">Online / Mobile</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Notes / Cheque # / Ref <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Paid via HBL transfer / Cheque #5541"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setPaymentModalSupplier(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save size={15} />
                  <span>{savingPayment ? 'Saving...' : 'Confirm & Save Payment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Printable Report Modal */}
      {showPrintReportModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 print:p-0 print:static print:bg-transparent print:block print:inset-auto">
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 10mm;
              }
            }
          `}</style>
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col print:max-w-none print:w-full print:max-h-none print:shadow-none print:rounded-none print:p-0 print:border-none">
            {/* Modal Action Bar (Screen Only) */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between print:hidden">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="text-blue-600" size={18} />
                  <span>Purchase Voucher & Accounts Payable Report</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Period: <span className="font-semibold text-slate-700">{activeDateRange ? activeDateRange.label : 'All Time'}</span> • {filteredVouchers.length} supplier accounts
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <FileSpreadsheet size={15} />
                  <span>Export to Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Printer size={15} />
                  <span>Print Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintReportModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Printable Content */}
            <div className="p-6 overflow-y-auto print:p-0 print:overflow-visible text-slate-900">
              {/* Report Header for Print & Preview */}
              <div className="border-b-2 border-slate-900 pb-4 mb-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                      {settings?.business_name || 'AMKS'}
                    </h1>
                    <div className="text-xs font-medium text-slate-600">
                      {settings?.company_name || 'AMKAS International'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase font-bold text-slate-500 tracking-wider">Report</div>
                    <div className="text-base font-extrabold text-slate-900">Purchase Vouchers Summary</div>
                    <div className="text-xs text-slate-700 font-mono mt-0.5">
                      Period: <strong>{activeDateRange ? activeDateRange.label : 'All Time'}</strong>
                    </div>
                    <div className="text-[11px] text-slate-400">Generated: {formatDateTime(new Date().toISOString())}</div>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Payable Amount</div>
                  <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                    {formatPrice(filteredVouchers.reduce((s, v) => s + v.totalGoodsCost, 0), currencySymbol)}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Amount Paid</div>
                  <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
                    {formatPrice(filteredVouchers.reduce((s, v) => s + v.totalPaid, 0), currencySymbol)}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pending Payable Amount</div>
                  <div className="text-xl font-bold font-mono text-amber-700 mt-1">
                    {formatPrice(filteredVouchers.reduce((s, v) => s + v.outstandingBalance, 0), currencySymbol)}
                  </div>
                </div>
              </div>

              {/* Report Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-14 text-center">S.No.</th>
                      <th className="py-2.5 px-3">Name of the Supplier</th>
                      <th className="py-2.5 px-3">City / Phone</th>
                      <th className="py-2.5 px-3 text-right">Total Payable Amount</th>
                      <th className="py-2.5 px-3 text-right">Total Amount Paid</th>
                      <th className="py-2.5 px-3 text-right">Pending Payable Amount</th>
                      <th className="py-2.5 px-3 text-center w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {filteredVouchers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No voucher records found within the selected date range.
                        </td>
                      </tr>
                    ) : (
                      filteredVouchers.map((v, idx) => (
                        <tr key={v.supplier.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{v.supplier.name}</td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {v.supplier.city || '-'} {v.supplier.phone ? `(${v.supplier.phone})` : ''}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                            {formatPrice(v.totalGoodsCost, currencySymbol)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">
                            {formatPrice(v.totalPaid, currencySymbol)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700">
                            {formatPrice(v.outstandingBalance, currencySymbol)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              v.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : v.status === 'partial'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {v.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredVouchers.length > 0 && (
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                      <tr>
                        <td colSpan={3} className="py-3 px-3 uppercase text-right tracking-wider text-[11px]">
                          Grand Total:
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {formatPrice(filteredVouchers.reduce((s, v) => s + v.totalGoodsCost, 0), currencySymbol)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-800">
                          {formatPrice(filteredVouchers.reduce((s, v) => s + v.totalPaid, 0), currencySymbol)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-amber-800">
                          {formatPrice(filteredVouchers.reduce((s, v) => s + v.outstandingBalance, 0), currencySymbol)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Print Footer / Signatures */}
              <div className="mt-8 pt-6 border-t border-slate-200 hidden print:grid grid-cols-2 text-xs text-slate-500">
                <div>
                  <div className="h-10 border-b border-slate-300 w-48 mb-1"></div>
                  <span>Prepared By / Accounts</span>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="h-10 border-b border-slate-300 w-48 mb-1"></div>
                  <span>Authorized Signature</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
