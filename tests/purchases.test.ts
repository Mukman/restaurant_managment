import "./_guard";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { addSupplier, setSupplierActive } from "../src/lib/suppliers";
import { paySupplier, receivePurchase } from "../src/lib/purchases";
import { closeShift, currentShift, openShift, shiftSummary } from "../src/lib/shift";
import type { SessionData } from "../src/lib/session";

const id = () => crypto.randomUUID();
let owner: SessionData, inventory: SessionData, cashier: SessionData, other: SessionData;
let oil: string, rice: string, tea: string, phoneSeq = Math.floor(Math.random() * 1e6);

async function user(tenantId: string, branchId: string, role: SessionData["role"]): Promise<SessionData> {
  const u = await db.user.create({ data: { tenantId, branchId, name: role, phone: `09${String(40000000 + ++phoneSeq).slice(-8)}`, role } });
  return { userId: u.id, tenantId, branchId, role, name: role, mode: "GROCERY" };
}
const stock = async (s: SessionData, productId: string) =>
  Number((await db.stockLevel.findUnique({ where: { productId_branchId: { productId, branchId: s.branchId } } }))?.quantity ?? 0);
const cost = async (productId: string) => (await db.product.findUniqueOrThrow({ where: { id: productId } })).cost;
const owed = async (supplierId: string) => (await db.supplier.findUniqueOrThrow({ where: { id: supplierId } })).balance;
const receive = (s: SessionData, supplierId: string, items: { productId: string; quantity: number; unitCost: number; expiresAt?: string }[], extra: object = {}) =>
  receivePurchase(s, { clientId: id(), supplierId, items, ...extra });

before(async () => {
  const t = await db.tenant.create({ data: { name: "Purchase Test", mode: "GROCERY" } });
  const b = await db.branch.create({ data: { tenantId: t.id, name: "Main" } });
  owner = await user(t.id, b.id, "OWNER");
  inventory = await user(t.id, b.id, "INVENTORY");
  cashier = await user(t.id, b.id, "CASHIER");
  const mk = (name: string, extra = {}) => db.product.create({ data: { tenantId: t.id, name, price: 30000, ...extra } });
  oil = (await mk("Oil")).id;
  rice = (await mk("Rice", { soldByWeight: true })).id;
  tea = (await mk("Tea (made to order)", { tracksStock: false })).id;
  const o = await db.tenant.create({ data: { name: "Other", mode: "GROCERY" } });
  const ob = await db.branch.create({ data: { tenantId: o.id, name: "Main" } });
  other = await user(o.id, ob.id, "OWNER");
});

test("suppliers: inventory staff can add, cashier cannot, duplicates and bad phones rejected", async () => {
  const sup = await addSupplier(inventory, { name: "Sabegn Trading", phone: "0911 22 33 44" });
  assert.equal(sup.phone, "0911223344");
  assert.equal(sup.balance, 0);
  await assert.rejects(addSupplier(cashier, { name: "Nope Ltd" }), /Not allowed/);
  await assert.rejects(addSupplier(owner, { name: "sabegn trading" }), /already a supplier/);
  await assert.rejects(addSupplier(owner, { name: "Bad Phone", phone: "123" }), /valid Ethiopian phone/);
});

test("receiving stock adds quantity, sets cost, raises what we owe", async () => {
  const sup = await addSupplier(owner, { name: "Bole Fresh" });
  const p = await receive(inventory, sup.id, [{ productId: oil, quantity: 10, unitCost: 20000 }, { productId: rice, quantity: 25.5, unitCost: 5000 }], { invoiceNo: "INV-77" });
  assert.equal(p.total, 10 * 20000 + Math.round(25.5 * 5000));
  assert.equal(p.number, 1);
  assert.equal(await stock(owner, oil), 10);
  assert.equal(await stock(owner, rice), 25.5);
  assert.equal(await cost(oil), 20000);
  assert.equal(await owed(sup.id), p.total);
  const mv = await db.stockMovement.findMany({ where: { productId: oil, type: "PURCHASE" } });
  assert.equal(mv.length, 1);
  assert.equal(Number(mv[0].quantity), 10);
});

test("average cost blends old stock with new, and a second receive numbers purchases in order", async () => {
  const sup = await addSupplier(owner, { name: "Average Co" });
  // oil: 10 on hand at 200.00, receive 30 more at 240.00 -> (10*200 + 30*240) / 40 = 230.00
  const p = await receive(owner, sup.id, [{ productId: oil, quantity: 30, unitCost: 24000 }]);
  assert.equal(await cost(oil), 23000);
  assert.equal(await stock(owner, oil), 40);
  assert.equal(p.number, 2);
});

test("made-to-order products get a cost but no stock", async () => {
  const sup = await addSupplier(owner, { name: "Tea Leaves" });
  await receive(owner, sup.id, [{ productId: tea, quantity: 5, unitCost: 1500 }]);
  assert.equal(await cost(tea), 1500);
  assert.equal(await stock(owner, tea), 0);
});

test("only owner or manager pays; payment at receipt reduces what we owe", async () => {
  const sup = await addSupplier(owner, { name: "Pay At Door" });
  await assert.rejects(
    receive(inventory, sup.id, [{ productId: oil, quantity: 1, unitCost: 20000 }], { payment: { amount: 20000, method: "CASH" } }),
    /Only the owner or a manager can pay suppliers/,
  );
  assert.equal(await owed(sup.id), 0, "rejected receive leaves nothing behind");
  await assert.rejects(receive(owner, sup.id, [{ productId: oil, quantity: 1, unitCost: 20000 }], { payment: { amount: 20001, method: "CASH" } }), /more than the purchase total/);
  const p = await receive(owner, sup.id, [{ productId: oil, quantity: 2, unitCost: 20000 }], { payment: { amount: 15000, method: "TELEBIRR", reference: "TB-1" } });
  assert.equal(p.paid, 15000);
  assert.equal(await owed(sup.id), 25000);
});

