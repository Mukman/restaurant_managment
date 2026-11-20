"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receiveStockAction } from "./actions";

type Opt = { id: string; label: string };
type Line = { productId: string; quantity: string; unitCost: string; expiresAt: string };
const blank = (): Line => ({ productId: "", quantity: "", unitCost: "", expiresAt: "" });
const REF_METHODS = ["TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER"];

export function NewPurchaseForm({ suppliers, products, methods, t, defaultSupplier }: {
  suppliers: Opt[]; products: (Opt & { cost: string })[]; methods: Record<string, string>; t: Record<string, string>; defaultSupplier?: string;
}) {
  const router = useRouter();
  // One id per attempt: a retried tap or lost connection can never receive the same delivery twice.
  const clientId = useRef(crypto.randomUUID());
  const [supplierId, setSupplierId] = useState(defaultSupplier ?? "");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [fromTill, setFromTill] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost.replace(/,/g, "")) || 0), 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const items = lines.filter((l) => l.productId || l.quantity || l.unitCost);
    start(async () => {
      const r = await receiveStockAction({
        clientId: clientId.current, supplierId, invoiceNo, note,
        items: items.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitCostBirr: l.unitCost, expiresAt: l.expiresAt || undefined })),
        payment: paid.trim() ? { amountBirr: paid, method, reference, fromTill: method === "CASH" && fromTill } : undefined,
      });
      if (r.error) setError(r.error);
      else router.push(`/app/purchases/${r.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="panel">
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="grid sm:grid-cols-2 gap-x-4">
        <label className="field"><span>{t.supplier}</span>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required name="supplier">
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="field"><span>{t.invoiceNo}</span><input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} name="invoiceNo" /></label>
      </div>

      <div className="grid gap-3 mb-1">
        {lines.map((l, i) => (
          <div key={i} className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
            <div className="flex gap-2 items-start">
              <label className="field flex-1 !mb-2"><span>{t.product}</span>
                <select className="input" value={l.productId} onChange={(e) => set(i, { productId: e.target.value })} name={`product-${i}`}>
                  <option value="">—</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
              {lines.length > 1 && <button type="button" className="mt-6 w-10 h-10 font-bold" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="remove">✕</button>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3">
              <label className="field !mb-0"><span>{t.quantity}</span><input className="input" inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} name={`qty-${i}`} /></label>
              <label className="field !mb-0"><span>{t.unitCost}</span><input className="input" inputMode="decimal" value={l.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} name={`cost-${i}`} /></label>
              <label className="field !mb-0 col-span-2 sm:col-span-1"><span>{t.expiry}</span><input className="input" type="date" value={l.expiresAt} onChange={(e) => set(i, { expiresAt: e.target.value })} name={`exp-${i}`} /></label>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn mt-2 mb-4" onClick={() => setLines((ls) => [...ls, blank()])}>+ {t.addLine}</button>

      <label className="field"><span>{t.note}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} name="note" /></label>

      <div className="grid sm:grid-cols-3 gap-x-4">
        <label className="field"><span>{t.paidNow}</span><input className="input" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} name="paid" placeholder="0" /></label>
        {paid.trim() !== "" && (
          <label className="field"><span>{t.payment}</span>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)} name="method">
              {Object.entries(methods).filter(([k]) => k !== "CREDIT").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        )}
        {paid.trim() !== "" && REF_METHODS.includes(method) && (
          <label className="field"><span>{t.reference}</span><input className="input font-mono" value={reference} onChange={(e) => setReference(e.target.value)} name="reference" /></label>
        )}
      </div>
      {paid.trim() !== "" && method === "CASH" && (
        <label className="flex items-center gap-2 mb-3 text-sm font-semibold"><input type="checkbox" checked={fromTill} onChange={(e) => setFromTill(e.target.checked)} name="fromTill" /> {t.fromTill}</label>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="font-extrabold text-lg">{t.total}: <span data-testid="total">{total.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span> ETB</div>
        <button className="btn btn-primary" disabled={pending}>{t.receiveStock}</button>
      </div>
    </form>
  );
}
