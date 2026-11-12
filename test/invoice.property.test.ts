// Property-based tests: invariants from context/api/invoice.md checked on thousands of random invoices.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeTotals, type InvoiceLine } from "../src/invoice.js";

const line = fc.record({
  description: fc.string({ maxLength: 20 }),
  quantity: fc.integer({ min: 0, max: 1_000 }),
  unitPriceCents: fc.integer({ min: 0, max: 10_000_000 }),
});
const lines = fc.array(line, { maxLength: 20 });
const taxRate = fc.double({ min: 0, max: 1, noNaN: true });
const discount = fc.double({ min: 0, max: 100, noNaN: true });

describe("computeTotals properties", () => {
  it("total = subtotal - discount + tax, all integer cents", () => {
    fc.assert(
      fc.property(lines, taxRate, discount, (ls, t, d) => {
        const r = computeTotals(ls, t, d);
        expect(r.totalCents).toBe(r.subtotalCents - r.discountCents + r.taxCents);
        for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
      }),
    );
  });

  it("discount never exceeds subtotal and nothing goes negative", () => {
    fc.assert(
      fc.property(lines, taxRate, discount, (ls, t, d) => {
        const r = computeTotals(ls, t, d);
        expect(r.discountCents).toBeGreaterThanOrEqual(0);
        expect(r.discountCents).toBeLessThanOrEqual(r.subtotalCents);
        expect(r.taxCents).toBeGreaterThanOrEqual(0);
        expect(r.totalCents).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("line order does not change the totals", () => {
    fc.assert(
      fc.property(lines, taxRate, discount, (ls, t, d) => {
        expect(computeTotals([...ls].reverse(), t, d)).toEqual(computeTotals(ls, t, d));
      }),
    );
  });

  it("a higher tax rate never lowers the total", () => {
    fc.assert(
      fc.property(lines, taxRate, taxRate, discount, (ls, a, b, d) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(computeTotals(ls, hi, d).totalCents).toBeGreaterThanOrEqual(computeTotals(ls, lo, d).totalCents);
      }),
    );
  });

  it("subtotal is the exact sum of quantity x unit price", () => {
    fc.assert(
      fc.property(lines, (ls: InvoiceLine[]) => {
        const expected = ls.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
        expect(computeTotals(ls, 0).subtotalCents).toBe(expected);
      }),
    );
  });

  it("rejects out-of-range inputs with RangeError", () => {
    fc.assert(
      fc.property(fc.oneof(fc.double({ min: 1.0001, max: 1e6, noNaN: true }), fc.double({ min: -1e6, max: -0.0001, noNaN: true })), (t) => {
        expect(() => computeTotals([], t)).toThrow(RangeError);
      }),
    );
  });
});
