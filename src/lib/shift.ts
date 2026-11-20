import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import type { SessionData } from "./session";

export class ShiftError extends Error {}

export function currentShift(s: Pick<SessionData, "userId" | "tenantId" | "branchId">, tx: Prisma.TransactionClient | typeof db = db) {
  return tx.shift.findFirst({
    where: { userId: s.userId, tenantId: s.tenantId, branchId: s.branchId, status: "OPEN" },
  });
}

export async function openShift(s: SessionData, openingFloat: number) {
  if (!Number.isInteger(openingFloat) || openingFloat < 0) throw new ShiftError("Opening cash must be 0 or more");
  return db.$transaction(async (tx) => {
    if (await currentShift(s, tx)) throw new ShiftError("You already have an open shift");
    const shift = await tx.shift.create({
      data: { tenantId: s.tenantId, branchId: s.branchId, userId: s.userId, openingFloat },
    });
    await tx.auditLog.create({
      data: { tenantId: s.tenantId, userId: s.userId, action: "shift.opened", entity: "Shift", entityId: shift.id, detail: { openingFloat } },
    });
    return shift;
  });
}

/** What the till should hold, and what was taken by each payment method, for one shift. */
export async function shiftSummary(shiftId: string) {
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const [byMethod, orders, repaid] = await Promise.all([
    db.payment.groupBy({
      by: ["method"],
      where: { order: { shiftId, status: "COMPLETED" } },
      _sum: { amount: true },
    }),
    db.order.aggregate({ where: { shiftId, status: "COMPLETED" }, _count: true, _sum: { total: true } }),
    // Customers paying back old credit during this shift
    db.creditEntry.groupBy({ by: ["method"], where: { shiftId, type: "REPAYMENT" }, _sum: { amount: true } }),
  ]);
  const methods = Object.fromEntries(byMethod.map((m) => [m.method, m._sum.amount ?? 0])) as Record<string, number>;
  const repayments = Object.fromEntries(repaid.map((m) => [m.method ?? "CASH", m._sum.amount ?? 0])) as Record<string, number>;
  const cashSales = methods.CASH ?? 0;
  const cashRepayments = repayments.CASH ?? 0;
  return {
    shift,
    methods,
    repayments,
    cashSales,
    cashRepayments,
    expectedCash: shift.openingFloat + cashSales + cashRepayments,
    orderCount: orders._count,
    salesTotal: orders._sum.total ?? 0,
  };
}

export async function closeShift(s: SessionData, countedCash: number) {
  if (!Number.isInteger(countedCash) || countedCash < 0) throw new ShiftError("Enter the cash you counted");
  const open = await currentShift(s);
  if (!open) throw new ShiftError("No open shift");
  const pendingHere = await db.order.count({ where: { tenantId: s.tenantId, branchId: s.branchId, status: "OPEN", cashierId: s.userId } });
  const { expectedCash } = await shiftSummary(open.id);
  const closed = await db.shift.update({
    where: { id: open.id },
    data: { status: "CLOSED", closedAt: new Date(), expectedCash, countedCash },
  });
  await db.auditLog.create({
    data: {
      tenantId: s.tenantId,
      userId: s.userId,
      action: "shift.closed",
      entity: "Shift",
      entityId: closed.id,
      detail: { expectedCash, countedCash, difference: countedCash - expectedCash, openOrdersLeft: pendingHere },
    },
  });
  return closed;
}

export async function reviewShift(s: SessionData, shiftId: string, status: "AUDITED" | "DISPUTED") {
  if (s.role !== "OWNER" && s.role !== "MANAGER") throw new ShiftError("Not allowed");
  const res = await db.shift.updateMany({
    where: { id: shiftId, tenantId: s.tenantId, status: { in: ["CLOSED", "AUDITED", "DISPUTED"] } },
    data: { status },
  });
  if (res.count === 0) throw new ShiftError("Shift not found or still open");
  await db.auditLog.create({
    data: { tenantId: s.tenantId, userId: s.userId, action: `shift.${status.toLowerCase()}`, entity: "Shift", entityId: shiftId },
  });
}
