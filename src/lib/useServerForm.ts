"use client";
import { useState, useTransition, type FormEvent } from "react";

/**
 * Runs a server action from a form WITHOUT React's automatic form reset.
 * With `<form action={...}>`, React 19 clears every field after each submit, even when the server
 * said "wrong PIN" or "barcode already used", so people lose what they typed. Here the fields are kept
 * when there is an error, and cleared only after a successful save (`ok: true`).
 */
export function useServerForm<S extends { error?: string; ok?: boolean }>(
  action: (prev: S, form: FormData) => Promise<S>,
  initial: S,
  opts: { resetOnOk?: boolean } = {},
) {
  const [state, setState] = useState<S>(initial);
  const [pending, start] = useTransition();
  const resetOnOk = opts.resetOnOk ?? true;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    start(async () => {
      const next = await action(state, data);
      setState(next);
      if (next.ok && resetOnOk) form.reset();
    });
  }
  return { state, onSubmit, pending };
}
