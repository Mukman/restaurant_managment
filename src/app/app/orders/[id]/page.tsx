import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator, PAYMENT_LABELS, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";
import { lineNets } from "@/lib/refunds";
import { RefundForm, type RefundLine } from "./RefundForm";

const KEYS: DictKey[] = ["refund", "refundSaved", "item", "refundQty", "restock", "canRefund", "refundMethod", "reference", "reason"];

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER", "CASHIER"]);
  const { id } = await params;
  const lang = await getLang();
  const t = translator(lang);
  const o = await db.order.findFirst({
    where: { id, tenantId: s.tenantId, branchId: s.branchId },
    include: { items: { orderBy: { id: "asc" } }, payments: true, refunds: { include: { items: true, }, orderBy: { createdAt: "asc" } }, customer: true, table: true },
  });
  if (!o || !["COMPLETED", "REFUNDED"].includes(o.status)) notFound();
  const products = await db.product.findMany({ where: { id: { in: o.items.map((i) => i.productId) }, tenantId: s.tenantId } });
  const nets = lineNets(o.items.map((i) => ({ id: i.id, lineTotal: i.lineTotal })), o.discount);
  const refundItems = o.refunds.flatMap((r) => r.items);

  const lines: RefundLine[] = o.items.map((i) => {
    const done = refundItems.filter((r) => r.orderItemId === i.id);
    const remaining = Math.round((Number(i.quantity) - done.reduce((sum, r) => sum + Number(r.quantity), 0)) * 1000) / 1000;
    const left = nets.get(i.id)! - done.reduce((sum, r) => sum + r.amount, 0);
    const p = products.find((x) => x.id === i.productId);
    return { id: i.id, name: i.name, remaining, soldByWeight: !!p?.soldByWeight, maxAmount: formatETB(left, lang), canRestock: !!p?.tracksStock };
  }).filter((l) => l.remaining > 0);

  const paidMethods = [...new Set(o.payments.map((p) => p.method))];
  const methodList = ["CASH", ...paidMethods.filter((m) => m !== "CASH")].map((m) => ({ value: m, label: PAYMENT_LABELS[m][lang] }));
  const refundedTotal = o.refunds.reduce((sum, r) => sum + r.amount, 0);
  const fmt = (d: Date | null) => (d ? d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—");
  const canRefund = (s.role === "OWNER" || s.role === "MANAGER") && o.status === "COMPLETED" && lines.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <Link href="/app/orders" className="text-sm font-bold" style={{ color: "var(--ink-soft)" }}>← {t("orders")}</Link>
      <h1 className="text-2xl font-extrabold mt-2 mb-1">#{o.number} {o.status === "REFUNDED" && <span className="badge badge-err align-middle ml-2">{t("fullyRefunded")}</span>}</h1>
      <p className="mb-4 text-sm" style={{ color: "var(--ink-soft)" }}>{fmt(o.closedAt)}{o.table ? ` · ${o.table.label}` : ""}{o.customer ? ` · ${o.customer.name}` : ""}</p>
      <div className="grid lg:grid-cols-[1fr_420px] gap-4 items-start">
        <div className="space-y-4">
          <div className="panel overflow-x-auto">
            <table className="table w-full">
              <tbody>
                {o.items.map((i) => (<tr key={i.id}><td>{Number(i.quantity)} × {i.name}</td><td className="text-right font-bold">{formatETB(i.lineTotal, lang)}</td></tr>))}
              </tbody>
            </table>
            <div className="border-t border-dashed mt-2 pt-2 space-y-1" style={{ borderColor: "var(--line)" }}>
              {o.discount > 0 && <div className="flex justify-between"><span>{t("discount")}</span><span>−{formatETB(o.discount, lang)}</span></div>}
              <div className="flex justify-between"><span>{t("vat")}</span><span>{formatETB(o.vatAmount, lang)}</span></div>
              <div className="flex justify-between font-extrabold text-base"><span>{t("total")}</span><span>{formatETB(o.total, lang)}</span></div>
              {o.payments.map((p) => (<div key={p.id} className="flex justify-between text-sm" style={{ color: "var(--ink-soft)" }}><span>{PAYMENT_LABELS[p.method][lang]}{p.reference ? ` · ${p.reference}` : ""}</span><span>{formatETB(p.amount, lang)}</span></div>))}
            </div>
          </div>
          {o.refunds.length > 0 && (
            <div className="panel">
              <h2 className="font-extrabold mb-3">{t("refunded")}: {formatETB(refundedTotal, lang)}</h2>
              {o.refunds.map((r) => (
                <div key={r.id} className="flex justify-between py-2 border-b last:border-0 text-sm" style={{ borderColor: "var(--line)" }}>
                  <span>{fmt(r.createdAt)} · {PAYMENT_LABELS[r.method][lang]}{r.reference ? ` · ${r.reference}` : ""} · <i>{r.reason}</i></span>
                  <b style={{ color: "var(--error)" }}>−{formatETB(r.amount, lang)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
        {canRefund && <RefundForm orderId={o.id} lines={lines} methods={methodList} t={Object.fromEntries(KEYS.map((k) => [k, t(k)]))} />}
      </div>
    </div>
  );
}
