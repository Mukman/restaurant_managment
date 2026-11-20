import "server-only";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { cartTotals } from "./money";
import type { SessionData } from "./session";

export class CheckoutError extends Error {}

const MOBILE: PaymentMethod[] = ["TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER"];

export const checkoutSchema = z.object({
  clientId: z.string().min(8).max(64), // generated on the device; makes retries safe
  orderId: z.string().optional(), // existing OPEN order (restaurant) to add to or pay
  action: z.enum(["pay", "open"]), // open = send to table, pay later
  items: z
    .array(z.object({ productId: z.string(), quantity: z.number().positive().max(100000) }))
    .max(200),
  discount: z.number().int().min(0).default(0),
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "CARD", "TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER", "CREDIT"]),
        amount: z.number().int().positive(),
        tendered: z.number().int().positive().optional(),
        reference: z.string().trim().max(64).optional(),
      }),
    )
    .max(5)
    .default([]),
  customerId: z.string().optional(),
  tableId: z.string().optional(),
  waiterId: z.string().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

type Tx = Prisma.TransactionClient;

async function nextOrderNumber(tx: Tx, branchId: string) {
  const last = await tx.order.aggregate({ where: { branchId }, _max: { number: true } });
  return (last._max.number ?? 0) + 1;
}

/** Turns cart lines into priced order items and takes them out of stock. */
async function addItems(tx: Tx, s: SessionData, orderId: string, items: CheckoutInput["items"], userId: string) {
  if (items.length === 0) return;
  const products = await tx.product.findMany({
    where: { tenantId: s.tenantId, id: { in: items.map((i) => i.productId) }, active: true },
  });
  for (const item of items) {
    const p = products.find((x) => x.id === item.productId);
    if (!p) throw new CheckoutError("Product not found");
    if (!p.soldByWeight && !Number.isInteger(item.quantity))
      throw new CheckoutError(`${p.name}: quantity must be a whole number`);
    await tx.orderItem.create({
      data: {
        orderId,
        productId: p.id,
        name: p.name,
        unitPrice: p.price,
        quantity: item.quantity,
        vatRate: p.vatRate,
        lineTotal: Math.round(p.price * item.quantity),
      },
    });
    if (!p.tracksStock) continue;
    // Conditional decrement: fails if another till sold the last units first.
    const updated = await tx.stockLevel.updateMany({
      where: { productId: p.id, branchId: s.branchId, quantity: { gte: item.quantity } },
      data: { quantity: { decrement: item.quantity } },
    });
    if (updated.count === 0) throw new CheckoutError(`${p.name}: not enough stock`);
    await tx.stockMovement.create({
      data: {
        tenantId: s.tenantId,
        productId: p.id,
        branchId: s.branchId,
        type: "SALE",
        quantity: -item.quantity,
        userId,
        orderId,
      },
    });
  }
}

async function recomputeTotals(tx: Tx, orderId: string, discount: number) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  const totals = cartTotals(
    items.map((i) => ({ unitPrice: i.unitPrice, quantity: Number(i.quantity), vatRate: i.vatRate })),
    discount,
  );
  return tx.order.update({
    where: { id: orderId },
    data: { subtotal: totals.subtotal, discount: totals.discount, vatAmount: totals.vat, total: totals.total },
  });
}

async function takePayments(tx: Tx, s: SessionData, order: { id: string; total: number; customerId: string | null }, payments: CheckoutInput["payments"]) {
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  if (paid !== order.total) throw new CheckoutError("Payments must add up to the total");
  for (const p of payments) {
    if (MOBILE.includes(p.method) && !p.reference)
      throw new CheckoutError("Enter the transaction reference for mobile money / bank payments");
    if (p.method === "CASH" && p.tendered !== undefined && p.tendered < p.amount)
      throw new CheckoutError("Cash received is less than the amount due");
    if (p.method === "CREDIT") {
      if (!order.customerId) throw new CheckoutError("Choose a customer for a credit sale");
      const c = await tx.customer.findFirst({ where: { id: order.customerId, tenantId: s.tenantId } });
      if (!c) throw new CheckoutError("Customer not found");
      if (c.creditBalance + p.amount > c.creditLimit)
        throw new CheckoutError(`${c.name} would go over their credit limit`);
      await tx.customer.update({ where: { id: c.id }, data: { creditBalance: { increment: p.amount } } });
    }
    await tx.payment.create({
      data: { orderId: order.id, method: p.method, amount: p.amount, tendered: p.tendered, reference: p.reference },
    });
  }
}

export async function checkout(s: SessionData, raw: unknown) {
  const input = checkoutSchema.parse(raw);
  if (input.action === "open" && s.mode !== "RESTAURANT")
    throw new CheckoutError("Open orders are only available in restaurant mode");

  // Idempotency: a retried request from a flaky connection returns the first result.
  const existing = await db.order.findFirst({ where: { tenantId: s.tenantId, clientId: input.clientId } });
  if (existing) return existing;

  return db.$transaction(
    async (tx) => {
      let order;
      if (input.orderId) {
        order = await tx.order.findFirst({
          where: { id: input.orderId, tenantId: s.tenantId, branchId: s.branchId, status: "OPEN" },
        });
        if (!order) throw new CheckoutError("Order is no longer open");
        if (input.customerId) order = await tx.order.update({ where: { id: order.id }, data: { customerId: input.customerId } });
      } else {
        if (input.items.length === 0) throw new CheckoutError("Cart is empty");
        if (input.tableId) {
          const table = await tx.diningTable.findFirst({ where: { id: input.tableId, branchId: s.branchId } });
          if (!table) throw new CheckoutError("Table not found");
        }
        order = await tx.order.create({
          data: {
            tenantId: s.tenantId,
            branchId: s.branchId,
            number: await nextOrderNumber(tx, s.branchId),
            status: "OPEN",
            cashierId: s.userId,
            waiterId: input.waiterId || null,
            tableId: input.tableId || null,
            customerId: input.customerId || null,
            subtotal: 0,
            total: 0,
          },
        });
      }
      await addItems(tx, s, order.id, input.items, s.userId);
      order = await recomputeTotals(tx, order.id, input.discount || order.discount);
      if (order.total <= 0 && input.action === "pay") throw new CheckoutError("Total must be above zero");

      if (input.action === "pay") {
        await takePayments(tx, s, order, input.payments);
        order = await tx.order.update({
          where: { id: order.id },
          data: { status: "COMPLETED", closedAt: new Date(), clientId: input.clientId },
        });
      } else {
        // Only stamp clientId on the request that created/changed it, so retries stay idempotent.
        order = await tx.order.update({ where: { id: order.id }, data: { clientId: input.clientId } });
      }

      await tx.auditLog.create({
        data: {
          tenantId: s.tenantId,
          userId: s.userId,
          action: input.action === "pay" ? "order.completed" : "order.opened",
          entity: "Order",
          entityId: order.id,
          detail: { number: order.number, total: order.total, methods: input.payments.map((p) => p.method) },
        },
      });
      return order;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
