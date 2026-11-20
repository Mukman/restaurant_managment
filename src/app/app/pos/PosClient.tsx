"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PAYMENT_LABELS, translator, type Lang } from "@/lib/i18n";
import { cartTotals, formatETB, toSantim } from "@/lib/money";
import { checkoutAction, type CheckoutResult } from "./actions";

export interface PosProduct {
  id: string;
  name: string;
  nameAm: string | null;
  category: string | null;
  barcode: string | null;
  price: number;
  vatRate: number;
  soldByWeight: boolean;
  tracksStock: boolean;
  stock: number;
}
export interface OpenOrder {
  id: string;
  number: number;
  table: string | null;
  total: number;
  items: { name: string; quantity: number; lineTotal: number }[];
}
interface CartLine { product: PosProduct; quantity: number }
type Method = keyof typeof PAYMENT_LABELS;
const METHODS: Method[] = ["CASH", "TELEBIRR", "CBE_BIRR", "MPESA", "CARD", "BANK_TRANSFER", "CREDIT"];
const NEEDS_REF: Method[] = ["TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER"];

interface Props {
  lang: Lang;
  mode: "GROCERY" | "RESTAURANT";
  hasShift: boolean;
  shop: { name: string; tin: string | null };
  cashier: string;
  products: PosProduct[];
  customers: { id: string; name: string; available: number }[];
  tables: { id: string; label: string }[];
  waiters: { id: string; name: string }[];
  openOrders: OpenOrder[];
}

const newClientId = () => crypto.randomUUID();

