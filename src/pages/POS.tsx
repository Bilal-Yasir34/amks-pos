import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Minus, Trash2, X, ShoppingCart, Search, PackagePlus, CheckCircle, Printer } from 'lucide-react';
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
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then((s) => setCurrencySymbol(s.currency_symbol));
  }, []);

  const focusBarcode = useCallback(() => {
    setTimeout(() => barcodeRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    focusBarcode();
  }, [focusBarcode]);

  // F2 to focus barcode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        focusBarcode();
      }
      if (e.key === 'F4') {
        e.preventDefault();
        handleCompleteSale();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const barcode = barcodeInput.trim();
    if (!barcode) return;

    try {
      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', barcode)
        .eq('active', true)
        .maybeSingle();

      if (error) {
        showMessage('error', 'Error looking up product. Please try again.');
        return;
      }

      if (!product) {
        showMessage('error', `Product not found for barcode: ${barcode}`);
        setBarcodeInput('');
        focusBarcode();
        return;
      }

      addProductToCart(product as Product);
      setBarcodeInput('');
      focusBarcode();
    } catch {
      showMessage('error', 'Unable to process barcode. Please try again.');
      setBarcodeInput('');
      focusBarcode();
    }
  }

  function addProductToCart(product: Product) {
    const salePrice = product.sale_price != null && product.sale_price > 0 ? product.sale_price : product.normal_price;
    const priceType = product.sale_price != null && product.sale_price > 0 ? 'sale' : 'normal';

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product_id === product.id);
      if (existing) {
        const newQty = existing.quantity + 1;
        if (newQty > product.quantity) {
          showMessage('error', `Insufficient stock. Only ${product.quantity} units are available.`);
          return prevCart;
        }
        showMessage('success', `${product.article_name} added (qty: ${newQty})`);
        return prevCart.map((item) =>
          item.product_id === product.id ? { ...item, quantity: newQty } : item
        );
      }

      if (product.quantity <= 0) {
        showMessage('error', `${product.article_name} is out of stock.`);
        return prevCart;
      }

      showMessage('success', `${product.article_name} added`);
      return [
        ...prevCart,
        {
          product_id: product.id,
          article_name: product.article_name,
          product_code: product.product_code,
          barcode: product.barcode,
          colour: product.colour,
          unit_price: salePrice,
          price_type: priceType,
          quantity: 1,
          available_stock: product.quantity,
        },
      ];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.product_id !== productId) return item;
        const newQty = item.quantity + delta;
        if (newQty < 1) return item;
        if (newQty > item.available_stock) {
          showMessage('error', `Insufficient stock. Only ${item.available_stock} units are available.`);
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
  }

  async function handleCompleteSale() {
    if (!cart.length) {
      showMessage('error', 'Cart is empty. Add products before completing the sale.');
      return;
    }
    if (completing) return;

    setCompleting(true);
    try {
      const result = await completeSale(cart);
      setCompletedSale(result);
      setCart([]);
      showMessage('success', `Sale completed! Invoice: ${result.sale.invoice_number}`);
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to complete sale.');
    } finally {
      setCompleting(false);
      focusBarcode();
    }
  }

  async function handleSearchProducts() {
    if (!productSearchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .or(`article_name.ilike.%${productSearchQuery}%,product_code.ilike.%${productSearchQuery}%,barcode.ilike.%${productSearchQuery}%,colour.ilike.%${productSearchQuery}%`)
      .limit(10);
    setSearchResults((data || []) as Product[]);
  }

  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  return (
    <>
      <div className={`max-w-7xl mx-auto ${completedSale ? 'print:hidden' : ''}`}>
        <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">New Sale / POS</h1>
        <p className="text-sm text-slate-500 mt-1">Scan or enter a barcode to add products to the cart</p>
      </div>

      {/* Message bar */}
      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle size={18} /> : <X size={18} />}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Barcode input + cart */}
        <div className="lg:col-span-2 space-y-4">
          {/* Barcode input */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <form onSubmit={handleBarcodeSubmit}>
              <div className="flex gap-2">
                <input
                  ref={barcodeRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Scan or enter barcode..."
                  className="flex-1 px-4 py-3 text-lg border-2 border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowProductSearch(true)}
                  className="px-4 py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                  title="Search Products"
                >
                  <Search size={20} />
                </button>
              </div>
            </form>
            <p className="text-xs text-slate-400 mt-2">
              Tip: Use a barcode scanner or type the barcode number and press Enter. F2 = focus input, F4 = complete sale.
            </p>
          </div>

          {/* Cart */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={20} className="text-slate-600" />
                <h2 className="font-semibold text-slate-900">Cart ({cart.length} items)</h2>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="px-4 py-12 text-center text-slate-400">
                <ShoppingCart size={48} className="mx-auto mb-3 opacity-40" />
                <p>Cart is empty. Scan or search for products to begin.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Article</th>
                      <th className="px-3 py-2 text-left font-medium">Code</th>
                      <th className="px-3 py-2 text-left font-medium">Colour</th>
                      <th className="px-3 py-2 text-right font-medium">Price</th>
                      <th className="px-3 py-2 text-center font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.product_id} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{item.article_name}</div>
                          <div className="text-xs text-slate-400">{item.barcode}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{item.product_code}</td>
                        <td className="px-3 py-2 text-slate-600">{item.colour || '-'}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="text-slate-900">{formatPrice(item.unit_price, currencySymbol)}</div>
                          <div className="text-xs text-slate-400">{item.price_type}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => updateQuantity(item.product_id, -1)}
                              className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center font-medium">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.product_id, 1)}
                              className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">
                          {formatPrice(item.unit_price * item.quantity, currencySymbol)}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeItem(item.product_id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={16} />
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

        {/* Right: Summary + checkout */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm sticky top-6">
            <h2 className="font-semibold text-slate-900 mb-4">Sale Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Items</span>
                <span className="font-medium">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium">{formatPrice(subtotal, currencySymbol)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between text-base">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="font-bold text-slate-900">{formatPrice(subtotal, currencySymbol)}</span>
              </div>
            </div>

            <button
              onClick={handleCompleteSale}
              disabled={!cart.length || completing}
              className="w-full mt-4 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              {completing ? 'Processing...' : 'Complete Sale (F4)'}
            </button>
          </div>
        </div>
      </div>

      {/* Product search modal */}
      {showProductSearch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Search Products</h3>
              <button
                onClick={() => {
                  setShowProductSearch(false);
                  setProductSearchQuery('');
                  setSearchResults([]);
                  focusBarcode();
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <input
                type="text"
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchProducts()}
                placeholder="Search by name, code, barcode, or colour..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={handleSearchProducts}
                className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                Search
              </button>

              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {searchResults.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => {
                        addProductToCart(product);
                        setShowProductSearch(false);
                        setProductSearchQuery('');
                        setSearchResults([]);
                        focusBarcode();
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:bg-blue-50 text-left"
                    >
                      <div>
                        <div className="font-medium text-slate-900">{product.article_name}</div>
                        <div className="text-xs text-slate-500">
                          {product.product_code} | {product.colour} | Stock: {product.quantity}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-slate-700">
                        {formatPrice(
                          product.sale_price != null && product.sale_price > 0
                            ? product.sale_price
                            : product.normal_price,
                          currencySymbol
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && productSearchQuery && (
                <div className="text-center py-6 text-slate-400">
                  <p>No products found. Try a different search term.</p>
                  <button
                    onClick={() => {
                      setShowProductSearch(false);
                      window.dispatchEvent(new CustomEvent('navigate', { detail: 'products' }));
                    }}
                    className="mt-3 text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 mx-auto"
                  >
                    <PackagePlus size={16} /> Add New Product
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Sale completed modal with invoice */}
    {completedSale && (
      <InvoiceModal
        sale={completedSale.sale}
        items={completedSale.items}
        currencySymbol={currencySymbol}
        onClose={() => {
          setCompletedSale(null);
          focusBarcode();
        }}
        onPrinted={async () => {
          try {
            await markInvoicePrinted(completedSale.sale.id);
          } catch {
            // Non-critical
          }
        }}
      />
    )}
  </>
);
}

function InvoiceModal({
  sale,
  items,
  currencySymbol,
  onClose,
  onPrinted,
}: {
  sale: Sale;
  items: SaleItem[];
  currencySymbol: string;
  onClose: () => void;
  onPrinted: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:p-0 print:static print:bg-transparent print:block print:inset-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[92vh] flex flex-col print:max-w-none print:w-auto print:max-h-none print:shadow-none print:rounded-none print:p-0 print:border-none">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between print:hidden">
          <div>
            <h3 className="font-semibold text-slate-900">Sale Completed!</h3>
            <p className="text-sm text-emerald-600">Invoice {sale.invoice_number}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto print:p-0 print:overflow-visible">
          <PosReceipt sale={sale} items={items} currencySymbol={currencySymbol} />
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex gap-3 print:hidden">
          <button
            onClick={() => {
              onPrinted();
              window.print();
            }}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            <Printer size={18} /> Print Receipt
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export { PosReceipt, PosReceipt as InvoiceContent } from '@/components/PosReceipt';
