import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";
import { AddSupplierForm } from "./SupplierForms";

const KEYS: DictKey[] = ["addSupplier", "name", "phone", "save"];

export default async function SuppliersPage() {
  const s = await requireSession(["OWNER", "MANAGER", "INVENTORY"]);
  const lang = await getLang();
  const t = translator(lang);
  const suppliers = await db.supplier.findMany({ where: { tenantId: s.tenantId }, orderBy: [{ active: "desc" }, { balance: "desc" }, { name: "asc" }] });
  const total = suppliers.reduce((sum, x) => sum + x.balance, 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl grid lg:grid-cols-[1fr_340px] gap-4 items-start">
      <div className="panel overflow-x-auto">
        <div className="flex justify-between items-baseline mb-3">
          <h1 className="text-xl font-extrabold">{t("suppliers")} ({suppliers.length})</h1>
          <div className="text-sm font-bold">{t("weOwe")}: <span style={{ color: total > 0 ? "var(--error)" : undefined }}>{formatETB(total, lang)}</span></div>
        </div>
        <table className="table w-full">
          <thead><tr><th>{t("name")}</th><th>{t("phone")}</th><th>{t("weOwe")}</th></tr></thead>
          <tbody>
            {suppliers.map((x) => (
              <tr key={x.id} style={x.active ? undefined : { opacity: 0.55 }}>
                <td><Link href={`/app/suppliers/${x.id}`} className="font-bold" style={{ color: "var(--primary)" }}>{x.name}</Link></td>
                <td className="font-mono text-xs">{x.phone ?? "—"}</td>
                <td>{x.balance > 0 ? <span className="badge badge-warn">{formatETB(x.balance, lang)}</span> : "—"}</td>
              </tr>
            ))}
            {suppliers.length === 0 && <tr><td colSpan={3} style={{ color: "var(--ink-faint)" }}>—</td></tr>}
          </tbody>
        </table>
      </div>
      <AddSupplierForm t={Object.fromEntries(KEYS.map((k) => [k, t(k)]))} />
    </div>
  );
}
