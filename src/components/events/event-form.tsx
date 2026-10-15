"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Field, Textarea, Button, Alert } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { EVENT_BANNER_MAX_BYTES, EVENT_IMAGE_TYPES } from "@/lib/events/input";
import type { CommunityEventRow } from "@/lib/supabase/types";

const MODES = [["driving", "Ô tô / xe máy"], ["transit", "Phương tiện công cộng"], ["bicycling", "Xe đạp"], ["walking", "Đi bộ"]] as const;
function localDate(value?: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function EventForm({ initial = null, initialBannerUrl = null }: { initial?: CommunityEventRow | null; initialBannerUrl?: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerPath, setBannerPath] = useState(initial?.banner_path ?? "");
  const [bannerUrl, setBannerUrl] = useState(initialBannerUrl);
  async function upload(file: File | undefined) {
    if (!file) return;
    if (!EVENT_IMAGE_TYPES[file.type] || file.size <= 0 || file.size > EVENT_BANNER_MAX_BYTES) { setError("Ảnh bìa cần là JPG, PNG hoặc WebP, tối đa 10 MB."); return; }
    setUploading(true); setError(null);
    try {
      const response = await fetch("/api/events/banner-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: file.type, size: file.size }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không tải được ảnh.");
      const client = createClient();
      const { error } = await client.storage.from("event-banners").uploadToSignedUrl(result.path, result.token, file, { contentType: file.type });
      if (error) throw new Error("Không tải được ảnh bìa. Vui lòng thử lại.");
      setBannerPath(result.path); setBannerUrl(client.storage.from("event-banners").getPublicUrl(result.path).data.publicUrl);
    } catch (error) { setError(error instanceof Error ? error.message : "Kết nối bị gián đoạn."); }
    finally { setUploading(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const status = submitter instanceof HTMLButtonElement ? submitter.value : "draft";
    const value = (name: string) => String(form.get(name) ?? "");
    const price = value("price_vnd").trim();
    const body = {
      title: value("title"), summary: value("summary"), overview: value("overview"),
      starts_at: `${value("starts_at")}:00+07:00`, ends_at: `${value("ends_at")}:00+07:00`,
      venue: value("venue"), address: value("address"), city: value("city"), category: value("category"),
      organizer_bio: value("organizer_bio"), price_vnd: price === "" ? null : Number(price),
      ticket_url: value("ticket_url"), banner_path: bannerPath,
      travel_notes: Object.fromEntries(MODES.map(([mode]) => [mode, value(mode)])), status,
    };
    setPending(true); setError(null);
    try {
      const response = await fetch(initial ? `/api/events/${initial.id}` : "/api/events", { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không lưu được sự kiện.");
      router.push(status === "published" ? `/su-kien/${result.id}` : `/su-kien/quan-ly/${result.id}?saved=1`);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Kết nối bị gián đoạn. Vui lòng thử lại."); }
    finally { setPending(false); }
  }
  return <form onSubmit={save} className="space-y-8">
    <fieldset disabled={pending || uploading || initial?.hidden} className="space-y-8 disabled:opacity-70">
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7"><h2 className="mb-5 text-xl font-bold text-brand-ink">Hình ảnh & câu chuyện</h2>
        {bannerUrl && <div className="relative mb-4 aspect-[2.7/1] overflow-hidden rounded-xl"><Image src={bannerUrl} alt="Xem trước ảnh bìa sự kiện" fill unoptimized className="object-cover" /></div>}
        <label className="mb-6 block rounded-xl border border-dashed border-line bg-surface-muted p-5 text-sm font-semibold text-brand-ink">{uploading ? "Đang tải ảnh bìa…" : "Chọn ảnh bìa sự kiện"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} className="mt-3 block w-full text-xs" /><span className="mt-3 block text-xs font-normal text-stone">JPG, PNG, WebP · Tối đa 10 MB · Gợi ý tỷ lệ 2,7:1. Có thể để trống để dùng bìa Vịnh.</span></label>
        {bannerPath && <button type="button" className="mb-5 text-sm text-error" onClick={() => { setBannerPath(""); setBannerUrl(null); }}>Bỏ ảnh bìa</button>}
        <div className="space-y-5"><Field label="Tên sự kiện" name="title" required minLength={3} maxLength={160} defaultValue={initial?.title} placeholder="Đặt tên cho cuộc hẹn của bạn" /><Field label="Chủ đề" name="category" required maxLength={100} defaultValue={initial?.category ?? "Cộng đồng"} /><Textarea label="Giới thiệu ngắn" name="summary" required maxLength={500} rows={3} defaultValue={initial?.summary} /><Textarea label="Thông tin tổng quan" name="overview" required maxLength={20000} rows={10} defaultValue={initial?.overview} hint="Giới thiệu chương trình và những gì người tham dự có thể trải nghiệm. Xuống dòng trống để chia đoạn." /><Textarea label="Giới thiệu người tổ chức" name="organizer_bio" maxLength={500} rows={3} defaultValue={initial?.organizer_bio} hint="Tên và ảnh đại diện được lấy từ hồ sơ Vịnh của bạn." /></div>
      </section>
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7"><h2 className="mb-5 text-xl font-bold text-brand-ink">Thời gian & địa điểm</h2><p className="mb-5 text-sm text-stone">Tất cả thời gian theo giờ Việt Nam (GMT+7).</p><div className="grid gap-5 sm:grid-cols-2"><Field label="Bắt đầu" name="starts_at" type="datetime-local" required defaultValue={localDate(initial?.starts_at)} /><Field label="Kết thúc" name="ends_at" type="datetime-local" required defaultValue={localDate(initial?.ends_at)} /><Field label="Tên địa điểm" name="venue" required maxLength={200} defaultValue={initial?.venue} wrapperClassName="sm:col-span-2" /><Field label="Địa chỉ đầy đủ" name="address" required maxLength={500} defaultValue={initial?.address} wrapperClassName="sm:col-span-2" /><Field label="Tỉnh / thành phố" name="city" required maxLength={100} defaultValue={initial?.city} wrapperClassName="sm:col-span-2" /></div><div className="mt-7 space-y-5">{MODES.map(([mode, label]) => <Textarea key={mode} label={`Hướng dẫn: ${label}`} name={mode} maxLength={1000} rows={2} defaultValue={initial?.travel_notes[mode] ?? ""} />)}</div></section>
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7"><h2 className="mb-5 text-xl font-bold text-brand-ink">Vé tham dự</h2><div className="space-y-5"><Field label="Giá vé (VNĐ)" name="price_vnd" type="number" min={0} max={100000000} step={1} defaultValue={initial?.price_vnd ?? ""} hint="Nhập 0 cho sự kiện miễn phí; để trống nếu chưa công bố giá." /><Field label="Liên kết đăng ký / mua vé (không bắt buộc)" name="ticket_url" type="url" maxLength={2000} defaultValue={initial?.ticket_url ?? ""} placeholder="https://…" hint="Người tham dự sẽ mở trang của người tổ chức. Vịnh chưa thu tiền vé trực tiếp." /></div></section>
      <p className="text-sm leading-relaxed text-stone">Trò chơi sẽ được quản trị viên gắn vào sự kiện khi có nội dung phù hợp.</p>
      <div className="flex flex-wrap gap-3"><Button type="submit" value="draft" variant="ghost">{pending ? "Đang lưu…" : "Lưu nháp"}</Button><Button type="submit" value="published">{initial?.status === "published" ? "Lưu & cập nhật công khai" : "Xuất bản sự kiện"}</Button></div>
    </fieldset>
    {error && <Alert tone="error">{error}</Alert>}
  </form>;
}
