import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit, Barcode, Printer, Power, X, RefreshCw, Save, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { formatPrice, generateBarcodeNumber, generateNextProductCode } from '@/lib/format';
import { adjustStock } from '@/lib/sales';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import type { Product, Settings } from '@/types';

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'inactive'>('all');
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

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

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
    if (statusFilter === 'all') return true;
    return getStockStatus(p) === statusFilter;
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products / Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your product catalog and stock</p>
        </div>
        <button
          onClick={() => {
            setEditingProduct(null);
            setShowForm(true);
          }}
          className="bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={18} /> Add Product
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, barcode, colour, or brand..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Products</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Article Name</th>
                <th className="px-4 py-3 text-left font-medium">Barcode</th>
                <th className="px-4 py-3 text-left font-medium">Colour</th>
                <th className="px-4 py-3 text-center font-medium">Stock</th>
                <th className="px-4 py-3 text-right font-medium">Normal Price</th>
                <th className="px-4 py-3 text-right font-medium">Sale Price</th>
                <th className="px-4 py-3 text-left font-medium">Brand</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    Loading products...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    No products found. Click "Add Product" to create one.
                  </td>
                </tr>
              ) : (
                filtered.map((product) => {
                  const status = getStockStatus(product);
                  return (
                    <tr key={product.id} className="border-t border-gray-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-slate-900">{product.product_code}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{product.article_name}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{product.barcode}</td>
                      <td className="px-4 py-3 text-slate-600">{product.colour || '-'}</td>
                      <td className="px-4 py-3 text-center font-medium text-slate-900">{product.quantity}</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatPrice(Number(product.normal_price), settings?.currency_symbol ?? 'Rs.')}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {product.sale_price != null
                          ? formatPrice(Number(product.sale_price), settings?.currency_symbol ?? 'Rs.')
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{product.brand_name}</td>
                      <td className="px-4 py-3 text-center">
                        <StockBadge status={status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setEditingProduct(product);
                              setShowForm(true);
                            }}
                            className="p-1.5 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => setShowStockAdjust(product)}
                            className="p-1.5 text-slate-600 hover:bg-amber-50 hover:text-amber-600 rounded"
                            title="Adjust Stock"
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button
                            onClick={() => toggleActive(product)}
                            className={`p-1.5 rounded ${
                              product.active
                                ? 'text-slate-600 hover:bg-amber-50 hover:text-amber-600'
                                : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'
                            }`}
                            title={product.active ? 'Deactivate' : 'Activate'}
                          >
                            <Power size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setProductToDelete(product);
                              setDeleteError(null);
                            }}
                            className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded transition-colors"
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
          onClose={() => {
            setShowForm(false);
            setEditingProduct(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditingProduct(null);
            loadProducts();
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
    in_stock: { label: 'In Stock', className: 'bg-emerald-100 text-emerald-700' },
    low_stock: { label: 'Low Stock', className: 'bg-amber-100 text-amber-700' },
    out_of_stock: { label: 'Out of Stock', className: 'bg-red-100 text-red-700' },
    inactive: { label: 'Inactive', className: 'bg-slate-100 text-slate-500' },
  };
  const c = config[status];
  return <span className={`px-2 py-1 rounded text-xs font-medium ${c.className}`}>{c.label}</span>;
}

function ProductForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [barcodePreview, setBarcodePreview] = useState(product?.barcode ?? '');

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
            updated_at: new Date().toISOString(),
          })
          .eq('id', product.id);

        if (updateError) {
          if (updateError.code === '23505') {
            setError(updateError.message.includes('barcode')
              ? 'This barcode is already assigned to another product.'
              : 'This product code is already in use.');
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
          active: true,
        });

        if (insertError) {
          if (insertError.code === '23505') {
            setError(insertError.message.includes('barcode')
              ? 'This barcode is already assigned to another product.'
              : 'This product code is already in use.');
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
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            {product ? 'Edit Product' : 'Add Product'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 overflow-y-auto">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {product && barcode !== product.barcode && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle size={16} />
              Warning: Changing the barcode will not affect historical sales which contain the old barcode.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Article Name *</label>
              <input
                type="text"
                value={articleName}
                onChange={(e) => setArticleName(e.target.value)}
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity / Stock</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Normal Price *</label>
              <input
                type="number"
                value={normalPrice}
                onChange={(e) => setNormalPrice(e.target.value)}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sale Price</label>
              <input
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Leave empty for no sale price"
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
          </div>

          {/* Barcode section */}
          <div className="mt-6 pt-4 border-t border-gray-200">
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1"
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

          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:bg-slate-300 flex items-center justify-center gap-2"
            >
              <Save size={18} /> {saving ? 'Saving...' : 'Save Product'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
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

