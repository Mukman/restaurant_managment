// All amounts are integer santim (1 ETB = 100 santim).

export const SANTIM_PER_BIRR = 100;

export function toSantim(birr: number): number {
  return Math.round(birr * SANTIM_PER_BIRR);
}

export function formatETB(santim: number, locale: "en" | "am" = "en"): string {
  const birr = santim / SANTIM_PER_BIRR;
  const n = birr.toLocaleString(locale === "am" ? "am-ET" : "en-US", {
    minimumFractionDigits: santim % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return locale === "am" ? `${n} ብር` : `${n} ETB`;
}

// Prices are VAT-inclusive. vatRate is in basis points (1500 = 15%).
export function vatIncluded(grossSantim: number, vatRate: number): number {
  return Math.round((grossSantim * vatRate) / (10000 + vatRate));
}

export interface CartLine {
  unitPrice: number; // santim
  quantity: number; // pieces, or kg for weighed items
  vatRate: number;
}

export function lineTotal(line: CartLine): number {
  return Math.round(line.unitPrice * line.quantity);
}

// Discount is spread across lines in proportion to their value so VAT stays correct.
export function cartTotals(lines: CartLine[], discount = 0) {
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const d = Math.min(Math.max(discount, 0), subtotal);
  // Sum net amounts per VAT rate first, then round once per rate (not per line).
  const byRate = new Map<number, number>();
  for (const l of lines) {
    const gross = lineTotal(l);
    const net = subtotal === 0 ? 0 : gross - (gross * d) / subtotal;
    byRate.set(l.vatRate, (byRate.get(l.vatRate) ?? 0) + net);
  }
  let vat = 0;
  for (const [rate, amount] of byRate) vat += vatIncluded(amount, rate);
  return { subtotal, discount: d, vat, total: subtotal - d };
}

export function changeDue(total: number, tendered: number): number {
  return tendered - total;
}
