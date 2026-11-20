"use client";
import { useActionState, useTransition } from "react";
import { closeShiftAction, openShiftAction, reviewShiftAction, type ShiftFormState } from "./actions";

export function OpenShiftForm({ t }: { t: Record<string, string> }) {
  const [state, action, pending] = useActionState<ShiftFormState, FormData>(openShiftAction, {});
  return (
    <form action={action} className="panel max-w-sm">
      <h2 className="font-extrabold mb-4">{t.openShift}</h2>
      {state.error && <div className="error-box">{state.error}</div>}
      <label className="field"><span>{t.openingCash}</span>
        <input className="input text-lg font-extrabold" name="amount" inputMode="decimal" defaultValue="0" required />
      </label>
      <button className="btn btn-primary w-full" disabled={pending}>{t.openShift}</button>
    </form>
  );
}

export function CloseShiftForm({ t, expected }: { t: Record<string, string>; expected: string }) {
  const [state, action, pending] = useActionState<ShiftFormState, FormData>(closeShiftAction, {});
  return (
    <form action={action} className="panel max-w-sm">
      <h2 className="font-extrabold mb-1">{t.closeShift}</h2>
      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>{t.expectedCash}: <b>{expected}</b></p>
      {state.error && <div className="error-box">{state.error}</div>}
      <label className="field"><span>{t.countedCash}</span>
        <input className="input text-lg font-extrabold" name="amount" inputMode="decimal" required />
      </label>
      <button className="btn btn-primary w-full" disabled={pending}>{t.closeShift}</button>
    </form>
  );
}

export function ReviewButtons({ id, t }: { id: string; t: Record<string, string> }) {
  const [pending, start] = useTransition();
  return (
    <span className="whitespace-nowrap">
      <button className="btn btn-secondary !py-1 !px-2 text-xs mr-1" disabled={pending} onClick={() => start(async () => { await reviewShiftAction(id, "AUDITED"); })}>{t.markAudited}</button>
      <button className="btn btn-secondary !py-1 !px-2 text-xs" disabled={pending} onClick={() => start(async () => { await reviewShiftAction(id, "DISPUTED"); })}>{t.flagDispute}</button>
    </span>
  );
}
