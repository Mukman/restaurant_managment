"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signup, type FormState } from "../auth-actions";

export function SignupForm({ t }: { t: Record<string, string> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, {});
  return (
    <form action={action}>
      {state.error && <div className="error-box">{state.error}</div>}
      <label className="field"><span>{t.shopName}</span><input className="input" name="shopName" required /></label>
      <fieldset className="field">
        <span>{t.businessType}</span>
        <div className="grid grid-cols-2 gap-2">
          {[["GROCERY", t.grocery], ["RESTAURANT", t.restaurant]].map(([v, label]) => (
            <label key={v} className="input flex items-center gap-2 cursor-pointer has-[:checked]:border-[var(--primary)] has-[:checked]:bg-[var(--primary-tint)]">
              <input type="radio" name="mode" value={v} defaultChecked={v === "GROCERY"} />
              <span className="font-bold text-sm">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field"><span>{t.yourName}</span><input className="input" name="name" required /></label>
      <label className="field"><span>{t.phone}</span><input className="input" name="phone" inputMode="tel" placeholder="09XX XXX XXX" required /></label>
      <label className="field"><span>{t.pin}</span><input className="input" name="pin" type="password" inputMode="numeric" pattern="\d{4,6}" required /></label>
      <label className="field"><span>{t.tin}</span><input className="input" name="tin" inputMode="numeric" /></label>
      <button className="btn btn-primary w-full" disabled={pending}>{t.signUp}</button>
      <p className="text-center mt-4 text-sm"><Link href="/login" className="font-bold" style={{ color: "var(--primary)" }}>{t.haveAccount}</Link></p>
    </form>
  );
}
