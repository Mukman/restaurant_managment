// Ethiopian mobile numbers: 09XXXXXXXX / 07XXXXXXXX or +2519/+2517 forms; stored as 09XXXXXXXX.
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[^\d+]/g, "");
  const m = d.match(/^(?:\+?251|0)?([79]\d{8})$/);
  return m ? `0${m[1]}` : null;
}
