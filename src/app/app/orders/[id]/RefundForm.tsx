"use client";
import { useEffect, useState } from "react";
import { useServerForm } from "@/lib/useServerForm";
import { refundAction, type RefundFormState } from "../actions";

export interface RefundLine { id: string; name: string; remaining: number; soldByWeight: boolean; maxAmount: string; canRestock: boolean }

export function RefundForm({ orderId, lines, methods, t }: { orderId: string; lines: RefundLine[]; methods: { value: string; label: string }[]; t: Record<string, string> }) {
  const { state, onSubmit, pending } = useServerForm<RefundFormState>(refundAction.bind(null, orderId), {});
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const [method, setMethod] = useState("CASH");
  useEffect(() => { if (state.ok) setClientId(crypto.randomUUID()); }, [state]);

  return (
    <form onSubmit={onSubmit} className="panel">
      <h2 className="font-extrabold mb-4">{t.refund}</h2>
      {state.error && <div className="error-box">{state.error}</div>}
      {state.ok && <div className="rounded-md px-3 py-2 mb-3 font-bold badge-ok">{t.refundSaved}</div>}
      <input type="hidden" name="clientId" value={clientId} />
      <table className="table w-full mb-3">
        <thead><tr><th>{t.item}</th><th>{t.refundQty}</th><th>{t.restock}</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td><div className="font-bold">{l.name}</div><div className="text-xs" style={{ color: "var(--ink-faint)" }}>{t.canRefund}: {l.remaining}{l.soldByWeight ? " kg" : ""} · {l.maxAmount}</div></td>
              <td><input className="input !w-24" name={`qty_${l.id}`} inputMode="decimal" placeholder="0" /></td>
              <td>{l.canRestock && <input type="checkbox" name={`restock_${l.id}`} defaultChecked />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid sm:grid-cols-2 gap-x-3">
        <label className="field"><span>{t.refundMethod}</span>
          <select className="input" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {methods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        {["TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER"].includes(method) && (
          <label className="field"><span>{t.reference}</span><input className="input font-mono" name="reference" /></label>
        )}
      </div>
      <label className="field"><span>{t.reason}</span><input className="input" name="reason" required minLength={3} /></label>
      <button className="btn btn-primary w-full" disabled={pending}>{t.refund}</button>
    </form>
  );
}
