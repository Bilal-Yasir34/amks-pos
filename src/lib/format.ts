export function formatPrice(amount: number, currencySymbol = 'Rs.'): string {
  const formatted = Number(amount).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${currencySymbol}${formatted}`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateBarcodeNumber(): string {
  const prefix = '200';
  const random = Math.floor(Math.random() * 1000000000)
    .toString()
    .padStart(9, '0');
  return prefix + random;
}

export function generateNextProductCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const num = parseInt(code, 10);
    if (!isNaN(num) && num > max) {
      max = num;
    }
  }
  return (max + 1).toString().padStart(4, '0');
}

export function generateInvoiceNumber(counter: number): string {
  return `AMKS-${(counter + 1).toString().padStart(6, '0')}`;
}
