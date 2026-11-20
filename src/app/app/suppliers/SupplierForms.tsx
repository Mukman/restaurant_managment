"use client";
import { useState, useTransition } from "react";
import { useServerForm } from "@/lib/useServerForm";
import { addSupplierAction, paySupplierAction, setSupplierActiveAction, type SupplierFormState } from "./actions";

export function AddSupplierForm({ t }: { t: Record<string, string> }) {
  const { state, onSubmit, pending } = useServerForm<SupplierFormState>(addSupplierAction, {});
  return (
    <form onSubmit={onSubmit} className="panel">
      <h2 className="font-extrabold mb-4">{t.addSupplier}</h2>
      {state.error && <div className="error-box">{state.error}</div>}
      <label className="field"><span>{t.name}</span><input className="input" name="name" required /></label>
      <label className="field"><span>{t.phone}</span><input className="input" name="phone" inputMode="tel" placeholder="09XX XXX XXX" /></label>
      <button className="btn btn-primary w-full" disabled={pending}>{t.save}</button>
    </form>
  );
}

const METHODS = ["CASH", "TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER", "CARD"];

export function PaySupplierForm({ supplierId, t, methods, owed, purchases }: {
  supplierId: string; t: Record<string, string>; methods: Record<string, string>; owed: string;
  purchases: { id: string; label: string }[];
}) {
  const { state, onSubmit, pending } = useServerForm<SupplierFormState>(paySupplierAction.bind(null, supplierId), {});
  const [method, setMethod] = useState("CASH");
  return (
    <form onSubmit={onSubmit} className="panel">
      <h2 className="font-extrabold mb-1">{t.paySupplier}</h2>
      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>{t.weOwe}: <b>{owed}</b></p>
      {state.error && <div className="error-box">{state.error}</div>}
      <label className="field"><span>{t.amountPaid}</span><input className="input text-lg font-extrabold" name="amount" inputMode="decimal" required /></label>
      <label className="field"><span>{t.payment}</span>
        <select className="input" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{methods[m]}</option>)}</select>
      </label>
      {["TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER"].includes(method) && (
        <label className="field"><span>{t.reference}</span><input className="input font-mono" name="reference" /></label>
      )}
      {method === "CASH" && (
        <label className="flex items-center gap-2 mb-3 text-sm font-semibold"><input type="checkbox" name="fromTill" /> {t.fromTill}</label>
      )}
      <label className="field"><span>{t.forPurchase}</span>
        <select className="input" name="purchaseId" defaultValue="">
          <option value="">{t.oldestFirst}</option>
          {purchases.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <button className="btn btn-primary w-full" disabled={pending}>{t.confirm}</button>
    </form>
  );
}

export function ActiveToggle({ supplierId, active, t }: { supplierId: string; active: boolean; t: Record<string, string> }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button className="btn btn-secondary !py-1 !px-3 text-sm" disabled={pending}
        onClick={() => start(async () => { const r = await setSupplierActiveAction(supplierId, !active); setErr(r.error ?? null); })}>
        {active ? t.deactivate : t.activate}
      </button>
      {err && <span className="text-sm font-bold ml-2" style={{ color: "var(--error)" }}>{err}</span>}
    </span>
  );
}
