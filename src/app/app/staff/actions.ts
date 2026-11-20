"use server";
import { localized } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { addStaff, resetStaffPin, setStaffActive, StaffError } from "@/lib/staff";

export type StaffFormState = { error?: string; ok?: boolean };

async function run(fn: () => Promise<void>): Promise<StaffFormState> {
  try {
    await fn();
    revalidatePath("/app/staff");
    return { ok: true };
  } catch (e) {
    if (e instanceof StaffError) return { error: await localized(e.message) };
    console.error(e);
    return { error: await localized("Something went wrong. Try again.") };
  }
}

export async function addStaffAction(_: StaffFormState, form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  return run(async () => { await addStaff(s, Object.fromEntries(form)); });
}
export async function setActiveAction(userId: string, active: boolean) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  return run(() => setStaffActive(s, userId, active));
}
export async function resetPinAction(userId: string, pin: string) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  return run(() => resetStaffPin(s, userId, pin));
}
