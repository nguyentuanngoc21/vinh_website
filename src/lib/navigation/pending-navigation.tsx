"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

type PendingCtx = { pending: boolean; setPending: (value: boolean) => void };
const Ctx = createContext<PendingCtx | null>(null);

/**
 * Nguồn state DUY NHẤT cho "có đang chuyển trang không" — trước đây chỉ
 * NavigationOverlay tự giữ state này, chỉ bật khi bắt được click vào <a>
 * (xem navigation-overlay.tsx, phần doc-comment "Chỉ bắt navigation qua
 * CLICK"). Next 16 không có event/hook toàn cục nào cho router.push() gọi
 * từ code (đã xác nhận qua node_modules/next/dist/docs — useLinkStatus()
 * chỉ hoạt động BÊN TRONG 1 <Link>), nên submit-rồi-redirect (đăng nhập,
 * đăng ký, đặt dịch vụ...) trước đây không có phản hồi loading nào.
 *
 * Provider này nâng state lên 1 tầng: vừa NavigationOverlay (qua click),
 * vừa usePendingNavigate() (qua code) đều ghi vào CÙNG 1 state, tắt lại
 * đúng 1 chỗ khi pathname đổi thật — logic tắt y hệt bản cũ trong
 * navigation-overlay.tsx, chỉ chuyển vị trí lên đây.
 */
export function NavigationPendingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setPending(false);
    }
  }, [pathname]);

  return <Ctx.Provider value={{ pending, setPending }}>{children}</Ctx.Provider>;
}

function usePendingContext() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Thiếu <NavigationPendingProvider> ở gốc cây (xem layout.tsx)");
  return ctx;
}

/** Đọc bởi NavigationOverlay — KHÔNG dùng trực tiếp ở nơi khác. */
export function useNavigationPending() {
  return usePendingContext().pending;
}

/** Đọc/ghi bởi chính click-listener của NavigationOverlay. */
export function useSetNavigationPending() {
  return usePendingContext().setPending;
}

/**
 * Bọc router.push()/router.replace() cho MỌI submit-rồi-điều-hướng bằng
 * code (đăng nhập, đăng ký, quên/đặt lại mật khẩu, đặt dịch vụ ở Kết nối...)
 * — bật cùng 1 overlay toàn trang mà click vào <Link> vẫn luôn bật, thay vì
 * im lặng như trước. `startTransition` không tự tắt overlay (bỏ qua
 * `isPending` của chính nó) — việc tắt luôn đến từ pathname đổi thật ở
 * NavigationPendingProvider, khớp với cách NavigationOverlay tắt hiện có.
 */
export function usePendingNavigate() {
  const router = useRouter();
  const { setPending } = usePendingContext();
  const [, startTransition] = useTransition();

  return useCallback(
    (href: string, options?: { replace?: boolean }) => {
      setPending(true);
      startTransition(() => {
        if (options?.replace) router.replace(href);
        else router.push(href);
      });
    },
    [router, setPending, startTransition]
  );
}
