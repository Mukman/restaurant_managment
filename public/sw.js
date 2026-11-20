// Addis POS service worker: lets the POS screen open and sell with no internet.
// - /_next/static files (hashed, never change): cache first.
// - The POS page itself: network first, and the last good copy is used when offline.
// Only the POS page is stored, and logging out clears it (see LogoutForm).
const STATIC = "pos-static-v1";
const PAGES = "pos-pages-v1";
const POS_PATH = "/app/pos";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function cachePage(url) {
  try {
    const res = await fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" } });
    const type = res.headers.get("content-type") || "";
    if (res.ok && !res.redirected && type.includes("text/html")) await (await caches.open(PAGES)).put(POS_PATH, res.clone());
  } catch {}
}

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "cache-pos") e.waitUntil(cachePage(POS_PATH));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate" && url.pathname === POS_PATH) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const type = res.headers.get("content-type") || "";
          if (res.ok && !res.redirected && type.includes("text/html")) caches.open(PAGES).then((c) => c.put(POS_PATH, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(POS_PATH, { cacheName: PAGES })) || Response.error()),
    );
  }
});
