import { AppShell } from "@/components/AppShell";
import { LangToggle } from "@/components/LangToggle";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { logout } from "../auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const lang = await getLang();
  const t = translator(lang);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: s.tenantId } });
  const nav = [
    { href: "/app", label: t("dashboard"), roles: ["OWNER", "MANAGER"] },
    { href: "/app/pos", label: t("pos"), roles: ["OWNER", "MANAGER", "CASHIER", "WAITER"] },
    { href: "/app/orders", label: t("orders"), roles: ["OWNER", "MANAGER", "CASHIER"] },
    { href: "/app/customers", label: t("customers"), roles: ["OWNER", "MANAGER", "CASHIER"] },
    { href: "/app/shift", label: t("shift"), roles: ["OWNER", "MANAGER", "CASHIER", "WAITER"] },
    { href: "/app/products", label: t("products"), roles: ["OWNER", "MANAGER", "INVENTORY"] },
    { href: "/app/reports", label: t("reports"), roles: ["OWNER", "MANAGER"] },
    { href: "/app/purchases", label: t("purchases"), roles: ["OWNER", "MANAGER", "INVENTORY"] },
    { href: "/app/suppliers", label: t("suppliers"), roles: ["OWNER", "MANAGER", "INVENTORY"] },
    { href: "/app/staff", label: t("staff"), roles: ["OWNER", "MANAGER"] },
  ].filter((n) => n.roles.includes(s.role));

  return (
    <AppShell
      tenantName={tenant.name}
      userName={s.name}
      role={t(`role_${s.role}` as DictKey)}
      nav={nav.map(({ href, label }) => ({ href, label }))}
      signOutLabel={t("signOut")}
      menuLabel={t("more")}
      logout={logout}
      badge={<span className="badge badge-ok">{tenant.mode === "RESTAURANT" ? t("restaurant") : t("grocery")}</span>}
      langToggle={<LangToggle lang={lang} />}
    >
      {children}
    </AppShell>
  );
}
