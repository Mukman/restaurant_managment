import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator, PAYMENT_LABELS, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";
import { ActiveToggle, PaySupplierForm } from "../SupplierForms";

const KEYS: DictKey[] = ["paySupplier", "weOwe", "amountPaid", "payment", "reference", "fromTill", "forPurchase", "oldestFirst", "confirm", "deactivate", "activate"];

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER", "INVENTORY"]);
  const { id } = await params;
  const lang = await getLang();
  const t = translator(lang);
  const sup = await db.supplier.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!sup) notFound();
  const [purchases, payments] = await Promise.all([
    db.purchase.findMany({ where: { supplierId: sup.id, tenantId: s.tenantId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.supplierPayment.findMany({ where: { supplierId: sup.id, tenantId: s.tenantId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const numberOf = new Map(purchases.map((p) => [p.id, p.number]));
  const canPay = s.role === "OWNER" || s.role === "MANAGER";
  const tt = Object.fromEntries(KEYS.map((k) => [k, t(k)]));
  const methods = Object.fromEntries(Object.entries(PAYMENT_LABELS).map(([k, v]) => [k, v[lang]]));
  const unpaid = purchases.filter((p) => p.paid < p.total).map((p) => ({ id: p.id, label: `#${p.number} · ${formatETB(p.total - p.paid, lang)}` }));
  const fmt = (d: Date) => d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <Link href="/app/suppliers" className="text-sm font-bold" style={{ color: "var(--ink-soft)" }}>← {t("suppliers")}</Link>
      <div className="flex items-center gap-3 mt-2 mb-1">
        <h1 className="text-2xl font-extrabold">{sup.name}</h1>
        {canPay && <ActiveToggle supplierId={sup.id} active={sup.active} t={tt} />}
      </div>
      <p className="mb-4 font-mono text-sm" style={{ color: "var(--ink-soft)" }}>{sup.phone ?? ""}</p>
      <div className="panel mb-4 max-w-xs"><div className="text-xs font-bold mb-1" style={{ color: "var(--ink-soft)" }}>{t("weOwe")}</div><div className="text-2xl font-extrabold">{formatETB(sup.balance, lang)}</div></div>
      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="space-y-4">
          <div className="panel overflow-x-auto">
            <h2 className="font-extrabold mb-3">{t("purchases")}</h2>
            <table className="table w-full">
              <thead><tr><th>#</th><th>{t("date")}</th><th>{t("total")}</th><th>{t("paid")}</th></tr></thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/app/purchases/${p.id}`} className="font-bold" style={{ color: "var(--primary)" }}>#{p.number}</Link>{p.invoiceNo && <span className="text-xs ml-1" style={{ color: "var(--ink-faint)" }}>{p.invoiceNo}</span>}</td>
                    <td>{fmt(p.createdAt)}</td><td className="font-bold">{formatETB(p.total, lang)}</td>
                    <td>{p.paid >= p.total ? <span className="badge badge-ok">{t("paid")}</span> : <span className="badge badge-warn">{formatETB(p.total - p.paid, lang)}</span>}</td>
                  </tr>
                ))}
                {purchases.length === 0 && <tr><td colSpan={4} style={{ color: "var(--ink-faint)" }}>—</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="panel overflow-x-auto">
            <h2 className="font-extrabold mb-3">{t("payments")}</h2>
            <table className="table w-full">
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{fmt(p.createdAt)}</td>
                    <td>{PAYMENT_LABELS[p.method][lang]}{p.reference ? ` · ${p.reference}` : ""}{p.fromTill ? ` · ${t("fromTill")}` : ""}</td>
                    <td>{p.purchaseId && numberOf.get(p.purchaseId) ? `#${numberOf.get(p.purchaseId)}` : ""}</td>
                    <td className="font-bold text-right" style={{ color: "var(--success)" }}>−{formatETB(p.amount, lang)}</td>
                  </tr>
                ))}
                {payments.length === 0 && <tr><td style={{ color: "var(--ink-faint)" }}>—</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {canPay && sup.balance > 0 && <PaySupplierForm supplierId={sup.id} t={tt} methods={methods} owed={formatETB(sup.balance, lang)} purchases={unpaid} />}
      </div>
    </div>
  );
}
