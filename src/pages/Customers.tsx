import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  Phone,
  MapPin,
  Building,
  Calendar,
  ShoppingBag,
  ExternalLink,
  X,
  Save,
  AlertTriangle,
  Receipt,
  Download,
  Printer,
  CheckCircle2,
  TrendingUp,
  UserCheck,
  Eye,
  FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { formatPrice, formatDateTime, formatDate } from '@/lib/format';
import { PosReceipt } from '@/components/PosReceipt';
import type { Customer, Sale, SaleWithItems, Settings } from '@/types';

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [currencySymbol, setCurrencySymbol] = useState('Rs.');

  // Filters & Sorting
  const [search, setSearch] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'orders' | 'spent'>('recent');

  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    city: '',
    address: '',
    notes: '',
  });

  // Customer Orders History Modal
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<Sale[]>([]);
  const [loadingCustomerSales, setLoadingCustomerSales] = useState(false);
  const [viewingSale, setViewingSale] = useState<SaleWithItems | null>(null);

  // Load Customers, Sales, and Settings
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsData, customersRes, salesRes] = await Promise.all([
        getSettings(),
        supabase.from('customers').select('*').order('created_at', { ascending: false }),
        supabase.from('sales').select('id, invoice_number, total, created_at, customer_id, customer_name, customer_phone, customer_city, customer_address'),
      ]);

      if (settingsData) {
        setSettings(settingsData);
        setCurrencySymbol(settingsData.currency_symbol || 'Rs.');
      }

      const rawCustomers = (customersRes.data || []) as Customer[];
      const rawSales = (salesRes.data || []) as Sale[];

      setSales(rawSales);
      setCustomers(rawCustomers);
    } catch (err) {
      console.error('Failed to load customers data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Aggregate stats per customer (orders, total spent, last order date)
  const customersWithMetrics = useMemo(() => {
    return customers.map((cust) => {
      // Match by customer_id OR customer_phone OR customer_name
      const matchedSales = sales.filter((s) => {
        if (s.customer_id && s.customer_id === cust.id) return true;
        if (cust.phone && s.customer_phone && s.customer_phone.trim() === cust.phone.trim()) return true;
        if (!cust.phone && cust.name && s.customer_name && s.customer_name.trim().toLowerCase() === cust.name.trim().toLowerCase()) return true;
        return false;
      });

      const totalOrders = matchedSales.length;
      const totalSpent = matchedSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
      const sortedSales = [...matchedSales].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const lastOrderDate = sortedSales[0]?.created_at || undefined;

      return {
        ...cust,
        total_orders: totalOrders,
        total_spent: totalSpent,
        last_order_date: lastOrderDate,
      };
    });
  }, [customers, sales]);

  // Unique cities list for filtering
  const cities = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.city && c.city.trim()) {
        set.add(c.city.trim());
      }
    });
    return Array.from(set).sort();
  }, [customers]);

  // Filtered & Sorted customers
  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = customersWithMetrics.filter((cust) => {
      const matchSearch =
        !q ||
        (cust.name && cust.name.toLowerCase().includes(q)) ||
        (cust.phone && cust.phone.toLowerCase().includes(q)) ||
        (cust.city && cust.city.toLowerCase().includes(q)) ||
        (cust.address && cust.address.toLowerCase().includes(q)) ||
        (cust.notes && cust.notes.toLowerCase().includes(q));

      const matchCity = selectedCity === 'all' || (cust.city || '').toLowerCase() === selectedCity.toLowerCase();

      return matchSearch && matchCity;
    });

    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'orders') return (b.total_orders || 0) - (a.total_orders || 0);
      if (sortBy === 'spent') return (b.total_spent || 0) - (a.total_spent || 0);
      // default: recent
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return list;
  }, [customersWithMetrics, search, selectedCity, sortBy]);

  // KPI calculations
  const totalCustomersCount = customers.length;
  const repeatCustomersCount = customersWithMetrics.filter((c) => (c.total_orders || 0) > 1).length;
  const totalSpentByCustomers = customersWithMetrics.reduce((sum, c) => sum + (c.total_spent || 0), 0);
  const totalCitiesCount = cities.length;

  // Open Add modal
  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormData({
      name: '',
      phone: '',
      city: '',
      address: '',
      notes: '',
    });
    setErrorMsg(null);
    setShowAddEditModal(true);
  };

  // Open Edit modal
  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      city: customer.city || '',
      address: customer.address || '',
      notes: customer.notes || '',
    });
    setErrorMsg(null);
    setShowAddEditModal(true);
  };

  // Save (Create or Update) Customer
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMsg('Customer name is required.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      if (editingCustomer) {
        // Update
        const { error } = await supabase
          .from('customers')
          .update({
            name: formData.name.trim(),
            phone: formData.phone.trim(),
            city: formData.city.trim(),
            address: formData.address.trim(),
            notes: formData.notes.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingCustomer.id);

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase.from('customers').insert({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          city: formData.city.trim(),
          address: formData.address.trim(),
          notes: formData.notes.trim(),
        });

        if (error) throw error;
      }

      setShowAddEditModal(false);
      await loadData();
    } catch (err: any) {
      console.error('Error saving customer:', err);
      setErrorMsg(err?.message || 'Failed to save customer. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Delete Customer
  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('customers').delete().eq('id', customerToDelete.id);
      if (error) throw error;
      setCustomerToDelete(null);
      await loadData();
    } catch (err: any) {
      alert(`Failed to delete customer: ${err?.message || 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  // View Customer Purchase History
  const handleViewCustomerHistory = async (customer: Customer) => {
    setSelectedCustomerForHistory(customer);
    setLoadingCustomerSales(true);

    try {
      // Find all sales matching this customer
      const matched = sales.filter((s) => {
        if (s.customer_id && s.customer_id === customer.id) return true;
        if (customer.phone && s.customer_phone && s.customer_phone.trim() === customer.phone.trim()) return true;
        if (!customer.phone && customer.name && s.customer_name && s.customer_name.trim().toLowerCase() === customer.name.trim().toLowerCase()) return true;
        return false;
      });

      matched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setCustomerSales(matched);
    } catch (err) {
      console.error('Error loading customer sales:', err);
    } finally {
      setLoadingCustomerSales(false);
    }
  };

  // View full sale invoice
  const handleViewInvoiceDetails = async (saleId: string) => {
    try {
      const [saleRes, itemsRes] = await Promise.all([
        supabase.from('sales').select('*').eq('id', saleId).single(),
        supabase.from('sale_items').select('*').eq('sale_id', saleId),
      ]);

      if (saleRes.data && itemsRes.data) {
        setViewingSale({
          ...(saleRes.data as Sale),
          sale_items: itemsRes.data,
        });
      }
    } catch (err) {
      console.error('Failed to load invoice items:', err);
    }
  };

  // Export Customers to CSV
  const handleExportCSV = () => {
    if (!filteredCustomers.length) return;

    const headers = ['Name', 'Phone', 'City', 'Address', 'Total Orders', 'Total Spent', 'Registered Date', 'Notes'];
    const rows = filteredCustomers.map((c) => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.city || '').replace(/"/g, '""')}"`,
      `"${(c.address || '').replace(/"/g, '""')}"`,
      c.total_orders || 0,
      c.total_spent || 0,
      `"${formatDate(c.created_at)}"`,
      `"${(c.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `AMKS_Customers_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className={`max-w-7xl mx-auto space-y-6 ${viewingSale ? 'print:hidden' : ''}`}>
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-blue-100 text-blue-700">
                <Users size={22} />
              </span>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customer Info</h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Complete customer directory captured during POS checkout and counter retail sales
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredCustomers.length === 0}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Download customer list as CSV"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer print:hidden"
            >
              <Printer size={14} />
              <span>Print Directory</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-blue-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span>Add Customer</span>
            </button>
          </div>
        </div>

        {/* Top KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Customers
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users size={16} />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {totalCustomersCount}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Saved customer records</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Cities Reached
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Building size={16} />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {totalCitiesCount}
            </div>
            <p className="text-[11px] text-emerald-600 font-medium mt-1">Geographic coverage</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Repeat Customers
              </span>
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <UserCheck size={16} />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {repeatCustomersCount}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Customers with &gt; 1 order</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Customer Sales
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <TrendingUp size={16} />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {formatPrice(totalSpentByCustomers, currencySymbol)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Total customer transactions</p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 print:hidden">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer name, phone number, city, or address..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* City Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium">City:</span>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">All Cities ({totalCustomersCount})</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-medium">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="recent">Recently Added</option>
                <option value="name">Name (A - Z)</option>
                <option value="orders">Most Orders</option>
                <option value="spent">Highest Spent</option>
              </select>
            </div>
          </div>
        </div>

        {/* Customer Directory Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="px-4 py-3.5">Customer Name</th>
                  <th className="px-4 py-3.5">Phone Number</th>
                  <th className="px-4 py-3.5">City</th>
                  <th className="px-4 py-3.5">Address</th>
                  <th className="px-4 py-3.5 text-center">Orders</th>
                  <th className="px-4 py-3.5 text-right">Total Spent</th>
                  <th className="px-4 py-3.5">Registered</th>
                  <th className="px-4 py-3.5 text-center print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      Loading customer directory...
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      {search ? (
                        <p>No customers matching "{search}"</p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-slate-600 font-medium">No customers registered yet.</p>
                          <p className="text-xs text-slate-400">
                            Customer details entered during POS checkout will automatically appear here.
                          </p>
                          <button
                            type="button"
                            onClick={handleOpenAdd}
                            className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            + Add First Customer
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => {
                    const initials = (cust.name || 'C')
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2);

                    return (
                      <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Name + Avatar */}
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                              {initials}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-sm">{cust.name}</div>
                              {cust.notes && (
                                <div className="text-[11px] text-slate-400 truncate max-w-xs" title={cust.notes}>
                                  {cust.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="px-4 py-3">
                          {cust.phone ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-800 font-semibold">{cust.phone}</span>
                              <a
                                href={`tel:${cust.phone.replace(/[^0-9+]/g, '')}`}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors print:hidden"
                                title="Call customer"
                              >
                                <Phone size={13} />
                              </a>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* City */}
                        <td className="px-4 py-3">
                          {cust.city ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                              <Building size={11} />
                              <span>{cust.city}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Address */}
                        <td className="px-4 py-3 text-slate-600 max-w-xs">
                          {cust.address ? (
                            <div className="flex items-start gap-1">
                              <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" />
                              <span className="truncate" title={cust.address}>
                                {cust.address}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Total Orders */}
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleViewCustomerHistory(cust)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer"
                            title="Click to view all customer invoices"
                          >
                            <ShoppingBag size={12} />
                            <span>{cust.total_orders || 0}</span>
                          </button>
                        </td>

                        {/* Total Spent */}
                        <td className="px-4 py-3 text-right font-bold text-slate-900 font-mono">
                          {formatPrice(cust.total_spent || 0, currencySymbol)}
                        </td>

                        {/* Registered Date */}
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {formatDate(cust.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-center print:hidden">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleViewCustomerHistory(cust)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="View purchase history & invoices"
                            >
                              <Receipt size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(cust)}
                              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit customer info"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomerToDelete(cust)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete customer"
                            >
                              <Trash2 size={15} />
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

          {/* Table Footer */}
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
            <span>
              Showing <strong>{filteredCustomers.length}</strong> of <strong>{totalCustomersCount}</strong> customers
            </span>
            <span>AMKS Customer Information Management</span>
          </div>
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
      {showAddEditModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                  {editingCustomer ? <Edit2 size={16} /> : <Plus size={16} />}
                </span>
                <h3 className="font-bold text-base text-slate-900">
                  {editingCustomer ? 'Edit Customer Info' : 'Add New Customer'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddEditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Customer Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Muhammad Usman"
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="0300-1234567"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="e.g. Lahore"
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street, Area, House / Shop #..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Preferred size, wholesale notes, VIP status, etc."
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Save size={15} />
                      <span>{editingCustomer ? 'Update Customer' : 'Save Customer'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {customerToDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Delete Customer?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to delete <strong>{customerToDelete.name}</strong>?
                Past invoices will remain intact.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                className="flex-1 py-2 text-xs font-semibold border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteCustomer}
                className="flex-1 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Purchase History Modal */}
      {selectedCustomerForHistory && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-blue-100 text-blue-700">
                    <Receipt size={16} />
                  </span>
                  <h3 className="font-bold text-base text-slate-900">
                    Purchase History: {selectedCustomerForHistory.name}
                  </h3>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                  {selectedCustomerForHistory.phone && <span>Phone: {selectedCustomerForHistory.phone}</span>}
                  {selectedCustomerForHistory.city && <span>City: {selectedCustomerForHistory.city}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerForHistory(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Invoices List */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {loadingCustomerSales ? (
                <div className="py-12 text-center text-slate-400">Loading purchase invoices...</div>
              ) : customerSales.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Receipt size={32} className="mx-auto text-slate-300" />
                  <p className="font-medium text-slate-600">No purchase records found for this customer.</p>
                  <p className="text-xs text-slate-400">
                    When this customer completes a sale at the POS counter, the invoices will show here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
                    <span>Invoices ({customerSales.length})</span>
                    <span>
                      Total Spent:{' '}
                      <strong className="text-slate-900 font-mono">
                        {formatPrice(
                          customerSales.reduce((sum, s) => sum + Number(s.total || 0), 0),
                          currencySymbol
                        )}
                      </strong>
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {customerSales.map((sale) => (
                      <div
                        key={sale.id}
                        className="p-3.5 bg-white hover:bg-slate-50 transition-colors flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 font-mono text-xs font-bold">
                            #{sale.invoice_number}
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">
                              {formatDateTime(sale.created_at)}
                            </div>
                            <div className="text-xs font-bold text-slate-900 mt-0.5">
                              {formatPrice(Number(sale.total), currencySymbol)}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleViewInvoiceDetails(sale.id)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Eye size={13} />
                          <span>View Receipt</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCustomerForHistory(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Viewer Modal */}
      {viewingSale && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between print:hidden">
              <span className="font-bold text-sm text-slate-800">
                Invoice Preview: {viewingSale.invoice_number}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingSale(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-100">
              <PosReceipt
                sale={viewingSale}
                items={viewingSale.sale_items}
                currencySymbol={currencySymbol}
                settings={settings}
                showFormatSelector={true}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
