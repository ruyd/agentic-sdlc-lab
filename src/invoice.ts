// Tiny domain used as the "product" agents work on. Small on purpose: easy to extend through issues.

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** Optional discount (0-100) applied to this line only, before the invoice-level discount. */
  discountPercent?: number;
}

export interface InvoiceTotals {
  /** Gross: sum of quantity * unit price, before any discount. */
  subtotalCents: number;
  /** Total of per-line discounts. */
  lineDiscountCents: number;
  /** Invoice-level discount, applied after line discounts. */
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Totals for an invoice. Line discounts apply first (reported in lineDiscountCents; subtotalCents stays gross), then the
 * invoice-level `discountPercent`, then tax. Amounts are integer cents.
 */
export function computeTotals(lines: InvoiceLine[], taxRate: number, discountPercent = 0): InvoiceTotals {
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
    throw new RangeError("taxRate must be a finite number between 0 and 1");
  }
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new RangeError("discountPercent must be a finite number between 0 and 100");
  }

  let subtotalCents = 0;
  let lineDiscountCents = 0;
  for (const line of lines) {
    if (line.quantity < 0) throw new RangeError(`negative quantity on "${line.description}"`);
    const lineDiscount = line.discountPercent ?? 0;
    if (!Number.isFinite(lineDiscount) || lineDiscount < 0 || lineDiscount > 100) {
      throw new RangeError(`discountPercent must be a finite number between 0 and 100 on "${line.description}"`);
    }
    const gross = line.quantity * line.unitPriceCents;
    subtotalCents += gross;
    lineDiscountCents += Math.round((gross * lineDiscount) / 100);
  }
  const netCents = subtotalCents - lineDiscountCents;
  const discountCents = Math.round((netCents * discountPercent) / 100);
  const taxCents = Math.round((netCents - discountCents) * taxRate);
  return { subtotalCents, lineDiscountCents, discountCents, taxCents, totalCents: netCents - discountCents + taxCents };
}

export function formatCents(cents: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}
