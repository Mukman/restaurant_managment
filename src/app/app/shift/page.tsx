import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator, PAYMENT_LABELS, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";
import { currentShift, shiftSummary } from "@/lib/shift";
import { CloseShiftForm, OpenShiftForm, ReviewButtons } from "./ShiftForms";

const KEYS: DictKey[] = ["openShift", "closeShift", "openingCash", "countedCash", "expectedCash", "markAudited", "flagDispute"];

export default async function ShiftPage() {
  const s = await requireSession(["OWNER", "MANAGER", "CASHIER", "WAITER"]);
  const lang = await getLang();
  const t = translator(lang);
  const tt = Object.fromEntries(KEYS.map((k) => [k, t(k)]));
  const open = await currentShift(s);
  const summary = open ? await shiftSummary(open.id) : null;
  const canReview = s.role === "OWNER" || s.role === "MANAGER";
  const recent = await db.shift.findMany({
    where: { tenantId: s.tenantId, branchId: s.branchId, status: { not: "OPEN" }, ...(canReview ? {} : { userId: s.userId }) },
    include: { user: true },
    orderBy: { closedAt: "desc" },
    take: 15,
  });
  const fmt = (d: Date | null) => (d ? d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—");

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <h1 className="text-2xl font-extrabold mb-4">{t("shift")}</h1>
      {!open && <OpenShiftForm t={tt} />}
      {open && summary && (
        <div className="grid md:grid-cols-2 gap-4 items-start">
          <div className="panel">
            <div className="text-sm mb-3" style={{ color: "var(--ink-soft)" }}>{t("openedAt")}: {fmt(open.openedAt)}</div>
            <div className="space-y-1">
              <Row l={t("openingCash")} v={formatETB(open.openingFloat, lang)} />
              <Row l={t("orders")} v={String(summary.orderCount)} />
              {Object.entries(summary.methods).map(([m, v]) => (
                <Row key={m} l={PAYMENT_LABELS[m]?.[lang] ?? m} v={formatETB(v, lang)} />
              ))}
              {summary.cashRepayments > 0 && <Row l={t("cashRepayments")} v={formatETB(summary.cashRepayments, lang)} />}
              <div className="border-t border-dashed pt-2 mt-2" style={{ borderColor: "var(--line)" }}>
                <Row l={t("expectedCash")} v={formatETB(summary.expectedCash, lang)} bold />
              </div>
            </div>
          </div>
          <CloseShiftForm t={tt} expected={formatETB(summary.expectedCash, lang)} />
        </div>
      )}

      <div className="panel mt-6 overflow-x-auto">
        <h2 className="font-extrabold mb-3">{t("recentShifts")}</h2>
        <table className="table w-full">
          <thead><tr><th>{t("cashier")}</th><th>{t("openedAt")}</th><th>{t("closedAt")}</th><th>{t("expectedCash")}</th><th>{t("countedCash")}</th><th>{t("difference")}</th><th>{t("status")}</th></tr></thead>
          <tbody>
            {recent.map((r) => {
              const diff = (r.countedCash ?? 0) - (r.expectedCash ?? 0);
              return (
                <tr key={r.id}>
                  <td className="font-bold">{r.user.name}</td>
                  <td>{fmt(r.openedAt)}</td>
                  <td>{fmt(r.closedAt)}</td>
                  <td>{formatETB(r.expectedCash ?? 0, lang)}</td>
                  <td>{formatETB(r.countedCash ?? 0, lang)}</td>
                  <td><span className={`badge ${diff === 0 ? "badge-ok" : "badge-err"}`}>{diff > 0 ? "+" : ""}{formatETB(diff, lang)}</span></td>
                  <td>
                    <span className={`badge ${r.status === "AUDITED" ? "badge-ok" : r.status === "DISPUTED" ? "badge-err" : "badge-warn"}`}>{r.status}</span>
                    {canReview && r.status === "CLOSED" && <div className="mt-1"><ReviewButtons id={r.id} t={tt} /></div>}
                  </td>
                </tr>
              );
            })}
            {recent.length === 0 && <tr><td colSpan={7} style={{ color: "var(--ink-faint)" }}>—</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ l, v, bold }: { l: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-extrabold text-base" : ""}`}><span>{l}</span><span>{v}</span></div>;
}
