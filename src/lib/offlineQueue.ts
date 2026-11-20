// Sales taken with no internet wait here (this browser's localStorage) until they can be sent.
// Each carries its own clientId, so sending one twice can never record it twice.

export interface QueuedSale {
  clientId: string;
  userId: string; // only the person who sold it sends it, so it lands on their shift
  createdAt: number;
  payload: Record<string, unknown>; // the exact checkout input
  receipt: {
    lines: { name: string; qty: number; total: number }[];
    method: string;
    tendered?: number;
    total: number; vat: number; subtotal: number; discount: number;
  };
  status: "queued" | "failed";
  error?: string;
}

const KEY = "addis-pos-offline-sales";

export function loadQueue(): QueuedSale[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveQueue(list: QueuedSale[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // storage full or blocked: the caller must not tell the cashier the sale was saved
  }
}
