"use server";
import { localized } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { toSantim } from "@/lib/money";
import { PurchaseError, paySupplier } from "@/lib/purchases";
import { addSupplier, setSupplierActive, SupplierError } from "@/lib/suppliers";

export type SupplierFormState = { error?: string; ok?: boolean };

async function run(fn: () => Promise<unknown>): Promise<SupplierFormState> {
  try {
    await fn();
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof SupplierError || e instanceof PurchaseError) return { error: await localized(e.message) };
    console.error(e);
    return { error: await localized("Something went wrong. Try again.") };
  }
}

const birr = (v: FormDataEntryValue | null) => {
  const str = String(v ?? "").replace(/,/g, "").trim();
  return str !== "" && Number.isFinite(Number(str)) ? toSantim(Number(str)) : NaN;
};

export async function addSupplierAction(_: SupplierFormState, form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER", "INVENTORY"]);
  return run(() => addSupplier(s, { name: form.get("name"), phone: String(form.get("phone") ?? "") || undefined }));
}

export async function paySupplierAction(supplierId: string, _: SupplierFormState, form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  return run(() =>
    paySupplier(s, supplierId, {
      amount: birr(form.get("amount")),
      method: form.get("method"),
      reference: String(form.get("reference") ?? "") || undefined,
      fromTill: form.get("fromTill") === "on",
      purchaseId: String(form.get("purchaseId") ?? "") || undefined,
    }),
  );
}

export async function setSupplierActiveAction(supplierId: string, active: boolean) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  return run(() => setSupplierActive(s, supplierId, active));
}
