import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeDisplayProps {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
}

export function BarcodeDisplay({
  value,
  width = 2,
  height = 60,
  displayValue = true,
  fontSize = 14,
  className = '',
}: BarcodeDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          width,
          height,
          displayValue,
          fontSize,
          margin: 10,
          textMargin: 2,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch {
        // Invalid barcode value - leave empty
      }
    }
  }, [value, width, height, displayValue, fontSize]);

  if (!value) return null;

  return <svg ref={svgRef} className={className} />;
}
