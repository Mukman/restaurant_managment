"use client";
import { useRouter } from "next/navigation";
import { setLang } from "@/app/auth-actions";

export function LangToggle({ lang }: { lang: "en" | "am" }) {
  const router = useRouter();
  return (
    <div className="flex rounded-full border p-0.5" style={{ borderColor: "var(--line)" }}>
      {(["en", "am"] as const).map((l) => (
        <button
          key={l}
          onClick={async () => { await setLang(l); router.refresh(); }}
          className="px-3 py-1 rounded-full text-xs font-bold"
          style={lang === l ? { background: "var(--primary)", color: "#fff" } : { color: "var(--ink-soft)" }}
        >
          {l === "en" ? "EN" : "አማ"}
        </button>
      ))}
    </div>
  );
}
