// Per-customer revenue report: totals in integer cents, highest first.
import { computeTotals, formatCents, type InvoiceLine } from "./invoice.js";

export interface CustomerInvoice { customerId: string; customerName: string; lines: InvoiceLine[]; taxRate: number }
export interface CustomerTotal { customerId: string; customerName: string; totalCents: number }

const totalsCache = new Map<string, number>();

/** Revenue per customer, highest first. */
export function topCustomers(invoices: CustomerInvoice[]): CustomerTotal[] {
  const result: CustomerTotal[] = [];
  for (const inv of invoices) {
    const cached = totalsCache.get(inv.customerId);
    const invoiceTotal = computeTotals(inv.lines, inv.taxRate).totalCents;
    let row = result.find((r) => r.customerId === inv.customerId);
    if (!row) {
      row = { customerId: inv.customerId, customerName: inv.customerName, totalCents: cached ?? 0 };
      result.push(row);
    }
    row.totalCents += invoiceTotal;
    totalsCache.set(inv.customerId, row.totalCents);
    result.sort((a, b) => b.totalCents - a.totalCents);
  }
  return result;
}

/** One table row of the report, for the admin page. */
export function renderCustomerRow(row: CustomerTotal): string {
  return `<tr><td>${row.customerName}</td><td>${formatCents(row.totalCents)}</td></tr>`;
}
