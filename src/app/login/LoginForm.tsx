"use client";
import Link from "next/link";
import { useActionState } from "react";
import { login, type FormState } from "../auth-actions";

export function LoginForm({ t }: { t: Record<string, string> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action}>
      {state.error && <div className="error-box">{state.error}</div>}
      <label className="field"><span>{t.phone}</span><input className="input" name="phone" inputMode="tel" autoComplete="tel" placeholder="09XX XXX XXX" required /></label>
      <label className="field"><span>{t.pin}</span><input className="input" name="pin" type="password" inputMode="numeric" pattern="\d{4,6}" required /></label>
      <button className="btn btn-primary w-full" disabled={pending}>{t.signIn}</button>
      <p className="text-center mt-4 text-sm"><Link href="/signup" className="font-bold" style={{ color: "var(--primary)" }}>{t.noAccount}</Link></p>
    </form>
  );
}
