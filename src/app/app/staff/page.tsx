import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { StaffClient } from "./StaffClient";

const KEYS: DictKey[] = ["staff", "name", "role", "phone", "pin", "addStaff", "save", "resetPin", "newPin", "deactivate", "activate", "lockedOut",
  "role_OWNER", "role_MANAGER", "role_CASHIER", "role_WAITER", "role_INVENTORY"];

export default async function StaffPage() {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const t = translator(await getLang());
  const users = await db.user.findMany({ where: { tenantId: s.tenantId }, orderBy: [{ role: "asc" }, { name: "asc" }] });
  const manageableRoles = s.role === "OWNER" ? ["MANAGER", "CASHIER", "WAITER", "INVENTORY"] : ["CASHIER", "WAITER", "INVENTORY"];
  const rows = users.map((u) => ({
    id: u.id, name: u.name, phone: u.phone, role: u.role, active: u.active, locked: !!u.lockedUntil && u.lockedUntil > new Date(),
    manageable: u.id !== s.userId && manageableRoles.includes(u.role),
  }));
  return <StaffClient rows={rows} roles={manageableRoles} t={Object.fromEntries(KEYS.map((k) => [k, t(k)]))} />;
}
