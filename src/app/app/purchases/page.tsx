import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";

export default async function PurchasesPage() {
  const s = await requireSession(["OWNER", "MANAGER", "INVENTORY"]);
  const lang = await getLang();
  const t = translator(lang);
  const purchases = await db.purchase.findMany({
    where: { tenantId: s.tenantId, branchId: s.branchId },
    include: { supplier: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const fmt = (d: Date) => d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="panel overflow-x-auto">
        <div className="flex justify-between items-baseline mb-3">
          <h1 className="text-xl font-extrabold">{t("purchases")}</h1>
          <Link href="/app/purchases/new" className="btn btn-primary">{t("newPurchase")}</Link>
        </div>
        <table className="table w-full">
          <thead><tr><th>#</th><th>{t("date")}</th><th>{t("supplier")}</th><th>{t("invoiceNo")}</th><th>{t("total")}</th><th>{t("paid")}</th></tr></thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/app/purchases/${p.id}`} className="font-bold" style={{ color: "var(--primary)" }}>#{p.number}</Link></td>
                <td>{fmt(p.createdAt)}</td>
                <td>{p.supplier.name}</td>
                <td>{p.invoiceNo ?? "—"}</td>
                <td>{formatETB(p.total, lang)}</td>
                <td>{p.paid >= p.total ? <span className="badge badge-ok">{formatETB(p.paid, lang)}</span> : <span className="badge badge-warn">{formatETB(p.paid, lang)}</span>}</td>
              </tr>
            ))}
            {purchases.length === 0 && <tr><td colSpan={6} style={{ color: "var(--ink-faint)" }}>—</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
