"use client";
import Link from "next/link";
export default function EventsError({ reset }: { reset: () => void }) {
  return <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-6 py-20 text-center"><h1 className="text-2xl font-bold text-brand-ink">Chưa tải được sự kiện</h1><p className="mt-3 text-sm text-stone">Vui lòng thử lại sau ít phút.</p><button onClick={reset} className="mt-6 rounded-full bg-brand-gold px-6 py-3 font-bold text-brand-navy">Thử lại</button><Link href="/" className="mt-5 text-sm text-brand-ink">Về trang chủ</Link></main>;
}
