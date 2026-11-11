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

  it("applies a line discount to only that line, before tax", () => {
    const discounted = [{ ...lines[0]!, discountPercent: 10 }, lines[1]!];
    expect(computeTotals(discounted, 0.1)).toEqual({ subtotalCents: 20_500, discountCents: 0, taxCents: 2_050, totalCents: 22_550 });
  });

  it("applies line discounts first, then the invoice discount", () => {
    const discounted = [{ ...lines[0]!, discountPercent: 10 }, lines[1]!];
    expect(computeTotals(discounted, 0.1, 10)).toEqual({ subtotalCents: 20_500, discountCents: 2_050, taxCents: 1_845, totalCents: 20_295 });
  });

  it("rejects out-of-range line discounts", () => {
    expect(() => computeTotals([{ ...lines[0]!, discountPercent: -1 }], 0)).toThrow(RangeError);
    expect(() => computeTotals([{ ...lines[0]!, discountPercent: 101 }], 0)).toThrow(RangeError);
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
