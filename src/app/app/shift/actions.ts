"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { toSantim } from "@/lib/money";
import { closeShift, openShift, reviewShift, ShiftError } from "@/lib/shift";

export type ShiftFormState = { error?: string };

async function run(fn: () => Promise<unknown>): Promise<ShiftFormState> {
  try {
    await fn();
    revalidatePath("/app", "layout");
    return {};
  } catch (e) {
    if (e instanceof ShiftError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Try again." };
  }
}

const birr = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? toSantim(n) : NaN;
};

export async function openShiftAction(_: ShiftFormState, form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER", "CASHIER", "WAITER"]);
  return run(() => openShift(s, birr(form.get("amount"))));
}
export async function closeShiftAction(_: ShiftFormState, form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER", "CASHIER", "WAITER"]);
  return run(() => closeShift(s, birr(form.get("amount"))));
}
export async function reviewShiftAction(shiftId: string, status: "AUDITED" | "DISPUTED") {
  const s = await requireSession(["OWNER", "MANAGER"]);
  return run(() => reviewShift(s, shiftId, status));
}
