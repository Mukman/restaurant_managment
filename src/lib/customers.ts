import "server-only";
import { z } from "zod";
import { db } from "./db";
import { normalizePhone } from "./phone";
import { currentShift } from "./shift";
import type { SessionData } from "./session";

export class CustomerError extends Error {}

const canSetLimit = (s: SessionData) => s.role === "OWNER" || s.role === "MANAGER";

const addSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name").max(60),
  phone: z.string().trim().optional(),
  creditLimit: z.number().int().min(0).default(0),
});

export async function addCustomer(s: SessionData, raw: unknown) {
  const p = addSchema.safeParse(raw);
  if (!p.success) throw new CustomerError(p.error.issues[0].message);
  let phone: string | null = null;
  if (p.data.phone) {
    phone = normalizePhone(p.data.phone);
    if (!phone) throw new CustomerError("Enter a valid Ethiopian phone number");
    const dup = await db.customer.findFirst({ where: { tenantId: s.tenantId, phone } });
    if (dup) throw new CustomerError(`${dup.name} already has this phone number`);
  }
  // Only an owner or manager may give a credit line; a cashier's new customers start at 0 (cash only).
  const creditLimit = canSetLimit(s) ? p.data.creditLimit : 0;
  const c = await db.customer.create({ data: { tenantId: s.tenantId, name: p.data.name, phone, creditLimit } });
  await db.auditLog.create({
    data: { tenantId: s.tenantId, userId: s.userId, action: "customer.added", entity: "Customer", entityId: c.id, detail: { creditLimit } },
  });
  return c;
}

export async function setCreditLimit(s: SessionData, customerId: string, creditLimit: number) {
  if (!canSetLimit(s)) throw new CustomerError("Only the owner or a manager can change a credit limit");
  if (!Number.isInteger(creditLimit) || creditLimit < 0) throw new CustomerError("Credit limit must be 0 or more");
  const res = await db.customer.updateMany({ where: { id: customerId, tenantId: s.tenantId }, data: { creditLimit } });
  if (res.count === 0) throw new CustomerError("Customer not found");
  await db.auditLog.create({
    data: { tenantId: s.tenantId, userId: s.userId, action: "customer.limit_changed", entity: "Customer", entityId: customerId, detail: { creditLimit } },
  });
}

const METHODS = ["CASH", "TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER", "CARD"] as const;
const NEEDS_REF = ["TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER"];

const repaySchema = z.object({
  amount: z.number().int().positive("Enter the amount paid"),
  method: z.enum(METHODS),
  reference: z.string().trim().max(64).optional(),
});

/** A customer pays back some of what they owe. Cash lands in the receiver's open shift. */
export async function recordRepayment(s: SessionData, customerId: string, raw: unknown) {
  const p = repaySchema.safeParse(raw);
  if (!p.success) throw new CustomerError(p.error.issues[0].message);
  const { amount, method, reference } = p.data;
  if (NEEDS_REF.includes(method) && !reference) throw new CustomerError("Enter the transaction reference");

  return db.$transaction(async (tx) => {
    const shift = await currentShift(s, tx);
    if (!shift) throw new CustomerError("Open a shift before taking a repayment");
    // Conditional decrement: refuses to take more than is owed, even if two tills record at once.
    const res = await tx.customer.updateMany({
      where: { id: customerId, tenantId: s.tenantId, creditBalance: { gte: amount } },
      data: { creditBalance: { decrement: amount } },
    });
    if (res.count === 0) {
      const c = await tx.customer.findFirst({ where: { id: customerId, tenantId: s.tenantId } });
      if (!c) throw new CustomerError("Customer not found");
      throw new CustomerError("That is more than the customer owes");
    }
    const entry = await tx.creditEntry.create({
      data: { tenantId: s.tenantId, customerId, type: "REPAYMENT", amount, method, reference: reference || null, shiftId: shift.id, userId: s.userId },
    });
    await tx.auditLog.create({
      data: { tenantId: s.tenantId, userId: s.userId, action: "credit.repayment", entity: "Customer", entityId: customerId, detail: { amount, method } },
    });
    return entry;
  });
}
