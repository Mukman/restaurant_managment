import "server-only";
import { z } from "zod";
import { db } from "./db";
import { normalizePhone } from "./phone";
import type { SessionData } from "./session";

export class SupplierError extends Error {}

const STOCK_ROLES = ["OWNER", "MANAGER", "INVENTORY"];

export async function addSupplier(s: SessionData, raw: unknown) {
  if (!STOCK_ROLES.includes(s.role)) throw new SupplierError("Not allowed");
  const p = z
    .object({ name: z.string().trim().min(2, "Enter the supplier's name").max(80), phone: z.string().trim().optional() })
    .safeParse(raw);
  if (!p.success) throw new SupplierError(p.error.issues[0].message);
  let phone: string | null = null;
  if (p.data.phone) {
    phone = normalizePhone(p.data.phone);
    if (!phone) throw new SupplierError("Enter a valid Ethiopian phone number");
  }
  const dup = await db.supplier.findFirst({ where: { tenantId: s.tenantId, name: { equals: p.data.name, mode: "insensitive" } } });
  if (dup) throw new SupplierError(`${dup.name} is already a supplier`);
  const supplier = await db.supplier.create({ data: { tenantId: s.tenantId, name: p.data.name, phone } });
  await db.auditLog.create({
    data: { tenantId: s.tenantId, userId: s.userId, action: "supplier.added", entity: "Supplier", entityId: supplier.id },
  });
  return supplier;
}

/** A supplier we no longer buy from. History stays, but they disappear from the purchase form. */
export async function setSupplierActive(s: SessionData, supplierId: string, active: boolean) {
  if (s.role !== "OWNER" && s.role !== "MANAGER") throw new SupplierError("Not allowed");
  const sup = await db.supplier.findFirst({ where: { id: supplierId, tenantId: s.tenantId } });
  if (!sup) throw new SupplierError("Supplier not found");
  if (!active && sup.balance > 0) throw new SupplierError("You still owe this supplier money. Pay it first.");
  await db.supplier.update({ where: { id: sup.id }, data: { active } });
  await db.auditLog.create({
    data: { tenantId: s.tenantId, userId: s.userId, action: active ? "supplier.activated" : "supplier.deactivated", entity: "Supplier", entityId: sup.id },
  });
}
