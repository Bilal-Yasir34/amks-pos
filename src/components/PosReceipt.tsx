import { useState, useEffect } from 'react';
import { formatPrice, formatDateTime } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import type { Sale, SaleItem, Settings } from '@/types';

export interface PosReceiptProps {
  sale: Sale;
  items: SaleItem[];
  currencySymbol?: string;
  settings?: Settings | null;
}

export function PosReceipt({
  sale,
  items,
  currencySymbol = 'Rs.',
  settings: initialSettings,
}: PosReceiptProps) {
  const [settings, setSettings] = useState<Settings | null>(initialSettings ?? null);

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
    <div className="pos-receipt-wrapper flex justify-center w-full">
      <div className="pos-receipt bg-white text-black p-4 w-full max-w-[78mm] font-mono text-xs border border-dashed border-gray-300 rounded-sm shadow-sm print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-[76mm] print:w-[76mm]">
        {/* Store Header */}
        <div className="text-center mb-3">
          <h1 className="text-lg font-black uppercase tracking-wider text-black">
            {businessName}
          </h1>
          {companyName && (
            <p className="text-[11px] font-medium text-black uppercase tracking-wide">
              {companyName}
            </p>
          )}
          <div className="border-b border-dashed border-black my-2" />
          <p className="text-xs font-bold uppercase tracking-wider text-black">
            Sales Receipt
          </p>
        </div>

        {/* Invoice & Date Meta */}
        <div className="text-[11px] mb-2 space-y-0.5 text-black">
          <div className="flex justify-between">
            <span className="font-semibold">Invoice No:</span>
            <span className="font-bold">{sale.invoice_number}</span>
          </div>
          <div className="flex justify-between">
            <span>Date & Time:</span>
            <span>{formatDateTime(sale.created_at)}</span>
          </div>
        </div>

        {/* Dashed separator */}
        <div className="border-b border-dashed border-black my-2" />

        {/* Items Table - BARCODE REMOVED as requested */}
        <div className="mb-2 text-black">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-dashed border-black">
                <th className="text-left font-bold pb-1 pr-1">ITEM</th>
                <th className="text-center font-bold pb-1 px-1 w-7 whitespace-nowrap">QTY</th>
                <th className="text-right font-bold pb-1 px-1 whitespace-nowrap">PRICE</th>
                <th className="text-right font-bold pb-1 pl-1 whitespace-nowrap">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dotted divide-gray-200 print:divide-dotted print:divide-black">
              {items.map((item) => (
                <tr key={item.id} className="pos-receipt-item">
                  <td className="py-1 pr-1 font-semibold align-top break-words">
                    <div className="leading-tight">{item.article_name_snapshot}</div>
                    {(item.product_code_snapshot || item.colour_snapshot) && (
                      <div className="text-[9px] font-normal text-gray-600 print:text-black mt-0.5">
                        {[
                          item.product_code_snapshot ? `#${item.product_code_snapshot}` : '',
                          item.colour_snapshot ? item.colour_snapshot : '',
                        ]
                          .filter(Boolean)
                          .join(' | ')}
                      </div>
                    )}
                  </td>
                  <td className="py-1 px-1 text-center align-top font-medium whitespace-nowrap">
                    {item.quantity}
                  </td>
                  <td className="py-1 px-1 text-right align-top font-medium whitespace-nowrap">
                    {formatPrice(Number(item.unit_price), currencySymbol)}
                  </td>
                  <td className="py-1 pl-1 text-right align-top font-bold whitespace-nowrap">
                    {formatPrice(Number(item.total), currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Dashed separator */}
        <div className="border-b border-dashed border-black my-2" />

        {/* Financial Summary */}
        <div className="text-[11px] space-y-1 text-black">
          <div className="flex justify-between text-gray-700 print:text-black">
            <span>Total Items:</span>
            <span>
              {items.length} ({totalQuantity} pcs)
            </span>
          </div>
          <div className="flex justify-between text-gray-700 print:text-black">
            <span>Subtotal:</span>
            <span>{formatPrice(Number(sale.subtotal), currencySymbol)}</span>
          </div>
          <div className="border-t border-dashed border-black my-1" />
          <div className="flex justify-between items-center text-sm font-black pt-0.5 text-black">
            <span className="uppercase">Net Total:</span>
            <span className="text-base">{formatPrice(Number(sale.total), currencySymbol)}</span>
          </div>
        </div>

        {/* Dashed separator */}
        <div className="border-b border-dashed border-black my-2.5" />

        {/* Receipt Footer */}
        <div className="text-center text-[10px] space-y-1 text-gray-600 print:text-black">
          <p className="font-semibold text-black uppercase">
            *** Thank you for shopping with us! ***
          </p>
          {footerText && <p className="whitespace-pre-line">{footerText}</p>}
          <p className="pt-1 text-[9px] text-gray-500 print:text-black">
            Software by AMKS POS
          </p>
        </div>
      </div>
    </div>
  );
}

// Export as InvoiceContent for backwards compatibility
export { PosReceipt as InvoiceContent };
