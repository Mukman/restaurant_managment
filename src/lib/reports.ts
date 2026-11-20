import "server-only";
import type { OrderStatus } from "@prisma/client";
import { db } from "./db";
import type { SessionData } from "./session";

export class ReportError extends Error {}

// Ethiopia is UTC+3 all year, so "a day" for the shop runs 00:00–24:00 at +03:00 no matter where the server is.
const TZ_MS = 3 * 3600_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function dayStart(d: string) {
  return new Date(`${d}T00:00:00+03:00`);
}
export function localDay(date: Date) {
  return new Date(date.getTime() + TZ_MS).toISOString().slice(0, 10);
}
export function todayLocal() {
  return localDay(new Date());
}

/** Parses ?from=&to= (inclusive days). Defaults to the last 7 days. Max 366 days so a report stays fast. */
export function parseRange(from?: string, to?: string) {
  const today = todayLocal();
  const t = to && DAY.test(to) ? to : today;
  const f = from && DAY.test(from) ? from : localDay(new Date(dayStart(t).getTime() - 6 * 86400_000));
  if (Number.isNaN(dayStart(f).getTime()) || Number.isNaN(dayStart(t).getTime())) throw new ReportError("Invalid date");
  if (f > t) throw new ReportError("The start date is after the end date");
  const start = dayStart(f);
  const end = new Date(dayStart(t).getTime() + 86400_000); // exclusive
  if (end.getTime() - start.getTime() > 366 * 86400_000) throw new ReportError("Pick a range of one year or less");
  return { from: f, to: t, start, end };
}

export async function salesReport(s: Pick<SessionData, "tenantId" | "branchId" | "role">, range: { start: Date; end: Date }) {
  if (s.role !== "OWNER" && s.role !== "MANAGER") throw new ReportError("Not allowed");
  const taken = { in: ["COMPLETED", "REFUNDED"] as OrderStatus[] };
  const orderWhere = { tenantId: s.tenantId, branchId: s.branchId, status: taken, closedAt: { gte: range.start, lt: range.end } };
  const refundWhere = { tenantId: s.tenantId, order: { branchId: s.branchId }, createdAt: { gte: range.start, lt: range.end } };

  const [orders, payments, refunds, items, purchases] = await Promise.all([
    db.order.findMany({ where: orderWhere, select: { closedAt: true, subtotal: true, discount: true, vatAmount: true, total: true } }),
    db.payment.groupBy({ by: ["method"], where: { order: orderWhere }, _sum: { amount: true } }),
    db.refund.findMany({ where: refundWhere, select: { createdAt: true, amount: true, vatAmount: true, method: true } }),
    db.orderItem.groupBy({ by: ["productId", "name"], where: { order: orderWhere }, _sum: { quantity: true, lineTotal: true } }),
    db.purchase.aggregate({ where: { tenantId: s.tenantId, branchId: s.branchId, createdAt: { gte: range.start, lt: range.end } }, _sum: { total: true }, _count: true }),
  ]);

  const days = new Map<string, { day: string; orders: number; gross: number; refunds: number }>();
  const row = (d: string) => {
    let r = days.get(d);
    if (!r) days.set(d, (r = { day: d, orders: 0, gross: 0, refunds: 0 }));
    return r;
  };
  let gross = 0, discount = 0, vat = 0;
  for (const o of orders) {
    const r = row(localDay(o.closedAt!));
    r.orders++; r.gross += o.total;
    gross += o.total; discount += o.discount; vat += o.vatAmount;
  }
  let refunded = 0;
  for (const f of refunds) {
    row(localDay(f.createdAt)).refunds += f.amount;
    refunded += f.amount; vat -= f.vatAmount;
  }
  const byDay = [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ ...r, net: r.gross - r.refunds }));

  const refundsByMethod = new Map<string, number>();
  for (const f of refunds) refundsByMethod.set(f.method, (refundsByMethod.get(f.method) ?? 0) + f.amount);

  // Same product sold under a renamed name would split into two rows, so merge by product id.
  const prod = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const i of items) {
    const p = prod.get(i.productId) ?? { name: i.name, quantity: 0, revenue: 0 };
    p.quantity += Number(i._sum.quantity ?? 0);
    p.revenue += i._sum.lineTotal ?? 0;
    prod.set(i.productId, p);
  }

  return {
    orders: orders.length,
    gross, discount, refunded,
    net: gross - refunded,
    vat,
    byDay,
    byMethod: payments.map((p) => ({ method: p.method, amount: p._sum.amount ?? 0 })).sort((a, b) => b.amount - a.amount),
    refundsByMethod: [...refundsByMethod].map(([method, amount]) => ({ method, amount })),
    topProducts: [...prod.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    purchases: { count: purchases._count, total: purchases._sum.total ?? 0 },
  };
}

export type SalesReport = Awaited<ReturnType<typeof salesReport>>;
