import "./_guard";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { checkLogin, LOCK_MINUTES, MAX_ATTEMPTS } from "../src/lib/lockout";
import { resetStaffPin } from "../src/lib/staff";
import type { SessionData } from "../src/lib/session";

let tenantId: string, owner: SessionData;
let seq = Math.floor(Math.random() * 1e6);
const phone = () => `09${String(60000000 + ++seq).slice(-8)}`;

async function staff(role: SessionData["role"] = "CASHIER", pin = "1234") {
  const p = phone();
  const u = await db.user.create({ data: { tenantId, name: "Staff", phone: p, role, pinHash: await bcrypt.hash(pin, 4) } });
  return { id: u.id, phone: p };
}

before(async () => {
  const t = await db.tenant.create({ data: { name: "Lockout Test", mode: "GROCERY" } });
  const b = await db.branch.create({ data: { tenantId: t.id, name: "Main" } });
  tenantId = t.id;
  const u = await db.user.create({ data: { tenantId, branchId: b.id, name: "Boss", phone: phone(), role: "OWNER" } });
  owner = { userId: u.id, tenantId, branchId: b.id, role: "OWNER", name: "Boss", mode: "GROCERY" };
});

test("right PIN signs in and clears earlier wrong tries", async () => {
  const u = await staff();
  await checkLogin(u.phone, "0000");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: u.id } })).failedAttempts, 1);
  assert.deepEqual(await checkLogin(u.phone, "1234"), { userId: u.id });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: u.id } })).failedAttempts, 0);
});

test("after 5 wrong PINs the account is locked, even for the right PIN", async () => {
  const u = await staff();
  for (let i = 0; i < MAX_ATTEMPTS; i++) assert.deepEqual(await checkLogin(u.phone, "9999"), { error: "Wrong phone number or PIN" });
  const locked = await checkLogin(u.phone, "1234");
  assert.ok("error" in locked && /Too many wrong PINs/.test(locked.error));
  assert.equal(await db.auditLog.count({ where: { entityId: u.id, action: "login.locked" } }), 1);
});

test("the lock ends after the wait and counting starts again", async () => {
  const u = await staff();
  for (let i = 0; i < MAX_ATTEMPTS; i++) await checkLogin(u.phone, "9999");
  const later = new Date(Date.now() + (LOCK_MINUTES + 1) * 60_000);
  assert.deepEqual(await checkLogin(u.phone, "1234", later), { userId: u.id });
  // Fresh count: one wrong PIN does not relock
  await checkLogin(u.phone, "9999", later);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: u.id } })).lockedUntil, null);
});

test("parallel guesses cannot get past the limit", async () => {
  const u = await staff();
  await Promise.all(Array.from({ length: 12 }, () => checkLogin(u.phone, "9999")));
  const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  assert.ok(row.lockedUntil && row.lockedUntil > new Date());
  const r = await checkLogin(u.phone, "1234");
  assert.ok("error" in r);
});

test("resetting the PIN unlocks, and unknown phones get the plain wrong-PIN message", async () => {
  const u = await staff();
  for (let i = 0; i < MAX_ATTEMPTS; i++) await checkLogin(u.phone, "9999");
  await resetStaffPin(owner, u.id, "5555");
  assert.deepEqual(await checkLogin(u.phone, "5555"), { userId: u.id });
  assert.deepEqual(await checkLogin("0911000000", "1234"), { error: "Wrong phone number or PIN" });
});
