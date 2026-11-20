import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { checkout } from "../src/lib/checkout";
import { addCustomer, recordRepayment, setCreditLimit } from "../src/lib/customers";
import { closeShift, currentShift, openShift, shiftSummary } from "../src/lib/shift";
import type { SessionData } from "../src/lib/session";

const id = () => crypto.randomUUID();
let owner: SessionData, cashier: SessionData, other: SessionData, product: string;
let phoneSeq = Math.floor(Math.random() * 1e6);

async function user(tenantId: string, branchId: string, role: SessionData["role"]): Promise<SessionData> {
  const u = await db.user.create({ data: { tenantId, branchId, name: role, phone: `09${String(20000000 + ++phoneSeq).slice(-8)}`, role } });
  return { userId: u.id, tenantId, branchId, role, name: role, mode: "GROCERY" };
}
async function shop() {
  const tenant = await db.tenant.create({ data: { name: "Credit Test", mode: "GROCERY" } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Main" } });
  return { tenant, branch };
}
const balance = async (cid: string) => (await db.customer.findUniqueOrThrow({ where: { id: cid } })).creditBalance;
const creditSale = (s: SessionData, customerId: string, qty: number) =>
  checkout(s, { clientId: id(), action: "pay", customerId, items: [{ productId: product, quantity: qty }], payments: [{ method: "CREDIT", amount: 1000 * qty }] });

before(async () => {
  const { tenant, branch } = await shop();
  owner = await user(tenant.id, branch.id, "OWNER");
  cashier = await user(tenant.id, branch.id, "CASHIER");
  const p = await db.product.create({ data: { tenantId: tenant.id, name: "Bread", price: 1000 } });
  await db.stockLevel.create({ data: { productId: p.id, branchId: branch.id, quantity: 1000 } });
  product = p.id;
  await openShift(cashier, 10000);
  const o = await shop();
  other = await user(o.tenant.id, o.branch.id, "OWNER");
});

test("cashier-created customer has no credit; owner can set a limit", async () => {
  const c = await addCustomer(cashier, { name: "Abebe Kebede", phone: "0911 22 33 44", creditLimit: 500000 });
  assert.equal(c.creditLimit, 0, "cashier cannot grant credit");
  await assert.rejects(creditSale(cashier, c.id, 1), /credit limit/);
  await assert.rejects(setCreditLimit(cashier, c.id, 500000), /Only the owner or a manager/);
  await setCreditLimit(owner, c.id, 5000);
  assert.equal((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).creditLimit, 5000);
  await assert.rejects(addCustomer(owner, { name: "Dup", phone: "+251911223344" }), /already has this phone/);
});

test("credit sale raises the balance and writes a ledger entry; limit enforced", async () => {
  const c = await addCustomer(owner, { name: "Tigist Haile", creditLimit: 5000 });
  const order = await creditSale(cashier, c.id, 3);
  assert.equal(await balance(c.id), 3000);
  const entries = await db.creditEntry.findMany({ where: { customerId: c.id } });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "SALE");
  assert.equal(entries[0].orderId, order.id);
  await assert.rejects(creditSale(cashier, c.id, 3), /credit limit/); // 3000 + 3000 > 5000
  assert.equal(await balance(c.id), 3000, "rejected sale leaves the balance alone");
  await creditSale(cashier, c.id, 2); // exactly at the limit
  assert.equal(await balance(c.id), 5000);
});

test("two tills selling on credit at once cannot exceed the limit", async () => {
  const c = await addCustomer(owner, { name: "Race Customer", creditLimit: 3000 });
  const results = await Promise.allSettled([creditSale(cashier, c.id, 2), creditSale(cashier, c.id, 2)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await balance(c.id), 2000);
});

test("repayment lowers the balance, cannot overpay, needs reference and a shift", async () => {
  const c = await addCustomer(owner, { name: "Payer", creditLimit: 10000 });
  await creditSale(cashier, c.id, 5); // owes 5000
  await recordRepayment(cashier, c.id, { amount: 2000, method: "CASH" });
  assert.equal(await balance(c.id), 3000);
  await assert.rejects(recordRepayment(cashier, c.id, { amount: 3001, method: "CASH" }), /more than the customer owes/);
  await assert.rejects(recordRepayment(cashier, c.id, { amount: 100, method: "TELEBIRR" }), /reference/);
  await recordRepayment(cashier, c.id, { amount: 3000, method: "TELEBIRR", reference: "TB-77" });
  assert.equal(await balance(c.id), 0);
  const types = (await db.creditEntry.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "asc" } })).map((e) => e.type);
  assert.deepEqual(types, ["SALE", "REPAYMENT", "REPAYMENT"]);

  const noShift = await user(owner.tenantId, owner.branchId, "CASHIER");
  const c2 = await addCustomer(owner, { name: "Needs Shift", creditLimit: 5000 });
  await creditSale(cashier, c2.id, 1);
  await assert.rejects(recordRepayment(noShift, c2.id, { amount: 500, method: "CASH" }), /Open a shift/);
  assert.equal(await balance(c2.id), 1000);
});

test("cash repayments count in the till, Telebirr repayments do not", async () => {
  const s = await user(owner.tenantId, owner.branchId, "CASHIER");
  await openShift(s, 20000);
  const c = await addCustomer(owner, { name: "Till Check", creditLimit: 20000 });
  await creditSale(cashier, c.id, 10);
  await recordRepayment(s, c.id, { amount: 4000, method: "CASH" });
  await recordRepayment(s, c.id, { amount: 1000, method: "TELEBIRR", reference: "T1" });
  const sum = await shiftSummary((await currentShift(s))!.id);
  assert.equal(sum.cashRepayments, 4000);
  assert.equal(sum.expectedCash, 24000, "float 20000 + 4000 cash repayment; credit sale and Telebirr are not cash");
  const closed = await closeShift(s, 24000);
  assert.equal(closed.expectedCash, 24000);
});

test("customers are private to their shop", async () => {
  const c = await addCustomer(owner, { name: "Mine", creditLimit: 5000 });
  await assert.rejects(setCreditLimit(other, c.id, 1), /not found/i);
  await openShift(other, 0);
  await assert.rejects(recordRepayment(other, c.id, { amount: 100, method: "CASH" }), /not found/i);

  // The other shop sells its own product on credit to a customer id that belongs to this shop.
  const p = await db.product.create({ data: { tenantId: other.tenantId, name: "Their bread", price: 1000 } });
  await db.stockLevel.create({ data: { productId: p.id, branchId: other.branchId, quantity: 10 } });
  await assert.rejects(
    checkout(other, { clientId: id(), action: "pay", customerId: c.id, items: [{ productId: p.id, quantity: 1 }], payments: [{ method: "CREDIT", amount: 1000 }] }),
    /Customer not found/,
  );
  assert.equal(await balance(c.id), 0);
});