export function PosClient(props: Props) {
  const { lang, mode, products } = props;
  const t = translator(lang);
  const router = useRouter();
  const isRestaurant = mode === "RESTAURANT";
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountBirr, setDiscountBirr] = useState("");
  const [tableId, setTableId] = useState("");
  const [waiterId, setWaiterId] = useState("");
  const [editingOrder, setEditingOrder] = useState<OpenOrder | null>(null); // adding items to an open order
  const [weighing, setWeighing] = useState<PosProduct | null>(null);
  const [weight, setWeight] = useState("");
  const [paying, setPaying] = useState<{ orderId?: string; total: number } | null>(null);
  const [receipt, setReceipt] = useState<{ result: Extract<CheckoutResult, { ok: true }>; lines: { name: string; qty: number; total: number }[]; method: Method; tendered?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const clientIdRef = useRef(newClientId()); // stays the same across retries of one sale

  const label = (p: { name: string; nameAm: string | null }) => (lang === "am" && p.nameAm ? p.nameAm : p.name);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))] as string[], [products]);
  const visible = products.filter((p) => {
    if (category && p.category !== category) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.nameAm ?? "").includes(q) || p.barcode === q;
  });

  const inCart = (id: string) => cart.find((l) => l.product.id === id)?.quantity ?? 0;
  const available = (p: PosProduct) => (p.tracksStock ? p.stock - inCart(p.id) : Infinity);

  function add(p: PosProduct, qty = 1) {
    setError(null);
    if (p.soldByWeight && qty === 1) { setWeighing(p); setWeight(""); return; }
    if (available(p) < qty) { setError(`${label(p)}: ${t("outOfStock")}`); return; }
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i === -1) return [...c, { product: p, quantity: qty }];
      const next = [...c];
      next[i] = { ...next[i], quantity: +(next[i].quantity + qty).toFixed(3) };
      return next;
    });
  }
  function setQty(id: string, q: number) {
    setCart((c) => (q <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, quantity: q } : l))));
  }
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const code = query.trim();
    const hit = products.find((p) => p.barcode && p.barcode === code) ?? (visible.length === 1 ? visible[0] : undefined);
    if (hit) { add(hit); setQuery(""); }
  }

  const discount = Math.max(0, toSantim(Number(discountBirr) || 0));
  const totals = cartTotals(cart.map((l) => ({ unitPrice: l.product.price, quantity: l.quantity, vatRate: l.product.vatRate })), discount);

  function reset() {
    setCart([]); setDiscountBirr(""); setTableId(""); setWaiterId(""); setEditingOrder(null);
    clientIdRef.current = newClientId();
    searchRef.current?.focus();
  }

  function submit(payload: Record<string, unknown>, after: (r: Extract<CheckoutResult, { ok: true }>) => void) {
    setError(null);
    startTransition(async () => {
      const r = await checkoutAction({ clientId: clientIdRef.current, ...payload });
      if (!r.ok) { setError(r.error); return; }
      after(r);
      router.refresh();
    });
  }

  const items = cart.map((l) => ({ productId: l.product.id, quantity: l.quantity }));

  function sendToTable() {
    submit(
      { action: "open", orderId: editingOrder?.id, items, discount, tableId: tableId || undefined, waiterId: waiterId || undefined },
      () => reset(),
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] lg:h-[calc(100vh-56px)]">
      {/* Products */}
      <section className="p-4 lg:overflow-y-auto">
        {!props.hasShift && (
          <Link href="/app/shift" className="block mb-3 rounded-lg px-4 py-3 font-bold badge-warn">{t("openFirst")} →</Link>
        )}
        {isRestaurant && props.openOrders.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-bold uppercase mb-2" style={{ color: "var(--ink-faint)" }}>{t("openOrders")}</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {props.openOrders.map((o) => (
                <div key={o.id} className="panel !p-3 min-w-[180px]">
                  <div className="font-extrabold">#{o.number} · {o.table ?? t("takeaway")}</div>
                  <div className="text-sm mb-2" style={{ color: "var(--ink-soft)" }}>{formatETB(o.total, lang)}</div>
                  <div className="flex gap-1">
                    <button className="btn btn-secondary !px-2 !py-1 text-xs" onClick={() => { reset(); setEditingOrder(o); }}>{t("addItems")}</button>
                    <button className="btn btn-primary !px-2 !py-1 text-xs" onClick={() => { setError(null); clientIdRef.current = newClientId(); setPaying({ orderId: o.id, total: o.total }); }}>{t("payOrder")}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <input
          ref={searchRef}
          autoFocus
          className="input mb-3 !bg-white"
          placeholder={t("search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
        />
        <div className="flex gap-2 overflow-x-auto mb-3 pb-1">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              onClick={() => setCategory(c)}
              className="px-4 py-1.5 rounded-full border font-bold text-sm whitespace-nowrap"
              style={category === c ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" } : { background: "#fff", borderColor: "var(--line)", color: "var(--ink-soft)" }}
            >
              {c ?? t("all")}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {visible.map((p) => {
            const out = p.tracksStock && p.stock <= 0;
            return (
              <button key={p.id} disabled={out} onClick={() => add(p)} className="panel !p-3 text-left hover:border-[var(--primary)] disabled:opacity-50">
                <div className="font-bold leading-tight">{label(p)}</div>
                {lang === "en" && p.nameAm && <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{p.nameAm}</div>}
                <div className="font-extrabold mt-1" style={{ color: "var(--primary)" }}>{formatETB(p.price, lang)}{p.soldByWeight ? t("perKg") : ""}</div>
                {p.tracksStock && (
                  <div className="text-xs font-semibold" style={{ color: out ? "var(--error)" : "var(--ink-faint)" }}>
                    {out ? t("outOfStock") : `${p.stock} ${t("inStock")}`}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Cart */}
      <aside className="bg-white border-l flex flex-col" style={{ borderColor: "var(--line)" }}>
        <div className="p-4 border-b" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-extrabold text-base">{editingOrder ? `#${editingOrder.number} · ${t("addItems")}` : t("cart")}</h2>
          {isRestaurant && !editingOrder && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <select className="input" value={tableId} onChange={(e) => setTableId(e.target.value)} aria-label={t("table")}>
                <option value="">{t("takeaway")}</option>
                {props.tables.map((x) => <option key={x.id} value={x.id}>{t("table")} {x.label}</option>)}
              </select>
              <select className="input" value={waiterId} onChange={(e) => setWaiterId(e.target.value)} aria-label={t("waiter")}>
                <option value="">{t("waiter")}: —</option>
                {props.waiters.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 min-h-[120px]">
          {cart.length === 0 && <p className="text-center py-10" style={{ color: "var(--ink-faint)" }}>{t("cartEmpty")}</p>}
          {cart.map((l) => (
            <div key={l.product.id} className="flex items-center gap-2 py-3 border-b" style={{ borderColor: "var(--line)" }}>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{label(l.product)}</div>
                <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{formatETB(l.product.price, lang)}{l.product.soldByWeight ? t("perKg") : ""}</div>
              </div>
              {l.product.soldByWeight ? (
                <span className="text-sm font-bold">{l.quantity} kg</span>
              ) : (
                <div className="flex items-center gap-1">
                  <button className="btn btn-secondary !p-0 w-7 h-7" onClick={() => setQty(l.product.id, l.quantity - 1)}>−</button>
                  <span className="w-6 text-center font-bold">{l.quantity}</span>
                  <button className="btn btn-secondary !p-0 w-7 h-7" onClick={() => add(l.product)}>+</button>
                </div>
              )}
              <div className="w-20 text-right font-bold text-sm">{formatETB(Math.round(l.product.price * l.quantity), lang)}</div>
              <button className="px-1" style={{ color: "var(--ink-faint)" }} onClick={() => setQty(l.product.id, 0)} aria-label="remove">✕</button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t space-y-1 text-sm" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
          <div className="flex justify-between"><span>{t("subtotal")}</span><span>{formatETB(totals.subtotal, lang)}</span></div>
          <div className="flex justify-between items-center">
            <span>{t("discount")}</span>
            <input className="input !w-24 !py-1 text-right" inputMode="decimal" placeholder="0" value={discountBirr} onChange={(e) => setDiscountBirr(e.target.value)} />
          </div>
          <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}><span>{t("vat")}</span><span>{formatETB(totals.vat, lang)}</span></div>
          <div className="flex justify-between text-lg font-extrabold pt-2 border-t border-dashed" style={{ borderColor: "var(--line)" }}><span>{t("total")}</span><span>{formatETB(totals.total, lang)}</span></div>
        </div>
        {error && !paying && <div className="error-box mx-4">{error}</div>}
        <div className="p-4 flex gap-2">
          <button className="btn btn-secondary flex-1" onClick={reset}>{editingOrder ? t("cancel") : t("clear")}</button>
          {isRestaurant && (
            <button className="btn btn-secondary flex-[2]" disabled={cart.length === 0 || pending} onClick={sendToTable}>{t("sendToTable")}</button>
          )}
          {!editingOrder && (
            <button className="btn btn-primary flex-[2]" disabled={!props.hasShift || cart.length === 0 || pending || totals.total <= 0} onClick={() => { setError(null); setPaying({ total: totals.total }); }}>
              {t("charge")}
            </button>
          )}
        </div>
      </aside>

      {weighing && (
        <Modal onClose={() => setWeighing(null)} title={label(weighing)}>
          <label className="field"><span>{t("weightKg")}</span>
            <input autoFocus className="input text-center text-xl font-extrabold" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("weigh-ok")?.click(); }} />
          </label>
          <div className="text-center mb-4 font-bold" style={{ color: "var(--ink-soft)" }}>{formatETB(Math.round(weighing.price * (Number(weight) || 0)), lang)}</div>
          <button id="weigh-ok" className="btn btn-primary w-full" disabled={!(Number(weight) > 0)}
            onClick={() => { add(weighing, +Number(weight).toFixed(3)); setWeighing(null); }}>{t("confirm")}</button>
        </Modal>
      )}

      {paying && (
        <PaymentModal
          lang={lang}
          total={paying.total}
          customers={props.customers}
          pending={pending}
          error={error}
          onClose={() => { setPaying(null); setError(null); }}
          onConfirm={({ method, tendered, reference, customerId }) => {
            const lines = paying.orderId
              ? props.openOrders.find((o) => o.id === paying.orderId)!.items.map((i) => ({ name: i.name, qty: i.quantity, total: i.lineTotal }))
              : cart.map((l) => ({ name: label(l.product), qty: l.quantity, total: Math.round(l.product.price * l.quantity) }));
            submit(
              {
                action: "pay",
                orderId: paying.orderId,
                items: paying.orderId ? [] : items,
                discount: paying.orderId ? 0 : discount,
                tableId: tableId || undefined,
                waiterId: waiterId || undefined,
                customerId,
                payments: [{ method, amount: paying.total, tendered, reference }],
              },
              (r) => { setPaying(null); setReceipt({ result: r, lines, method, tendered }); reset(); },
            );
          }}
        />
      )}

      {receipt && (
        <Modal onClose={() => setReceipt(null)} title={t("saleDone")}>
          <div className="receipt font-mono text-xs border rounded p-3 mb-4" style={{ borderColor: "var(--line)" }}>
            <div className="text-center font-bold text-sm">{props.shop.name}</div>
            {props.shop.tin && <div className="text-center">TIN: {props.shop.tin}</div>}
            <div className="text-center mb-2">#{receipt.result.number} · {new Date().toLocaleString("en-GB")}</div>
            <div className="mb-2">{props.cashier}</div>
            {receipt.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-2"><span>{l.qty} × {l.name}</span><span>{(l.total / 100).toFixed(2)}</span></div>
            ))}
            <div className="border-t border-dashed mt-2 pt-2">
              {receipt.result.discount > 0 && <div className="flex justify-between"><span>{t("discount")}</span><span>-{(receipt.result.discount / 100).toFixed(2)}</span></div>}
              <div className="flex justify-between"><span>VAT 15%</span><span>{(receipt.result.vat / 100).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-sm"><span>{t("total")}</span><span>{(receipt.result.total / 100).toFixed(2)} ETB</span></div>
              <div className="flex justify-between"><span>{PAYMENT_LABELS[receipt.method][lang]}</span><span>{((receipt.tendered ?? receipt.result.total) / 100).toFixed(2)}</span></div>
              {receipt.tendered && <div className="flex justify-between"><span>{t("change")}</span><span>{((receipt.tendered - receipt.result.total) / 100).toFixed(2)}</span></div>}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary flex-1" onClick={() => window.print()}>{t("printReceipt")}</button>
            <button className="btn btn-primary flex-1" onClick={() => setReceipt(null)}>{t("newSale")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(27,27,24,.45)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-extrabold text-base">{title}</h3>
          <button onClick={onClose} aria-label="close" style={{ color: "var(--ink-faint)" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PaymentModal(props: {
  lang: Lang;
  total: number;
  customers: { id: string; name: string; available: number }[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (p: { method: Method; tendered?: number; reference?: string; customerId?: string }) => void;
}) {
  const { lang, total } = props;
  const t = translator(lang);
  const [method, setMethod] = useState<Method>("CASH");
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  const [customerId, setCustomerId] = useState("");
  const tendered = received ? toSantim(Number(received)) : undefined;
  const change = tendered !== undefined ? tendered - total : 0;

  const invalid =
    (method === "CASH" && tendered !== undefined && tendered < total) ||
    (NEEDS_REF.includes(method) && !reference.trim()) ||
    (method === "CREDIT" && !customerId);

  return (
    <Modal title={t("payment")} onClose={props.onClose}>
      <div className="text-center text-3xl font-extrabold mb-4">{formatETB(total, lang)}</div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {METHODS.map((m) => (
          <button key={m} onClick={() => setMethod(m)} className="rounded-lg border-2 py-3 text-sm font-bold"
            style={method === m ? { borderColor: "var(--primary)", background: "var(--primary-tint)" } : { borderColor: "var(--line)", background: "var(--surface-2)" }}>
            {PAYMENT_LABELS[m][lang]}
          </button>
        ))}
      </div>
      {method === "CASH" && (
        <>
          <label className="field"><span>{t("amountReceived")}</span>
            <input autoFocus className="input text-center text-lg font-extrabold" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} />
          </label>
          {tendered !== undefined && (
            <div className={`flex justify-between rounded-md px-3 py-2 mb-4 font-extrabold ${change < 0 ? "badge-err" : "badge-ok"}`}>
              <span>{t("change")}</span><span>{formatETB(change, lang)}</span>
            </div>
          )}
        </>
      )}
      {NEEDS_REF.includes(method) && (
        <label className="field"><span>{t("reference")}</span><input autoFocus className="input font-mono" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
      )}
      {method === "CREDIT" && (
        <label className="field"><span>{t("customer")}</span>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">—</option>
            {props.customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({formatETB(c.available, lang)})</option>)}
          </select>
          {props.customers.length === 0 && <Link href="/app/customers" className="text-sm font-bold" style={{ color: "var(--primary)" }}>{t("addCustomer")} →</Link>}
        </label>
      )}
      {props.error && <div className="error-box">{props.error}</div>}
      <div className="flex gap-2">
        <button className="btn btn-secondary flex-1" onClick={props.onClose}>{t("cancel")}</button>
        <button className="btn btn-primary flex-[2]" disabled={invalid || props.pending}
          onClick={() => props.onConfirm({ method, tendered: method === "CASH" ? tendered : undefined, reference: reference.trim() || undefined, customerId: customerId || undefined })}>
          {t("confirm")}
        </button>
      </div>
    </Modal>
  );
}
