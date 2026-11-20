import "./_guard";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { checkout } from "../src/lib/checkout";
import { addCustomer, recordRepayment } from "../src/lib/customers";
import { lineNets, refundOrder } from "../src/lib/refunds";
import { closeShift, currentShift, openShift, shiftSummary } from "../src/lib/shift";
import type { SessionData } from "../src/lib/session";

const id = () => crypto.randomUUID();
let owner: SessionData, cashier: SessionData, other: SessionData;
let bread: string, rice: string, phoneSeq = Math.floor(Math.random() * 1e6);

async function user(tenantId: string, branchId: string, role: SessionData["role"]): Promise<SessionData> {
  const u = await db.user.create({ data: { tenantId, branchId, name: role, phone: `09${String(30000000 + ++phoneSeq).slice(-8)}`, role } });
  return { userId: u.id, tenantId, branchId, role, name: role, mode: "GROCERY" };
}
const stock = async (s: SessionData, productId: string) =>
  Number((await db.stockLevel.findUniqueOrThrow({ where: { productId_branchId: { productId, branchId: s.branchId } } })).quantity);
const items = async (orderId: string) => db.orderItem.findMany({ where: { orderId }, orderBy: { id: "asc" } });
const sell = (s: SessionData, lines: [string, number][], pay: object[], extra: object = {}, discount = 0) =>
  checkout(s, { clientId: id(), action: "pay", discount, items: lines.map(([productId, quantity]) => ({ productId, quantity })), payments: pay, ...extra });
const refund = (s: SessionData, orderId: string, lines: { orderItemId: string; quantity: number; restock?: boolean }[], over: object = {}) =>
  refundOrder(s, { clientId: id(), orderId, method: "CASH", reason: "Customer returned", items: lines.map((l) => ({ restock: true, ...l })), ...over });

before(async () => {
  const tenant = await db.tenant.create({ data: { name: "Refund Test", mode: "GROCERY" } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Main" } });
  owner = await user(tenant.id, branch.id, "OWNER");
  cashier = await user(tenant.id, branch.id, "CASHIER");
  const b = await db.product.create({ data: { tenantId: tenant.id, name: "Bread", price: 3000 } });
  const r = await db.product.create({ data: { tenantId: tenant.id, name: "Rice", price: 6500, soldByWeight: true } });
  for (const p of [b, r]) await db.stockLevel.create({ data: { productId: p.id, branchId: branch.id, quantity: 100 } });
  bread = b.id; rice = r.id;
  await openShift(owner, 100000);
  await openShift(cashier, 0);
  const o = await db.tenant.create({ data: { name: "Other", mode: "GROCERY" } });
  const ob = await db.branch.create({ data: { tenantId: o.id, name: "Main" } });
  other = await user(o.id, ob.id, "OWNER");
  await openShift(other, 0);
});

test("discount is shared across lines and adds up exactly", () => {
  const nets = lineNets([{ id: "a", lineTotal: 3333 }, { id: "b", lineTotal: 3333 }, { id: "c", lineTotal: 3334 }], 1000);
  assert.equal([...nets.values()].reduce((s, n) => s + n, 0), 10000 - 1000);
});

test("only owner or manager can refund, and a shift is needed", async () => {
  const o = await sell(cashier, [[bread, 2]], [{ method: "CASH", amount: 6000 }]);
  const [line] = await items(o.id);
  await assert.rejects(refund(cashier, o.id, [{ orderItemId: line.id, quantity: 1 }]), /Only the owner or a manager/);
  const noShift = await user(owner.tenantId, owner.branchId, "MANAGER");
  await assert.rejects(refund(noShift, o.id, [{ orderItemId: line.id, quantity: 1 }]), /Open a shift/);
});

test("partial then final refund: restocks, returns the exact total, order becomes REFUNDED", async () => {
  const before = await stock(owner, bread);
  const o = await sell(cashier, [[bread, 3]], [{ method: "CASH", amount: 8000 }], {}, 1000); // 9000 - 1000 discount
  assert.equal(o.total, 8000);
  assert.equal(await stock(owner, bread), before - 3);
  const [line] = await items(o.id);

  const r1 = await refund(owner, o.id, [{ orderItemId: line.id, quantity: 1 }]);
  assert.equal(r1.amount, 2667); // 8000 / 3
  assert.equal(await stock(owner, bread), before - 2);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, "COMPLETED");

  await assert.rejects(refund(owner, o.id, [{ orderItemId: line.id, quantity: 3 }]), /only 2 left/);
  const r2 = await refund(owner, o.id, [{ orderItemId: line.id, quantity: 2 }]);
  assert.equal(r1.amount + r2.amount, 8000, "no cents lost or invented by rounding");
  assert.equal(await stock(owner, bread), before);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status, "REFUNDED");
  await assert.rejects(refund(owner, o.id, [{ orderItemId: line.id, quantity: 1 }]), /Only completed sales/);
  const moves = await db.stockMovement.findMany({ where: { orderId: o.id, type: "RETURN" } });
  assert.equal(moves.length, 2);
});

