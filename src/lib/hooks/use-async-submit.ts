"use client";

import { useCallback, useState } from "react";

/**
 * Rút gọn pattern `useState(false)` + `useState<string|null>(null)` +
 * try/catch lặp lại tay ở hầu hết form trong repo (login-form.tsx,
 * register-form.tsx, forgot/reset-password-form.tsx, bank-info-form.tsx,
 * identity-form.tsx, edit-profile-tab.tsx, order-card.tsx,
 * profile-header.tsx, services-tab.tsx, author-name-agreement-panel.tsx,
 * connect-directory.tsx...). Khớp thẳng với shape kết quả các hàm gọi
 * API/auth đã dùng sẵn trong repo (`{ok:true,...} | {ok:false,error}` —
 * xem AuthResult/RegisterResult trong src/lib/auth.ts), không cần bọc lại
 * response.
 *
 * KHÔNG migrate toàn bộ các file trên trong 1 lần — hook này không đổi
 * hành vi, chỉ giảm boilerplate, nên áp dụng dần khi sửa từng file là đủ,
 * không bắt buộc đổi hàng loạt cùng lúc (rủi ro diff lớn không cần thiết).
 */
export function useAsyncSubmit<Args extends unknown[], R extends { ok: boolean; error?: string }>(
  fn: (...args: Args) => Promise<R>
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: Args): Promise<R> => {
      setPending(true);
      setError(null);
      const result = await fn(...args);
      setPending(false);
      if (!result.ok) setError(result.error ?? "Đã có lỗi xảy ra. Vui lòng thử lại.");
      return result;
    },
    [fn]
  );

  return { pending, error, setError, run };
}
