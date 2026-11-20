import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translator, PAYMENT_LABELS, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { formatETB } from "@/lib/money";
import { NewPurchaseForm } from "../NewPurchaseForm";

const KEYS: DictKey[] = ["supplier", "invoiceNo", "product", "quantity", "unitCost", "expiry", "addLine", "note", "paidNow", "payment", "reference", "fromTill", "total", "receiveStock", "removeLabel", "etb"];

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER", "INVENTORY"]);
  const { supplier } = await searchParams;
  const lang = await getLang();
  const t = translator(lang);
  const [suppliers, products] = await Promise.all([
    db.supplier.findMany({ where: { tenantId: s.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tenantId: s.tenantId, active: true }, orderBy: { name: "asc" } }),
  ]);
  const methods = Object.fromEntries(Object.entries(PAYMENT_LABELS).map(([k, v]) => [k, v[lang]]));
  // Only owner/manager may pay suppliers, so the payment section stays out of the way for others.
  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <h1 className="text-xl font-extrabold mb-3">{t("newPurchase")}</h1>
      <NewPurchaseForm
        suppliers={suppliers.map((x) => ({ id: x.id, label: x.name }))}
        products={products.map((p) => ({ id: p.id, label: p.name, cost: formatETB(p.cost, lang) }))}
        methods={methods}
        t={Object.fromEntries(KEYS.map((k) => [k, t(k)]))}
        defaultSupplier={supplier}
      />
    </div>
  );
}
