import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";
import { ProductForm } from "./ProductForm";

const KEYS: DictKey[] = ["addProduct", "name", "nameAm", "category", "barcode", "price", "cost", "unit", "openingStock", "minStock", "soldByWeight", "noStockTracking", "save", "unit_PIECE", "unit_KG", "unit_GRAM", "unit_LITER", "unit_BOTTLE", "unit_BOX", "unit_PACK"];

export default async function ProductsPage() {
  const s = await requireSession(["OWNER", "MANAGER", "INVENTORY"]);
  const lang = await getLang();
  const t = translator(lang);
  const products = await db.product.findMany({
    where: { tenantId: s.tenantId, active: true },
    include: { category: true, stock: { where: { branchId: s.branchId } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-4 md:p-6 max-w-6xl grid lg:grid-cols-[1fr_380px] gap-4 items-start">
      <div className="panel overflow-x-auto">
        <h1 className="text-xl font-extrabold mb-3">{t("products")} ({products.length})</h1>
        <table className="table w-full">
          <thead><tr><th>{t("name")}</th><th className="hidden md:table-cell">{t("category")}</th><th className="hidden md:table-cell">{t("barcode")}</th><th>{t("cost")}</th><th>{t("price")}</th><th>{t("stock")}</th></tr></thead>
          <tbody>
            {products.map((p) => {
              const q = Number(p.stock[0]?.quantity ?? 0);
              const cls = !p.tracksStock ? "" : q <= 0 ? "badge-err" : q <= Number(p.minStock) ? "badge-warn" : "badge-ok";
              return (
                <tr key={p.id}>
                  <td><div className="font-bold">{p.name}</div>{p.nameAm && <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{p.nameAm}</div>}</td>
                  <td className="hidden md:table-cell">{p.category?.name ?? "—"}</td>
                  <td className="hidden md:table-cell font-mono text-xs">{p.barcode ?? "—"}</td>
                  <td>{p.cost > 0 ? formatETB(p.cost, lang) : "—"}</td>
                  <td>{formatETB(p.price, lang)}{p.soldByWeight ? t("perKg") : ""}</td>
                  <td>{p.tracksStock ? <span className={`badge ${cls}`}>{q} {t(`unit_${p.unit}` as DictKey)}</span> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ProductForm mode={s.mode} t={Object.fromEntries(KEYS.map((k) => [k, t(k)]))} />
    </div>
  );
}
