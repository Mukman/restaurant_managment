"use server";
import { localized } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { refundOrder, RefundError } from "@/lib/refunds";

export type RefundFormState = { error?: string; ok?: boolean };

export async function refundAction(orderId: string, _: RefundFormState, form: FormData): Promise<RefundFormState> {
  const s = await requireSession(["OWNER", "MANAGER"]);
  // Fields are qty_<orderItemId> and restock_<orderItemId>; only lines with a quantity are refunded.
  const items = [...form.keys()]
    .filter((k) => k.startsWith("qty_"))
    .map((k) => ({ orderItemId: k.slice(4), quantity: Number(String(form.get(k)).replace(",", ".")), restock: form.get("restock_" + k.slice(4)) === "on" }))
    .filter((i) => Number.isFinite(i.quantity) && i.quantity > 0);
  try {
    await refundOrder(s, {
      clientId: String(form.get("clientId") ?? ""),
      orderId,
      items,
      method: form.get("method"),
      reference: String(form.get("reference") ?? "") || undefined,
      reason: String(form.get("reason") ?? ""),
    });
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof RefundError) return { error: await localized(e.message) };
    console.error(e);
    return { error: await localized("Could not save the refund. Try again.") };
  }
}
