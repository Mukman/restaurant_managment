import { requireSession } from "@/lib/auth";
import { translator, PAYMENT_LABELS } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";
import { parseRange, ReportError, salesReport, type SalesReport } from "@/lib/reports";
import { PrintButton } from "./PrintButton";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const q = await searchParams;
  const lang = await getLang();
  const t = translator(lang);
  let error = "";
  let range = parseRange();
  let r: SalesReport | null = null;
  try {
    range = parseRange(q.from, q.to);
    r = await salesReport(s, range);
  } catch (e) {
    if (e instanceof ReportError) error = e.message;
    else throw e;
  }
  const f = (n: number) => formatETB(n, lang);
  const qs = `from=${range.from}&to=${range.to}`;

  return (
    <div className="p-4 md:p-6 max-w-5xl report">
      <h1 className="text-2xl font-extrabold mb-1">{t("reports")}</h1>
      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>{range.from} → {range.to}</p>
      <form className="panel no-print grid grid-cols-2 sm:flex sm:flex-wrap gap-3 items-end mb-4" method="get">
        <label className="field mb-0"><span>{t("from")}</span><input className="input" type="date" name="from" defaultValue={range.from} /></label>
        <label className="field mb-0"><span>{t("to")}</span><input className="input" type="date" name="to" defaultValue={range.to} /></label>
        <button className="btn btn-primary">{t("show")}</button>
        {r && <a className="btn" href={`/app/reports/export?${qs}`}>{t("exportExcel")}</a>}
        {r && <PrintButton label={t("printPdf")} />}
      </form>
      {error && <div className="error-box">{error}</div>}
      {r && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {([
              [t("todayOrders"), String(r.orders)],
              [t("grossSales"), f(r.gross)],
              [t("discounts"), f(r.discount)],
              [t("refundsTotal"), f(r.refunded)],
              [t("netSalesLabel"), f(r.net)],
              [t("vatIncluded"), f(r.vat)],
              [t("purchasesReceived"), f(r.purchases.total)],
            ] as const).map(([label, value]) => (
              <div key={label} className="panel">
                <div className="text-xs font-bold mb-1" style={{ color: "var(--ink-soft)" }}>{label}</div>
                <div className="text-xl font-extrabold">{value}</div>
              </div>
            ))}
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="panel overflow-x-auto">
              <h2 className="font-extrabold mb-2">{t("byDay")}</h2>
              <table className="table w-full">
                <thead><tr><th>{t("date")}</th><th>{t("orders")}</th><th>{t("netSalesLabel")}</th></tr></thead>
                <tbody>
                  {r.byDay.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.orders}</td><td>{f(d.net)}</td></tr>)}
                  {r.byDay.length === 0 && <tr><td colSpan={3} style={{ color: "var(--ink-faint)" }}>—</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="panel overflow-x-auto">
              <h2 className="font-extrabold mb-2">{t("byPayment")}</h2>
              <table className="table w-full">
                <tbody>
                  {r.byMethod.map((m) => <tr key={m.method}><td>{PAYMENT_LABELS[m.method]?.[lang] ?? m.method}</td><td>{f(m.amount)}</td></tr>)}
                  {r.byMethod.length === 0 && <tr><td style={{ color: "var(--ink-faint)" }}>—</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="panel overflow-x-auto lg:col-span-2">
              <h2 className="font-extrabold mb-2">{t("topProducts")}</h2>
              <table className="table w-full">
                <thead><tr><th>{t("product")}</th><th>{t("quantity")}</th><th>{t("revenue")}</th></tr></thead>
                <tbody>
                  {r.topProducts.map((p) => <tr key={p.name}><td className="font-bold">{p.name}</td><td>{p.quantity}</td><td>{f(p.revenue)}</td></tr>)}
                  {r.topProducts.length === 0 && <tr><td colSpan={3} style={{ color: "var(--ink-faint)" }}>—</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
