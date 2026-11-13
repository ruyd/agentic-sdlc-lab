# API: invoice module (`src/invoice.ts`)

## `computeTotals(lines, taxRate, discountPercent = 0): InvoiceTotals`
- `lines[]`: `{ description: string; quantity: number (>= 0); unitPriceCents: integer; discountPercent?: number (0–100) }`
- A line's `discountPercent` reduces that line only, rounded to whole cents per line; `subtotalCents` is the sum of lines after their own discounts
- `taxRate`: 0–1 inclusive
- `discountPercent`: 0–100 inclusive, applied to the subtotal (after line discounts) before tax
- Returns integer cents: `{ subtotalCents, discountCents, taxCents, totalCents }`
- Invariants: `totalCents === subtotalCents - discountCents + taxCents`; all fields are integers; `discountCents <= subtotalCents`
- Errors: `RangeError` on out-of-range `taxRate` or `discountPercent`, an out-of-range or non-finite line `discountPercent` (the message names the line), or negative `quantity`

## `formatCents(cents, currency = "USD", locale = "en-US"): string`
- Formats integer cents with `Intl.NumberFormat`
