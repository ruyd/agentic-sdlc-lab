// Tiny domain used as the "product" agents work on. Small on purpose: easy to extend through issues.

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** Optional discount (0-100) applied to this line only, before the invoice-level discount. */
  discountPercent?: number;
}

export interface InvoiceTotals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Totals for an invoice. Line discounts apply first (subtotalCents is net of them), then the
 * invoice-level `discountPercent`, then tax. Amounts are integer cents.
 */
export function computeTotals(lines: InvoiceLine[], taxRate: number, discountPercent = 0): InvoiceTotals {
  if (taxRate < 0 || taxRate > 1) throw new RangeError("taxRate must be between 0 and 1");
  if (discountPercent < 0 || discountPercent > 100) throw new RangeError("discountPercent must be between 0 and 100");

  const subtotalCents = lines.reduce((sum, line) => {
    if (line.quantity < 0) throw new RangeError(`negative quantity on "${line.description}"`);
    const lineDiscount = line.discountPercent ?? 0;
    if (lineDiscount < 0 || lineDiscount > 100) {
      throw new RangeError(`discountPercent must be between 0 and 100 on "${line.description}"`);
    }
    const gross = line.quantity * line.unitPriceCents;
    return sum + gross - Math.round((gross * lineDiscount) / 100);
  }, 0);
  const discountCents = Math.round((subtotalCents * discountPercent) / 100);
  const taxCents = Math.round((subtotalCents - discountCents) * taxRate);
  return { subtotalCents, discountCents, taxCents, totalCents: subtotalCents - discountCents + taxCents };
}

export function formatCents(cents: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}