test("restock can be skipped for spoiled goods", async () => {
  const o = await sell(cashier, [[bread, 1]], [{ method: "CASH", amount: 3000 }]);
  const before = await stock(owner, bread);
  const [line] = await items(o.id);
  await refund(owner, o.id, [{ orderItemId: line.id, quantity: 1, restock: false }]);
  assert.equal(await stock(owner, bread), before);
});

test("weighed item partial refund by kg", async () => {
  const o = await sell(cashier, [[rice, 2.5]], [{ method: "CASH", amount: 16250 }]);
  const [line] = await items(o.id);
  const r = await refund(owner, o.id, [{ orderItemId: line.id, quantity: 1.5 }]);
  assert.equal(r.amount, 9750);
});

test("retrying the same refund request does not pay twice", async () => {
  const o = await sell(cashier, [[bread, 2]], [{ method: "CASH", amount: 6000 }]);
  const [line] = await items(o.id);
  const body = { clientId: id(), orderId: o.id, method: "CASH", reason: "Returned", items: [{ orderItemId: line.id, quantity: 1, restock: true }] };
  const a = await refundOrder(owner, body);
  const b = await refundOrder(owner, body);
  assert.equal(a.id, b.id);
  assert.equal((await db.refund.count({ where: { orderId: o.id } })), 1);
});

test("two refunds of the same sale at once: only one succeeds", async () => {
  const o = await sell(cashier, [[bread, 1]], [{ method: "CASH", amount: 3000 }]);
  const [line] = await items(o.id);
  const res = await Promise.allSettled([refund(owner, o.id, [{ orderItemId: line.id, quantity: 1 }]), refund(owner, o.id, [{ orderItemId: line.id, quantity: 1 }])]);
  assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await db.refund.aggregate({ where: { orderId: o.id }, _sum: { amount: true } }))._sum.amount, 3000);
});

test("electronic refunds go back the way they came and need a reference", async () => {
  const o = await sell(cashier, [[bread, 2]], [{ method: "TELEBIRR", amount: 6000, reference: "TB9" }]);
  const [line] = await items(o.id);
  await assert.rejects(refund(owner, o.id, [{ orderItemId: line.id, quantity: 1 }], { method: "TELEBIRR" }), /reference/);
  await assert.rejects(refund(owner, o.id, [{ orderItemId: line.id, quantity: 1 }], { method: "CBE_BIRR", reference: "X" }), /did not pay this way/);
  const r = await refund(owner, o.id, [{ orderItemId: line.id, quantity: 1 }], { method: "TELEBIRR", reference: "TB-REV-1" });
  assert.equal(r.method, "TELEBIRR");
});

test("credit sale refund lowers what the customer owes", async () => {
  const c = await addCustomer(owner, { name: "Credit Buyer", creditLimit: 20000 });
  const o = await sell(cashier, [[bread, 4]], [{ method: "CREDIT", amount: 12000 }], { customerId: c.id });
  assert.equal((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).creditBalance, 12000);
  const [line] = await items(o.id);
  await refund(owner, o.id, [{ orderItemId: line.id, quantity: 1 }], { method: "CREDIT" });
  assert.equal((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).creditBalance, 9000);
  const entry = await db.creditEntry.findFirstOrThrow({ where: { customerId: c.id, type: "REFUND" } });
  assert.equal(entry.amount, 3000);

  // After the customer has paid it all back, there is no balance left to reduce: refund in cash instead.
  await recordRepayment(cashier, c.id, { amount: 9000, method: "CASH" });
  await assert.rejects(refund(owner, o.id, [{ orderItemId: line.id, quantity: 1 }], { method: "CREDIT" }), /already paid back/);
  await refund(owner, o.id, [{ orderItemId: line.id, quantity: 1 }], { method: "CASH" });
});

test("cash refunds come out of the till of the shift that paid them", async () => {
  const mgr = await user(owner.tenantId, owner.branchId, "MANAGER");
  await openShift(mgr, 50000);
  const o = await sell(mgr, [[bread, 2]], [{ method: "CASH", amount: 6000 }]);
  const [line] = await items(o.id);
  let sum = await shiftSummary((await currentShift(mgr))!.id);
  assert.equal(sum.expectedCash, 56000);
  await refund(mgr, o.id, [{ orderItemId: line.id, quantity: 2 }]); // full refund, status becomes REFUNDED
  sum = await shiftSummary((await currentShift(mgr))!.id);
  assert.equal(sum.cashRefunds, 6000);
  assert.equal(sum.expectedCash, 50000, "sale still counted as money in, refund counted as money out");
  const closed = await closeShift(mgr, 50000);
  assert.equal(closed.expectedCash, 50000);
});

test("other shops cannot refund this shop's sales", async () => {
  const o = await sell(cashier, [[bread, 1]], [{ method: "CASH", amount: 3000 }]);
  const [line] = await items(o.id);
  await assert.rejects(refund(other, o.id, [{ orderItemId: line.id, quantity: 1 }]), /Order not found/);
});
