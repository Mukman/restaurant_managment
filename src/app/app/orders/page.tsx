import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";

export default async function OrdersPage() {
  const s = await requireSession(["OWNER", "MANAGER", "CASHIER"]);
  const lang = await getLang();
  const t = translator(lang);
  const orders = await db.order.findMany({
    where: { tenantId: s.tenantId, branchId: s.branchId, status: { in: ["COMPLETED", "REFUNDED"] } },
    include: { refunds: true, customer: true, table: true },
    orderBy: { closedAt: "desc" },
    take: 100,
  });
  const fmt = (d: Date | null) => (d ? d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—");

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <h1 className="text-2xl font-extrabold mb-4">{t("orders")}</h1>
      <div className="panel overflow-x-auto">
        <table className="table w-full">
          <thead><tr><th>#</th><th>{t("date")}</th><th className="hidden md:table-cell">{t("customer")}</th><th>{t("total")}</th><th>{t("refunded")}</th><th>{t("status")}</th></tr></thead>
          <tbody>
            {orders.map((o) => {
              const refunded = o.refunds.reduce((sum, r) => sum + r.amount, 0);
              return (
                <tr key={o.id}>
                  <td><Link href={`/app/orders/${o.id}`} className="font-bold" style={{ color: "var(--primary)" }}>#{o.number}</Link>{o.table && <span className="text-xs ml-1" style={{ color: "var(--ink-faint)" }}>{o.table.label}</span>}</td>
                  <td>{fmt(o.closedAt)}</td>
                  <td className="hidden md:table-cell">{o.customer?.name ?? "—"}</td>
                  <td className="font-bold">{formatETB(o.total, lang)}</td>
                  <td>{refunded > 0 ? <span className="badge badge-err">−{formatETB(refunded, lang)}</span> : "—"}</td>
                  <td><span className={`badge ${o.status === "REFUNDED" ? "badge-err" : "badge-ok"}`}>{o.status === "REFUNDED" ? t("fullyRefunded") : t("completed")}</span></td>
                </tr>
              );
            })}
            {orders.length === 0 && <tr><td colSpan={6} style={{ color: "var(--ink-faint)" }}>—</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
