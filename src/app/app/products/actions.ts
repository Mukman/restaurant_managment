"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { toSantim } from "@/lib/money";

export type ProductFormState = { error?: string; ok?: boolean };

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  nameAm: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).optional(),
  barcode: z.string().trim().max(32).optional(),
  unit: z.enum(["PIECE", "KG", "GRAM", "LITER", "BOTTLE", "BOX", "PACK"]),
  price: z.coerce.number().positive("Price must be above zero"),
  cost: z.coerce.number().min(0).default(0),
  openingStock: z.coerce.number().min(0).default(0),
  minStock: z.coerce.number().min(0).default(0),
  soldByWeight: z.literal("on").optional(),
  madeToOrder: z.literal("on").optional(),
});

export async function createProduct(_: ProductFormState, form: FormData): Promise<ProductFormState> {
  const s = await requireSession(["OWNER", "MANAGER", "INVENTORY"]);
  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => v !== ""));
  const p = schema.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;

  if (d.barcode) {
    const dup = await db.product.findFirst({ where: { tenantId: s.tenantId, barcode: d.barcode } });
    if (dup) return { error: `Barcode already used by ${dup.name}` };
  }

  await db.$transaction(async (tx) => {
    let categoryId: string | undefined;
    if (d.category) {
      const existing = await tx.category.findFirst({ where: { tenantId: s.tenantId, name: d.category } });
      categoryId = existing?.id ?? (await tx.category.create({ data: { tenantId: s.tenantId, name: d.category } })).id;
    }
    const tracksStock = !d.madeToOrder;
    const product = await tx.product.create({
      data: {
        tenantId: s.tenantId,
        name: d.name,
        nameAm: d.nameAm,
        categoryId,
        barcode: d.barcode,
        unit: d.soldByWeight ? "KG" : d.unit,
        soldByWeight: !!d.soldByWeight,
        price: toSantim(d.price),
        cost: toSantim(d.cost),
        minStock: d.minStock,
        tracksStock,
      },
    });
    await tx.stockLevel.create({ data: { productId: product.id, branchId: s.branchId, quantity: tracksStock ? d.openingStock : 0 } });
    if (tracksStock && d.openingStock > 0) {
      await tx.stockMovement.create({
        data: { tenantId: s.tenantId, productId: product.id, branchId: s.branchId, type: "ADJUSTMENT", quantity: d.openingStock, reason: "Opening stock", userId: s.userId },
      });
    }
  });
  revalidatePath("/app/products");
  return { ok: true };
}
