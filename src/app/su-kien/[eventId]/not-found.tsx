import Link from "next/link";
export default function EventNotFound() {
  return <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 py-20 text-center"><p className="text-xs font-bold uppercase tracking-widest text-brand-gold-dark">Sự kiện tại Vịnh</p><h1 className="mt-4 text-3xl font-bold text-brand-ink">Không tìm thấy sự kiện</h1><p className="mt-4 text-sm leading-relaxed text-stone">Sự kiện có thể chưa được công bố hoặc đã ngừng hiển thị.</p><Link href="/su-kien" className="mt-7 rounded-full bg-brand-gold px-6 py-3 text-sm font-bold text-brand-navy no-underline">Khám phá sự kiện khác</Link></main>;
}
