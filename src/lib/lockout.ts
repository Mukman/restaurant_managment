import "server-only";
import bcrypt from "bcryptjs";
import { db } from "./db";

export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export type LoginResult = { userId: string } | { error: string };

/**
 * Checks a phone + PIN. After MAX_ATTEMPTS wrong PINs in a row the account is blocked for LOCK_MINUTES,
 * and even the right PIN is refused until then. A locked account can also be freed by an owner/manager
 * resetting the PIN. The attempt counter is updated with an atomic increment so parallel guesses can't skip it.
 */
export async function checkLogin(phone: string, pin: string, now = new Date()): Promise<LoginResult> {
  const wrong: LoginResult = { error: "Wrong phone number or PIN" };
  // A phone can belong to staff at several shops; accept the first whose PIN matches.
  const users = await db.user.findMany({ where: { phone, active: true }, take: 5 });
  if (users.length === 0) return wrong;

  const open = [];
  let longest = 0;
  for (const u of users) {
    if (u.lockedUntil && u.lockedUntil > now) {
      longest = Math.max(longest, u.lockedUntil.getTime() - now.getTime());
      continue;
    }
    if (u.lockedUntil) {
      // The block has run out: start counting from zero again.
      await db.user.update({ where: { id: u.id }, data: { failedAttempts: 0, lockedUntil: null } });
    }
    open.push(u);
  }
  if (open.length === 0) {
    return { error: `Too many wrong PINs. Try again in ${Math.ceil(longest / 60_000)} minutes, or ask the owner to reset your PIN.` };
  }

  for (const u of open) {
    if (u.pinHash && (await bcrypt.compare(pin, u.pinHash))) {
      if (u.failedAttempts > 0 || u.lockedUntil) await db.user.update({ where: { id: u.id }, data: { failedAttempts: 0, lockedUntil: null } });
      return { userId: u.id };
    }
  }

  for (const u of open) {
    const upd = await db.user.update({ where: { id: u.id }, data: { failedAttempts: { increment: 1 } } });
    if (upd.failedAttempts >= MAX_ATTEMPTS) {
      await db.user.update({ where: { id: u.id }, data: { lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } });
      await db.auditLog.create({ data: { tenantId: u.tenantId, userId: u.id, action: "login.locked", entity: "User", entityId: u.id, detail: { attempts: upd.failedAttempts } } });
    }
  }
  return wrong;
}
