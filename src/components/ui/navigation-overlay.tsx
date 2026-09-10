"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LoadingScreen } from "./loading-screen";

/**
 * Lớp phủ loading TOÀN TRANG khi đang chuyển route — KHÁC hẳn
 * app/loading.tsx (file đặc biệt Next tự THAY THẾ nội dung trang cũ
 * bằng fallback trong 1 Suspense boundary, không phải "đè lên" — nhìn ra
 * nền trắng/rỗng phía sau nên lớp đen 20% trông như xám, không phải đè
 * lên màn hình đang xem — đúng bug người dùng báo). Component này giữ
 * NGUYÊN trang cũ hiển thị (hành vi mặc định của Next khi không có
 * loading.tsx cho route đó — xem "Client-side transitions" trong docs:
 * giữ nguyên UI cũ cho tới khi trang mới render xong), chỉ phủ 1 lớp đen
 * mờ LÊN TRÊN trong lúc chờ — bắt sự kiện click vào <a> nội bộ (Next
 * <Link> render ra thẻ a thật), bật pending NGAY khi bấm, tắt khi
 * pathname thực sự đổi (trang mới đã render xong).
 *
 * CHỦ Ý không dùng useSearchParams() — chỉ theo dõi usePathname(), tránh
 * phải bọc Suspense boundary riêng (useSearchParams() bắt buộc Suspense,
 * không thì ép CẢ layout gốc — bọc mọi trang — de-opt khỏi static
 * rendering). Hệ quả: link chỉ đổi query string (không đổi path, vd
 * "?tab=chat") sẽ không bật overlay — chấp nhận được, các chuyển đổi đó
 * thường gần như tức thời, không cần loading.
 *
 * Chỉ bắt navigation qua CLICK (Link/thẻ a) — router.push() gọi thẳng từ
 * code (sau submit form, redirect sau đăng nhập...) và nút back/forward
 * trình duyệt (popstate) không đi qua đây. Phạm vi vừa đủ cho phần lớn
 * điều hướng thật trong app (bấm vào nav/menu/link), không cố bắt mọi
 * đường có thể đổi route.
 *
 * Bug thật đã xảy ra: listener gắn ở BUBBLE phase (mặc định) trên
 * `document` không bao giờ chạy TRƯỚC handler onClick của chính Next
 * <Link> — React gắn listener của nó ở gốc React (nằm DƯỚI document
 * trong cây DOM), nên trong bubble phase (đi từ target lên TRÊN, qua gốc
 * React rồi mới tới document) nó luôn nổ trước, gọi preventDefault()
 * xong thì tới lượt listener ở đây mới chạy, thấy `e.defaultPrevented`
 * đã true nên return sớm ngay dòng đầu — overlay không bao giờ bật được
 * với link thật. Sửa bằng CAPTURE phase (đi từ document XUỐNG target,
 * document luôn nổ đầu tiên) — không còn dựa vào defaultPrevented nữa.
 */
export function NavigationOverlay() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const prevPathnameRef = useRef(pathname);

  // pathname đổi thật (RSC payload trang mới đã áp dụng xong) -> tắt overlay.
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setPending(false);
    }
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      // target khác "_self" (vd "_blank") -> mở tab mới, không phải
      // client-side transition ở TRANG NÀY.
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) return;

      let url: URL;
      try {
        // anchor.href (IDL property, không phải getAttribute) đã tự
        // resolve thành URL tuyệt đối theo base document.
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      setPending(true);
    };
    // capture: true — bắt buộc, xem giải thích "Bug thật" ở doc-comment
    // trên đầu file.
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  if (!pending) return null;
  return <LoadingScreen />;
}
