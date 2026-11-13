# API: invoice module (`src/invoice.ts`)

## `computeTotals(lines, taxRate, discountPercent = 0): InvoiceTotals`
- `lines[]`: `{ description: string; quantity: number (>= 0); unitPriceCents: integer }`
- `taxRate`: 0–1 inclusive
- `discountPercent`: 0–100 inclusive, applied to the subtotal before tax
- Returns integer cents: `{ subtotalCents, discountCents, taxCents, totalCents }`
- Invariants: `totalCents === subtotalCents - discountCents + taxCents`; all fields are integers; `discountCents <= subtotalCents`
- Errors: `RangeError` on out-of-range or non-finite (`NaN`, `±Infinity`) `taxRate` or `discountPercent`, or negative `quantity`

## `formatCents(cents, currency = "USD", locale = "en-US"): string`
- Formats integer cents with `Intl.NumberFormat`
