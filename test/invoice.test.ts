import { describe, expect, it } from "vitest";
import { computeTotals, formatCents } from "../src/invoice.js";

const lines = [
  { description: "Consulting", quantity: 2, unitPriceCents: 10_000 },
  { description: "Hosting", quantity: 1, unitPriceCents: 2_500 },
];

describe("computeTotals", () => {
  it("adds lines and tax", () => {
    expect(computeTotals(lines, 0.1)).toEqual({ subtotalCents: 22_500, discountCents: 0, taxCents: 2_250, totalCents: 24_750 });
  });

  it("applies the discount before tax", () => {
    expect(computeTotals(lines, 0.1, 10)).toEqual({ subtotalCents: 22_500, discountCents: 2_250, taxCents: 2_025, totalCents: 22_275 });
  });

  // Line discounts (issue #4): each line is reduced first, so subtotalCents is net and the invariant still holds.
  it("applies a line discount to only that line, before tax", () => {
    const discounted = [{ ...lines[0]!, discountPercent: 10 }, lines[1]!];
    expect(computeTotals(discounted, 0.1)).toEqual({ subtotalCents: 20_500, discountCents: 0, taxCents: 2_050, totalCents: 22_550 });
  });

  it("applies line discounts first, then the invoice discount", () => {
    const discounted = [{ ...lines[0]!, discountPercent: 10 }, lines[1]!];
    expect(computeTotals(discounted, 0.1, 10)).toEqual({ subtotalCents: 20_500, discountCents: 2_050, taxCents: 1_845, totalCents: 20_295 });
  });

  it("leaves totals unchanged when no line has a discount", () => {
    const explicitZero = lines.map((l) => ({ ...l, discountPercent: 0 }));
    expect(computeTotals(explicitZero, 0.1, 10)).toEqual(computeTotals(lines, 0.1, 10));
  });

  it("accepts line discount boundaries 0 and 100", () => {
    expect(computeTotals([{ ...lines[0]!, discountPercent: 0 }], 0).subtotalCents).toBe(20_000);
    expect(computeTotals([{ ...lines[0]!, discountPercent: 100 }], 0.1)).toEqual({ subtotalCents: 0, discountCents: 0, taxCents: 0, totalCents: 0 });
  });

  it("rounds each line's discount on its own", () => {
    const pennies = [1, 2, 3].map((i) => ({ description: `item ${i}`, quantity: 1, unitPriceCents: 5, discountPercent: 10 }));
    expect(computeTotals(pennies, 0).subtotalCents).toBe(12); // 0.5c rounds to 1c per line: 3 x 4c
  });

  it("rejects out-of-range and non-finite line discounts, naming the line", () => {
    for (const bad of [-1, 101, NaN, Infinity]) {
      expect(() => computeTotals([{ ...lines[0]!, discountPercent: bad }], 0)).toThrow(/discountPercent must be between 0 and 100 on "Consulting"/);
    }
  });

  it("rejects non-finite tax rates and invoice discounts", () => {
    expect(() => computeTotals(lines, NaN)).toThrow(/taxRate must be between 0 and 1/);
    expect(() => computeTotals(lines, Infinity)).toThrow(RangeError);
    expect(() => computeTotals(lines, 0.1, NaN)).toThrow(/discountPercent must be between 0 and 100/);
  });

  // Added after mutation testing showed these boundaries were unpinned.
  it("accepts the discount boundaries 0 and 100", () => {
    expect(computeTotals(lines, 0.1, 0).discountCents).toBe(0);
    expect(computeTotals(lines, 0.1, 100)).toEqual({ subtotalCents: 22_500, discountCents: 22_500, taxCents: 0, totalCents: 0 });
  });

  it("accepts the tax boundaries 0 and 1", () => {
    expect(computeTotals(lines, 0).taxCents).toBe(0);
    expect(computeTotals(lines, 1).taxCents).toBe(22_500);
  });

  it("names the bad argument in the error", () => {
    expect(() => computeTotals(lines, -0.1)).toThrow(/taxRate must be between 0 and 1/);
    expect(() => computeTotals(lines, 0.1, -1)).toThrow(/discountPercent must be between 0 and 100/);
    expect(() => computeTotals(lines, 0.1, 101)).toThrow(/discountPercent must be between 0 and 100/);
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
