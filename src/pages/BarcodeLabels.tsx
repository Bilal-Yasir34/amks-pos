import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Printer, X, CheckSquare, Square } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { getSettings } from '@/lib/settings';
import { formatPrice } from '@/lib/format';
import type { Product, Settings } from '@/types';

interface LabelConfig {
  showBrand: boolean;
  showArticleName: boolean;
  showProductCode: boolean;
  showPrice: boolean;
  showBarcodeNumber: boolean;
  showBarcodeGraphic: boolean;
}

const DEFAULT_LABEL_CONFIG: LabelConfig = {
  showBrand: true,
  showArticleName: true,
  showProductCode: true,
  showPrice: true,
  showBarcodeNumber: true,
  showBarcodeGraphic: true,
};

export function BarcodeLabels() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [customBatchCount, setCustomBatchCount] = useState<string>('');
  const [labelConfig, setLabelConfig] = useState<LabelConfig>(DEFAULT_LABEL_CONFIG);
  const [showPreview, setShowPreview] = useState(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const currencySymbol = settings?.currency_symbol || 'Rs.';

  const loadProducts = useCallback(async () => {
    let query = supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('product_code', { ascending: true });

    if (search.trim()) {
      query = query.or(
        `article_name.ilike.%${search}%,product_code.ilike.%${search}%,barcode.ilike.%${search}%`
      );
    }

    const { data } = await query;
    if (data) setProducts(data as Product[]);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => loadProducts(), 300);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  function toggleSelect(productId: string) {
    const newSelected = new Map(selected);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.set(productId, 1);
    }
    setSelected(newSelected);
  }

  function setLabelCount(productId: string, count: number) {
    const newSelected = new Map(selected);
    newSelected.set(productId, Math.max(1, count));
    setSelected(newSelected);
  }

  const allFilteredSelected = products.length > 0 && products.every((p) => selected.has(p.id));
  const someFilteredSelected = products.some((p) => selected.has(p.id)) && !allFilteredSelected;

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  function toggleSelectAll() {
    const newSelected = new Map(selected);
    if (allFilteredSelected) {
      products.forEach((p) => newSelected.delete(p.id));
    } else {
      products.forEach((p) => {
        if (!newSelected.has(p.id)) {
          newSelected.set(p.id, 1);
        }
      });
    }
    setSelected(newSelected);
  }

  function applyCustomCountToAll() {
    const count = parseInt(customBatchCount, 10);
    if (isNaN(count) || count < 1) return;
    const newSelected = new Map(selected);
    for (const [id] of newSelected) {
      newSelected.set(id, count);
    }
    setSelected(newSelected);
  }

  const selectedProducts = products.filter((p) => selected.has(p.id));
  const totalLabels = Array.from(selected.entries()).reduce((sum, [, count]) => sum + count, 0);

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
        }
      `}</style>

      <div className={`max-w-7xl mx-auto ${showPreview ? 'print:hidden' : ''}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Barcode Labels</h1>
          <p className="text-sm text-slate-500 mt-1">Select products and generate printable barcode labels</p>
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => setShowPreview(true)}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Printer size={18} /> Preview & Print ({totalLabels} labels)
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product selection */}
        <div className="lg:col-span-2">
          {/* Search bar + Select All button */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by code, name, barcode..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleSelectAll}
                disabled={products.length === 0}
                className={`px-3.5 py-2.5 rounded-lg text-sm font-semibold border flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 ${
                  allFilteredSelected
                    ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                    : 'bg-white border-gray-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {allFilteredSelected ? (
                  <>
                    <CheckSquare size={16} className="text-blue-600" />
                    <span>Deselect All</span>
                  </>
                ) : (
                  <>
                    <Square size={16} className="text-slate-400" />
                    <span>Select All ({products.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-center font-medium w-12">
                    <input
                      type="checkbox"
                      ref={selectAllCheckboxRef}
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded cursor-pointer text-blue-600 focus:ring-blue-500"
                      title={allFilteredSelected ? 'Deselect all' : 'Select all'}
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Code</th>
                  <th className="px-4 py-3 text-left font-medium">Article Name</th>
                  <th className="px-4 py-3 text-left font-medium">Barcode</th>
                  <th className="px-4 py-3 text-center font-medium">Stock</th>
                  <th className="px-4 py-3 text-center font-medium w-40">Labels Qty</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      No products found.
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr
                      key={product.id}
                      className={`border-t border-gray-100 ${
                        selected.has(product.id) ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(product.id)}
                          onChange={() => toggleSelect(product.id)}
                          className="w-4 h-4 rounded cursor-pointer text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-900 font-medium">{product.product_code}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {product.article_name}
                        {product.colour && (
                          <span className="text-slate-500 ml-1 font-normal">({product.colour})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{product.barcode}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{product.quantity}</td>
                      <td className="px-4 py-3">
                        {selected.has(product.id) ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setLabelCount(product.id, (selected.get(product.id) || 1) - 1)}
                              className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                              title="Decrease prints"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={selected.get(product.id) ?? 1}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setLabelCount(product.id, isNaN(val) ? 1 : Math.max(1, val));
                              }}
                              className="w-14 px-1 py-1 text-center font-bold text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                              title="Enter custom number of prints"
                            />
                            <button
                              type="button"
                              onClick={() => setLabelCount(product.id, (selected.get(product.id) || 1) + 1)}
                              className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                              title="Increase prints"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleSelect(product.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium block text-center w-full py-1 hover:underline cursor-pointer"
                          >
                            + Select
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Quick set and custom count toolbar */}
          {selected.size > 0 && (
            <div className="mt-3 p-3.5 bg-white border border-gray-200 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Quick set:</span>
                {[1, 2, 5, 10, 20, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      const newSelected = new Map(selected);
                      for (const [id] of newSelected) {
                        newSelected.set(id, n);
                      }
                      setSelected(newSelected);
                    }}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    {n} each
                  </button>
                ))}
              </div>

              {/* Custom number adding option for all labels */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 font-medium">Custom count for all:</span>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyCustomCountToAll();
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 15"
                    value={customBatchCount}
                    onChange={(e) => setCustomBatchCount(e.target.value)}
                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-center"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Apply to All
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Label settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-4">Label Settings</h2>
          <div className="space-y-3">
            {(
              [
                { key: 'showBrand', label: 'Show AMKS brand' },
                { key: 'showArticleName', label: 'Show article name' },
                { key: 'showProductCode', label: 'Show product code & colour' },
                { key: 'showPrice', label: 'Show price' },
                { key: 'showBarcodeNumber', label: 'Show barcode number' },
                { key: 'showBarcodeGraphic', label: 'Show barcode graphic' },
              ] as { key: keyof LabelConfig; label: string }[]
            ).map((item) => (
              <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={labelConfig[item.key]}
                  onChange={(e) =>
                    setLabelConfig({ ...labelConfig, [item.key]: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                />
                <span className="text-sm text-slate-700">{item.label}</span>
              </label>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm text-slate-500">Selected: {selected.size} products</div>
            <div className="text-sm text-slate-500">Total labels: {totalLabels}</div>
          </div>
        </div>
      </div>
      </div>

      {/* Print preview modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:p-0 print:static print:bg-transparent print:block print:inset-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col print:max-w-none print:w-auto print:max-h-none print:shadow-none print:rounded-none print:p-0 print:border-none">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between print:hidden">
              <div>
                <h3 className="font-semibold text-slate-900">Label Preview ({totalLabels} labels)</h3>
                <p className="text-xs text-slate-500">Ready to print on standard A4 label paper</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Printer size={18} /> Print Labels
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto print:p-0 print:overflow-visible">
              <div className="barcode-label-grid">
                {selectedProducts.map((product) => {
                  const count = selected.get(product.id) || 1;
                  return Array.from({ length: count }).map((_, idx) => (
                    <div
                      key={`${product.id}-${idx}`}
                      className="barcode-label-item"
                    >
                      {labelConfig.showBrand && (
                        <div className="text-sm font-black text-slate-900 tracking-wider uppercase mb-0.5">
                          {settings?.business_name || 'AMKS'}
                        </div>
                      )}
                      {labelConfig.showArticleName && (
                        <div className="text-xs font-bold text-slate-800 line-clamp-1 mb-0.5">
                          {product.article_name}
                        </div>
                      )}
                      <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-600 print:text-black mb-1">
                        {labelConfig.showProductCode && (
                          <span className="font-mono font-medium">#{product.product_code}</span>
                        )}
                        {product.colour && (
                          <span>• {product.colour}</span>
                        )}
                        {labelConfig.showPrice && (
                          <span className="font-extrabold text-slate-900 print:text-black ml-1">
                            {formatPrice(product.sale_price ?? product.normal_price, currencySymbol)}
                          </span>
                        )}
                      </div>
                      {labelConfig.showBarcodeGraphic && (
                        <div className="flex justify-center mb-0.5">
                          <BarcodeDisplay value={product.barcode} width={1.4} height={42} displayValue={false} />
                        </div>
                      )}
                      {labelConfig.showBarcodeNumber && (
                        <div className="text-[11px] font-mono tracking-widest text-slate-800 print:text-black font-semibold">
                          {product.barcode}
                        </div>
                      )}
                    </div>
                  ));
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
