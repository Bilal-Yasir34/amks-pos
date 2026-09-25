import { useState, useEffect, useCallback } from 'react';
import {
  Truck,
  Plus,
  Search,
  Edit2,
  Trash2,
  Phone,
  MapPin,
  Building,
  Package,
  X,
  Save,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  CreditCard,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Supplier, Product } from '@/types';

export function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('all');

  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [suppliersRes, productsRes] = await Promise.all([
        supabase.from('suppliers').select('*').order('name', { ascending: true }),
        supabase.from('products').select('id, supplier_id, article_name, product_code'),
      ]);

      if (!suppliersRes.error && suppliersRes.data) {
        setSuppliers(suppliersRes.data as Supplier[]);
      }
      if (!productsRes.error && productsRes.data) {
        setProducts(productsRes.data as Product[]);
      }
    } catch (err) {
      console.error('Failed to load suppliers data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Extract unique cities for filtering
  const cities = Array.from(
    new Set(suppliers.map((s) => s.city?.trim()).filter(Boolean))
  ).sort();

  // Filtered suppliers
  const filteredSuppliers = suppliers.filter((sup) => {
    const matchesSearch =
      (sup.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (sup.city || '').toLowerCase().includes(search.toLowerCase()) ||
      (sup.phone || '').toLowerCase().includes(search.toLowerCase()) ||
      (sup.address || '').toLowerCase().includes(search.toLowerCase());

    const matchesCity =
      selectedCity === 'all' ||
      (sup.city || '').toLowerCase() === selectedCity.toLowerCase();

    return matchesSearch && matchesCity;
  });

  // Calculate linked products per supplier
  const getLinkedProductsCount = (supplierId: string) => {
    return products.filter((p) => p.supplier_id === supplierId).length;
  };

  const totalLinkedProducts = products.filter((p) => Boolean(p.supplier_id)).length;

  const handleDelete = async () => {
    if (!supplierToDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // 1. Unlink supplier from products first to maintain data integrity
      const linked = products.filter((p) => p.supplier_id === supplierToDelete.id);
      for (const p of linked) {
        await supabase
          .from('products')
          .update({ supplier_id: null, supplier_name: null })
          .eq('id', p.id);
      }

      // 2. Delete the supplier
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', supplierToDelete.id);

      if (error) {
        throw error;
      }

      setSupplierToDelete(null);
      await loadData();
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete supplier. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Suppliers</h1>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
              Admin Only
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage procurement vendors and goods suppliers from whom inventory is purchased
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              window.history.pushState(null, '', '/admin/vouchers');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
          >
            <CreditCard size={17} />
            <span>Purchase Vouchers</span>
          </button>
          <button
            onClick={() => {
              setEditingSupplier(null);
              setShowAddEditModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Plus size={18} />
            <span>Add Supplier</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Truck size={24} />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Suppliers
            </div>
            <div className="text-2xl font-bold text-slate-900">{suppliers.length}</div>
            <div className="text-xs text-slate-500 mt-0.5">Active procurement partners</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <MapPin size={24} />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Supply Hubs / Cities
            </div>
            <div className="text-2xl font-bold text-slate-900">{cities.length}</div>
            <div className="text-xs text-slate-500 mt-0.5">Geographic distribution</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Package size={24} />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Assigned Products
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalLinkedProducts}</div>
            <div className="text-xs text-slate-500 mt-0.5">Inventory items with supplier tracked</div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by supplier name, city, phone, address..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <select
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          <option value="all">All Cities ({suppliers.length})</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-gray-200 text-slate-600">
              <tr>
                <th className="px-5 py-3.5 text-left font-semibold">Supplier Name</th>
                <th className="px-5 py-3.5 text-left font-semibold">City</th>
                <th className="px-5 py-3.5 text-left font-semibold">Phone Number</th>
                <th className="px-5 py-3.5 text-left font-semibold">Address</th>
                <th className="px-5 py-3.5 text-center font-semibold">Linked Products</th>
                <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>Loading suppliers...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <div className="max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                        <Truck size={24} />
                      </div>
                      <h4 className="text-base font-semibold text-slate-900 mb-1">
                        {search || selectedCity !== 'all' ? 'No matching suppliers' : 'No suppliers added yet'}
                      </h4>
                      <p className="text-xs text-slate-500 mb-4">
                        {search || selectedCity !== 'all'
                          ? 'Try adjusting your search query or city filter.'
                          : 'Add suppliers from whom you purchase inventory goods to track procurement costs.'}
                      </p>
                      {(!search && selectedCity === 'all') && (
                        <button
                          onClick={() => {
                            setEditingSupplier(null);
                            setShowAddEditModal(true);
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                        >
                          + Add Your First Supplier
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => {
                  const linkedCount = getLinkedProductsCount(supplier.id);
                  return (
                    <tr key={supplier.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 font-bold text-sm flex items-center justify-center shrink-0 border border-blue-100">
                            {supplier.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 leading-tight">
                              {supplier.name}
                            </div>
                            {supplier.notes && (
                              <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                                {supplier.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          <Building size={12} className="text-slate-400" />
                          {supplier.city || '—'}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        {supplier.phone ? (
                          <a
                            href={`tel:${supplier.phone.replace(/\s+/g, '')}`}
                            className="inline-flex items-center gap-1.5 text-slate-700 hover:text-blue-600 font-mono text-xs transition-colors"
                          >
                            <Phone size={13} className="text-slate-400" />
                            <span>{supplier.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-start gap-1.5 text-slate-600 text-xs max-w-xs">
                          <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{supplier.address || '—'}</span>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            linkedCount > 0
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Package size={12} />
                          {linkedCount} {linkedCount === 1 ? 'product' : 'products'}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingSupplier(supplier);
                              setShowAddEditModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                            title="Edit Supplier"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setSupplierToDelete(supplier);
                              setDeleteError(null);
                            }}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="Delete Supplier"
                          >
                            <Trash2 size={16} />
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

      {/* Add / Edit Supplier Modal */}
      {showAddEditModal && (
        <SupplierFormModal
          supplier={editingSupplier}
          onClose={() => {
            setShowAddEditModal(false);
            setEditingSupplier(null);
          }}
          onSaved={() => {
            setShowAddEditModal(false);
            setEditingSupplier(null);
            loadData();
          }}
        />
      )}

      {/* Delete Supplier Confirmation Modal */}
      {supplierToDelete && (
        <DeleteSupplierModal
          supplier={supplierToDelete}
          linkedCount={getLinkedProductsCount(supplierToDelete.id)}
          deleting={deleting}
          error={deleteError}
          onClose={() => {
            setSupplierToDelete(null);
            setDeleteError(null);
          }}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

// Subcomponent: Add / Edit Supplier Modal
interface SupplierFormModalProps {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}

function SupplierFormModal({ supplier, onClose, onSaved }: SupplierFormModalProps) {
  const [name, setName] = useState(supplier?.name ?? '');
  const [city, setCity] = useState(supplier?.city ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [address, setAddress] = useState(supplier?.address ?? '');
  const [notes, setNotes] = useState(supplier?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const popularCities = [
    'Karachi',
    'Lahore',
    'Faisalabad',
    'Islamabad',
    'Rawalpindi',
    'Sialkot',
    'Multan',
    'Gujranwala',
    'Peshawar',
    'Quetta',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Supplier name is required.');
      return;
    }
    if (!city.trim()) {
      setError('City is required.');
      return;
    }

    setSaving(true);
    try {
      if (supplier) {
        // Edit existing
        const { error: updateErr } = await supabase
          .from('suppliers')
          .update({
            name: name.trim(),
            city: city.trim(),
            phone: phone.trim(),
            address: address.trim(),
            notes: notes.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', supplier.id);

        if (updateErr) throw updateErr;

        // Also update cached supplier_name in products table
        await supabase
          .from('products')
          .update({ supplier_name: name.trim() })
          .eq('supplier_id', supplier.id);

        onSaved();
      } else {
        // Create new
        const { error: insertErr } = await supabase.from('suppliers').insert({
          name: name.trim(),
          city: city.trim(),
          phone: phone.trim(),
          address: address.trim(),
          notes: notes.trim(),
        });

        if (insertErr) throw insertErr;
        onSaved();
      }
    } catch (err: any) {
      console.error('Error saving supplier:', err);
      setError(err?.message || 'Failed to save supplier. Please check your connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <Truck size={17} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 leading-tight">
                {supplier ? 'Edit Supplier' : 'Add New Supplier'}
              </h3>
              <p className="text-xs text-slate-500">Wholesale goods & inventory procurement</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Supplier Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Supplier / Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Al-Karam Textile Mills"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* City & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                list="pakistan-cities"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Karachi"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <datalist id="pakistan-cities">
                {popularCities.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Phone Number <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +92 300 1234567"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Physical Address / Factory / Market <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder="e.g. Plot 45, Sector 15, Korangi Industrial Area, Karachi"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Notes (Optional) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Additional Notes <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Contact Person: Imran Khan (Manager), Net 30 payment terms"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Footer Action buttons */}
          <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Save size={16} />
              <span>{saving ? 'Saving...' : supplier ? 'Update Supplier' : 'Save Supplier'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Subcomponent: Delete Supplier Modal
interface DeleteSupplierModalProps {
  supplier: Supplier;
  linkedCount: number;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteSupplierModal({
  supplier,
  linkedCount,
  deleting,
  error,
  onClose,
  onConfirm,
}: DeleteSupplierModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={24} />
        </div>

        <h3 className="text-lg font-bold text-center text-slate-900 mb-1">Delete Supplier?</h3>
        <p className="text-sm text-center text-slate-500 mb-4">
          Are you sure you want to delete <span className="font-semibold text-slate-800">{supplier.name}</span>?
        </p>

        {linkedCount > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Notice:</span> There are currently{' '}
              <strong>{linkedCount} product(s)</strong> linked to this supplier. Deleting this
              supplier will unlink it from those products, but the products themselves will not be
              deleted.
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {deleting ? 'Deleting...' : 'Delete Supplier'}
          </button>
        </div>
      </div>
    </div>
  );
}
