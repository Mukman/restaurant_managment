"use client";

/** Signs out, and first clears the stored POS page so the next person on this device cannot open it offline. */
export function LogoutForm({ action, children, className }: { action: () => void | Promise<void>; children: React.ReactNode; className?: string }) {
  return (
    <form action={action} className={className} onSubmit={() => { try { void caches.delete("pos-pages-v1"); } catch {} }}>
      {children}
    </form>
  );
}
