import { useState, useEffect } from 'react';
import { formatPrice, formatDateTime } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import type { Sale, SaleItem, Settings } from '@/types';
import { Receipt, FileText } from 'lucide-react';

export type PrintFormat = 'thermal' | 'a4';

export interface PosReceiptProps {
  sale: Sale;
  items: SaleItem[];
  currencySymbol?: string;
  settings?: Settings | null;
  format?: PrintFormat;
  onFormatChange?: (format: PrintFormat) => void;
  showFormatSelector?: boolean;
}

export function PosReceipt({
  sale,
  items,
  currencySymbol = 'Rs.',
  settings: initialSettings,
  format: controlledFormat,
  onFormatChange,
  showFormatSelector = true,
}: PosReceiptProps) {
  const [settings, setSettings] = useState<Settings | null>(initialSettings ?? null);
  const [internalFormat, setInternalFormat] = useState<PrintFormat>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('amks_print_format') as PrintFormat | null;
      if (saved === 'thermal' || saved === 'a4') return saved;
    }
    return 'thermal';
  });

  const activeFormat = controlledFormat ?? internalFormat;

  const handleFormatChange = (newFormat: PrintFormat) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('amks_print_format', newFormat);
    }
    if (onFormatChange) {
      onFormatChange(newFormat);
    } else {
      setInternalFormat(newFormat);
    }
  };

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    } else {
      getSettings().then(setSettings);
    }
  }, [initialSettings]);

  const businessName = settings?.business_name || 'AMKS';
  const companyName = settings?.company_name || 'AMKAS International';
  const footerText = settings?.invoice_footer || 'AMKS by AMKAS International';

  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return (
    <div className="pos-receipt-wrapper w-full">
      {/* Dynamic print @page rule based on active format */}
      <style>{`
        @media print {
          @page {
            size: ${activeFormat === 'thermal' ? '100mm auto' : 'A4 portrait'};
            margin: ${activeFormat === 'thermal' ? '0mm' : '10mm'};
          }
        }
      `}</style>

      {/* Format Toggle Bar (Screen Only) */}
      {showFormatSelector && (
        <div className="print:hidden mb-4 flex items-center justify-between bg-slate-100 p-2 rounded-xl border border-slate-200">
          <span className="text-xs font-semibold text-slate-600 px-2">Print Layout:</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => handleFormatChange('thermal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeFormat === 'thermal'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Receipt size={14} />
              <span>Thermal Receipt (100mm)</span>
            </button>
            <button
              type="button"
              onClick={() => handleFormatChange('a4')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeFormat === 'a4'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <FileText size={14} />
              <span>A4 Invoice</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Layout Component */}
      {activeFormat === 'thermal' ? (
        <ThermalReceiptView
          sale={sale}
          items={items}
          currencySymbol={currencySymbol}
          businessName={businessName}
          companyName={companyName}
          footerText={footerText}
          totalQuantity={totalQuantity}
        />
      ) : (
        <A4InvoiceView
          sale={sale}
          items={items}
          currencySymbol={currencySymbol}
          businessName={businessName}
          companyName={companyName}
          footerText={footerText}
          totalQuantity={totalQuantity}
        />
      )}
    </div>
  );
}

/**
 * Clean, authentic 100mm POS Thermal Receipt Layout
 */
function ThermalReceiptView({
  sale,
  items,
  currencySymbol,
  businessName,
  companyName,
  footerText,
  totalQuantity,
}: {
  sale: Sale;
  items: SaleItem[];
  currencySymbol: string;
  businessName: string;
  companyName: string;
  footerText: string;
  totalQuantity: number;
}) {
  return (
    <div className="flex justify-center w-full">
      <div className="pos-receipt-thermal bg-white text-slate-950 p-4 w-full max-w-[100mm] text-[11px] leading-tight border border-slate-300 rounded-sm shadow-sm print:shadow-none print:border-none print:p-2 print:m-0 print:max-w-[100mm] print:w-[100mm]">
        {/* Store Branding Header */}
        <div className="text-center pb-2">
          <h1 className="text-lg font-black uppercase tracking-wider text-black">
            {businessName}
          </h1>
          {companyName && (
            <p className="text-[10px] font-semibold text-slate-700 print:text-black uppercase tracking-wide mt-0.5">
              {companyName}
            </p>
          )}
          <div className="border-b-2 border-black my-1.5" />
          <p className="text-xs font-bold uppercase tracking-wider text-black">
            SALES RECEIPT
          </p>
        </div>

        {/* Invoice & Date Meta Grid */}
        <div className="text-[11px] mb-2 space-y-0.5 text-black">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-slate-700 print:text-black">Invoice No:</span>
            <span className="font-extrabold tracking-wide font-mono text-[11px]">{sale.invoice_number}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-600 print:text-black">Date & Time:</span>
            <span className="font-medium">{formatDateTime(sale.created_at)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-600 print:text-black">Payment:</span>
            <span className="font-bold text-[10px] bg-slate-100 print:bg-transparent px-1 rounded uppercase">PAID (CASH)</span>
          </div>
        </div>

        {/* Items Table */}
        <div className="border-t border-b border-black py-1 mb-2">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-dashed border-black">
                <th className="text-left font-black pb-1 pr-1 uppercase">Item</th>
                <th className="text-center font-black pb-1 px-1 w-6 uppercase whitespace-nowrap">Qty</th>
                <th className="text-right font-black pb-1 px-1 uppercase whitespace-nowrap">Rate</th>
                <th className="text-right font-black pb-1 pl-1 uppercase whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dotted divide-slate-300 print:divide-slate-400">
              {items.map((item) => (
                <tr key={item.id} className="pos-receipt-item">
                  <td className="py-1 pr-1 align-top break-words">
                    <div className="font-bold text-black leading-tight">{item.article_name_snapshot}</div>
                    {(item.product_code_snapshot || item.colour_snapshot) && (
                      <div className="text-[9px] text-slate-600 print:text-black mt-0.5 font-medium">
                        {[
                          item.product_code_snapshot ? `#${item.product_code_snapshot}` : '',
                          item.colour_snapshot ? item.colour_snapshot : '',
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </div>
                    )}
                  </td>
                  <td className="py-1 px-1 text-center align-top font-semibold whitespace-nowrap tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="py-1 px-1 text-right align-top font-medium whitespace-nowrap tabular-nums">
                    {formatPrice(Number(item.unit_price), currencySymbol)}
                  </td>
                  <td className="py-1 pl-1 text-right align-top font-bold whitespace-nowrap tabular-nums">
                    {formatPrice(Number(item.total), currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Summary */}
        <div className="text-[11px] space-y-1 text-black">
          <div className="flex justify-between text-slate-700 print:text-black">
            <span>Total Items:</span>
            <span className="font-semibold tabular-nums">
              {items.length} ({totalQuantity} pcs)
            </span>
          </div>
          <div className="flex justify-between text-slate-700 print:text-black">
            <span>Subtotal:</span>
            <span className="font-medium tabular-nums">{formatPrice(Number(sale.subtotal), currencySymbol)}</span>
          </div>

          {/* Prominent NET TOTAL Box */}
          <div className="border-y-2 border-black py-1.5 my-1 flex justify-between items-baseline font-black">
            <span className="uppercase text-xs tracking-wider">NET TOTAL:</span>
            <span className="text-sm font-extrabold tracking-tight tabular-nums">
              {formatPrice(Number(sale.total), currencySymbol)}
            </span>
          </div>
        </div>

        {/* Invoice Barcode for fast POS scanning */}
        <div className="mt-3 text-center print:block">
          <div className="flex justify-center">
            <BarcodeDisplay
              value={sale.invoice_number}
              width={1.2}
              height={32}
              displayValue={false}
              className="mx-auto"
            />
          </div>
          <div className="text-[9px] font-mono tracking-widest text-slate-700 print:text-black mt-0.5">
            {sale.invoice_number}
          </div>
        </div>

        {/* Receipt Footer & Policies */}
        <div className="text-center text-[10px] space-y-1 text-slate-600 print:text-black mt-3 pt-2 border-t border-dashed border-black">
          <p className="font-bold text-black uppercase tracking-wide">
            *** Thank you for shopping with us! ***
          </p>
          {footerText && <p className="whitespace-pre-line text-[9px]">{footerText}</p>}
          <p className="text-[8px] text-slate-500 print:text-black">
            Software by AMKS POS
          </p>
          <div className="text-[9px] text-slate-400 print:text-slate-600 font-mono tracking-widest mt-1">
            - - - - - - - - - - - - - - - - - - - - - -
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Clean, modern A4 Business Invoice Layout
 */
function A4InvoiceView({
  sale,
  items,
  currencySymbol,
  businessName,
  companyName,
  footerText,
  totalQuantity,
}: {
  sale: Sale;
  items: SaleItem[];
  currencySymbol: string;
  businessName: string;
  companyName: string;
  footerText: string;
  totalQuantity: number;
}) {
  return (
    <div className="flex justify-center w-full">
      <div className="pos-invoice-a4 bg-white text-slate-900 p-8 w-full max-w-3xl rounded-xl border border-slate-200 shadow-md print:shadow-none print:border-none print:p-0 print:max-w-none">
        {/* Header Section */}
        <div className="flex justify-between items-start pb-6 border-b-2 border-slate-900">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase">
              {businessName}
            </h1>
            {companyName && (
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide mt-1">
                {companyName}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-2">
              POS Terminal Retail Invoice
            </p>
          </div>

          <div className="text-right">
            <div className="inline-block bg-slate-900 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-widest mb-2 print:border print:border-black print:text-black print:bg-transparent">
              TAX INVOICE
            </div>
            <div className="text-sm space-y-1">
              <div className="font-bold text-slate-900">
                Invoice #: <span className="font-mono">{sale.invoice_number}</span>
              </div>
              <div className="text-xs text-slate-600">
                Date: {formatDateTime(sale.created_at)}
              </div>
              <div className="text-xs font-semibold text-emerald-700 print:text-black">
                Status: PAID
              </div>
            </div>
          </div>
        </div>

        {/* Bill To & Meta Section */}
        <div className="grid grid-cols-2 gap-6 py-5 border-b border-slate-200 text-xs">
          <div>
            <span className="font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Customer:
            </span>
            <p className="text-sm font-semibold text-slate-800">Walk-in Customer</p>
            <p className="text-slate-500">Retail Point of Sale Transaction</p>
          </div>
          <div className="text-right">
            <span className="font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Payment Details:
            </span>
            <p className="text-slate-800"><span className="font-semibold">Method:</span> Cash / Counter</p>
            <p className="text-slate-800"><span className="font-semibold">Terminal:</span> POS Main</p>
          </div>
        </div>

        {/* Items Table */}
        <div className="py-5">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 print:bg-slate-200 border-y border-slate-300">
                <th className="py-2.5 px-3 font-bold text-slate-700 print:text-black w-8">#</th>
                <th className="py-2.5 px-3 font-bold text-slate-700 print:text-black">Item Description</th>
                <th className="py-2.5 px-3 font-bold text-slate-700 print:text-black">Code</th>
                <th className="py-2.5 px-3 font-bold text-slate-700 print:text-black">Colour</th>
                <th className="py-2.5 px-3 font-bold text-slate-700 print:text-black text-center w-12">Qty</th>
                <th className="py-2.5 px-3 font-bold text-slate-700 print:text-black text-right">Unit Price</th>
                <th className="py-2.5 px-3 font-bold text-slate-700 print:text-black text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((item, idx) => (
                <tr key={item.id} className="pos-receipt-item hover:bg-slate-50">
                  <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                    {item.article_name_snapshot}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600 print:text-black text-[11px]">
                    {item.product_code_snapshot || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 print:text-black">
                    {item.colour_snapshot || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-center font-medium tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium tabular-nums">
                    {formatPrice(Number(item.unit_price), currencySymbol)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">
                    {formatPrice(Number(item.total), currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals & Summary Grid */}
        <div className="border-t-2 border-slate-900 pt-4 flex justify-between items-start">
          <div className="space-y-3 max-w-sm">
            <div>
              <BarcodeDisplay
                value={sale.invoice_number}
                width={1.5}
                height={40}
                displayValue={true}
                fontSize={12}
              />
            </div>
            <p className="text-[11px] text-slate-500 print:text-black">
              * Goods once sold can be exchanged within 7 days upon presentation of this original invoice.
            </p>
          </div>

          <div className="w-64 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600 print:text-black">
              <span>Total Items / Pieces:</span>
              <span className="font-semibold tabular-nums">{items.length} items ({totalQuantity} pcs)</span>
            </div>
            <div className="flex justify-between text-slate-600 print:text-black">
              <span>Subtotal:</span>
              <span className="font-medium tabular-nums">{formatPrice(Number(sale.subtotal), currencySymbol)}</span>
            </div>
            <div className="border-t border-slate-300 pt-2 flex justify-between items-baseline font-black text-slate-900">
              <span className="text-sm uppercase">Net Payable:</span>
              <span className="text-lg font-extrabold tabular-nums">
                {formatPrice(Number(sale.total), currencySymbol)}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Signature & Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 flex justify-between items-end text-xs">
          <div className="text-slate-500 print:text-black">
            <p className="font-semibold text-slate-700 print:text-black">{businessName}</p>
            {footerText && <p className="mt-0.5">{footerText}</p>}
            <p className="text-[10px] mt-1">Thank you for your business!</p>
          </div>
          <div className="text-center w-48">
            <div className="border-b border-slate-400 mb-1 pb-6" />
            <span className="text-[11px] font-medium text-slate-600 print:text-black">
              Authorized Signature
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export as InvoiceContent for backwards compatibility
export { PosReceipt as InvoiceContent };
