import { describe, expect, it } from "vitest";
import { renderCustomerRow, topCustomers } from "../src/customer-report.js";

const inv = (customerId: string, unitPriceCents: number) => ({
  customerId, customerName: `Customer ${customerId}`, taxRate: 0,
  lines: [{ description: "Work", quantity: 1, unitPriceCents }],
});

describe("topCustomers", () => {
  it("sums invoices per customer, highest first", () => {
    expect(topCustomers([inv("a", 100), inv("b", 500), inv("a", 300)]).map((r) => [r.customerId, r.totalCents]))
      .toEqual([["b", 500], ["a", 400]]);
  });

  it("renders a table row", () => {
    expect(renderCustomerRow({ customerId: "x", customerName: "Ada", totalCents: 1234 })).toBe("<tr><td>Ada</td><td>$12.34</td></tr>");
  });
});
