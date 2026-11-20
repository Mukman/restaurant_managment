"use server";
import { localized } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { toSantim } from "@/lib/money";
import { PurchaseError, receivePurchase } from "@/lib/purchases";

export type ReceiveInput = {
  clientId: string;
  supplierId: string;
  invoiceNo?: string;
  note?: string;
  items: { productId: string; quantity: number; unitCostBirr: string; expiresAt?: string }[];
  payment?: { amountBirr: string; method: string; reference?: string; fromTill: boolean };
};
export type ReceiveResult = { error?: string; ok?: boolean; id?: string };

const birr = (v: string) => {
  const str = v.replace(/,/g, "").trim();
  return str !== "" && Number.isFinite(Number(str)) ? toSantim(Number(str)) : NaN;
};

export async function receiveStockAction(input: ReceiveInput): Promise<ReceiveResult> {
  const s = await requireSession(["OWNER", "MANAGER", "INVENTORY"]);
  try {
    const paid = input.payment && input.payment.amountBirr.trim() !== "" ? birr(input.payment.amountBirr) : 0;
    const p = await receivePurchase(s, {
      clientId: input.clientId,
      supplierId: input.supplierId,
      invoiceNo: input.invoiceNo || undefined,
      note: input.note || undefined,
      items: input.items.map((i) => ({
        productId: i.productId,
        quantity: Number(i.quantity),
        unitCost: birr(i.unitCostBirr),
        expiresAt: i.expiresAt || undefined,
      })),
      payment: input.payment && paid !== 0
        ? { amount: paid, method: input.payment.method, reference: input.payment.reference || undefined, fromTill: input.payment.fromTill }
        : undefined,
    });
    revalidatePath("/app", "layout");
    return { ok: true, id: p.id };
  } catch (e) {
    if (e instanceof PurchaseError) return { error: await localized(e.message) };
    // zod errors carry a readable first message
    const msg = (e as { issues?: { message: string }[] }).issues?.[0]?.message;
    if (msg) return { error: await localized(msg) };
    console.error(e);
    return { error: await localized("Something went wrong. Try again.") };
  }
}
