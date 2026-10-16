"use client";

import { useEffect, useState } from "react";
import { useRole } from "@/lib/role";

/** Per-mount personal data. Never serialize it into a shared page or reuse another viewer's result. */
export function usePrivateItems<T>(url: string): T[] {
  const { isLogged, session } = useRole();
  const owner = isLogged ? session?.handle : undefined;
  const [snapshot, setSnapshot] = useState<{ owner: string; url: string; items: T[] } | null>(null);

  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!controller.signal.aborted && Array.isArray(data?.items)) {
          setSnapshot({ owner, url, items: data.items });
        }
      })
      .catch(() => { /* Personal sections are optional; keep the public page usable. */ })
      .finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [owner, url]);

  return owner && snapshot?.owner === owner && snapshot.url === url ? snapshot.items : [];
}
