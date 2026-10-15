"use client";
import { useState } from "react";
import { Field } from "@/components/ui";
import { isGoogleMapsUrl } from "@/lib/events/map-link";

export function EventLocationFields({ address = "", city = "", mapsUrl = "" }: { address?: string; city?: string; mapsUrl?: string }) {
  const [currentAddress, setCurrentAddress] = useState(address);
  const [currentCity, setCurrentCity] = useState(city);
  const [link, setLink] = useState(mapsUrl);
  const query = [currentAddress.trim(), currentCity.trim()].filter(Boolean).join(", ");
  const search = `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: query || "Việt Nam" })}`;
  const valid = !link.trim() || isGoogleMapsUrl(link.trim());
  return <div className="space-y-5 sm:col-span-2">
    <Field label="Địa chỉ đầy đủ" name="address" required maxLength={500} value={currentAddress} onChange={(event) => setCurrentAddress(event.target.value)} />
    <Field label="Tỉnh / thành phố" name="city" required maxLength={100} value={currentCity} onChange={(event) => setCurrentCity(event.target.value)} />
    <div className="rounded-xl border border-line bg-surface-muted p-4">
      <a href={search} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-gold-dark">Tìm địa chỉ trên Google Maps ↗</a>
      <p className="mb-4 mt-2 text-xs leading-relaxed text-stone">Mở Google Maps, tìm đúng địa điểm, chọn Chia sẻ → Sao chép đường liên kết rồi dán vào ô bên dưới.</p>
      <Field label="Liên kết Google Maps (không bắt buộc)" name="google_maps_url" type="url" maxLength={2000} value={link} onChange={(event) => { setLink(event.target.value); event.target.setCustomValidity(!event.target.value.trim() || isGoogleMapsUrl(event.target.value.trim()) ? "" : "Vui lòng dán liên kết Google Maps hợp lệ (HTTPS)."); }} placeholder="https://maps.app.goo.gl/…" status={!valid ? { tone: "error", message: "Chỉ nhận liên kết Google Maps hợp lệ (HTTPS)." } : undefined} hint="Nếu để trống, bản đồ sẽ tìm theo địa chỉ bạn đã nhập." />
      {link.trim() && valid && <a href={link.trim()} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-brand-ink">Kiểm tra liên kết đã dán ↗</a>}
    </div>
  </div>;
}
