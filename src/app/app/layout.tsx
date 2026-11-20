import Link from "next/link";
import { LangToggle } from "@/components/LangToggle";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator } from "@/lib/i18n";
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
    { href: "/app/purchases", label: t("purchases"), roles: ["OWNER", "MANAGER", "INVENTORY"] },
    { href: "/app/suppliers", label: t("suppliers"), roles: ["OWNER", "MANAGER", "INVENTORY"] },
    { href: "/app/staff", label: t("staff"), roles: ["OWNER", "MANAGER"] },
  ].filter((n) => n.roles.includes(s.role));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="text-white p-4 flex md:flex-col gap-2 items-center md:items-stretch md:sticky md:top-0 md:h-screen" style={{ background: "var(--sidebar)" }}>
        <div className="font-extrabold text-base md:mb-4 mr-auto md:mr-0 truncate">{tenant.name}</div>
        <nav className="flex md:flex-col gap-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="px-3 py-2 rounded-lg font-semibold hover:bg-white/10">{n.label}</Link>
          ))}
        </nav>
        <form action={logout} className="md:mt-auto">
          <div className="hidden md:block text-sm font-bold">{s.name}</div>
          <div className="hidden md:block text-xs mb-2" style={{ color: "#8fa396" }}>{s.role}</div>
          <button className="text-sm font-semibold opacity-80 hover:opacity-100">{t("signOut")}</button>
        </form>
      </aside>
      <div className="min-w-0">
        <header className="h-14 bg-white border-b flex items-center justify-end px-4 gap-3" style={{ borderColor: "var(--line)" }}>
          <span className="badge badge-ok">{tenant.mode === "RESTAURANT" ? t("restaurant") : t("grocery")}</span>
          <LangToggle lang={lang} />
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
