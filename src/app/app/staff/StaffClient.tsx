"use client";
import { useState, useTransition } from "react";
import { useServerForm } from "@/lib/useServerForm";
import { addStaffAction, resetPinAction, setActiveAction, type StaffFormState } from "./actions";

export interface StaffRow { id: string; name: string; phone: string; role: string; active: boolean; manageable: boolean }

export function StaffClient({ rows, roles, t }: { rows: StaffRow[]; roles: string[]; t: Record<string, string> }) {
  const { state, onSubmit, pending } = useServerForm<StaffFormState>(addStaffAction, {});
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();

  const report = (r: StaffFormState) => setMsg(r.error ?? null);

  return (
    <div className="p-4 md:p-6 max-w-5xl grid lg:grid-cols-[1fr_340px] gap-4 items-start">
      <div className="panel overflow-x-auto">
        <h1 className="text-xl font-extrabold mb-3">{t.staff}</h1>
        {msg && <div className="error-box">{msg}</div>}
        <table className="table w-full">
          <thead><tr><th>{t.name}</th><th>{t.role}</th><th>{t.phone}</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                <td className="font-bold">{u.name}</td>
                <td><span className="badge badge-ok">{t[`role_${u.role}`] ?? u.role}</span></td>
                <td className="font-mono text-xs">{u.phone}</td>
                <td className="text-right whitespace-nowrap">
                  {u.manageable && (
                    <>
                      <button className="btn btn-secondary !py-1 !px-2 text-xs mr-1"
                        onClick={() => { const pin = window.prompt(t.newPin); if (pin) start(async () => report(await resetPinAction(u.id, pin))); }}>
                        {t.resetPin}
                      </button>
                      <button className="btn btn-secondary !py-1 !px-2 text-xs"
                        onClick={() => start(async () => report(await setActiveAction(u.id, !u.active)))}>
                        {u.active ? t.deactivate : t.activate}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={onSubmit} className="panel">
        <h2 className="font-extrabold mb-4">{t.addStaff}</h2>
        {state.error && <div className="error-box">{state.error}</div>}
        <label className="field"><span>{t.name}</span><input className="input" name="name" required /></label>
        <label className="field"><span>{t.phone}</span><input className="input" name="phone" inputMode="tel" placeholder="09XX XXX XXX" required /></label>
        <label className="field"><span>{t.role}</span>
          <select className="input" name="role" defaultValue="CASHIER">
            {roles.map((r) => <option key={r} value={r}>{t[`role_${r}`] ?? r}</option>)}
          </select>
        </label>
        <label className="field"><span>{t.pin}</span><input className="input" name="pin" type="password" inputMode="numeric" pattern="\d{4,6}" required /></label>
        <button className="btn btn-primary w-full" disabled={pending}>{t.save}</button>
      </form>
    </div>
  );
}
