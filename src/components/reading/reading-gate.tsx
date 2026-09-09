"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CoinsIcon, LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import { LoginGateModal } from "@/components/access-gate/login-gate-modal";
import type { ThemeColors } from "./reader";

// Vài dòng "giả" hiển thị mờ phía dưới đoạn preview cuối cùng — CHỈ để gợi
// ý trực quan "chương còn dài", KHÔNG phải nội dung thật của chương (nội
// dung thật đã bị cắt ở server, xem src/lib/reading/access-gate.ts — client
// không hề nhận được phần bị khoá, nên không thể vô tình lộ qua devtools
// như cách làm mờ bằng CSS lên văn bản thật sẽ bị).
const GHOST_LINE_WIDTHS = ["92%", "78%", "88%", "60%"];

type ReadingGateProps = {
  c: ThemeColors;
  bookSlug: string;
  chapterId: string;
  isLoggedIn: boolean;
} & (
  | { variant: "login" }
  | { variant: "purchase"; price: number }
);

/**
 * Rào chặn phần còn lại của chương — 2 biến thể:
 * - "login": chương thường, khách vãng lai đã xem hết % preview cho phép
 *   (GUEST_PREVIEW_RATIO) — chỉ cần đăng nhập là đọc tiếp được, miễn phí.
 * - "purchase": chương VIP (price > 0) chưa mua — dù đã đăng nhập vẫn phải
 *   mua bằng token mới đọc được, không có preview % (chặn hoàn toàn ngay từ
 *   đầu, xem page.tsx `needsPurchase`).
 */
export function ReadingGate(props: ReadingGateProps) {
  const { c, bookSlug, chapterId, isLoggedIn } = props;
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const returnTo = `/read/${bookSlug}/${chapterId}`;

  const handleBuy = async () => {
    if (purchasing) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/purchase`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPurchaseError(body?.error ?? "Không thể mua chương. Vui lòng thử lại.");
        return;
      }
      // Chương đã mở — refetch page.tsx để nhận content thật thay vì reload
      // toàn trang, giữ nguyên vị trí cuộn/theme đang chọn.
      router.refresh();
    } catch {
      setPurchaseError("Không thể kết nối máy chủ. Vui lòng thử lại.");
    } finally {
      setPurchasing(false);
    }
  };

  const cardTitle =
    props.variant === "purchase" ? "Chương này cần mua để đọc" : "Đăng nhập để đọc tiếp";
  const cardDescription =
    props.variant === "purchase"
      ? `Tác giả đặt giá ${props.price.toLocaleString("vi-VN")} token cho chương này. Mua 1 lần, đọc lại bất cứ lúc nào.`
      : "Bạn vừa đọc hết phần xem trước dành cho khách. Đăng nhập miễn phí để đọc toàn bộ chương này và mọi chương thường khác.";

  return (
    <>
      {/* Vùng "làm mờ" — fade nội dung thật (đã cắt) mờ dần xuống nền, cộng
          vài dòng giả bị blur, tạo cảm giác "còn nữa" mà không lộ chữ thật.
          Chỉ có ý nghĩa với variant "login" — có thật 1 đoạn preview phía
          trên để fade tiếp nối. Chương VIP chưa mua (variant "purchase")
          content="" ngay từ đầu (page.tsx), không có gì phía trên để fade
          — hiện thẳng thẻ khoá, đúng tinh thần "chặn hoàn toàn ngay từ đầu". */}
      {props.variant === "login" && (
        <div
          aria-hidden="true"
          className="pointer-events-none relative -mt-[3em] select-none pb-2"
          style={{
            background: `linear-gradient(to bottom, transparent, ${c.pageBg} 85%)`,
          }}
        >
          <div className="blur-[5px] opacity-60" style={{ color: c.body }}>
            {GHOST_LINE_WIDTHS.map((w, i) => (
              <div key={i} className="mb-[0.9em] h-[1em] rounded" style={{ width: w, background: "currentColor" }} />
            ))}
          </div>
        </div>
      )}

      <div
        style={{ borderColor: c.hair, background: c.pageBg }}
        className="relative z-[1] flex flex-col items-center gap-3 rounded-2xl border px-6 py-8 text-center"
      >
        <div
          style={{ background: c.tintBg, color: c.tintInk }}
          className="flex h-11 w-11 items-center justify-center rounded-full"
        >
          {props.variant === "purchase" ? <CoinsIcon size={20} weight="fill" /> : <LockKeyIcon size={20} weight="fill" />}
        </div>
        <div style={{ color: c.ink }} className="font-[family-name:var(--font-lora)] text-lg font-bold">
          {cardTitle}
        </div>
        <p style={{ color: c.inkSoft }} className="max-w-[440px] text-[13.5px] leading-[1.6]">
          {cardDescription}
        </p>

        {purchaseError && (
          <div className="rounded-[10px] border border-[#F3C6C6] bg-[#FBEDEC] px-3.5 py-2 text-[12.5px] text-[#B02A37]">
            {purchaseError}
          </div>
        )}

        {props.variant === "purchase" && isLoggedIn ? (
          <button
            type="button"
            onClick={handleBuy}
            disabled={purchasing}
            className="mt-1 cursor-pointer rounded-full bg-brand-gold px-7 py-3 text-sm font-bold text-brand-ink disabled:cursor-default disabled:opacity-70"
          >
            {purchasing ? "Đang xử lý…" : `Mua chương — ${props.price.toLocaleString("vi-VN")} token`}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-1 cursor-pointer rounded-full bg-brand-gold px-7 py-3 text-sm font-bold text-brand-ink"
          >
            {props.variant === "purchase" ? "Đăng nhập để mua chương này" : "Đăng nhập để đọc tiếp"}
          </button>
        )}
      </div>

      <LoginGateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={cardTitle}
        description={cardDescription}
        returnTo={returnTo}
        primaryLabel={props.variant === "purchase" ? "Đăng nhập để mua" : "Đăng nhập"}
      />
    </>
  );
}
