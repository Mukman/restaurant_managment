import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator, PAYMENT_LABELS } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER", "INVENTORY"]);
  const { id } = await params;
  const lang = await getLang();
  const t = translator(lang);
  const p = await db.purchase.findFirst({ where: { id, tenantId: s.tenantId }, include: { supplier: true, items: true, payments: { orderBy: { createdAt: "asc" } } } });
  if (!p) notFound();
  const fmt = (d: Date) => d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="p-4 md:p-6 max-w-4xl grid gap-4">
      <div className="panel">
        <Link href="/app/purchases" className="text-sm font-bold" style={{ color: "var(--primary)" }}>← {t("purchases")}</Link>
        <h1 className="text-xl font-extrabold mt-2">{t("purchases")} #{p.number}</h1>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          <Link href={`/app/suppliers/${p.supplierId}`} className="font-bold">{p.supplier.name}</Link> · {fmt(p.createdAt)}{p.invoiceNo ? ` · ${p.invoiceNo}` : ""}
        </p>
        {p.note && <p className="text-sm mt-1">{p.note}</p>}
      </div>
      <div className="panel overflow-x-auto">
        <table className="table w-full">
          <thead><tr><th>{t("product")}</th><th>{t("quantity")}</th><th>{t("unitCost")}</th><th>{t("expiry")}</th><th>{t("total")}</th></tr></thead>
          <tbody>
            {p.items.map((i) => (
              <tr key={i.id}>
                <td className="font-bold">{i.name}</td><td>{Number(i.quantity)}</td><td>{formatETB(i.unitCost, lang)}</td>
                <td>{i.expiresAt ? i.expiresAt.toISOString().slice(0, 10) : "—"}</td><td>{formatETB(i.lineTotal, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-right mt-3 grid gap-1">
          <div className="font-extrabold">{t("total")}: {formatETB(p.total, lang)}</div>
          <div>{t("paid")}: {formatETB(p.paid, lang)}</div>
          <div className="font-bold">{t("balanceDue")}: {formatETB(p.total - p.paid, lang)}</div>
        </div>
      </div>
      {p.payments.length > 0 && (
        <div className="panel overflow-x-auto">
          <h2 className="font-extrabold mb-2">{t("payments")}</h2>
          <table className="table w-full"><tbody>
            {p.payments.map((x) => (
              <tr key={x.id}><td>{fmt(x.createdAt)}</td><td>{PAYMENT_LABELS[x.method]?.[lang]}{x.fromTill ? ` (${t("fromTill")})` : ""}</td><td>{x.reference ?? ""}</td><td>{formatETB(x.amount, lang)}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
