"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { addCustomer, CustomerError, recordRepayment, setCreditLimit } from "@/lib/customers";
import { toSantim } from "@/lib/money";

export type CustomerFormState = { error?: string; ok?: boolean };

async function run(fn: () => Promise<unknown>): Promise<CustomerFormState> {
  try {
    await fn();
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof CustomerError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Try again." };
  }
}

// Empty or non-numeric input becomes NaN, which the library rejects with a clear message.
const birr = (v: FormDataEntryValue | null) => {
  const str = String(v ?? "").replace(/,/g, "").trim();
  return str !== "" && Number.isFinite(Number(str)) ? toSantim(Number(str)) : NaN;
};

export async function addCustomerAction(_: CustomerFormState, form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER", "CASHIER"]);
  const limit = birr(form.get("creditLimit") ?? "0");
  return run(() =>
    addCustomer(s, {
      name: form.get("name"),
      phone: form.get("phone") || undefined,
      creditLimit: Number.isNaN(limit) ? 0 : limit,
    }),
  );
}

export async function repayAction(customerId: string, _: CustomerFormState, form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER", "CASHIER"]);
  return run(() =>
    recordRepayment(s, customerId, {
      amount: birr(form.get("amount")),
      method: form.get("method"),
      reference: String(form.get("reference") ?? "") || undefined,
    }),
  );
}

export async function limitAction(customerId: string, _: CustomerFormState, form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  return run(() => setCreditLimit(s, customerId, birr(form.get("creditLimit"))));
}
