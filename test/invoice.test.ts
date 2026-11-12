import { describe, expect, it } from "vitest";
import { computeTotals, formatCents } from "../src/invoice.js";

const lines = [
  { description: "Consulting", quantity: 2, unitPriceCents: 10_000 },
  { description: "Hosting", quantity: 1, unitPriceCents: 2_500 },
];

describe("computeTotals", () => {
  it("adds lines and tax", () => {
    expect(computeTotals(lines, 0.1)).toEqual({ subtotalCents: 22_500, lineDiscountCents: 0, discountCents: 0, taxCents: 2_250, totalCents: 24_750 });
  });

  it("applies the discount before tax", () => {
    expect(computeTotals(lines, 0.1, 10)).toEqual({ subtotalCents: 22_500, lineDiscountCents: 0, discountCents: 2_250, taxCents: 2_025, totalCents: 22_275 });
  });

  it("applies a line discount to only that line, before tax", () => {
    const discounted = [{ ...lines[0]!, discountPercent: 10 }, lines[1]!];
    expect(computeTotals(discounted, 0.1)).toEqual({ subtotalCents: 22_500, lineDiscountCents: 2_000, discountCents: 0, taxCents: 2_050, totalCents: 22_550 });
  });

  it("applies line discounts first, then the invoice discount", () => {
    const discounted = [{ ...lines[0]!, discountPercent: 10 }, lines[1]!];
    expect(computeTotals(discounted, 0.1, 10)).toEqual({ subtotalCents: 22_500, lineDiscountCents: 2_000, discountCents: 2_050, taxCents: 1_845, totalCents: 20_295 });
  });

  it("rejects out-of-range line discounts", () => {
    expect(() => computeTotals([{ ...lines[0]!, discountPercent: -1 }], 0)).toThrow(RangeError);
    expect(() => computeTotals([{ ...lines[0]!, discountPercent: 101 }], 0)).toThrow(RangeError);
    expect(() => computeTotals([{ ...lines[0]!, discountPercent: 101 }], 0)).toThrow(/between 0 and 100 on "Consulting"/);
  });

  it("accepts line discount boundaries 0 and 100", () => {
    const zero = [{ ...lines[0]!, discountPercent: 0 }];
    expect(computeTotals(zero, 0)).toEqual({ subtotalCents: 20_000, lineDiscountCents: 0, discountCents: 0, taxCents: 0, totalCents: 20_000 });
    const full = [{ ...lines[0]!, discountPercent: 100 }];
    expect(computeTotals(full, 0.1)).toEqual({ subtotalCents: 20_000, lineDiscountCents: 20_000, discountCents: 0, taxCents: 0, totalCents: 0 });
  });

  it("rejects non-finite discounts and tax rates", () => {
    expect(() => computeTotals([{ ...lines[0]!, discountPercent: NaN }], 0)).toThrow(RangeError);
    expect(() => computeTotals([{ ...lines[0]!, discountPercent: Infinity }], 0)).toThrow(RangeError);
    expect(() => computeTotals(lines, 0.1, NaN)).toThrow(RangeError);
    expect(() => computeTotals(lines, NaN)).toThrow(RangeError);
    expect(() => computeTotals(lines, Infinity)).toThrow(RangeError);
  });

  // Added after mutation testing showed these boundaries were unpinned.
  it("accepts the discount boundaries 0 and 100", () => {
    expect(computeTotals(lines, 0.1, 0).discountCents).toBe(0);
    expect(computeTotals(lines, 0.1, 100)).toEqual({ subtotalCents: 22_500, lineDiscountCents: 0, discountCents: 22_500, taxCents: 0, totalCents: 0 });
  });

  it("accepts the tax boundaries 0 and 1", () => {
    expect(computeTotals(lines, 0).taxCents).toBe(0);
    expect(computeTotals(lines, 1).taxCents).toBe(22_500);
  });

  it("names the bad argument in the error", () => {
    expect(() => computeTotals(lines, -0.1)).toThrow(/taxRate must be a finite number between 0 and 1/);
    expect(() => computeTotals(lines, 0.1, -1)).toThrow(/discountPercent must be a finite number between 0 and 100/);
    expect(() => computeTotals(lines, 0.1, 101)).toThrow(/discountPercent must be a finite number between 0 and 100/);
  });

  it("handles an empty invoice", () => {
    expect(computeTotals([], 0.2).totalCents).toBe(0);
  });

  it("rejects invalid input", () => {
    expect(() => computeTotals(lines, 1.5)).toThrow(RangeError);
    expect(() => computeTotals(lines, 0.1, 120)).toThrow(RangeError);
    expect(() => computeTotals([{ description: "x", quantity: -1, unitPriceCents: 1 }], 0)).toThrow(/negative quantity/);
  });
});

describe("formatCents", () => {
  it("formats US dollars", () => {
    expect(formatCents(24_750)).toBe("$247.50");
  });
});
