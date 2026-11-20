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

/** Sidebar on desktop; on phones a slim top bar with a menu button that opens the same links. */
export function AppShell(p: Props) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  const links = (
    <nav className="flex flex-col gap-1">
      {p.nav.map((n) => (
        <Link key={n.href} href={n.href} className="px-3 py-3 md:py-2 rounded-lg font-semibold hover:bg-white/10"
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
      <div className="no-print md:hidden sticky top-0 z-30 text-white" style={{ background: "var(--sidebar)" }}>
        <div className="h-14 flex items-center gap-3 px-4">
          <button aria-label={p.menuLabel} aria-expanded={open} onClick={() => setOpen((o) => !o)}
            className="w-11 h-11 -ml-2 flex items-center justify-center rounded-lg text-2xl hover:bg-white/10">
            {open ? "✕" : "☰"}
          </button>
          <div className="font-extrabold truncate flex-1">{p.tenantName}</div>
          <div className="bg-white rounded-full">{p.langToggle}</div>
        </div>
        {open && (
          <div className="px-3 pb-4 max-h-[calc(100vh-56px)] overflow-y-auto border-t border-white/10">
            <div className="py-2">{links}</div>
            <LogoutForm action={p.logout} className="px-3 pt-2 border-t border-white/10">
              <div className="text-sm font-bold">{p.userName} <span className="text-xs font-normal" style={{ color: "#8fa396" }}>· {p.role}</span></div>
              <button className="mt-2 py-2 text-sm font-semibold opacity-90">{p.signOutLabel}</button>
            </LogoutForm>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <header className="no-print hidden md:flex h-14 bg-white border-b items-center justify-end px-4 gap-3" style={{ borderColor: "var(--line)" }}>
          {p.badge}
          {p.langToggle}
        </header>
        <main className="min-w-0">{p.children}</main>
      </div>
    </div>
  );
}
