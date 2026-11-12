// Tiny domain used as the "product" agents work on. Small on purpose: easy to extend through issues.

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** Optional discount (0-100) applied to this line only, before the invoice-level discount. */
  discountPercent?: number;
}

export interface InvoiceTotals {
  /** Sum of line amounts after each line's own discount. */
  subtotalCents: number;
  /** Invoice-level discount, applied to the subtotal before tax. */
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Totals for an invoice. Each line's `discountPercent` reduces that line first, so the subtotal is net of line discounts;
 * then the invoice-level `discountPercent` applies to the subtotal, then tax. Amounts are integer cents.
 */
export function computeTotals(lines: InvoiceLine[], taxRate: number, discountPercent = 0): InvoiceTotals {
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) throw new RangeError("taxRate must be between 0 and 1");
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new RangeError("discountPercent must be between 0 and 100");
  }

  const subtotalCents = lines.reduce((sum, line) => {
    if (line.quantity < 0) throw new RangeError(`negative quantity on "${line.description}"`);
    const linePercent = line.discountPercent ?? 0;
    if (!Number.isFinite(linePercent) || linePercent < 0 || linePercent > 100) {
      throw new RangeError(`discountPercent must be between 0 and 100 on "${line.description}"`);
    }
    const gross = line.quantity * line.unitPriceCents;
    // Rounding point: each line's discount is rounded to whole cents on its own, as it would print on the invoice.
    return sum + gross - Math.round((gross * linePercent) / 100);
  }, 0);
  const discountCents = Math.round((subtotalCents * discountPercent) / 100);
  const taxCents = Math.round((subtotalCents - discountCents) * taxRate);
  return { subtotalCents, discountCents, taxCents, totalCents: subtotalCents - discountCents + taxCents };
}

export function formatCents(cents: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}
