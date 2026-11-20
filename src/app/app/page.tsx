import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";

export default async function Dashboard() {
  const s = await requireSession();
  if (!["OWNER", "MANAGER"].includes(s.role)) redirect(s.role === "INVENTORY" ? "/app/products" : "/app/pos");
  const lang = await getLang();
  const t = translator(lang);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [sales, open, stock] = await Promise.all([
    db.order.aggregate({
      where: { tenantId: s.tenantId, branchId: s.branchId, status: "COMPLETED", closedAt: { gte: start } },
      _sum: { total: true },
      _count: true,
    }),
    db.order.count({ where: { tenantId: s.tenantId, branchId: s.branchId, status: "OPEN" } }),
    db.stockLevel.findMany({
      where: { branchId: s.branchId, product: { tenantId: s.tenantId, active: true, tracksStock: true } },
      include: { product: true },
    }),
  ]);
  const low = stock.filter((x) => Number(x.quantity) <= Number(x.product.minStock));

  const kpis = [
    [t("todaySales"), formatETB(sales._sum.total ?? 0, lang)],
    [t("todayOrders"), String(sales._count)],
    ...(s.mode === "RESTAURANT" ? [[t("openOrders"), String(open)]] : []),
    [t("lowStock"), String(low.length)],
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <h1 className="text-2xl font-extrabold mb-4">{t("dashboard")}</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {kpis.map(([label, value]) => (
          <div key={label} className="panel">
            <div className="text-xs font-bold mb-2" style={{ color: "var(--ink-soft)" }}>{label}</div>
            <div className="text-2xl font-extrabold">{value}</div>
          </div>
        ))}
      </div>
      <div className="panel overflow-x-auto">
        <h2 className="font-extrabold mb-3">{t("lowStock")}</h2>
        <table className="table w-full">
          <thead><tr><th>{t("name")}</th><th>{t("stock")}</th><th>{t("minStock")}</th></tr></thead>
          <tbody>
            {low.map((x) => (
              <tr key={x.productId}>
                <td>{lang === "am" && x.product.nameAm ? x.product.nameAm : x.product.name}</td>
                <td><span className={`badge ${Number(x.quantity) <= 0 ? "badge-err" : "badge-warn"}`}>{Number(x.quantity)}</span></td>
                <td>{Number(x.product.minStock)}</td>
              </tr>
            ))}
            {low.length === 0 && <tr><td colSpan={3} style={{ color: "var(--ink-faint)" }}>—</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
