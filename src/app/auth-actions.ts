"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

export type FormState = { error?: string };

const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits");

async function startSession(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { tenant: true, branch: true } });
  const branchId = u.branchId ?? (await db.branch.findFirstOrThrow({ where: { tenantId: u.tenantId } })).id;
  const token = await signSession({
    userId: u.id,
    tenantId: u.tenantId,
    branchId,
    role: u.role,
    name: u.name,
    mode: u.tenant.mode,
  });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      shopName: z.string().trim().min(2, "Enter your business name").max(80),
      name: z.string().trim().min(2, "Enter your name").max(60),
      phone: z.string(),
      pin: pinSchema,
      mode: z.enum(["GROCERY", "RESTAURANT"]),
      tin: z.string().trim().max(20).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: "Enter a valid Ethiopian phone number" };

  // Phone numbers are unique per tenant, but an owner should only ever have one shop per number.
  const taken = await db.user.findFirst({ where: { phone, role: "OWNER" } });
  if (taken) return { error: "This phone number already has a shop. Sign in instead." };

  const pinHash = await bcrypt.hash(parsed.data.pin, 10);
  const user = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: parsed.data.shopName, mode: parsed.data.mode, tin: parsed.data.tin || null },
    });
    const branch = await tx.branch.create({ data: { tenantId: tenant.id, name: "Main" } });
    if (parsed.data.mode === "RESTAURANT") {
      await tx.diningTable.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({ tenantId: tenant.id, branchId: branch.id, label: `T${i + 1}` })),
      });
    }
    return tx.user.create({
      data: { tenantId: tenant.id, branchId: branch.id, name: parsed.data.name, phone, pinHash, role: "OWNER" },
    });
  });
  await startSession(user.id);
  redirect("/app");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const pin = String(form.get("pin") ?? "");
  const generic = { error: "Wrong phone number or PIN" };
  if (!phone || !pinSchema.safeParse(pin).success) return generic;

  // A phone can belong to staff at several shops; accept the first whose PIN matches.
  const users = await db.user.findMany({ where: { phone, active: true }, take: 5 });
  for (const u of users) {
    if (u.pinHash && (await bcrypt.compare(pin, u.pinHash))) {
      await startSession(u.id);
      redirect("/app");
    }
  }
  return generic;
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function setLang(lang: "en" | "am") {
  (await cookies()).set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}
