"use server";
import { localized } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/lib/auth";
import { checkout, CheckoutError } from "@/lib/checkout";

export type CheckoutResult =
  | { ok: true; orderId: string; number: number; total: number; vat: number; subtotal: number; discount: number }
  | { ok: false; error: string };

export async function checkoutAction(input: unknown): Promise<CheckoutResult> {
  const s = await requireSession(["OWNER", "MANAGER", "CASHIER", "WAITER"]);
  try {
    const o = await checkout(s, input);
    revalidatePath("/app/pos");
    return { ok: true, orderId: o.id, number: o.number, total: o.total, vat: o.vatAmount, subtotal: o.subtotal, discount: o.discount };
  } catch (e) {
    if (e instanceof CheckoutError) return { ok: false, error: await localized(e.message) };
    if (e instanceof ZodError) return { ok: false, error: await localized("Invalid sale data") };
    console.error(e);
    return { ok: false, error: await localized("Could not save the sale. Try again.") };
  }
}
