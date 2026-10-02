"use client";

import { useEffect, useState } from "react";
import { useRole } from "@/lib/role";

// 1 request cho cả trang dù có nhiều bìa 18+ (lưới truyện, BXH…). Gắn với
// trạng thái đăng nhập: đổi tài khoản/đăng xuất thì hỏi lại.
let cached: { key: string; promise: Promise<boolean> } | null = null;

function fetchCanReadAdult(key: string): Promise<boolean> {
  if (cached?.key !== key) {
    cached = {
      key,
      promise: fetch("/api/profile/age-status")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data?.canReadAdult === true)
        .catch(() => false),
    };
  }
  return cached.promise;
}

/**
 * true khi người xem đã xác thực đủ 18 tuổi (hoặc là admin) — dùng để bỏ làm
 * mờ bìa truyện 18+ ở danh sách. Khách: luôn false, không gọi API. Mặc định
 * false cho tới khi có kết quả (mờ trước, rõ sau — không lộ bìa rồi mới mờ).
 */
export function useCanReadAdult(enabled = true): boolean {
  const { isLogged, session } = useRole();
  const key = session?.handle ?? "";
  const [canRead, setCanRead] = useState(false);

  useEffect(() => {
    if (!enabled || !isLogged) return;
    let cancelled = false;
    fetchCanReadAdult(key).then((value) => {
      if (!cancelled) setCanRead(value);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, isLogged, key]);

  return enabled && isLogged && canRead;
}
