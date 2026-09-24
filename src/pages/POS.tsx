import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plus,
  Minus,
  Trash2,
  X,
  ShoppingCart,
  Search,
  CheckCircle,
  Printer,
  Barcode,
  RotateCcw,
  Sparkles,
  Banknote,
  ArrowRight,
  PackageCheck,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { formatPrice } from '@/lib/format';
import { completeSale, markInvoicePrinted } from '@/lib/sales';
import { PosReceipt } from '@/components/PosReceipt';
import type { CartItem, Product, Sale, SaleItem } from '@/types';

export function POS() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('Rs.');
  const [completing, setCompleting] = useState(false);
  const [completedSale, setCompletedSale] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);

  // Cash / Tender calculator
  const [cashTendered, setCashTendered] = useState<string>('');

  // Live product search
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Instant inline match suggestions
  const [instantMatches, setInstantMatches] = useState<Product[]>([]);
  const [showInstantMatches, setShowInstantMatches] = useState(false);

  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then((s) => setCurrencySymbol(s.currency_symbol));
  }, []);

  const focusBarcode = useCallback(() => {
    setTimeout(() => barcodeRef.current?.focus(), 60);
  }, []);

  useEffect(() => {
    focusBarcode();
  }, [focusBarcode]);

  // Load catalog products for quick pick modal
  const loadCatalog = useCallback(async () => {
    setLoadingProducts(true);
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('article_name', { ascending: true })
      .limit(100);
    setAllProducts((data || []) as Product[]);
    setLoadingProducts(false);
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Debounced search for inline suggestions as cashier types
  useEffect(() => {
    const term = barcodeInput.trim();
    if (!term || term.length < 2) {
      setInstantMatches([]);
      setShowInstantMatches(false);
      return;
    }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .or(
          `article_name.ilike.%${term}%,product_code.ilike.%${term}%,barcode.ilike.%${term}%,colour.ilike.%${term}%`
        )
        .limit(6);

      if (data && data.length > 0) {
        setInstantMatches(data as Product[]);
        setShowInstantMatches(true);
      } else {
        setInstantMatches([]);
        setShowInstantMatches(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [barcodeInput]);

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  }

  function addProductToCart(product: Product) {
    const salePrice =
      product.sale_price != null && product.sale_price > 0 ? product.sale_price : product.normal_price;
    const priceType = product.sale_price != null && product.sale_price > 0 ? 'sale' : 'normal';

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product_id === product.id);
      if (existing) {
        const newQty = existing.quantity + 1;
        if (newQty > product.quantity) {
          showMessage('error', `Insufficient stock. Only ${product.quantity} units available.`);
          return prevCart;
        }
        showMessage('success', `Added another ${product.article_name} (Total: ${newQty})`);
        return prevCart.map((item) =>
          item.product_id === product.id ? { ...item, quantity: newQty } : item
        );
      }

      if (product.quantity <= 0) {
        showMessage('error', `${product.article_name} is currently out of stock.`);
        return prevCart;
      }

      showMessage('success', `${product.article_name} added to cart`);
      return [
        ...prevCart,
        {
          product_id: product.id,
          article_name: product.article_name,
          product_code: product.product_code,
          barcode: product.barcode,
          colour: product.colour,
          unit_price: salePrice,
          cost_price: product.cost_price ?? null,
          price_type: priceType,
          quantity: 1,
          available_stock: product.quantity,
        },
      ];
    });

    setBarcodeInput('');
    setShowInstantMatches(false);
    focusBarcode();
  }

  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const barcode = barcodeInput.trim();
    if (!barcode) return;

    // Check if exactly 1 instant match exists
    if (instantMatches.length === 1) {
      addProductToCart(instantMatches[0]);
      return;
    }

    try {
      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .or(`barcode.eq.${barcode},product_code.eq.${barcode}`)
        .eq('active', true)
        .maybeSingle();

      if (error) {
        showMessage('error', 'Error looking up barcode. Please try again.');
        return;
      }

      if (!product) {
        showMessage('error', `No product found for code/barcode: "${barcode}"`);
        return;
      }

      addProductToCart(product as Product);
    } catch {
      showMessage('error', 'Unable to process barcode. Please try again.');
    } finally {
      setBarcodeInput('');
      setShowInstantMatches(false);
      focusBarcode();
    }
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.product_id !== productId) return item;
        const newQty = item.quantity + delta;
        if (newQty < 1) return item;
        if (newQty > item.available_stock) {
          showMessage('error', `Only ${item.available_stock} units available in stock.`);
          return item;
        }
        return { ...item, quantity: newQty };
      })
    );
  }

  function removeItem(productId: string) {
    setCart((prevCart) => prevCart.filter((item) => item.product_id !== productId));
  }

  function clearCart() {
    setCart([]);
    setCashTendered('');
    focusBarcode();
  }

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    [cart]
  );

  const totalItemsCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  // Cash change calculations
  const parsedCash = parseFloat(cashTendered) || 0;
  const changeDue = parsedCash >= subtotal ? parsedCash - subtotal : 0;
  const remainingDue = parsedCash > 0 && parsedCash < subtotal ? subtotal - parsedCash : 0;

  async function handleCompleteSale() {
    if (!cart.length) {
      showMessage('error', 'Cart is empty. Scan products before completing sale.');
      return;
    }
    if (completing) return;

    setCompleting(true);
    try {
      const result = await completeSale(cart);
      setCompletedSale(result);
      setCart([]);
      setCashTendered('');
      showMessage('success', `Sale completed! Invoice: ${result.sale.invoice_number}`);
    } catch (err: any) {
      showMessage('error', err?.message || 'Failed to complete sale.');
    } finally {
      setCompleting(false);
    }
  }

  // Hotkey handlers (F2 focus, F4 complete, Escape close)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        focusBarcode();
      }
      if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0 && !completing) {
          handleCompleteSale();
        }
      }
      if (e.key === 'Escape') {
        setShowInstantMatches(false);
        setShowCatalogModal(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart, completing, focusBarcode]);

  // Catalog filtered products
  const catalogFiltered = useMemo(() => {
    if (!catalogSearch.trim()) return allProducts;
    const q = catalogSearch.toLowerCase();
    return allProducts.filter(
      (p) =>
        p.article_name.toLowerCase().includes(q) ||
        p.product_code.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.colour && p.colour.toLowerCase().includes(q))
    );
  }, [allProducts, catalogSearch]);

  return (
    <>
      <div className={`max-w-7xl mx-auto px-1 sm:px-2 ${completedSale ? 'print:hidden' : ''}`}>
        {/* Clean Notification Toast */}
        {message && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold flex items-center gap-2.5 transition-all animate-in slide-in-from-top-3 ${
              message.type === 'success'
                ? 'bg-emerald-900 text-emerald-100 border-emerald-700/60'
                : 'bg-rose-900 text-rose-100 border-rose-700/60'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle size={18} className="text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle size={18} className="text-rose-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Top Control Bar: Fast Scanner & Quick Search */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 mb-5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Unified Scanner Input with Live Suggestions Dropdown */}
            <div className="relative flex-1">
              <form onSubmit={handleBarcodeSubmit} className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-600 flex items-center gap-1.5 pointer-events-none">
                  <Barcode size={20} />
                </div>
                <input
                  ref={barcodeRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onFocus={() => {
                    if (instantMatches.length > 0) setShowInstantMatches(true);
                  }}
                  placeholder="Scan barcode or type product name / code... (Press F2 to focus)"
                  className="w-full pl-11 pr-24 py-3 bg-slate-50 hover:bg-slate-100/60 focus:bg-white text-slate-900 text-sm font-medium rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Enter
                </button>
              </form>

              {/* Instant Match Dropdown */}
              {showInstantMatches && instantMatches.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 z-40 overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto animate-in fade-in duration-100">
                  <div className="px-3.5 py-2 bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Found {instantMatches.length} Matches</span>
                    <span className="text-[10px] text-slate-400 font-normal">Click or press Enter</span>
                  </div>
                  {instantMatches.map((prod) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => addProductToCart(prod)}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50/70 flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 font-bold text-xs flex items-center justify-center">
                          {prod.product_code}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 text-sm">{prod.article_name}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-2">
                            <span>Barcode: {prod.barcode}</span>
                            {prod.colour && <span>• Colour: {prod.colour}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900 text-sm">
                          {formatPrice(
                            prod.sale_price && prod.sale_price > 0 ? prod.sale_price : prod.normal_price,
                            currencySymbol
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">Stock: {prod.quantity}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Catalog Browser Button */}
            <button
              type="button"
              onClick={() => {
                setShowCatalogModal(true);
                loadCatalog();
              }}
              className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
              title="Browse Product Catalog"
            >
              <Search size={16} />
              <span>Browse Catalog</span>
            </button>
          </div>
        </div>

        {/* Main 2-Column POS Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Cart Items (7 cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex-1 flex flex-col">
              {/* Cart Header */}
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <ShoppingCart size={17} />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-sm leading-tight">Current Cart</h2>
                    <p className="text-[11px] text-slate-500">
                      {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'} ({cart.length} lines)
                    </p>
                  </div>
                </div>

                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Clear Cart</span>
                  </button>
                )}
              </div>

              {/* Cart Content */}
              {cart.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center text-slate-400 flex-1 min-h-[340px]">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-300 mb-3 shadow-inner">
                    <Barcode size={30} />
                  </div>
                  <h3 className="font-bold text-slate-700 text-base mb-1">Cart is Empty</h3>
                  <p className="text-xs text-slate-400 max-w-xs mb-4">
                    Scan a product barcode or use the search bar above to begin adding items to this sale.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal(true)}
                    className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Open Product Catalog
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 overflow-y-auto max-h-[520px]">
                  {cart.map((item) => {
                    const lineTotal = item.unit_price * item.quantity;
                    const isMax = item.quantity >= item.available_stock;

                    return (
                      <div
                        key={item.product_id}
                        className="p-3.5 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-3"
                      >
                        {/* Item Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-slate-900 text-sm truncate">
                              {item.article_name}
                            </span>
                            {item.price_type === 'sale' && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                Sale
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-700">
                              #{item.product_code}
                            </span>
                            {item.colour && <span className="text-slate-400">• {item.colour}</span>}
                            <span>• {formatPrice(item.unit_price, currencySymbol)} each</span>
                          </div>
                        </div>

                        {/* Quantity Stepper */}
                        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/70 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product_id, -1)}
                            className="w-7 h-7 rounded-lg bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-2xs flex items-center justify-center transition-all cursor-pointer"
                            title="Decrease quantity"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="w-8 text-center font-bold text-slate-900 text-xs font-mono">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={isMax}
                            onClick={() => updateQuantity(item.product_id, 1)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                              isMax
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-2xs cursor-pointer'
                            }`}
                            title={isMax ? 'Maximum stock reached' : 'Increase quantity'}
                          >
                            <Plus size={13} />
                          </button>
                        </div>

                        {/* Price & Delete */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="font-bold text-slate-900 text-sm">
                              {formatPrice(lineTotal, currencySymbol)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              avail: {item.available_stock}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.product_id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Remove from cart"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Checkout & Tender Calculator (5 cols) */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            {/* Primary Order Summary & Payment Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
              <div>
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                  Payment & Checkout
                </h2>

                {/* Subtotal & Line Details */}
                <div className="space-y-2.5 pb-4 border-b border-slate-100 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Quantity</span>
                    <span className="font-bold text-slate-800 font-mono">{totalItemsCount} units</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Distinct Items</span>
                    <span className="font-bold text-slate-800 font-mono">{cart.length} lines</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {formatPrice(subtotal, currencySymbol)}
                    </span>
                  </div>
                </div>

                {/* Grand Total Highlight Banner */}
                <div className="py-4 flex items-baseline justify-between border-b border-slate-100">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      Total Payable
                    </span>
                    <span className="text-[11px] text-emerald-600 font-semibold">Net invoice amount</span>
                  </div>
                  <div className="text-3xl font-black text-slate-900 tracking-tight">
                    {formatPrice(subtotal, currencySymbol)}
                  </div>
                </div>

                {/* Cash Tendered & Change Due Section */}
                <div className="mt-4 pt-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Banknote size={15} className="text-blue-600" />
                      <span>Cash Received</span>
                    </label>
                    {parsedCash > 0 && (
                      <button
                        type="button"
                        onClick={() => setCashTendered('')}
                        className="text-[11px] text-slate-400 hover:text-slate-600 font-semibold cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder="Enter customer cash amount..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                      {currencySymbol}
                    </div>
                  </div>

                  {/* Quick Cash Suggestions */}
                  {subtotal > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCashTendered(String(subtotal))}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Exact ({formatPrice(subtotal, currencySymbol)})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next500 = Math.ceil(subtotal / 500) * 500;
                          setCashTendered(String(next500 === subtotal ? subtotal + 500 : next500));
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Round 500
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next1000 = Math.ceil(subtotal / 1000) * 1000;
                          setCashTendered(String(next1000 === subtotal ? subtotal + 1000 : next1000));
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Round 1000
                      </button>
                      <button
                        type="button"
                        onClick={() => setCashTendered('5000')}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      >
                        5,000
                      </button>
                    </div>
                  )}

                  {/* Change Due Callout */}
                  {parsedCash >= subtotal && subtotal > 0 && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-900">
                      <span className="text-xs font-bold uppercase tracking-wider">Change to Return:</span>
                      <span className="text-lg font-black text-emerald-700 font-mono">
                        {formatPrice(changeDue, currencySymbol)}
                      </span>
                    </div>
                  )}

                  {remainingDue > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900">
                      <span className="text-xs font-bold">Remaining Amount:</span>
                      <span className="text-sm font-bold text-amber-700 font-mono">
                        {formatPrice(remainingDue, currencySymbol)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Complete Sale CTA Button */}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleCompleteSale}
                  disabled={!cart.length || completing}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-2xl font-black text-base tracking-wide shadow-lg shadow-emerald-600/20 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {completing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Processing Sale...</span>
                    </>
                  ) : (
                    <>
                      <span>Complete Sale</span>
                      <span className="text-xs bg-emerald-700/60 px-2 py-0.5 rounded font-mono font-medium">
                        F4
                      </span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
                <p className="text-center text-[11px] text-slate-400 mt-2 font-medium">
                  Press <strong>F4</strong> to complete • Press <strong>F2</strong> to scan barcode
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK PRODUCT CATALOG MODAL */}
      {showCatalogModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Search size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Product Catalog</h3>
                  <p className="text-xs text-slate-500">Click any product to add it directly to cart</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCatalogModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 bg-white">
              <div className="relative">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Filter by product name, code, barcode, or colour..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="overflow-y-auto p-4 divide-y divide-slate-100 flex-1">
              {loadingProducts ? (
                <div className="py-12 text-center text-slate-400 text-sm">Loading products...</div>
              ) : catalogFiltered.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  No active products match your search.
                </div>
              ) : (
                catalogFiltered.map((p) => {
                  const effectivePrice =
                    p.sale_price && p.sale_price > 0 ? p.sale_price : p.normal_price;

                  return (
                    <div
                      key={p.id}
                      onClick={() => addProductToCart(p)}
                      className="py-3 px-3 hover:bg-blue-50/60 rounded-xl flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{p.article_name}</div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span className="font-mono font-bold text-slate-700">#{p.product_code}</span>
                          <span>• Barcode: {p.barcode}</span>
                          {p.colour && <span>• {p.colour}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900 text-sm">
                          {formatPrice(effectivePrice, currencySymbol)}
                        </div>
                        <div
                          className={`text-xs font-semibold ${
                            p.quantity > 5
                              ? 'text-emerald-600'
                              : p.quantity > 0
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {p.quantity > 0 ? `${p.quantity} in stock` : 'Out of stock'}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCatalogModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close (ESC)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SALE COMPLETED / RECEIPT MODAL */}
      {completedSale && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 print:p-0 print:static print:bg-transparent print:block print:inset-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden print:max-w-none print:w-auto print:shadow-none print:rounded-none">
            {/* Modal Header */}
            <div className="p-6 text-center border-b border-slate-100 bg-emerald-50/60 print:hidden">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <PackageCheck size={28} />
              </div>
              <h3 className="text-xl font-black text-slate-900">Sale Completed!</h3>
              <p className="text-xs font-mono font-bold text-slate-500 mt-1">
                Invoice: {completedSale.sale.invoice_number}
              </p>
              <div className="mt-3 text-2xl font-black text-emerald-700">
                {formatPrice(Number(completedSale.sale.total), currencySymbol)}
              </div>
            </div>

            {/* Receipt Preview */}
            <div className="p-4 max-h-[50vh] overflow-y-auto print:max-h-none print:p-0 print:overflow-visible">
              <PosReceipt
                sale={completedSale.sale}
                items={completedSale.items}
                currencySymbol={currencySymbol}
              />
            </div>

            {/* Actions */}
            <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-2.5 print:hidden">
              <button
                type="button"
                onClick={() => {
                  markInvoicePrinted(completedSale.sale.id);
                  window.print();
                }}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Printer size={17} />
                <span>Print Thermal Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompletedSale(null);
                  focusBarcode();
                }}
                className="w-full py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Start Next Sale (ESC)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
