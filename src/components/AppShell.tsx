"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutForm } from "./LogoutForm";

interface Props {
  tenantName: string;
  userName: string;
  role: string;
  nav: { href: string; label: string }[];
  signOutLabel: string;
  menuLabel: string;
  logout: () => void | Promise<void>;
  badge: React.ReactNode;
  langToggle: React.ReactNode;
  children: React.ReactNode;
}

const ICONS: Record<string, string> = {
  "/app": "📊", "/app/pos": "🛒", "/app/orders": "🧾", "/app/products": "📦", "/app/customers": "👥",
  "/app/shift": "⏱️", "/app/reports": "📈", "/app/purchases": "🚚", "/app/suppliers": "🏭", "/app/staff": "🪪",
};
// Which pages get a tab on a phone (the first four the person's role may open); the rest go under "More".
const TAB_PRIORITY = ["/app/pos", "/app", "/app/orders", "/app/products", "/app/customers", "/app/shift"];

/** Sidebar on desktop. On phones: a slim top bar, a bottom tab bar, and a small "More" sheet that slides up. */
export function AppShell(p: Props) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  const tabs = TAB_PRIORITY.map((h) => p.nav.find((n) => n.href === h)).filter((n): n is { href: string; label: string } => !!n).slice(0, 4);
  const more = p.nav.filter((n) => !tabs.includes(n));
  const moreActive = more.some((n) => active(n.href));

  const links = (
    <nav className="flex flex-col gap-1">
      {p.nav.map((n) => (
        <Link key={n.href} href={n.href} className="px-3 py-2 rounded-lg font-semibold hover:bg-white/10"
          style={active(n.href) ? { background: "rgba(255,255,255,.14)" } : undefined}>
          {n.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="no-print hidden md:flex flex-col gap-2 text-white p-4 sticky top-0 h-screen overflow-y-auto" style={{ background: "var(--sidebar)" }}>
        <div className="font-extrabold text-base mb-4 truncate">{p.tenantName}</div>
        {links}
        <LogoutForm action={p.logout} className="mt-auto">
          <div className="text-sm font-bold">{p.userName}</div>
          <div className="text-xs mb-2" style={{ color: "#8fa396" }}>{p.role}</div>
          <button className="text-sm font-semibold opacity-80 hover:opacity-100">{p.signOutLabel}</button>
        </LogoutForm>
      </aside>

      {/* Phone top bar */}
      <div className="no-print md:hidden sticky top-0 z-30 text-white h-12 flex items-center gap-3 px-4" style={{ background: "var(--sidebar)" }}>
        <div className="font-extrabold truncate flex-1">{p.tenantName}</div>
        <div className="bg-white rounded-full">{p.langToggle}</div>
      </div>

      {/* Phone "More" sheet */}
      {open && (
        <div className="no-print md:hidden fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div role="dialog" aria-label={p.menuLabel} onClick={(e) => e.stopPropagation()}
            className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl p-4 shadow-2xl"
            style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: "var(--line)" }} />
            {more.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {more.map((n) => (
                  <Link key={n.href} href={n.href} className="flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-bold text-center"
                    style={active(n.href) ? { background: "var(--primary-tint)", color: "var(--primary)" } : { background: "var(--surface-2)" }}>
                    <span className="text-xl" aria-hidden>{ICONS[n.href] ?? "•"}</span>{n.label}
                  </Link>
                ))}
              </div>
            )}
            <LogoutForm action={p.logout} className="flex items-center justify-between gap-3 pt-3 border-t" >
              <div className="text-sm min-w-0"><div className="font-bold truncate">{p.userName}</div><div className="text-xs" style={{ color: "var(--ink-soft)" }}>{p.role}</div></div>
              <button className="btn btn-secondary !py-2">{p.signOutLabel}</button>
            </LogoutForm>
          </div>
        </div>
      )}

      {/* Phone bottom tab bar */}
      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t grid text-[11px] font-bold"
        style={{ borderColor: "var(--line)", gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map((n) => (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="flex flex-col items-center justify-center gap-0.5 h-16"
            style={active(n.href) && !open ? { color: "var(--primary)", background: "var(--primary-tint)" } : { color: "var(--ink-soft)" }}>
            <span className="text-xl leading-none" aria-hidden>{ICONS[n.href] ?? "•"}</span>
            <span className="truncate max-w-full px-1">{n.label}</span>
          </Link>
        ))}
        <button aria-label={p.menuLabel} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex flex-col items-center justify-center gap-0.5 h-16"
          style={open || moreActive ? { color: "var(--primary)", background: "var(--primary-tint)" } : { color: "var(--ink-soft)" }}>
          <span className="text-xl leading-none" aria-hidden>⋯</span>
          <span>{p.menuLabel}</span>
        </button>
      </nav>

      <div className="min-w-0">
        <header className="no-print hidden md:flex h-14 bg-white border-b items-center justify-end px-4 gap-3" style={{ borderColor: "var(--line)" }}>
          {p.badge}
          {p.langToggle}
        </header>
        <main className="min-w-0 pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0">{p.children}</main>
      </div>
    </div>
  );
}
