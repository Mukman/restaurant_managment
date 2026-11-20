import "./_guard";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { checkout } from "../src/lib/checkout";
import { refundOrder } from "../src/lib/refunds";
import { openShift } from "../src/lib/shift";
import { parseRange, salesReport, localDay, ReportError } from "../src/lib/reports";
import type { SessionData } from "../src/lib/session";

const id = () => crypto.randomUUID();
let owner: SessionData, cashier: SessionData, other: SessionData, bread: string, tea: string;
let seq = Math.floor(Math.random() * 1e6);

async function user(tenantId: string, branchId: string, role: SessionData["role"]): Promise<SessionData> {
  const u = await db.user.create({ data: { tenantId, branchId, name: role, phone: `09${String(50000000 + ++seq).slice(-8)}`, role } });
  return { userId: u.id, tenantId, branchId, role, name: role, mode: "GROCERY" };
}
const sell = (s: SessionData, productId: string, quantity: number, pay: object[]) =>
  checkout(s, { clientId: id(), action: "pay", discount: 0, items: [{ productId, quantity }], payments: pay });
const wide = () => {
  const day = localDay(new Date());
  return parseRange(day, day);
};

before(async () => {
  const t = await db.tenant.create({ data: { name: "Report Test", mode: "GROCERY" } });
  const b = await db.branch.create({ data: { tenantId: t.id, name: "Main" } });
  owner = await user(t.id, b.id, "OWNER");
  cashier = await user(t.id, b.id, "CASHIER");
  const p1 = await db.product.create({ data: { tenantId: t.id, name: "Bread", price: 3000 } });
  const p2 = await db.product.create({ data: { tenantId: t.id, name: "Tea", price: 1000 } });
  for (const p of [p1, p2]) await db.stockLevel.create({ data: { productId: p.id, branchId: b.id, quantity: 100 } });
  bread = p1.id; tea = p2.id;
  await openShift(owner, 0);
  await openShift(cashier, 0);
  const o = await db.tenant.create({ data: { name: "Other Report", mode: "GROCERY" } });
  const ob = await db.branch.create({ data: { tenantId: o.id, name: "Main" } });
  other = await user(o.id, ob.id, "OWNER");
  await openShift(other, 0);
});

test("totals, refunds, methods and top products add up", async () => {
  await sell(cashier, bread, 2, [{ method: "CASH", amount: 6000 }]);
  const o2 = await sell(cashier, tea, 3, [{ method: "TELEBIRR", amount: 3000, reference: "TB1" }]);
  const [line] = await db.orderItem.findMany({ where: { orderId: o2.id } });
  await refundOrder(owner, { clientId: id(), orderId: o2.id, method: "TELEBIRR", reference: "R1", reason: "bad", items: [{ orderItemId: line.id, quantity: 1, restock: true }] });
  const r = await salesReport(owner, wide());
  assert.equal(r.orders, 2);
  assert.equal(r.gross, 9000);
  assert.equal(r.refunded, 1000);
  assert.equal(r.net, 8000);
  assert.equal(r.byDay.length, 1);
  assert.equal(r.byDay[0].net, 8000);
  assert.deepEqual(r.byMethod.map((m) => [m.method, m.amount]), [["CASH", 6000], ["TELEBIRR", 3000]]);
  assert.equal(r.topProducts[0].name, "Bread");
  assert.equal(r.topProducts[0].revenue, 6000);
});

test("only owner or manager can run reports, and shops never see each other", async () => {
  await assert.rejects(salesReport(cashier, wide()), /Not allowed/);
  const r = await salesReport(other, wide());
  assert.equal(r.orders, 0);
  assert.equal(r.net, 0);
});

test("date range is validated", () => {
  assert.throws(() => parseRange("2026-05-02", "2026-05-01"), ReportError);
  assert.throws(() => parseRange("2020-01-01", "2026-05-01"), /one year/);
  const d = parseRange("junk", "also junk");
  assert.equal(d.to, localDay(new Date()));
});
