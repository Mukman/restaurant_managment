import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLang } from "@/lib/lang";
import { currentShift } from "@/lib/shift";
import { PosClient, type PosProduct, type OpenOrder } from "./PosClient";

export default async function PosPage() {
  const s = await requireSession(["OWNER", "MANAGER", "CASHIER", "WAITER"]);
  const lang = await getLang();
  const isRestaurant = s.mode === "RESTAURANT";

  const [shift, tenant, products, customers, tables, waiters, open] = await Promise.all([
    currentShift(s),
    db.tenant.findUniqueOrThrow({ where: { id: s.tenantId } }),
    db.product.findMany({
      where: { tenantId: s.tenantId, active: true },
      include: { category: true, stock: { where: { branchId: s.branchId } } },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({ where: { tenantId: s.tenantId }, orderBy: { name: "asc" } }),
    isRestaurant ? db.diningTable.findMany({ where: { branchId: s.branchId }, orderBy: { label: "asc" } }) : [],
    isRestaurant ? db.user.findMany({ where: { tenantId: s.tenantId, role: "WAITER", active: true } }) : [],
    isRestaurant
      ? db.order.findMany({
          where: { tenantId: s.tenantId, branchId: s.branchId, status: "OPEN" },
          include: { table: true, items: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);

  const posProducts: PosProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    nameAm: p.nameAm,
    category: p.category?.name ?? null,
    barcode: p.barcode,
    price: p.price,
    vatRate: p.vatRate,
    soldByWeight: p.soldByWeight,
    tracksStock: p.tracksStock,
    stock: Number(p.stock[0]?.quantity ?? 0),
  }));
  const openOrders: OpenOrder[] = open.map((o) => ({
    id: o.id,
    number: o.number,
    table: o.table?.label ?? null,
    total: o.total,
    items: o.items.map((i) => ({ name: i.name, quantity: Number(i.quantity), lineTotal: i.lineTotal })),
  }));

  return (
    <PosClient
      lang={lang}
      mode={s.mode}
      hasShift={!!shift}
      shop={{ name: tenant.name, tin: tenant.tin }}
      cashier={s.name}
      userId={s.userId}
      products={posProducts}
      customers={customers.map((c) => ({ id: c.id, name: c.name, available: c.creditLimit - c.creditBalance }))}
      tables={tables.map((x) => ({ id: x.id, label: x.label }))}
      waiters={waiters.map((w) => ({ id: w.id, name: w.name }))}
      openOrders={openOrders}
    />
  );
}
