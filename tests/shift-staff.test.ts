import { test, before } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { checkout } from "../src/lib/checkout";
import { closeShift, openShift, reviewShift, shiftSummary, currentShift } from "../src/lib/shift";
import { addStaff, resetStaffPin, setStaffActive } from "../src/lib/staff";
import type { SessionData } from "../src/lib/session";

const id = () => crypto.randomUUID();
let owner: SessionData, manager: SessionData, cashier: SessionData, product: string;
let phoneSeq = Math.floor(Math.random() * 1e6);
const phone = () => `09${String(10000000 + ++phoneSeq).slice(-8)}`;

async function user(tenantId: string, branchId: string, role: SessionData["role"], mode: SessionData["mode"]): Promise<SessionData> {
  const u = await db.user.create({ data: { tenantId, branchId, name: role, phone: phone(), role } });
  return { userId: u.id, tenantId, branchId, role, name: role, mode };
}

before(async () => {
  const tenant = await db.tenant.create({ data: { name: "Shift Test", mode: "GROCERY" } });
  const branch = await db.branch.create({ data: { tenantId: tenant.id, name: "Main" } });
  owner = await user(tenant.id, branch.id, "OWNER", "GROCERY");
  manager = await user(tenant.id, branch.id, "MANAGER", "GROCERY");
  cashier = await user(tenant.id, branch.id, "CASHIER", "GROCERY");
  const p = await db.product.create({ data: { tenantId: tenant.id, name: "Water", price: 2500 } });
  await db.stockLevel.create({ data: { productId: p.id, branchId: branch.id, quantity: 100 } });
  product = p.id;
});

test("cannot take payment without an open shift", async () => {
  await assert.rejects(
    checkout(cashier, { clientId: id(), action: "pay", items: [{ productId: product, quantity: 1 }], payments: [{ method: "CASH", amount: 2500 }] }),
    /Open a shift/,
  );
  const stock = await db.stockLevel.findFirstOrThrow({ where: { productId: product } });
  assert.equal(Number(stock.quantity), 100, "failed sale rolls back stock");
});

test("shift lifecycle: expected cash = float + cash sales only", async () => {
  await openShift(cashier, 50000); // 500 ETB float
  await assert.rejects(openShift(cashier, 0), /already have an open shift/);
  await checkout(cashier, { clientId: id(), action: "pay", items: [{ productId: product, quantity: 4 }], payments: [{ method: "CASH", amount: 10000, tendered: 20000 }] });
  await checkout(cashier, { clientId: id(), action: "pay", items: [{ productId: product, quantity: 2 }], payments: [{ method: "TELEBIRR", amount: 5000, reference: "TB1" }] });

  const open = (await currentShift(cashier))!;
  const sum = await shiftSummary(open.id);
  assert.equal(sum.cashSales, 10000, "change given back is not counted");
  assert.equal(sum.expectedCash, 60000, "Telebirr sale is not cash in the till");
  assert.equal(sum.orderCount, 2);

  const closed = await closeShift(cashier, 59800); // 2 ETB short
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.expectedCash, 60000);
  assert.equal((closed.countedCash ?? 0) - (closed.expectedCash ?? 0), -200);
  assert.equal(await currentShift(cashier), null);
  await assert.rejects(closeShift(cashier, 0), /No open shift/);

  await assert.rejects(reviewShift(cashier, closed.id, "AUDITED"), /Not allowed/);
  await reviewShift(manager, closed.id, "DISPUTED");
  assert.equal((await db.shift.findUniqueOrThrow({ where: { id: closed.id } })).status, "DISPUTED");
});

test("owner adds staff; PIN is hashed; duplicate phone rejected", async () => {
  const ph = phone();
  const u = await addStaff(owner, { name: "Hana Bekele", phone: ph, pin: "4321", role: "WAITER" });
  assert.notEqual(u.pinHash, "4321");
  assert.ok(await bcrypt.compare("4321", u.pinHash!));
  await assert.rejects(addStaff(owner, { name: "Other", phone: ph, pin: "1111", role: "CASHIER" }), /already uses/);
  await assert.rejects(addStaff(owner, { name: "Xavier", phone: "123", pin: "1111", role: "CASHIER" }), /valid Ethiopian phone/);
  await assert.rejects(addStaff(owner, { name: "Xy", phone: phone(), pin: "12", role: "CASHIER" }), /PIN/);
});

test("permissions: cashier cannot add staff; manager cannot create managers or touch owner", async () => {
  await assert.rejects(addStaff(cashier, { name: "Nope", phone: phone(), pin: "1234", role: "CASHIER" }), /Not allowed/);
  await assert.rejects(addStaff(manager, { name: "Boss", phone: phone(), pin: "1234", role: "MANAGER" }), /cannot create this role/);
  await assert.rejects(addStaff(owner, { name: "Own", phone: phone(), pin: "1234", role: "OWNER" }), /valid|Invalid/i);
  await assert.rejects(setStaffActive(manager, owner.userId, false), /owner account/);
  await assert.rejects(setStaffActive(owner, owner.userId, false), /own account/);
  await assert.rejects(resetStaffPin(manager, manager.userId, "1234"), /own account/);
});

test("cannot deactivate someone with an open shift; reset PIN works", async () => {
  const c2 = await user(owner.tenantId, owner.branchId, "CASHIER", "GROCERY");
  await openShift(c2, 0);
  await assert.rejects(setStaffActive(owner, c2.userId, false), /open shift/);
  await closeShift(c2, 0);
  await setStaffActive(owner, c2.userId, false);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: c2.userId } })).active, false);
  await resetStaffPin(manager, c2.userId, "9876");
  const fresh = await db.user.findUniqueOrThrow({ where: { id: c2.userId } });
  assert.ok(await bcrypt.compare("9876", fresh.pinHash!));
});

test("staff in another shop cannot be managed", async () => {
  const other = await db.tenant.create({ data: { name: "Other shop", mode: "GROCERY" } });
  const ob = await db.branch.create({ data: { tenantId: other.id, name: "Main" } });
  const victim = await user(other.id, ob.id, "CASHIER", "GROCERY");
  await assert.rejects(setStaffActive(owner, victim.userId, false), /not found/i);
});
