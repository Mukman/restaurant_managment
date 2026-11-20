import "server-only";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { vatIncluded } from "./money";
import { currentShift } from "./shift";
import type { SessionData } from "./session";

export class RefundError extends Error {}

const NEEDS_REF: PaymentMethod[] = ["TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER"];

export const refundSchema = z.object({
  clientId: z.string().min(8).max(64), // generated when the form opens; makes retries safe
  orderId: z.string(),
  items: z
    .array(
      z.object({
        orderItemId: z.string(),
        quantity: z.number().positive().max(100000),
        restock: z.boolean(), // false for spoiled goods or food already made
      }),
    )
    .min(1, "Choose at least one item to refund")
    .max(200),
  method: z.enum(["CASH", "CARD", "TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER", "CREDIT"]),
  reference: z.string().trim().max(64).optional(),
  reason: z.string().trim().min(3, "Give a short reason").max(200),
});

const q3 = (n: number) => Math.round(n * 1000) / 1000;

type Line = { id: string; lineTotal: number };

/** What each line is worth after its share of the order discount. Shares add up exactly to the order total. */
export function lineNets(lines: Line[], discount: number): Map<string, number> {
  const sorted = [...lines].sort((a, b) => a.id.localeCompare(b.id));
  const subtotal = sorted.reduce((s, l) => s + l.lineTotal, 0);
  const nets = new Map<string, number>();
  let allocated = 0;
  sorted.forEach((l, i) => {
    const share = i === sorted.length - 1 ? discount - allocated : Math.round((discount * l.lineTotal) / (subtotal || 1));
    allocated += share;
    nets.set(l.id, l.lineTotal - share);
  });
  return nets;
}

export async function refundOrder(s: SessionData, raw: unknown) {
  if (s.role !== "OWNER" && s.role !== "MANAGER") throw new RefundError("Only the owner or a manager can refund");
  const parsed = refundSchema.safeParse(raw);
  if (!parsed.success) throw new RefundError(parsed.error.issues[0].message);
  const input = parsed.data;
  if (NEEDS_REF.includes(input.method) && !input.reference) throw new RefundError("Enter the transaction reference");

  // A retried request returns the refund that was already made.
  const done = await db.refund.findFirst({ where: { tenantId: s.tenantId, clientId: input.clientId } });
  if (done) return done;

  return db.$transaction(
    async (tx) => {
      const shift = await currentShift(s, tx);
      if (!shift) throw new RefundError("Open a shift before refunding");

      // Lock the order so two refunds of the same sale are handled one after the other.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} AND "tenantId" = ${s.tenantId} FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id: input.orderId, tenantId: s.tenantId, branchId: s.branchId },
        include: { items: true, payments: true, refunds: { include: { items: true } } },
      });
      if (!order) throw new RefundError("Order not found");
      if (order.status !== "COMPLETED") throw new RefundError("Only completed sales can be refunded");

      const nets = lineNets(order.items.map((i) => ({ id: i.id, lineTotal: i.lineTotal })), order.discount);
      const priorRefundItems = order.refunds.flatMap((r) => r.items);

      let amount = 0;
      let vat = 0;
      const plan: { orderItemId: string; quantity: number; amount: number; restock: boolean; productId: string }[] = [];
      const seen = new Set<string>();
      for (const it of input.items) {
        if (seen.has(it.orderItemId)) throw new RefundError("An item appears twice");
        seen.add(it.orderItemId);
        const line = order.items.find((i) => i.id === it.orderItemId);
        if (!line) throw new RefundError("Item is not part of this order");
        const orderedQty = Number(line.quantity);
        const prev = priorRefundItems.filter((p) => p.orderItemId === line.id);
        const remaining = q3(orderedQty - prev.reduce((sum, p) => sum + Number(p.quantity), 0));
        const qty = q3(it.quantity);
        if (qty > remaining) throw new RefundError(`${line.name}: only ${remaining} left to refund`);
        const net = nets.get(line.id)!;
        const already = prev.reduce((sum, p) => sum + p.amount, 0);
        // Refunding everything left returns exactly what is left, so rounding never leaves cents behind.
        const lineAmount = qty === remaining ? net - already : Math.round((net * qty) / orderedQty);
        amount += lineAmount;
        vat += vatIncluded(lineAmount, line.vatRate);
        plan.push({ orderItemId: line.id, quantity: qty, amount: lineAmount, restock: it.restock, productId: line.productId });
      }
      if (amount <= 0) throw new RefundError("Nothing to refund");

      // Electronic money can only go back the way it came; cash can always be handed over.
      if (input.method !== "CASH") {
        const paid = order.payments.filter((p) => p.method === input.method).reduce((sum, p) => sum + p.amount, 0);
        const back = order.refunds.filter((r) => r.method === input.method).reduce((sum, r) => sum + r.amount, 0);
        if (paid === 0) throw new RefundError("The customer did not pay this way");
        if (amount > paid - back) throw new RefundError("That is more than was paid this way");
      }
      if (input.method === "CREDIT") {
        if (!order.customerId) throw new RefundError("This sale has no customer");
        const upd = await tx.customer.updateMany({
          where: { id: order.customerId, tenantId: s.tenantId, creditBalance: { gte: amount } },
          data: { creditBalance: { decrement: amount } },
        });
        if (upd.count === 0) throw new RefundError("The customer has already paid back part of this. Refund that part in cash.");
        await tx.creditEntry.create({
          data: { tenantId: s.tenantId, customerId: order.customerId, type: "REFUND", amount, orderId: order.id, userId: s.userId },
        });
      }

      const refund = await tx.refund.create({
        data: {
          tenantId: s.tenantId,
          orderId: order.id,
          shiftId: shift.id,
          userId: s.userId,
          method: input.method,
          amount,
          vatAmount: vat,
          reference: input.reference || null,
          reason: input.reason,
          clientId: input.clientId,
          items: { create: plan.map((p) => ({ orderItemId: p.orderItemId, quantity: p.quantity, amount: p.amount, restocked: p.restock })) },
        },
      });

      for (const p of plan) {
        if (!p.restock) continue;
        const product = await tx.product.findFirst({ where: { id: p.productId, tenantId: s.tenantId } });
        if (!product?.tracksStock) continue;
        const upd = await tx.stockLevel.updateMany({
          where: { productId: p.productId, branchId: s.branchId },
          data: { quantity: { increment: p.quantity } },
        });
        if (upd.count === 0) await tx.stockLevel.create({ data: { productId: p.productId, branchId: s.branchId, quantity: p.quantity } });
        await tx.stockMovement.create({
          data: { tenantId: s.tenantId, productId: p.productId, branchId: s.branchId, type: "RETURN", quantity: p.quantity, reason: `Refund: ${input.reason}`, userId: s.userId, orderId: order.id },
        });
      }

      const fullyRefunded = order.items.every((line) => {
        const done = priorRefundItems.filter((x) => x.orderItemId === line.id).reduce((sum, x) => sum + Number(x.quantity), 0);
        const now = plan.filter((x) => x.orderItemId === line.id).reduce((sum, x) => sum + x.quantity, 0);
        return q3(Number(line.quantity) - done - now) <= 0;
      });
      if (fullyRefunded) await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });

      await tx.auditLog.create({
        data: {
          tenantId: s.tenantId,
          userId: s.userId,
          action: "order.refunded",
          entity: "Order",
          entityId: order.id,
          detail: { number: order.number, amount, method: input.method, reason: input.reason, full: fullyRefunded },
        },
      });
      return refund;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
