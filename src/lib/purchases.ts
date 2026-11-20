import "server-only";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { currentShift } from "./shift";
import type { SessionData } from "./session";

export class PurchaseError extends Error {}

const STOCK_ROLES = ["OWNER", "MANAGER", "INVENTORY"];
const NEEDS_REF: PaymentMethod[] = ["TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER"];
const METHODS = ["CASH", "CARD", "TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER"] as const;

const paymentSchema = z.object({
  amount: z.number().int().positive("Enter the amount paid"),
  method: z.enum(METHODS),
  reference: z.string().trim().max(64).optional(),
  fromTill: z.boolean().default(false), // cash taken out of the till drawer
});

export const purchaseSchema = z.object({
  clientId: z.string().min(8).max(64),
  supplierId: z.string(),
  invoiceNo: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().positive("Quantity must be above zero").max(1_000_000),
        unitCost: z.number().int().min(0, "Cost cannot be negative"), // santim per unit
        expiresAt: z.coerce.date().optional(),
      }),
    )
    .min(1, "Add at least one product")
    .max(200),
  payment: paymentSchema.optional(),
});

const q3 = (n: number) => Math.round(n * 1000) / 1000;

function checkPayment(s: SessionData, p: z.infer<typeof paymentSchema>) {
  if (s.role !== "OWNER" && s.role !== "MANAGER") throw new PurchaseError("Only the owner or a manager can pay suppliers");
  if (NEEDS_REF.includes(p.method) && !p.reference) throw new PurchaseError("Enter the transaction reference");
  if (p.fromTill && p.method !== "CASH") throw new PurchaseError("Only cash can come out of the till");
}

type Tx = Prisma.TransactionClient;

