import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit, Barcode, Printer, Power, X, RefreshCw, Save, AlertTriangle, Trash2, Truck, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { formatPrice, generateBarcodeNumber, generateNextProductCode } from '@/lib/format';
import { adjustStock } from '@/lib/sales';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import type { Product, Settings, Supplier } from '@/types';

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'inactive'>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showStockAdjust, setShowStockAdjust] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [affectedSalesCount, setAffectedSalesCount] = useState<number | null>(null);
  const [checkingSales, setCheckingSales] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!productToDelete) {
      setAffectedSalesCount(null);
      setCheckingSales(false);
      return;
    }
    let isSubscribed = true;
    setCheckingSales(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('sale_items')
          .select('sale_id')
          .eq('product_id', productToDelete.id);
        if (!error && data && isSubscribed) {
          const uniqueIds = new Set(data.map((item: any) => item.sale_id).filter(Boolean));
          setAffectedSalesCount(uniqueIds.size);
        }
      } catch {
        // ignore
      } finally {
        if (isSubscribed) setCheckingSales(false);
      }
    })();
    return () => {
      isSubscribed = false;
    };
  }, [productToDelete]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('products').select('*').order('product_code', { ascending: true });

    if (search.trim()) {
      query = query.or(
        `article_name.ilike.%${search}%,product_code.ilike.%${search}%,barcode.ilike.%${search}%,colour.ilike.%${search}%,brand_name.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (!error && data) {
      setProducts(data as Product[]);
    }
    setLoading(false);
  }, [search]);

  const loadSuppliers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true });
      if (!error && data) {
        setSuppliers(data as Supplier[]);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    getSettings().then(setSettings);
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    const timer = setTimeout(() => loadProducts(), 300);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  const lowStockThreshold = settings?.low_stock_threshold ?? 5;

  function getStockStatus(product: Product): 'in_stock' | 'low_stock' | 'out_of_stock' | 'inactive' {
    if (!product.active) return 'inactive';
    if (product.quantity <= 0) return 'out_of_stock';
    if (product.quantity <= lowStockThreshold) return 'low_stock';
    return 'in_stock';
  }

  const filtered = products.filter((p) => {
    if (statusFilter !== 'all' && getStockStatus(p) !== statusFilter) return false;
    if (supplierFilter !== 'all' && p.supplier_id !== supplierFilter) return false;
    return true;
  });

  async function toggleActive(product: Product) {
    try {
      await supabase.from('products').update({ active: !product.active }).eq('id', product.id);
      loadProducts();
    } catch {
      // ignore
    }
  }

  async function handleDeleteProduct() {
    if (!productToDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // 1. Query all sales containing this product
      const { data: saleItemsData, error: fetchErr } = await supabase
        .from('sale_items')
        .select('sale_id')
        .eq('product_id', productToDelete.id);

      if (fetchErr) {
        console.warn('Error fetching related sale items:', fetchErr);
      }

      const saleIds = Array.from(
        new Set((saleItemsData || []).map((item: any) => item.sale_id).filter(Boolean))
      );

      // 2. Delete all sale_items for those sales, then delete the sales records
      if (saleIds.length > 0) {
        for (const sId of saleIds) {
          await supabase.from('sale_items').delete().eq('sale_id', sId);
          await supabase.from('sales').delete().eq('id', sId);
        }
      }

      // Also clean up any lingering sale_items directly referencing product_id
      await supabase.from('sale_items').delete().eq('product_id', productToDelete.id);

      // 3. Delete inventory movements for this product
      await supabase.from('inventory_movements').delete().eq('product_id', productToDelete.id);

      // 4. Delete the product itself
      const { error: prodDeleteError } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete.id);

      if (prodDeleteError) {
        throw new Error(prodDeleteError.message || 'Failed to delete product.');
      }

      setProductToDelete(null);
      loadProducts();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete product.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Products & Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your catalog, stock levels, suppliers, and pricing</p>
        </div>
        <button
          onClick={() => {
            setEditingProduct(null);
            setShowForm(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus size={18} />
          <span>Add Product</span>
        </button>
      </div>

      {/* Search + Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name, code, barcode, colour, or brand..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium shadow-xs"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-xs font-semibold text-slate-700 cursor-pointer shadow-xs"
          >
            <option value="all">All Suppliers ({suppliers.length})</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-xs font-semibold text-slate-700 cursor-pointer shadow-xs"
          >
            <option value="all">All Stock Statuses</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Streamlined Clean Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-100 text-xs font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5 text-left">Product & Brand</th>
                <th className="px-4 py-3.5 text-left">Code & Barcode</th>
                <th className="px-4 py-3.5 text-center">Stock Level</th>
                <th className="px-4 py-3.5 text-left">Supplier</th>
                <th className="px-4 py-3.5 text-right">Pricing & Cost</th>
                <th className="px-4 py-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    Loading products...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No products found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((product) => {
                  const status = getStockStatus(product);
                  const curr = settings?.currency_symbol ?? 'Rs.';
                  const hasSalePrice = product.sale_price != null && product.sale_price > 0;

                  return (
                    <tr key={product.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* 1. Product & Brand */}
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900 text-sm">{product.article_name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
                          {product.brand_name && (
                            <span className="text-slate-500 font-medium">{product.brand_name}</span>
                          )}
                          {product.colour && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                              {product.colour}
                            </span>
                          )}
                          {!product.active && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 text-slate-600">
                              Inactive
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Code & Barcode */}
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          #{product.product_code}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                          {product.barcode}
                        </div>
                      </td>

                      {/* 3. Stock Level & Badge */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-mono font-black text-slate-900 text-sm">
                            {product.quantity} <span className="text-[11px] font-medium text-slate-400 font-sans">units</span>
                          </span>
                          <StockBadge status={status} />
                        </div>
                      </td>

                      {/* 4. Supplier */}
                      <td className="px-4 py-3.5">
                        {product.supplier_name ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100 max-w-[170px] truncate"
                            title={product.supplier_name}
                          >
                            <Truck size={13} className="shrink-0 text-blue-500" />
                            <span className="truncate">{product.supplier_name}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* 5. Pricing & Cost */}
                      <td className="px-4 py-3.5 text-right">
                        <div>
                          {hasSalePrice ? (
                            <div>
                              <span className="font-bold text-emerald-700 text-sm">
                                {formatPrice(Number(product.sale_price), curr)}
                              </span>
                              <span className="ml-1.5 text-xs text-slate-400 line-through">
                                {formatPrice(Number(product.normal_price), curr)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-bold text-slate-900 text-sm">
                              {formatPrice(Number(product.normal_price), curr)}
                            </span>
                          )}

                          {product.cost_price != null && (
                            <div className="flex items-center justify-end gap-1 text-[11px] text-slate-400 mt-0.5" title="Admin procurement cost">
                              <Lock size={10} className="text-slate-400" />
                              <span>Cost: {formatPrice(Number(product.cost_price), curr)}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 6. Actions */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setEditingProduct(product);
                              setShowForm(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Product"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => setShowStockAdjust(product)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            title="Adjust Stock"
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button
                            onClick={() => toggleActive(product)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              product.active
                                ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={product.active ? 'Deactivate Product' : 'Activate Product'}
                          >
                            <Power size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setProductToDelete(product);
                              setDeleteError(null);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Product"
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

      {showForm && (
        <ProductForm
          product={editingProduct}
          suppliers={suppliers}
          onRefreshSuppliers={loadSuppliers}
          onClose={() => {
            setShowForm(false);
            setEditingProduct(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditingProduct(null);
            loadProducts();
            loadSuppliers();
          }}
        />
      )}

      {showStockAdjust && (
        <StockAdjustModal
          product={showStockAdjust}
          currencySymbol={settings?.currency_symbol ?? 'Rs.'}
          onClose={() => setShowStockAdjust(null)}
          onAdjusted={() => {
            setShowStockAdjust(null);
            loadProducts();
          }}
        />
      )}

      {productToDelete && (
        <DeleteProductModal
          product={productToDelete}
          deleting={deleting}
          error={deleteError}
          affectedSalesCount={affectedSalesCount}
          checkingSales={checkingSales}
          currencySymbol={settings?.currency_symbol ?? 'Rs.'}
          onClose={() => {
            setProductToDelete(null);
            setDeleteError(null);
          }}
          onConfirm={handleDeleteProduct}
        />
      )}
    </div>
  );
}

function StockBadge({ status }: { status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'inactive' }) {
  const config = {
    in_stock: { label: 'In Stock', className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80', dot: 'bg-emerald-500' },
    low_stock: { label: 'Low Stock', className: 'bg-amber-50 text-amber-700 border-amber-200/80', dot: 'bg-amber-500' },
    out_of_stock: { label: 'Out of Stock', className: 'bg-rose-50 text-rose-700 border-rose-200/80', dot: 'bg-rose-500' },
    inactive: { label: 'Inactive', className: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${c.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      <span>{c.label}</span>
    </span>
  );
}

function ProductForm({
  product,
  suppliers = [],
  onRefreshSuppliers,
  onClose,
  onSaved,
}: {
  product: Product | null;
  suppliers?: Supplier[];
  onRefreshSuppliers?: () => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [articleName, setArticleName] = useState(product?.article_name ?? '');
  const [productCode, setProductCode] = useState(product?.product_code ?? '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [colour, setColour] = useState(product?.colour ?? '');
  const [quantity, setQuantity] = useState(String(product?.quantity ?? ''));
  const [normalPrice, setNormalPrice] = useState(String(product?.normal_price ?? ''));
  const [salePrice, setSalePrice] = useState(product?.sale_price != null ? String(product.sale_price) : '');
  const [brandName, setBrandName] = useState(product?.brand_name ?? 'AMKS');

  // Supplier & Cost fields (Admin Only)
  const [supplierId, setSupplierId] = useState(product?.supplier_id ?? '');
  const [supplierName, setSupplierName] = useState(product?.supplier_name ?? '');
  const [purchaseQuantity, setPurchaseQuantity] = useState(
    product?.purchase_quantity != null
      ? String(product.purchase_quantity)
      : product?.quantity != null
      ? String(product.quantity)
      : ''
  );
  const [purchaseCost, setPurchaseCost] = useState(
    product?.purchase_cost != null ? String(product.purchase_cost) : ''
  );
  const [costPrice, setCostPrice] = useState(
    product?.cost_price != null ? String(product.cost_price) : ''
  );

  // Quick Add Supplier inline state
  const [showQuickAddSupplier, setShowQuickAddSupplier] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState('');
  const [quickSupplierCity, setQuickSupplierCity] = useState('');
  const [quickSupplierPhone, setQuickSupplierPhone] = useState('');
  const [quickSupplierAddress, setQuickSupplierAddress] = useState('');
  const [quickSupplierSaving, setQuickSupplierSaving] = useState(false);
  const [quickSupplierError, setQuickSupplierError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [barcodePreview, setBarcodePreview] = useState(product?.barcode ?? '');

  const handleSupplierSelect = (id: string) => {
    setSupplierId(id);
    const found = suppliers.find((s) => s.id === id);
    setSupplierName(found ? found.name : '');
  };

  const handleProductQuantityChange = (val: string) => {
    setQuantity(val);
    if (!product && (!purchaseQuantity || purchaseQuantity === quantity)) {
      setPurchaseQuantity(val);
      const qtyNum = parseFloat(val);
      const costNum = parseFloat(purchaseCost);
      if (qtyNum > 0 && costNum > 0) {
        setCostPrice((costNum / qtyNum).toFixed(2));
      }
    }
  };

  const handlePurchaseQuantityChange = (val: string) => {
    setPurchaseQuantity(val);
    const qtyNum = parseFloat(val);
    const costNum = parseFloat(purchaseCost);
    const unitNum = parseFloat(costPrice);
    if (qtyNum > 0 && costNum > 0) {
      setCostPrice((costNum / qtyNum).toFixed(2));
    } else if (qtyNum > 0 && unitNum > 0) {
      setPurchaseCost((unitNum * qtyNum).toFixed(2));
    }
  };

  const handlePurchaseCostChange = (val: string) => {
    setPurchaseCost(val);
    const costNum = parseFloat(val);
    const qtyNum = parseFloat(purchaseQuantity) || parseFloat(quantity);
    if (qtyNum > 0 && costNum > 0) {
      setCostPrice((costNum / qtyNum).toFixed(2));
    } else if (!val) {
      setCostPrice('');
    }
  };

  const handleCostPriceChange = (val: string) => {
    setCostPrice(val);
    const unitNum = parseFloat(val);
    const qtyNum = parseFloat(purchaseQuantity) || parseFloat(quantity);
    if (qtyNum > 0 && unitNum > 0) {
      setPurchaseCost((unitNum * qtyNum).toFixed(2));
    } else if (!val) {
      setPurchaseCost('');
    }
  };

  const handleQuickAddSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSupplierName.trim()) {
      setQuickSupplierError('Supplier name is required.');
      return;
    }
    setQuickSupplierSaving(true);
    setQuickSupplierError(null);
    try {
      const { data, error: insertErr } = await supabase
        .from('suppliers')
        .insert({
          name: quickSupplierName.trim(),
          city: quickSupplierCity.trim(),
          phone: quickSupplierPhone.trim(),
          address: quickSupplierAddress.trim(),
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      if (onRefreshSuppliers) {
        await onRefreshSuppliers();
      }

      if (data) {
        setSupplierId(data.id);
        setSupplierName(data.name);
      }
      setShowQuickAddSupplier(false);
      setQuickSupplierName('');
      setQuickSupplierCity('');
      setQuickSupplierPhone('');
      setQuickSupplierAddress('');
    } catch (err: any) {
      setQuickSupplierError(err?.message || 'Failed to add supplier.');
    } finally {
      setQuickSupplierSaving(false);
    }
  };

  async function generateNextCode() {
    const { data } = await supabase.from('products').select('product_code');
    const codes = (data || []).map((p) => p.product_code as string);
    setProductCode(generateNextProductCode(codes));
  }

  function handleGenerateBarcode() {
    const newBarcode = generateBarcodeNumber();
    setBarcode(newBarcode);
    setBarcodePreview(newBarcode);
  }

  async function validateBarcode(value: string): Promise<boolean> {
    if (!value) return false;
    const { data } = await supabase
      .from('products')
      .select('id')
      .eq('barcode', value)
      .maybeSingle();
    if (data && data.id !== product?.id) {
      setError('This barcode is already assigned to another product.');
      return false;
    }
    return true;
  }

  async function validateProductCode(value: string): Promise<boolean> {
    if (!value) return false;
    const { data } = await supabase
      .from('products')
      .select('id')
      .eq('product_code', value)
      .maybeSingle();
    if (data && data.id !== product?.id) {
      setError('This product code is already in use.');
      return false;
    }
    return true;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!articleName.trim()) {
      setError('Article name is required.');
      return;
    }
    if (!productCode.trim()) {
      setError('Product code is required.');
      return;
    }
    if (!barcode.trim()) {
      setError('Barcode is required. Generate one or enter an existing barcode.');
      return;
    }

    const validBarcode = await validateBarcode(barcode.trim());
    if (!validBarcode) return;

    const validCode = await validateProductCode(productCode.trim());
    if (!validCode) return;

    const qty = parseInt(quantity, 10) || 0;
    const nPrice = parseFloat(normalPrice) || 0;
    const sPrice = salePrice.trim() ? parseFloat(salePrice) : null;

    if (qty < 0) {
      setError('Quantity cannot be negative.');
      return;
    }
    if (nPrice <= 0) {
      setError('Normal price must be greater than zero.');
      return;
    }

    if (!supplierId && suppliers.length > 0) {
      setError('Please select the supplier of this product. If the supplier is not listed, use "Quick Add Supplier".');
      return;
    }

    const purchaseQty = parseInt(purchaseQuantity, 10) || null;
    const purchaseCostNum = parseFloat(purchaseCost) || null;
    const unitCostNum =
      parseFloat(costPrice) ||
      (purchaseQty && purchaseCostNum ? Number((purchaseCostNum / purchaseQty).toFixed(2)) : null);

    setSaving(true);
    try {
      if (product) {
        // Edit existing
        const barcodeChanged = barcode.trim() !== product.barcode;
        const { error: updateError } = await supabase
          .from('products')
          .update({
            article_name: articleName.trim(),
            product_code: productCode.trim(),
            barcode: barcode.trim(),
            colour: colour.trim(),
            quantity: qty,
            normal_price: nPrice,
            sale_price: sPrice,
            brand_name: brandName.trim(),
            supplier_id: supplierId || null,
            supplier_name: supplierName || null,
            purchase_quantity: purchaseQty,
            purchase_cost: purchaseCostNum,
            cost_price: unitCostNum,
            updated_at: new Date().toISOString(),
          })
          .eq('id', product.id);

        if (updateError) {
          if (updateError.code === '23505') {
            setError(
              updateError.message.includes('barcode')
                ? 'This barcode is already assigned to another product.'
                : 'This product code is already in use.'
            );
          } else {
            setError('Failed to save product. Please try again.');
          }
          setSaving(false);
          return;
        }

        // If barcode changed and it's an existing product, show confirmation was needed
        if (barcodeChanged) {
          // Already confirmed via the form
        }

        // If quantity changed, record audit movement
        if (qty !== product.quantity) {
          await supabase.from('inventory_movements').insert({
            product_id: product.id,
            previous_quantity: product.quantity,
            quantity_change: qty - product.quantity,
            remaining_quantity: qty,
            movement_type: qty > product.quantity ? 'MANUAL_INCREASE' : 'MANUAL_DECREASE',
          });
        }

        onSaved();
      } else {
        // Create new
        const { error: insertError } = await supabase.from('products').insert({
          article_name: articleName.trim(),
          product_code: productCode.trim(),
          barcode: barcode.trim(),
          colour: colour.trim(),
          quantity: qty,
          normal_price: nPrice,
          sale_price: sPrice,
          brand_name: brandName.trim(),
          supplier_id: supplierId || null,
          supplier_name: supplierName || null,
          purchase_quantity: purchaseQty,
          purchase_cost: purchaseCostNum,
          cost_price: unitCostNum,
          active: true,
        });

        if (insertError) {
          if (insertError.code === '23505') {
            setError(
              insertError.message.includes('barcode')
                ? 'This barcode is already assigned to another product.'
                : 'This product code is already in use.'
            );
          } else {
            setError('Failed to create product. Please try again.');
          }
          setSaving(false);
          return;
        }

        // Record initial stock audit movement
        if (qty > 0) {
          const { data: newProduct } = await supabase
            .from('products')
            .select('id')
            .eq('barcode', barcode.trim())
            .single();
          if (newProduct) {
            await supabase.from('inventory_movements').insert({
              product_id: newProduct.id,
              previous_quantity: 0,
              quantity_change: qty,
              remaining_quantity: qty,
              movement_type: 'INITIAL_STOCK',
            });
          }
        }

        onSaved();
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            {product ? 'Edit Product' : 'Add Product'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-5">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {product && barcode !== product.barcode && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle size={16} />
              Warning: Changing the barcode will not affect historical sales which contain the old barcode.
            </div>
          )}

          {/* Product basic details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Article Name *</label>
              <input
                type="text"
                value={articleName}
                onChange={(e) => setArticleName(e.target.value)}
                placeholder="e.g. Cotton Shirt"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Product Code *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
                {!product && (
                  <button
                    type="button"
                    onClick={generateNextCode}
                    className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 whitespace-nowrap"
                  >
                    Generate Next
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Colour</label>
              <input
                type="text"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                placeholder="e.g. Navy, Black, White"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity / Stock *</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => handleProductQuantityChange(e.target.value)}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Brand</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Normal Selling Price *</label>
              <input
                type="number"
                value={normalPrice}
                onChange={(e) => setNormalPrice(e.target.value)}
                min="0"
                step="0.01"
                placeholder="e.g. 3500"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sale Selling Price</label>
              <input
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="Leave empty for no sale price"
              />
            </div>
          </div>

          {/* Dedicated Supplier & Purchase Cost Section (Admin Only) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3.5 pb-2.5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Truck size={17} className="text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  Supplier & Purchase Cost
                </h4>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">
                  <Lock size={10} /> Admin Only
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Confidential — never shown on customer invoices or receipts
              </span>
            </div>

            <div className="space-y-3.5">
              {/* Supplier Dropdown + Quick Add */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Product Supplier <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickSupplierError(null);
                      setShowQuickAddSupplier(true);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus size={13} />
                    <span>Quick Add Supplier</span>
                  </button>
                </div>
                <select
                  value={supplierId}
                  onChange={(e) => handleSupplierSelect(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Select Supplier * --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.city ? `• ${s.city}` : ''} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))}
                </select>
                {supplierId && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">
                    ✓ Selected supplier: <strong>{supplierName}</strong>
                  </p>
                )}
              </div>

              {/* Purchase Quantity, Total Cost & Unit Cost */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Purchase Qty (pcs)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={purchaseQuantity}
                    onChange={(e) => handlePurchaseQuantityChange(e.target.value)}
                    placeholder="e.g. 400"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Quantity bought from supplier
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Total Cost (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchaseCost}
                    onChange={(e) => handlePurchaseCostChange(e.target.value)}
                    placeholder="e.g. 200000"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    e.g. 200k PKR for 400 pcs
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cost Price Per Unit (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costPrice}
                    onChange={(e) => handleCostPriceChange(e.target.value)}
                    placeholder="Auto or enter"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Calculated unit procurement cost
                  </span>
                </div>
              </div>

              {/* Profit & Margin Breakdown Box */}
              {(() => {
                const uCost = parseFloat(costPrice) || 0;
                const sPrice = salePrice.trim() ? parseFloat(salePrice) : parseFloat(normalPrice) || 0;
                const pQty = parseFloat(purchaseQuantity) || parseInt(quantity, 10) || 0;

                if (uCost > 0 && sPrice > 0) {
                  const profitPerUnit = sPrice - uCost;
                  const marginPct = (profitPerUnit / sPrice) * 100;
                  const totalProfit = profitPerUnit * (pQty > 0 ? pQty : 1);
                  const isProfit = profitPerUnit >= 0;

                  return (
                    <div
                      className={`p-3 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-3 ${
                        isProfit
                          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                          : 'bg-red-50/80 border-red-200 text-red-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Profit Analysis:</span>
                        <span>
                          {isProfit ? '+' : ''}
                          {profitPerUnit.toFixed(2)} PKR / unit
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                            isProfit ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'
                          }`}
                        >
                          {marginPct.toFixed(1)}% margin
                        </span>
                      </div>
                      {pQty > 0 && (
                        <div className="font-semibold">
                          Total Projected Profit: {isProfit ? '+' : ''}
                          {totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} PKR
                          <span className="font-normal text-[11px] text-slate-600 ml-1">
                            ({pQty} pcs)
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* Barcode section */}
          <div className="pt-2 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Barcode</h4>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={barcode}
                onChange={(e) => {
                  setBarcode(e.target.value);
                  setBarcodePreview(e.target.value);
                }}
                placeholder="Enter existing barcode or generate one"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <button
                type="button"
                onClick={handleGenerateBarcode}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <Barcode size={16} /> Generate
              </button>
            </div>

            {barcodePreview && (
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="text-center font-bold text-slate-900 mb-2">AMKS</div>
                <div className="flex justify-center">
                  <BarcodeDisplay value={barcodePreview} width={2} height={60} fontSize={14} />
                </div>
                <div className="text-center text-sm font-mono text-slate-600 mt-1">{barcodePreview}</div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:bg-slate-300 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Save size={18} /> {saving ? 'Saving...' : 'Save Product'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Inline Quick Add Supplier Modal */}
      {showQuickAddSupplier && (
        <div className="fixed inset-0 bg-black/60 z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <Truck size={15} />
                </div>
                <h4 className="font-bold text-slate-900">Add New Supplier</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddSupplier(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickAddSupplierSubmit} className="space-y-3.5">
              {quickSupplierError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {quickSupplierError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supplier Name *
                </label>
                <input
                  type="text"
                  value={quickSupplierName}
                  onChange={(e) => setQuickSupplierName(e.target.value)}
                  placeholder="e.g. Al-Karam Mills"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    value={quickSupplierCity}
                    onChange={(e) => setQuickSupplierCity(e.target.value)}
                    placeholder="e.g. Karachi"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone *
                  </label>
                  <input
                    type="text"
                    value={quickSupplierPhone}
                    onChange={(e) => setQuickSupplierPhone(e.target.value)}
                    placeholder="e.g. 0300-1234567"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Address *
                </label>
                <input
                  type="text"
                  value={quickSupplierAddress}
                  onChange={(e) => setQuickSupplierAddress(e.target.value)}
                  placeholder="e.g. Sector 15, Korangi Industrial Area"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowQuickAddSupplier(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickSupplierSaving}
                  className="px-4 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-md font-semibold cursor-pointer"
                >
                  {quickSupplierSaving ? 'Saving...' : 'Add & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StockAdjustModal({
  product,
  currencySymbol,
  onClose,
  onAdjusted,
}: {
  product: Product;
  currencySymbol: string;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const [adjustment, setAdjustment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const adjValue = parseInt(adjustment, 10) || 0;
  const newStock = product.quantity + adjValue;

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (adjValue === 0) {
      setError('Adjustment cannot be zero.');
      return;
    }
    if (newStock < 0) {
      setError('Cannot reduce stock below zero.');
      return;
    }

    setSaving(true);
    try {
      await adjustStock(
        product.id,
        adjValue,
        adjValue > 0 ? 'MANUAL_INCREASE' : 'MANUAL_DECREASE'
      );
      onAdjusted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust stock.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Adjust Stock</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleAdjust} className="p-5">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Product:</span>
              <span className="font-medium text-slate-900">{product.article_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Current Stock:</span>
              <span className="font-medium text-slate-900">{product.quantity}</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Adjustment (+/-)
              </label>
              <input
                type="number"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
                placeholder="e.g. +10 or -2"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">New Stock:</span>
              <span className="font-bold text-slate-900">{newStock}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full mt-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-slate-300"
          >
            {saving ? 'Saving...' : 'Confirm Adjustment'}
          </button>
        </form>
      </div>
    </div>
  );
}

function DeleteProductModal({
  product,
  deleting,
  error,
  affectedSalesCount,
  checkingSales,
  currencySymbol = 'Rs.',
  onClose,
  onConfirm,
}: {
  product: Product;
  deleting: boolean;
  error: string | null;
  affectedSalesCount?: number | null;
  checkingSales?: boolean;
  currencySymbol?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const salesCount = typeof affectedSalesCount === 'number' ? affectedSalesCount : 0;
  const hasSales = salesCount > 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
        {/* Modal Header */}
        <div className="px-6 py-4.5 bg-red-50/70 border-b border-red-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg leading-tight">Delete Product</h3>
              <p className="text-xs text-slate-500 mt-0.5">Permanent removal confirmation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={deleting}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 leading-relaxed flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-sm text-slate-600">
            Are you sure you want to permanently delete this product? This action cannot be reversed.
          </p>

          {/* Product Summary Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2.5 text-sm">
            <div className="flex justify-between items-start">
              <span className="text-slate-500 font-medium">Article Name:</span>
              <span className="font-semibold text-slate-900 text-right">{product.article_name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Product Code:</span>
              <span className="font-mono text-xs font-semibold bg-slate-200/70 px-2 py-0.5 rounded text-slate-800">
                {product.product_code}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Barcode:</span>
              <span className="font-mono text-xs text-slate-700">{product.barcode}</span>
            </div>
            {product.brand_name && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Brand:</span>
                <span className="text-slate-700">{product.brand_name}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Price:</span>
              <span className="font-semibold text-slate-900">
                {currencySymbol} {product.sale_price ? product.sale_price.toLocaleString() : product.normal_price.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-slate-500 font-medium">Current Stock:</span>
              <span className={`font-bold ${product.quantity > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                {product.quantity} units
              </span>
            </div>
          </div>

          {/* Affected Sales Warning Card */}
          {checkingSales ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-slate-400" />
              <span>Checking associated sales history...</span>
            </div>
          ) : hasSales ? (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2.5">
              <AlertTriangle size={16} className="shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">
                  Associated Sales Records Found: {salesCount} invoice(s)
                </p>
                <p className="mt-0.5 text-red-700 leading-relaxed">
                  Deleting this product will also delete the <strong>{salesCount}</strong> historical sale(s) and receipt(s) containing this item.
                </p>
              </div>
            </div>
          ) : null}

          {/* Stock Warning */}
          {product.quantity > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 text-amber-600 mt-0.5" />
              <span>
                <strong>Inventory Warning:</strong> This item has <strong>{product.quantity}</strong> unit(s) in stock. Deleting will remove these from inventory.
              </span>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="px-4.5 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-all shadow-xs flex items-center gap-2 disabled:bg-red-300 cursor-pointer"
          >
            {deleting ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                <span>
                  {hasSales ? 'Deleting Product & Sales...' : 'Deleting...'}
                </span>
              </>
            ) : (
              <>
                <Trash2 size={15} />
                <span>
                  {hasSales ? 'Delete Product & Sales' : 'Delete Permanently'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

