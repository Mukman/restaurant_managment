import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { normalizePhone } from "./phone";
import type { Role, SessionData } from "./session";

export class StaffError extends Error {}

// Owners can create any role except another owner; managers can only create floor/stock staff.
const CREATABLE: Record<string, Role[]> = {
  OWNER: ["MANAGER", "CASHIER", "WAITER", "INVENTORY"],
  MANAGER: ["CASHIER", "WAITER", "INVENTORY"],
};

export const staffSchema = z.object({
  name: z.string().trim().min(2, "Enter the person's name").max(60),
  phone: z.string(),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits"),
  role: z.enum(["MANAGER", "CASHIER", "WAITER", "INVENTORY"]),
});

function assertCanManage(s: SessionData) {
  if (!CREATABLE[s.role]) throw new StaffError("Not allowed");
}

export async function addStaff(s: SessionData, raw: unknown) {
  assertCanManage(s);
  const parsed = staffSchema.safeParse(raw);
  if (!parsed.success) throw new StaffError(parsed.error.issues[0].message);
  const d = parsed.data;
  if (!CREATABLE[s.role].includes(d.role)) throw new StaffError("You cannot create this role");
  const phone = normalizePhone(d.phone);
  if (!phone) throw new StaffError("Enter a valid Ethiopian phone number");
  const dup = await db.user.findFirst({ where: { tenantId: s.tenantId, phone } });
  if (dup) throw new StaffError(`${dup.name} already uses this phone number`);
  const user = await db.user.create({
    data: {
      tenantId: s.tenantId,
      branchId: s.branchId,
      name: d.name,
      phone,
      role: d.role,
      pinHash: await bcrypt.hash(d.pin, 10),
    },
  });
  await db.auditLog.create({
    data: { tenantId: s.tenantId, userId: s.userId, action: "staff.added", entity: "User", entityId: user.id, detail: { role: d.role } },
  });
  return user;
}

async function target(s: SessionData, userId: string) {
  assertCanManage(s);
  const u = await db.user.findFirst({ where: { id: userId, tenantId: s.tenantId } });
  if (!u) throw new StaffError("User not found");
  if (u.id === s.userId) throw new StaffError("You cannot change your own account here");
  if (u.role === "OWNER") throw new StaffError("The owner account cannot be changed");
  if (!CREATABLE[s.role].includes(u.role)) throw new StaffError("You cannot manage this role");
  return u;
}

export async function setStaffActive(s: SessionData, userId: string, active: boolean) {
  const u = await target(s, userId);
  if (!active) {
    const open = await db.shift.count({ where: { userId: u.id, status: "OPEN" } });
    if (open > 0) throw new StaffError(`${u.name} has an open shift. Ask them to close it first.`);
  }
  await db.user.update({ where: { id: u.id }, data: { active } });
  await db.auditLog.create({
    data: { tenantId: s.tenantId, userId: s.userId, action: active ? "staff.activated" : "staff.deactivated", entity: "User", entityId: u.id },
  });
}

export async function resetStaffPin(s: SessionData, userId: string, pin: string) {
  const u = await target(s, userId);
  if (!/^\d{4,6}$/.test(pin)) throw new StaffError("PIN must be 4–6 digits");
  await db.user.update({ where: { id: u.id }, data: { pinHash: await bcrypt.hash(pin, 10), failedAttempts: 0, lockedUntil: null } });
  await db.auditLog.create({
    data: { tenantId: s.tenantId, userId: s.userId, action: "staff.pin_reset", entity: "User", entityId: u.id },
  });
}
