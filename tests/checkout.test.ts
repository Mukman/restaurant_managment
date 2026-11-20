import "./_guard";
// Integration tests for checkout against a real Postgres (TEST_DATABASE_URL).
// Run: npm test   (needs TEST_DATABASE_URL; each run uses throwaway shops)
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { checkout, CheckoutError } from "../src/lib/checkout";
import { openShift } from "../src/lib/shift";
import type { SessionData } from "../src/lib/session";

let g: SessionData, r: SessionData;
let rice: string, bread: string, tibs: string, table: string, customer: string;
const id = () => crypto.randomUUID();

async function makeTenant(mode: "GROCERY" | "RESTAURANT"): Promise<SessionData> {
  const tenant = await db.tenant.create({ data: { name: `Test ${mode}`, mode } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Main" } });
  const user = await db.user.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Cashier", phone: `09${Date.now() % 1e8}`, role: "CASHIER" } });
  const session: SessionData = { userId: user.id, tenantId: tenant.id, branchId: branch.id, role: "CASHIER", name: "Cashier", mode };
  await openShift(session, 0);
  return session;
}
async function product(s: SessionData, data: { name: string; price: number; stock: number; soldByWeight?: boolean; tracksStock?: boolean; barcode?: string }) {
  const p = await db.product.create({ data: { tenantId: s.tenantId, name: data.name, price: data.price, soldByWeight: !!data.soldByWeight, tracksStock: data.tracksStock ?? true, barcode: data.barcode } });
  await db.stockLevel.create({ data: { productId: p.id, branchId: s.branchId, quantity: data.stock } });
  return p.id;
}
const stockOf = async (s: SessionData, productId: string) =>
  Number((await db.stockLevel.findUniqueOrThrow({ where: { productId_branchId: { productId, branchId: s.branchId } } })).quantity);

before(async () => {
  g = await makeTenant("GROCERY");
  r = await makeTenant("RESTAURANT");
  rice = await product(g, { name: "Rice", price: 6500, stock: 10, soldByWeight: true }); // 65 ETB/kg
  bread = await product(g, { name: "Bread", price: 3000, stock: 5 });
  tibs = await product(r, { name: "Tibs", price: 28000, stock: 0, tracksStock: false });
  table = (await db.diningTable.create({ data: { tenantId: r.tenantId, branchId: r.branchId, label: "T1" } })).id;
  customer = (await db.customer.create({ data: { tenantId: g.tenantId, name: "Abebe", creditLimit: 10000 } })).id;
});

test("grocery cash sale: weighed + piece items, VAT, stock decrement", async () => {
  const o = await checkout(g, {
    clientId: id(), action: "pay",
    items: [{ productId: rice, quantity: 2.5 }, { productId: bread, quantity: 2 }],
    payments: [{ method: "CASH", amount: 22250, tendered: 25000 }],
  });
  assert.equal(o.status, "COMPLETED");
  assert.equal(o.total, 16250 + 6000);
  assert.equal(o.vatAmount, Math.round((22250 * 1500) / 11500));
  assert.equal(await stockOf(g, rice), 7.5);
  assert.equal(await stockOf(g, bread), 3);
});

test("retrying the same clientId does not double-sell", async () => {
  const clientId = id();
  const body = { clientId, action: "pay", items: [{ productId: bread, quantity: 1 }], payments: [{ method: "CASH", amount: 3000 }] };
  const a = await checkout(g, body);
  const b = await checkout(g, body);
  assert.equal(a.id, b.id);
  assert.equal(await stockOf(g, bread), 2);
});

test("cannot sell more than in stock", async () => {
  await assert.rejects(
    checkout(g, { clientId: id(), action: "pay", items: [{ productId: bread, quantity: 3 }], payments: [{ method: "CASH", amount: 9000 }] }),
    (e) => e instanceof CheckoutError && /not enough stock/.test(e.message),
  );
  assert.equal(await stockOf(g, bread), 2, "failed sale rolls back");
});

test("discount and payment must match total; Telebirr needs reference", async () => {
  await assert.rejects(
    checkout(g, { clientId: id(), action: "pay", items: [{ productId: bread, quantity: 1 }], discount: 500, payments: [{ method: "TELEBIRR", amount: 2500 }] }),
    /reference/,
  );
  const o = await checkout(g, { clientId: id(), action: "pay", items: [{ productId: bread, quantity: 1 }], discount: 500, payments: [{ method: "TELEBIRR", amount: 2500, reference: "TB123" }] });
  assert.equal(o.total, 2500);
  assert.equal(o.discount, 500);
});

test("credit sale needs customer and respects limit", async () => {
  await assert.rejects(
    checkout(g, { clientId: id(), action: "pay", items: [{ productId: rice, quantity: 1 }], payments: [{ method: "CREDIT", amount: 6500 }] }),
    /customer/,
  );
  await checkout(g, { clientId: id(), action: "pay", customerId: customer, items: [{ productId: rice, quantity: 1 }], payments: [{ method: "CREDIT", amount: 6500 }] });
  assert.equal((await db.customer.findUniqueOrThrow({ where: { id: customer } })).creditBalance, 6500);
  await assert.rejects(
    checkout(g, { clientId: id(), action: "pay", customerId: customer, items: [{ productId: rice, quantity: 1 }], payments: [{ method: "CREDIT", amount: 6500 }] }),
    /credit limit/,
  );
});

test("grocery mode cannot open table orders", async () => {
  await assert.rejects(checkout(g, { clientId: id(), action: "open", items: [{ productId: bread, quantity: 1 }] }), /restaurant mode/);
});

test("restaurant: open order, add items, then pay", async () => {
  const opened = await checkout(r, { clientId: id(), action: "open", tableId: table, items: [{ productId: tibs, quantity: 1 }] });
  assert.equal(opened.status, "OPEN");
  const added = await checkout(r, { clientId: id(), action: "open", orderId: opened.id, items: [{ productId: tibs, quantity: 1 }] });
  assert.equal(added.total, 56000);
  const paid = await checkout(r, { clientId: id(), action: "pay", orderId: opened.id, items: [], payments: [{ method: "CASH", amount: 56000 }] });
  assert.equal(paid.status, "COMPLETED");
  await assert.rejects(
    checkout(r, { clientId: id(), action: "pay", orderId: opened.id, items: [], payments: [{ method: "CASH", amount: 1 }] }),
    /no longer open/,
  );
});

test("tenants cannot sell each other's products", async () => {
  await assert.rejects(
    checkout(r, { clientId: id(), action: "pay", items: [{ productId: bread, quantity: 1 }], payments: [{ method: "CASH", amount: 3000 }] }),
    /not found/,
  );
});
