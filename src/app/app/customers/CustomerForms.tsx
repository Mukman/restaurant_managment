"use client";
import { useActionState, useEffect, useRef } from "react";
import { addCustomerAction, limitAction, repayAction, type CustomerFormState } from "./actions";

export function AddCustomerForm({ t, canSetLimit }: { t: Record<string, string>; canSetLimit: boolean }) {
  const [state, action, pending] = useActionState<CustomerFormState, FormData>(addCustomerAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="panel">
      <h2 className="font-extrabold mb-4">{t.addCustomer}</h2>
      {state.error && <div className="error-box">{state.error}</div>}
      <label className="field"><span>{t.name}</span><input className="input" name="name" required /></label>
      <label className="field"><span>{t.phone}</span><input className="input" name="phone" inputMode="tel" placeholder="09XX XXX XXX" /></label>
      {canSetLimit ? (
        <label className="field"><span>{t.creditLimit}</span><input className="input" name="creditLimit" inputMode="decimal" defaultValue="0" /></label>
      ) : (
        <p className="text-xs mb-3" style={{ color: "var(--ink-faint)" }}>{t.limitByManager}</p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>{t.save}</button>
    </form>
  );
}

const METHODS = ["CASH", "TELEBIRR", "CBE_BIRR", "MPESA", "BANK_TRANSFER", "CARD"];

export function RepayForm({ customerId, t, methods, owed }: { customerId: string; t: Record<string, string>; methods: Record<string, string>; owed: string }) {
  const [state, action, pending] = useActionState<CustomerFormState, FormData>(repayAction.bind(null, customerId), {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="panel">
      <h2 className="font-extrabold mb-1">{t.recordRepayment}</h2>
      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>{t.owes}: <b>{owed}</b></p>
      {state.error && <div className="error-box">{state.error}</div>}
      <label className="field"><span>{t.amountPaid}</span><input className="input text-lg font-extrabold" name="amount" inputMode="decimal" required /></label>
      <label className="field"><span>{t.payment}</span>
        <select className="input" name="method" defaultValue="CASH">{METHODS.map((m) => <option key={m} value={m}>{methods[m]}</option>)}</select>
      </label>
      <label className="field"><span>{t.reference}</span><input className="input font-mono" name="reference" /></label>
      <button className="btn btn-primary w-full" disabled={pending}>{t.confirm}</button>
    </form>
  );
}

export function LimitForm({ customerId, current, t }: { customerId: string; current: string; t: Record<string, string> }) {
  const [state, action, pending] = useActionState<CustomerFormState, FormData>(limitAction.bind(null, customerId), {});
  return (
    <form action={action} className="flex items-end gap-2">
      <label className="field !mb-0 flex-1"><span>{t.creditLimit}</span><input className="input" name="creditLimit" inputMode="decimal" defaultValue={current} /></label>
      <button className="btn btn-secondary" disabled={pending}>{t.save}</button>
      {state.error && <span className="text-sm font-bold" style={{ color: "var(--error)" }}>{state.error}</span>}
    </form>
  );
}
