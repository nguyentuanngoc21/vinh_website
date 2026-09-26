"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRingingIcon } from "@phosphor-icons/react/dist/ssr";

/** "Nhắc tôi khi mở" (Q4) — CTA của giai đoạn Sắp mở nhận bài. */
export function RemindButton({ slug, initialOn, loggedIn }: { slug: string; initialOn: boolean; loggedIn: boolean }) {
  const pathname = usePathname();
  const [on, setOn] = useState(initialOn);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = `inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full px-7 py-3 text-[15px] font-semibold ${
    on ? "bg-white/15 text-white" : "bg-brand-gold text-brand-ink"
  }`;

  if (!loggedIn) {
    return (
      <Link href={`/dang-nhap?next=${encodeURIComponent(pathname)}`} className={`${cls} no-underline`}>
        <BellRingingIcon size={17} /> Nhắc tôi khi mở
      </Link>
    );
  }

  const toggle = async () => {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/contests/${slug}/reminder`, { method: on ? "DELETE" : "POST" });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(data?.error ?? "Không đặt được nhắc.");
      return;
    }
    setOn(Boolean(data.reminder_on));
  };

  return (
    <div className="flex flex-col">
      <button type="button" disabled={pending} onClick={toggle} className={`${cls} disabled:opacity-60`}>
        <BellRingingIcon size={17} weight={on ? "fill" : "regular"} /> {on ? "Đã bật nhắc" : "Nhắc tôi khi mở"}
      </button>
      {error && <span className="mt-1 text-xs text-brand-gold-light">{error}</span>}
    </div>
  );
}
