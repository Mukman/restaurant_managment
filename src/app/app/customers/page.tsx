import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";
import { AddCustomerForm } from "./CustomerForms";

const KEYS: DictKey[] = ["addCustomer", "name", "phone", "creditLimit", "limitByManager", "save"];

export default async function CustomersPage() {
  const s = await requireSession(["OWNER", "MANAGER", "CASHIER"]);
  const lang = await getLang();
  const t = translator(lang);
  const customers = await db.customer.findMany({ where: { tenantId: s.tenantId }, orderBy: [{ creditBalance: "desc" }, { name: "asc" }] });
  const totalOwed = customers.reduce((sum, c) => sum + c.creditBalance, 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl grid lg:grid-cols-[1fr_340px] gap-4 items-start">
      <div className="panel overflow-x-auto">
        <div className="flex justify-between items-baseline mb-3">
          <h1 className="text-xl font-extrabold">{t("customers")} ({customers.length})</h1>
          <div className="text-sm font-bold">{t("totalOwed")}: <span style={{ color: "var(--error)" }}>{formatETB(totalOwed, lang)}</span></div>
        </div>
        <table className="table w-full">
          <thead><tr><th>{t("name")}</th><th className="hidden md:table-cell">{t("phone")}</th><th>{t("owes")}</th><th>{t("creditLimit")}</th><th>{t("available")}</th></tr></thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/app/customers/${c.id}`} className="font-bold" style={{ color: "var(--primary)" }}>{c.name}</Link></td>
                <td className="hidden md:table-cell font-mono text-xs">{c.phone ?? "—"}</td>
                <td>{c.creditBalance > 0 ? <span className="badge badge-warn">{formatETB(c.creditBalance, lang)}</span> : "—"}</td>
                <td>{formatETB(c.creditLimit, lang)}</td>
                <td>{formatETB(Math.max(0, c.creditLimit - c.creditBalance), lang)}</td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={5} style={{ color: "var(--ink-faint)" }}>—</td></tr>}
          </tbody>
        </table>
      </div>
      <AddCustomerForm t={Object.fromEntries(KEYS.map((k) => [k, t(k)]))} canSetLimit={s.role === "OWNER" || s.role === "MANAGER"} />
    </div>
  );
}
