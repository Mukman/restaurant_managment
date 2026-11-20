import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator, PAYMENT_LABELS, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";
import { LimitForm, RepayForm } from "../CustomerForms";

const KEYS: DictKey[] = ["recordRepayment", "owes", "amountPaid", "payment", "reference", "confirm", "creditLimit", "save"];

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER", "CASHIER"]);
  const { id } = await params;
  const lang = await getLang();
  const t = translator(lang);
  const c = await db.customer.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!c) notFound();
  const entries = await db.creditEntry.findMany({ where: { customerId: c.id, tenantId: s.tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
  const orders = await db.order.findMany({ where: { id: { in: entries.flatMap((e) => (e.orderId ? [e.orderId] : [])) } }, select: { id: true, number: true } });
  const orderNo = new Map(orders.map((o) => [o.id, o.number]));
  const tt = Object.fromEntries(KEYS.map((k) => [k, t(k)]));
  const methods = Object.fromEntries(Object.entries(PAYMENT_LABELS).map(([k, v]) => [k, v[lang]]));
  const fmt = (d: Date) => d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <Link href="/app/customers" className="text-sm font-bold" style={{ color: "var(--ink-soft)" }}>← {t("customers")}</Link>
      <h1 className="text-2xl font-extrabold mb-1 mt-2">{c.name}</h1>
      <p className="mb-4 font-mono text-sm" style={{ color: "var(--ink-soft)" }}>{c.phone ?? ""}</p>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <div className="panel"><div className="text-xs font-bold mb-1" style={{ color: "var(--ink-soft)" }}>{t("owes")}</div><div className="text-2xl font-extrabold">{formatETB(c.creditBalance, lang)}</div></div>
        <div className="panel"><div className="text-xs font-bold mb-1" style={{ color: "var(--ink-soft)" }}>{t("creditLimit")}</div><div className="text-2xl font-extrabold">{formatETB(c.creditLimit, lang)}</div></div>
        <div className="panel"><div className="text-xs font-bold mb-1" style={{ color: "var(--ink-soft)" }}>{t("available")}</div><div className="text-2xl font-extrabold">{formatETB(Math.max(0, c.creditLimit - c.creditBalance), lang)}</div></div>
      </div>
      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="panel overflow-x-auto">
          <h2 className="font-extrabold mb-3">{t("history")}</h2>
          <table className="table w-full">
            <thead><tr><th>{t("date")}</th><th></th><th>{t("amount")}</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{fmt(e.createdAt)}</td>
                  <td>
                    {e.type === "SALE" ? <span className="badge badge-warn">{t("creditSale")} #{orderNo.get(e.orderId ?? "") ?? ""}</span>
                      : <span className="badge badge-ok">{t("repayment")} · {PAYMENT_LABELS[e.method ?? "CASH"]?.[lang]}{e.reference ? ` · ${e.reference}` : ""}</span>}
                  </td>
                  <td className="font-bold" style={{ color: e.type === "SALE" ? "var(--error)" : "var(--success)" }}>{e.type === "SALE" ? "+" : "−"}{formatETB(e.amount, lang)}</td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={3} style={{ color: "var(--ink-faint)" }}>—</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          <RepayForm customerId={c.id} t={tt} methods={methods} owed={formatETB(c.creditBalance, lang)} />
          {(s.role === "OWNER" || s.role === "MANAGER") && (
            <div className="panel"><LimitForm customerId={c.id} current={String(c.creditLimit / 100)} t={tt} /></div>
          )}
        </div>
      </div>
    </div>
  );
}
