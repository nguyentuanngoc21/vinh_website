"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * window.location.origin, an toàn qua SSR — trả "" trên server (không có
 * window) rồi tự re-render đúng giá trị thật ngay sau hydrate. Dùng
 * useSyncExternalStore (cùng pattern với session ở src/lib/role.tsx) thay
 * vì useEffect + setState: origin không đổi trong đời 1 tab, không cần
 * subscribe gì cả — chỉ cần cách đọc "giá trị chỉ có ở client" không gây
 * cascading render / hydration mismatch.
 */
export function useOrigin(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
}
