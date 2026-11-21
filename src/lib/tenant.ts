import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./db";

/** Shop name/TIN rarely change, so reuse the answer for 5 minutes instead of a database trip on every page. */
export const getTenant = (tenantId: string) =>
  unstable_cache(
    () => db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, mode: true, tin: true } }),
    ["tenant", tenantId],
    { revalidate: 300 },
  )();