test("paying on account clears the oldest purchases first and cannot overpay", async () => {
  const sup = await addSupplier(owner, { name: "Oldest First" });
  const a = await receive(owner, sup.id, [{ productId: oil, quantity: 1, unitCost: 10000 }]);
  const b = await receive(owner, sup.id, [{ productId: oil, quantity: 1, unitCost: 30000 }]);
  assert.equal(await owed(sup.id), 40000);
  await paySupplier(owner, sup.id, { amount: 15000, method: "BANK_TRANSFER", reference: "CBE-9" });
  assert.equal((await db.purchase.findUniqueOrThrow({ where: { id: a.id } })).paid, 10000, "oldest cleared first");
  assert.equal((await db.purchase.findUniqueOrThrow({ where: { id: b.id } })).paid, 5000);
  assert.equal(await owed(sup.id), 25000);
  await assert.rejects(paySupplier(owner, sup.id, { amount: 25001, method: "CASH" }), /more than you owe/);
  await assert.rejects(paySupplier(owner, sup.id, { amount: 100, method: "TELEBIRR" }), /reference/);
  await assert.rejects(paySupplier(owner, sup.id, { amount: 100, method: "CASH", purchaseId: a.id }), /already fully paid/);
  await paySupplier(owner, sup.id, { amount: 25000, method: "CASH", purchaseId: b.id });
  assert.equal(await owed(sup.id), 0);
  assert.equal(await db.supplierPayment.count({ where: { supplierId: sup.id } }), 3);
  await assert.rejects(setSupplierActive(inventory, sup.id, false), /Not allowed/);
  await setSupplierActive(owner, sup.id, false);
  await assert.rejects(receive(owner, sup.id, [{ productId: oil, quantity: 1, unitCost: 1 }]), /no longer active/);
});

test("two payments at once cannot add up to more than is owed", async () => {
  const sup = await addSupplier(owner, { name: "Race Supplier" });
  await receive(owner, sup.id, [{ productId: oil, quantity: 1, unitCost: 10000 }]);
  const res = await Promise.allSettled([
    paySupplier(owner, sup.id, { amount: 7000, method: "CASH" }),
    paySupplier(owner, sup.id, { amount: 7000, method: "CASH" }),
  ]);
  assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await owed(sup.id), 3000);
});

test("retrying the same receive does not add stock twice", async () => {
  const sup = await addSupplier(owner, { name: "Retry Supplier" });
  const before = await stock(owner, oil);
  const body = { clientId: id(), supplierId: sup.id, items: [{ productId: oil, quantity: 4, unitCost: 21000 }] };
  const a = await receivePurchase(owner, body);
  const b = await receivePurchase(owner, body);
  assert.equal(a.id, b.id);
  assert.equal(await stock(owner, oil), before + 4);
  assert.equal(await owed(sup.id), 84000);
});

test("cash paid from the till comes out of the shift's expected cash", async () => {
  await openShift(owner, 100000);
  const sup = await addSupplier(owner, { name: "Till Supplier" });
  await receive(owner, sup.id, [{ productId: oil, quantity: 1, unitCost: 30000 }]);
  await assert.rejects(paySupplier(owner, sup.id, { amount: 1000, method: "TELEBIRR", reference: "x", fromTill: true }), /Only cash can come out of the till/);
  await paySupplier(owner, sup.id, { amount: 12000, method: "CASH", fromTill: true });
  await paySupplier(owner, sup.id, { amount: 8000, method: "CASH", fromTill: false }); // paid from the owner's pocket
  const sum = await shiftSummary((await currentShift(owner))!.id);
  assert.equal(sum.cashSupplierPayments, 12000);
  assert.equal(sum.expectedCash, 88000);
  const closed = await closeShift(owner, 88000);
  assert.equal(closed.expectedCash, 88000);
  const noShift = await user(owner.tenantId, owner.branchId, "MANAGER");
  await assert.rejects(paySupplier(noShift, sup.id, { amount: 100, method: "CASH", fromTill: true }), /Open a shift/);
});

test("expiry date is recorded on the stock movement", async () => {
  const sup = await addSupplier(owner, { name: "Expiry Supplier" });
  await receive(owner, sup.id, [{ productId: oil, quantity: 2, unitCost: 100, expiresAt: "2027-03-01" }]);
  const mv = await db.stockMovement.findFirstOrThrow({ where: { productId: oil, type: "PURCHASE" }, orderBy: { createdAt: "desc" } });
  assert.equal(mv.expiresAt?.toISOString().slice(0, 10), "2027-03-01");
});

test("another shop cannot touch this shop's suppliers, products or purchases", async () => {
  const sup = await addSupplier(owner, { name: "Private Supplier" });
  await assert.rejects(receive(other, sup.id, [{ productId: oil, quantity: 1, unitCost: 1 }]), /Supplier not found/);
  const theirs = await addSupplier(other, { name: "Their Supplier" });
  await assert.rejects(receive(other, theirs.id, [{ productId: oil, quantity: 1, unitCost: 1 }]), /Product not found/);
  await assert.rejects(paySupplier(other, sup.id, { amount: 1, method: "CASH" }), /Supplier not found/);
  await assert.rejects(setSupplierActive(other, sup.id, false), /Supplier not found/);
});