/** Pays a supplier inside an open transaction. `purchaseId` targets one purchase; otherwise the oldest unpaid ones are cleared first. */
async function pay(tx: Tx, s: SessionData, supplierId: string, p: z.infer<typeof paymentSchema>, purchaseId?: string) {
  let shiftId: string | null = null;
  if (p.fromTill) {
    const shift = await currentShift(s, tx);
    if (!shift) throw new PurchaseError("Open a shift to pay from the till");
    shiftId = shift.id;
  }
  // The conditional decrement also locks the supplier row, so two payments to the same supplier go one at a time
  // and can never add up to more than is owed.
  const upd = await tx.supplier.updateMany({
    where: { id: supplierId, tenantId: s.tenantId, balance: { gte: p.amount } },
    data: { balance: { decrement: p.amount } },
  });
  if (upd.count === 0) {
    const sup = await tx.supplier.findFirst({ where: { id: supplierId, tenantId: s.tenantId } });
    if (!sup) throw new PurchaseError("Supplier not found");
    throw new PurchaseError("That is more than you owe this supplier");
  }

  const open = await tx.purchase.findMany({
    where: { supplierId, tenantId: s.tenantId, ...(purchaseId ? { id: purchaseId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  const unpaid = open.filter((x) => x.paid < x.total);
  if (purchaseId && unpaid.length === 0) throw new PurchaseError("That purchase is already fully paid");
  let left = p.amount;
  for (const purchase of unpaid) {
    if (left === 0) break;
    const part = Math.min(left, purchase.total - purchase.paid);
    await tx.purchase.update({ where: { id: purchase.id }, data: { paid: { increment: part } } });
    await tx.supplierPayment.create({
      data: { tenantId: s.tenantId, supplierId, purchaseId: purchase.id, amount: part, method: p.method, reference: p.reference || null, fromTill: p.fromTill, shiftId, userId: s.userId },
    });
    left -= part;
  }
  if (left > 0) throw new PurchaseError("That is more than is owed on this purchase");
}

export async function receivePurchase(s: SessionData, raw: unknown) {
  if (!STOCK_ROLES.includes(s.role)) throw new PurchaseError("Not allowed");
  const parsed = purchaseSchema.safeParse(raw);
  if (!parsed.success) throw new PurchaseError(parsed.error.issues[0].message);
  const input = parsed.data;
  if (input.payment) checkPayment(s, input.payment);

  const done = await db.purchase.findFirst({ where: { tenantId: s.tenantId, clientId: input.clientId } });
  if (done) return done;

  return db.$transaction(
    async (tx) => {
      const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, tenantId: s.tenantId } });
      if (!supplier) throw new PurchaseError("Supplier not found");
      if (!supplier.active) throw new PurchaseError("This supplier is no longer active");

      // One purchase number at a time per branch, and one receive at a time per product (keeps average cost right).
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${s.branchId} FOR UPDATE`;
      const ids = [...new Set(input.items.map((i) => i.productId))].sort();
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids)}) AND "tenantId" = ${s.tenantId} ORDER BY id FOR UPDATE`;
      const products = await tx.product.findMany({ where: { id: { in: ids }, tenantId: s.tenantId } });
      if (products.length !== ids.length) throw new PurchaseError("Product not found");

      const last = await tx.purchase.aggregate({ where: { branchId: s.branchId }, _max: { number: true } });
      const lines = input.items.map((i) => ({ ...i, quantity: q3(i.quantity), lineTotal: Math.round(q3(i.quantity) * i.unitCost) }));
      const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
      if (input.payment && input.payment.amount > total) throw new PurchaseError("You cannot pay more than the purchase total");

      const purchase = await tx.purchase.create({
        data: {
          tenantId: s.tenantId,
          branchId: s.branchId,
          supplierId: supplier.id,
          number: (last._max.number ?? 0) + 1,
          invoiceNo: input.invoiceNo || null,
          note: input.note || null,
          total,
          userId: s.userId,
          clientId: input.clientId,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              name: products.find((p) => p.id === l.productId)!.name,
              quantity: l.quantity,
              unitCost: l.unitCost,
              lineTotal: l.lineTotal,
              expiresAt: l.expiresAt ?? null,
            })),
          },
        },
      });
      await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { increment: total } } });

      for (const l of lines) {
        const product = products.find((p) => p.id === l.productId)!;
        let cost = l.unitCost;
        if (product.tracksStock) {
          const level = await tx.stockLevel.findUnique({ where: { productId_branchId: { productId: product.id, branchId: s.branchId } } });
          const have = Math.max(0, Number(level?.quantity ?? 0));
          // Average cost: what is already on the shelf at its old cost, plus the new goods at the new cost.
          cost = have > 0 ? Math.round((have * product.cost + l.quantity * l.unitCost) / (have + l.quantity)) : l.unitCost;
          if (level) {
            await tx.stockLevel.update({ where: { productId_branchId: { productId: product.id, branchId: s.branchId } }, data: { quantity: { increment: l.quantity } } });
          } else {
            await tx.stockLevel.create({ data: { productId: product.id, branchId: s.branchId, quantity: l.quantity } });
          }
          await tx.stockMovement.create({
            data: { tenantId: s.tenantId, productId: product.id, branchId: s.branchId, type: "PURCHASE", quantity: l.quantity, reason: `Purchase #${purchase.number} from ${supplier.name}`, userId: s.userId, expiresAt: l.expiresAt ?? null },
          });
        }
        await tx.product.update({ where: { id: product.id }, data: { cost } });
      }

      if (input.payment) await pay(tx, s, supplier.id, input.payment, purchase.id);

      await tx.auditLog.create({
        data: { tenantId: s.tenantId, userId: s.userId, action: "purchase.received", entity: "Purchase", entityId: purchase.id, detail: { number: purchase.number, total, supplier: supplier.name, paid: input.payment?.amount ?? 0 } },
      });
      return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}

const payInput = paymentSchema.extend({ purchaseId: z.string().optional() });

export async function paySupplier(s: SessionData, supplierId: string, raw: unknown) {
  const parsed = payInput.safeParse(raw);
  if (!parsed.success) throw new PurchaseError(parsed.error.issues[0].message);
  const { purchaseId, ...payment } = parsed.data;
  checkPayment(s, payment);
  return db.$transaction(
    async (tx) => {
      await pay(tx, s, supplierId, payment, purchaseId);
      await tx.auditLog.create({
        data: { tenantId: s.tenantId, userId: s.userId, action: "supplier.paid", entity: "Supplier", entityId: supplierId, detail: { amount: payment.amount, method: payment.method, fromTill: payment.fromTill } },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
