import { BookOpenTextIcon, PenNibIcon } from "@phosphor-icons/react/dist/ssr";

type WaitlistKind = "reader" | "author";

// TODO: thay 2 link placeholder này bằng link Google Form thật (1 form
// riêng cho độc giả, 1 form riêng cho tác giả) trước khi launch trang này.
// Không còn bảng waitlist_entries/API nội bộ nữa — xem lịch sử chat lúc
// quyết định đổi sang Google Form thay vì tự lưu Supabase.
const GOOGLE_FORM_URLS: Record<WaitlistKind, string> = {
  reader: "https://docs.google.com/forms/d/e/1FAIpQLSdcMWDWo8Wl2Duh8lNhhiF1HwJW3agXoEOjsrp3yEiWLXeGBA/viewform?usp=publish-editor",
  author: "https://docs.google.com/forms/d/e/1FAIpQLScqvp6oLIdrxM4YVOjZJHSs31yIjCbm2oaZcbf42pt94svXAw/viewform?usp=publish-editor",
};

export function WaitlistLanding() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-ink-dark px-6 py-16 text-white">
      <div
        aria-hidden="true"
        style={{
          background: "radial-gradient(circle at 30% 25%, rgba(217,164,65,.22), transparent 60%)",
        }}
        className="pointer-events-none absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full"
      />
      <div
        aria-hidden="true"
        style={{
          background: "radial-gradient(circle at 70% 75%, rgba(217,164,65,.16), transparent 60%)",
        }}
        className="pointer-events-none absolute -bottom-48 -right-32 h-[560px] w-[560px] rounded-full"
      />

      <div className="relative flex items-center gap-[9px]">
        <svg width="34" height="34" viewBox="0 0 100 100" className="shrink-0">
          <circle cx="50" cy="50" r="48" fill="var(--color-cream-card-alt)" />
          <path
            d="M50,98 A48,48 0 0 1 50,2 A24,24 0 0 1 50,50 A24,24 0 0 0 50,98 Z"
            fill="var(--color-brand-ink-dark)"
          />
          <circle cx="44" cy="24" r="3" fill="var(--color-brand-ink-dark)" />
        </svg>
        <span className="text-[22px] font-extrabold tracking-[-0.4px]">Vịnh</span>
      </div>

      <div className="relative mt-14 w-full max-w-[480px] text-center">
        <div className="text-[13px] font-medium tracking-[1.4px] text-brand-gold-light">
          SẮP RA MẮT
        </div>
        <h1 className="mt-4 font-[family-name:var(--font-lora)] text-[34px] font-bold leading-[1.25] sm:text-[42px]">
          Vịnh Câu Chuyện
        </h1>
        <p className="mt-2.5 text-[17px] leading-[1.5] text-sidebar-text-dim-2">
          Nơi những câu chuyện tìm thấy nhau.
        </p>

        <div className="mt-10 flex flex-col gap-3.5 sm:flex-row">
          <a
            href={GOOGLE_FORM_URLS.reader}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2.5 rounded-[12px] bg-brand-gold px-6 py-4 text-[15px] font-bold text-brand-ink transition-transform active:scale-[.99]"
          >
            <BookOpenTextIcon weight="bold" size={19} />
            Tôi là độc giả
          </a>
          <a
            href={GOOGLE_FORM_URLS.author}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2.5 rounded-[12px] border border-white/25 bg-white/5 px-6 py-4 text-[15px] font-bold text-white transition-transform active:scale-[.99] hover:bg-white/10"
          >
            <PenNibIcon weight="bold" size={19} />
            Tôi là tác giả
          </a>
        </div>

        <p className="mt-6 text-[13px] text-sidebar-text-dim">
          Chỉ mất 30 giây — không spam, chỉ báo tin khi Vịnh mở cửa.
        </p>
      </div>
    </div>
  );
}
