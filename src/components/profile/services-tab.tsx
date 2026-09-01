"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  PaletteIcon,
  WaveformIcon,
  PenNibIcon,
  PlusCircleIcon,
  ArrowLeftIcon,
  TrashIcon,
  WarningCircleIcon,
  DotsThreeVerticalIcon,
  PencilSimpleIcon,
  PlayIcon,
  PauseIcon,
  CopyIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Field, Alert, Checkbox } from "@/components/ui";
import { computeMissingFields } from "@/lib/orders/service-listing-service";
import type { Database } from "@/lib/supabase/types";

type Listing = {
  id: string;
  service_type: "illustration" | "voice" | "ghostwriting";
  name: string;
  scope_description: string;
  price_tiers: { label: string; price: number }[];
  deposit_pct: number | null;
  delivery_days: number | null;
  revisions_max: number | null;
  // multi-select group -> string[]; single-select group (multi:false, vd
  // "Mức độ hoàn thiện") -> string. Xem TagGroup bên dưới.
  tags: Record<string, string[] | string>;
  default_usage_scope: string | null;
  refund_policy: { before_draft: number; draft_pending: number; draft_approved: number; delivered: number } | null;
  lost_contact_days: number;
  accepted_content: string | null;
  rejected_content: string | null;
  is_private: boolean;
  is_accepting_orders: boolean;
};

// computeMissingFields() (service-listing-service.ts) chỉ đọc đúng các
// trường trên — an toàn ép kiểu Listing (subset) sang Row đầy đủ để tái
// dùng NGUYÊN VĂN logic 11 trường bắt buộc phía server (Mục 2.1), tránh
// lặp lại rule ở đây rồi lệch nhau về sau.
type ListingRow = Database["public"]["Tables"]["service_listings"]["Row"];
const asRow = (l: Listing) => l as unknown as ListingRow;

type Sample = { id: string; file_url: string; source: string; unverified_external: boolean };
// Đối chiếu TAG_GROUPS/VOICE_GROUPS trong Vịnh Cá nhân.dc.html — "4 tầng
// thẻ", không phải danh sách phẳng. multi=false (vd "Mức độ hoàn thiện")
// chỉ chọn được đúng 1 lựa chọn.
type TagGroup = {
  key: string;
  label: string;
  tier: string | null;
  rule: string | null;
  multi: boolean;
  optional: boolean;
  options: { label: string; warnText: string | null }[];
};

const TYPE_META = {
  illustration: { label: "Vẽ bìa / minh họa", icon: PaletteIcon },
  voice: { label: "Thu âm / lồng tiếng", icon: WaveformIcon },
  ghostwriting: { label: "Viết hộ", icon: PenNibIcon },
};

const SCOPE_OPTIONS = [
  { value: "personal", label: "Cá nhân" },
  { value: "commercial_limited", label: "Thương mại giới hạn" },
  { value: "commercial_full", label: "Thương mại toàn phần" },
];

// Số trường "đếm được" hiển thị "X/Y mục" — khớp đúng các key mà
// computeMissingFields() có thể trả về cho từng loại dịch vụ (tags chỉ
// áp dụng cho illustration/voice, xem service-listing-service.ts).
const FIELD_KEYS_BASE = [
  "name",
  "scope_description",
  "price_tiers",
  "deposit_pct",
  "delivery_days",
  "revisions_max",
  "content_policy",
  "default_usage_scope",
  "refund_policy",
  "lost_contact_days",
  "is_private",
];
function fieldKeyCountFor(serviceType: Listing["service_type"]): number {
  return serviceType === "ghostwriting" ? FIELD_KEYS_BASE.length : FIELD_KEYS_BASE.length + 1;
}

function tagArr(tags: Record<string, string[] | string> | null | undefined, key: string): string[] {
  const v = tags?.[key];
  return Array.isArray(v) ? v : v ? [v] : [];
}

// Đối chiếu titleOf() trong Vịnh Cá nhân.dc.html — với illustration/voice,
// tiêu đề gói được TỰ SINH từ thẻ đã chọn thay vì gõ tự do.
function titleOf(l: Listing): string {
  if (l.service_type === "ghostwriting") return l.name.trim() || "Gói chưa đặt tên";
  if (l.service_type === "voice") {
    const pick = [...tagArr(l.tags, "v1"), ...tagArr(l.tags, "v2")];
    return pick.length ? pick.slice(0, 2).join(" + ") + (pick.length > 2 ? ` +${pick.length - 2}` : "") : "Gói chưa phân loại";
  }
  const g1 = tagArr(l.tags, "g1");
  const g3 = typeof l.tags?.g3 === "string" ? l.tags.g3 : "";
  if (g1.length === 0 && !g3) return "Gói chưa phân loại";
  return (g1.slice(0, 2).join(" + ") || "Chưa chọn loại") + (g3 ? " — " + g3.replace(/\s*\(.*\)$/, "") : "");
}

// Đối chiếu tagChips() — danh sách thẻ rút gọn hiển thị ở list view.
function listingTagChips(l: Listing): string[] {
  if (l.service_type === "ghostwriting") return [];
  if (l.service_type === "voice") return [...tagArr(l.tags, "v1"), ...tagArr(l.tags, "v2")];
  return [...tagArr(l.tags, "g1"), ...tagArr(l.tags, "g2"), ...tagArr(l.tags, "g3"), ...tagArr(l.tags, "g4")];
}

function priceLabelOf(l: Listing): string {
  const tiers = Array.isArray(l.price_tiers) ? l.price_tiers : [];
  const prices = tiers.map((t) => Number(t?.price)).filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return "— chưa có giá";
  const min = Math.min(...prices);
  return min.toLocaleString("vi-VN") + "₫" + (prices.length > 1 ? " trở lên" : "");
}

/**
 * Tab "Dịch vụ" — khai báo gói dịch vụ commission (Mục 2 đặc tả). Validate
 * đủ 11 trường trước khi bật "Nhận đơn" luôn nằm ở server
 * (src/lib/orders/service-listing-service.ts) — component này tự tính
 * lại CÙNG hàm đó (computeMissingFields) để hiển thị live, không đợi 1
 * lượt lưu thất bại mới biết đang thiếu gì.
 */
export function ServicesTab() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forcedOffNotice, setForcedOffNotice] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [pending, setPending] = useState(false);
  // Menu "..." render qua portal ra document.body (đúng lý do như
  // MegaMenu — src/components/mega-menu.tsx) vì danh sách dịch vụ nằm
  // trong khung overflow-hidden để bo góc, nên absolute tại chỗ sẽ bị cắt
  // mất khi dropdown cao hơn phần còn lại của bảng bên dưới.
  const [openMenu, setOpenMenu] = useState<{ id: string; top: number; left: number } | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openMenu]);

  const loadListings = () =>
    fetch("/api/profile/services")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setListings(data?.listings ?? []);
        setLoaded(true);
      });

  useEffect(() => {
    loadListings();
  }, []);

  const selected = listings.find((l) => l.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/profile/services/${selected.id}/samples`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSamples(data?.samples ?? []));
    fetch(`/api/profile/services/tag-options?serviceType=${selected.service_type}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTagGroups(data?.groups ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const missing = useMemo(() => (selected ? computeMissingFields(asRow(selected)) : []), [selected]);
  const missingKeys = new Set(missing.map((m) => m.key));
  const ok = missing.length === 0;

  const openListing = (id: string) => {
    setError(null);
    setForcedOffNotice(false);
    setSelectedId(id);
  };

  const createListing = async (serviceType: Listing["service_type"]) => {
    setPending(true);
    const res = await fetch("/api/profile/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceType }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không tạo được dịch vụ.");
      return;
    }
    setListings((prev) => [data.listing, ...prev]);
    openListing(data.listing.id);
  };

  const patchListing = async (id: string, fields: Record<string, unknown>) => {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/profile/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không lưu được.");
      return null;
    }
    setListings((prev) => prev.map((l) => (l.id === id ? data.listing : l)));
    setForcedOffNotice(Boolean(data.forcedOff));
    return data.listing as Listing;
  };

  const patch = (fields: Record<string, unknown>) => (selected ? patchListing(selected.id, fields) : Promise.resolve(null));

  const toggleAcceptingFor = (l: Listing) => {
    const canToggle = l.is_accepting_orders || fieldKeyCountFor(l.service_type) - computeMissingFields(asRow(l)).length === fieldKeyCountFor(l.service_type);
    if (!canToggle) return;
    void patchListing(l.id, { isAcceptingOrders: !l.is_accepting_orders });
  };

  const duplicateListing = async (l: Listing) => {
    setPending(true);
    const res = await fetch("/api/profile/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceType: l.service_type }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.listing) {
      setPending(false);
      setError("Không nhân bản được dịch vụ.");
      return;
    }
    const cloneRes = await fetch(`/api/profile/services/${data.listing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: l.name,
        scope_description: l.scope_description,
        price_tiers: l.price_tiers,
        deposit_pct: l.deposit_pct,
        delivery_days: l.delivery_days,
        revisions_max: l.revisions_max,
        tags: l.tags,
        default_usage_scope: l.default_usage_scope,
        refund_policy: l.refund_policy,
        lost_contact_days: l.lost_contact_days,
        accepted_content: l.accepted_content,
        rejected_content: l.rejected_content,
        is_private: l.is_private,
      }),
    });
    const cloned = await cloneRes.json().catch(() => null);
    setPending(false);
    setListings((prev) => [cloned?.listing ?? data.listing, ...prev]);
  };

  const deleteListing = async (l: Listing) => {
    if (typeof window !== "undefined" && !window.confirm(`Xóa dịch vụ "${titleOf(l)}"? Không thể hoàn tác.`)) return;
    setPending(true);
    const res = await fetch(`/api/profile/services/${l.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không xoá được dịch vụ.");
      return;
    }
    setListings((prev) => prev.filter((x) => x.id !== l.id));
    if (selectedId === l.id) setSelectedId(null);
  };

  const toggleTag = (group: TagGroup, label: string) => {
    if (!selected) return;
    if (!group.multi) {
      // Chọn 1 (vd "Mức độ hoàn thiện") — bấm lại lựa chọn đang chọn thì bỏ chọn.
      const current = selected.tags[group.key];
      patch({ tags: { ...selected.tags, [group.key]: current === label ? "" : label } });
      return;
    }
    const current = (selected.tags[group.key] as string[] | undefined) ?? [];
    const next = current.includes(label) ? current.filter((v) => v !== label) : [...current, label];
    patch({ tags: { ...selected.tags, [group.key]: next } });
  };

  const uploadSample = async (file: File) => {
    if (!selected) return;
    const body = new FormData();
    body.set("file", file);
    setPending(true);
    const res = await fetch(`/api/profile/services/${selected.id}/samples`, { method: "POST", body });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Tải sample thất bại.");
      return;
    }
    setSamples((prev) => [data.sample, ...prev]);
  };

  if (!loaded) return <div className="px-4 py-10 text-center text-sm text-stone-light sm:px-8 lg:px-11">Đang tải…</div>;

  // ===== Danh sách =====
  if (!selected) {
    return (
      <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
        <div className="text-[19px] font-bold text-brand-ink">Dịch vụ tôi cung cấp</div>
        <div className="mt-1.5 max-w-[640px] text-[13.5px] leading-[1.6] text-stone-dark">
          Khai báo đầy đủ từng loại dịch vụ. Chỉ khi đủ các mục bắt buộc thì công tắc &quot;Nhận đơn&quot; mới bật được.
        </div>

        {error && (
          <div className="mt-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-2xl border border-cream">
          {listings.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-stone-light">Chưa có dịch vụ nào.</div>
          )}
          {listings.map((l, i) => {
            const rowMissing = computeMissingFields(asRow(l));
            const rowOk = rowMissing.length === 0;
            const total = fieldKeyCountFor(l.service_type);
            const filledCount = total - rowMissing.length;
            const tags = listingTagChips(l).slice(0, 4);
            const statusLabel = l.is_accepting_orders
              ? rowOk
                ? "Đang nhận đơn"
                : "Tạm dừng — thiếu mục"
              : rowOk
                ? "Chưa nhận đơn"
                : "Bản nháp";
            const statusColor = l.is_accepting_orders
              ? rowOk
                ? { bg: "#DBF3E8", fg: "#2C7453" }
                : { bg: "#FDF3E7", fg: "#A9781A" }
              : { bg: "#F1F3F4", fg: "#6f665c" };
            return (
              <div
                key={l.id}
                className="grid items-start gap-3 bg-white px-4 py-3.5"
                style={{
                  gridTemplateColumns: "minmax(0,1fr) 140px 150px 40px",
                  borderTop: i === 0 ? "none" : "1px solid #f4f2ef",
                }}
              >
                <button type="button" onClick={() => openListing(l.id)} className="min-w-0 cursor-pointer text-left">
                  <div className="truncate text-sm font-semibold text-ink">{titleOf(l)}</div>
                  <div className="mt-0.5 text-xs text-stone">{TYPE_META[l.service_type].label}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {tags.length === 0 ? (
                      <span className="text-[11px] text-stone-light">Chưa có thẻ</span>
                    ) : (
                      tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-cream bg-neutral-bg px-2.5 py-0.5 text-[11px] text-stone-dark"
                        >
                          {t}
                        </span>
                      ))
                    )}
                  </div>
                </button>
                <div className="pt-0.5 text-[13px] text-ink">{priceLabelOf(l)}</div>
                <div className="pt-0.5">
                  <span
                    className="inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                    style={{ background: statusColor.bg, color: statusColor.fg }}
                  >
                    {statusLabel}
                  </span>
                  <div className="mt-1.5 text-[11px] text-stone-light">
                    {filledCount}/{total} mục
                  </div>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      if (openMenu?.id === l.id) {
                        setOpenMenu(null);
                        return;
                      }
                      const rect = e.currentTarget.getBoundingClientRect();
                      setOpenMenu({ id: l.id, top: rect.bottom + 6, left: rect.right - 178 });
                    }}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-cream text-stone-dark hover:bg-cream-card"
                  >
                    <DotsThreeVerticalIcon size={16} weight="bold" />
                  </button>
                  {openMenu?.id === l.id &&
                    createPortal(
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
                        <div
                          style={{ position: "fixed", top: openMenu.top, left: openMenu.left, zIndex: 50 }}
                          className="min-w-[178px] rounded-xl border border-cream bg-white p-1 shadow-[0_12px_30px_rgba(20,59,77,0.14)]"
                        >
                          <RowMenuItem
                            icon={<PencilSimpleIcon size={15} weight="bold" />}
                            label="Sửa dịch vụ"
                            onClick={() => {
                              openListing(l.id);
                              setOpenMenu(null);
                            }}
                          />
                          <RowMenuItem
                            icon={l.is_accepting_orders ? <PauseIcon size={15} weight="bold" /> : <PlayIcon size={15} weight="bold" />}
                            label={l.is_accepting_orders ? "Tắt nhận đơn" : "Bật nhận đơn"}
                            onClick={() => {
                              toggleAcceptingFor(l);
                              setOpenMenu(null);
                            }}
                          />
                          <RowMenuItem
                            icon={<CopyIcon size={15} weight="bold" />}
                            label="Nhân bản"
                            onClick={() => {
                              void duplicateListing(l);
                              setOpenMenu(null);
                            }}
                          />
                          <RowMenuItem
                            icon={<TrashIcon size={15} weight="bold" />}
                            label="Xóa dịch vụ"
                            danger
                            onClick={() => {
                              void deleteListing(l);
                              setOpenMenu(null);
                            }}
                          />
                        </div>
                      </>,
                      document.body
                    )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(Object.keys(TYPE_META) as Listing["service_type"][]).map((t) => (
            <button
              key={t}
              type="button"
              disabled={pending}
              onClick={() => createListing(t)}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-brand-gold px-4 py-2 text-xs font-semibold text-brand-gold-dark disabled:cursor-default disabled:opacity-60"
            >
              <PlusCircleIcon size={16} /> Thêm dịch vụ {TYPE_META[t].label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ===== Sửa 1 dịch vụ =====
  const total = fieldKeyCountFor(selected.service_type);
  const filledCount = total - missing.length;
  const canToggleOn = ok || selected.is_accepting_orders;
  const toggleTip = ok
    ? "Bật để khách hàng có thể đặt gói này."
    : selected.is_accepting_orders
      ? `Form thiếu ${missing.length} mục nên gói đang tạm dừng. Bấm để tắt hẳn, hoặc điền bù để nhận đơn lại.`
      : `Cần điền đủ để bật được: còn thiếu ${missing.length} mục.`;
  const onLabel = selected.is_accepting_orders
    ? ok
      ? "Đang nhận đơn"
      : "Tạm dừng — thiếu mục"
    : ok
      ? "Chưa nhận đơn"
      : "Nhận đơn (bị khóa)";

  return (
    <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
      <div className="flex items-center gap-3 border-b border-[#f2f0ed] pb-4">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-cream text-stone-dark"
        >
          <ArrowLeftIcon size={16} weight="bold" />
        </button>
        <div className="min-w-0">
          <div className="truncate text-base font-bold text-brand-ink">{titleOf(selected)}</div>
          <div className="mt-0.5 text-xs text-stone">
            {TYPE_META[selected.service_type].label} · {ok ? "đã đủ mục" : `còn thiếu ${missing.length} mục`}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {forcedOffNotice && (
        <div className="mt-3">
          <Alert tone="error">Đã tự tắt &quot;Nhận đơn&quot; vì thiếu trường bắt buộc.</Alert>
        </div>
      )}

      {/* Thanh trạng thái + công tắc Nhận đơn — đối chiếu svcStatusStyle/svcSwitchStyle */}
      <div
        className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4"
        style={{
          borderColor: selected.is_accepting_orders ? "#CFE6D9" : "#eceae7",
          background: selected.is_accepting_orders ? "#F2F8F4" : "#FBFAF8",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]"
            style={{
              background: selected.is_accepting_orders ? "#DBF3E8" : "#EEF2F4",
              color: selected.is_accepting_orders ? "#2C7453" : "#2C5870",
            }}
          >
            {(() => {
              const Icon = TYPE_META[selected.service_type].icon;
              return <Icon size={20} />;
            })()}
          </div>
          <div>
            <div
              className="text-[13px] font-semibold"
              style={{ color: selected.is_accepting_orders ? (ok ? "#2F7A4F" : "#A9781A") : ok ? "#6f665c" : "#a09689" }}
            >
              {onLabel}
            </div>
            <div className="mt-0.5 text-[11.5px] text-stone-light">
              {filledCount}/{total} mục đã điền{ok ? " · đủ điều kiện nhận đơn" : ""}
            </div>
          </div>
        </div>
        <button
          type="button"
          title={toggleTip}
          disabled={pending || !canToggleOn}
          onClick={() => patch({ isAcceptingOrders: !selected.is_accepting_orders })}
          style={{
            background: selected.is_accepting_orders ? "var(--color-brand-ink)" : "#dcdcdc",
            cursor: canToggleOn ? "pointer" : "not-allowed",
            opacity: canToggleOn ? 1 : 0.6,
          }}
          className="h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors"
        >
          <div
            className="h-5 w-5 rounded-full bg-white transition-transform"
            style={{ transform: selected.is_accepting_orders ? "translateX(20px)" : "translateX(0)" }}
          />
        </button>
      </div>

      {missing.length > 0 && (
        <div className="mt-3 rounded-xl border border-[#F0D9B5] bg-[#FDF3E7] px-4 py-3">
          <div className="text-xs font-bold text-[#7a5a12]">
            {selected.is_accepting_orders ? "Gói đang tạm dừng" : "Chưa thể nhận đơn"} — còn thiếu {missing.length} mục:
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {missing.map((m) => (
              <span key={m.key} className="rounded-full border border-[#F0D9B5] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#8a6f3a]">
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3.5">
        <NumberedField num={1} label="Tên gói dịch vụ" filled={!missingKeys.has("name")}>
          <Field
            label={null}
            defaultValue={selected.name}
            onBlur={(e) => e.target.value !== selected.name && patch({ name: e.target.value })}
          />
        </NumberedField>

        <NumberedField num={2} label="Phạm vi công việc" filled={!missingKeys.has("scope_description")}>
          <textarea
            defaultValue={selected.scope_description}
            onBlur={(e) => e.target.value !== selected.scope_description && patch({ scope_description: e.target.value })}
            rows={3}
            className="w-full resize-y rounded-xl border border-cream px-3.5 py-3 text-sm leading-[1.65] outline-none focus:border-brand-gold"
          />
        </NumberedField>

        <NumberedField num={3} label="Giá / thanh toán" filled={!missingKeys.has("price_tiers")}>
          <PriceTiersEditor tiers={selected.price_tiers} onSave={(tiers) => patch({ price_tiers: tiers })} />
        </NumberedField>

        <NumberedField
          num={4}
          label="Mốc cọc / thời gian giao / số lần sửa"
          filled={!missingKeys.has("deposit_pct") && !missingKeys.has("delivery_days") && !missingKeys.has("revisions_max")}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field
              label="Mốc cọc (%)"
              type="number"
              defaultValue={selected.deposit_pct ?? ""}
              onBlur={(e) => patch({ deposit_pct: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <Field
              label="Thời gian giao (ngày)"
              type="number"
              defaultValue={selected.delivery_days ?? ""}
              onBlur={(e) => patch({ delivery_days: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <Field
              label="Số lần sửa"
              type="number"
              defaultValue={selected.revisions_max ?? ""}
              onBlur={(e) => patch({ revisions_max: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
        </NumberedField>

        {selected.service_type !== "ghostwriting" && (
          <NumberedField
            num={5}
            label={selected.service_type === "voice" ? "Phân loại gói (Lồng tiếng/Nhạc cụ)" : "Phân loại gói dịch vụ"}
            filled={!missingKeys.has("tags")}
          >
            <div className="flex flex-col gap-4">
              {tagGroups.map((g) => {
                const currentVal = selected.tags[g.key];
                const isChecked = (label: string) =>
                  g.multi ? ((currentVal as string[] | undefined) ?? []).includes(label) : currentVal === label;
                const activeWarning = g.options.find((o) => o.warnText && isChecked(o.label))?.warnText ?? null;
                const groupDone = g.multi
                  ? ((currentVal as string[] | undefined) ?? []).length > 0
                  : Boolean(currentVal);
                const groupChip = groupDone
                  ? g.multi
                    ? `${((currentVal as string[] | undefined) ?? []).length} thẻ`
                    : "Đã chọn"
                  : g.optional
                    ? "Không nhận"
                    : "Chưa chọn";
                return (
                  <div
                    key={g.key}
                    className="rounded-[13px] border px-[15px] py-[13px]"
                    style={{ borderColor: groupDone || g.optional ? "#f0eeea" : "#F0D9B5", background: groupDone || g.optional ? "#FBFAF8" : "#FFFDF8" }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {g.tier && (
                        <span className="rounded-[7px] bg-[#EEF2F4] px-2.5 py-0.5 text-[10.5px] font-bold text-[#2C5870]">{g.tier}</span>
                      )}
                      <span className="text-[13px] font-semibold text-slate">{g.label}</span>
                      <span
                        className="ml-auto rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold"
                        style={{
                          background: groupDone ? "#DBF3E8" : g.optional ? "#F1F3F4" : "#F7EFD8",
                          color: groupDone ? "#2C7453" : g.optional ? "#6f665c" : "#8A6414",
                        }}
                      >
                        {groupChip}
                      </span>
                    </div>
                    {g.rule && <div className="mt-1 text-[11.5px] leading-[1.5] text-stone-light">{g.rule}</div>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.options.map((o) => {
                        const checked = isChecked(o.label);
                        return (
                          <button
                            key={o.label}
                            type="button"
                            onClick={() => toggleTag(g, o.label)}
                            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${
                              checked ? "border-brand-ink bg-brand-ink text-white" : "border-cream text-ink"
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                    {activeWarning && (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-[#F0D9B5] bg-[#FDF3E7] px-3 py-2">
                        <WarningCircleIcon weight="fill" size={15} className="mt-0.5 shrink-0 text-[#A9781A]" />
                        <div className="text-[11.5px] leading-[1.6] text-[#7a5a12]">{activeWarning}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </NumberedField>
        )}

        <NumberedField num={6} label="Phạm vi quyền sử dụng mặc định" filled={!missingKeys.has("default_usage_scope")}>
          <div className="flex flex-wrap gap-1.5">
            {SCOPE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => patch({ default_usage_scope: o.value })}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-medium ${
                  selected.default_usage_scope === o.value ? "border-brand-ink bg-brand-ink text-white" : "border-cream text-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </NumberedField>

        <NumberedField num={7} label="Thể loại nhận / từ chối" filled={!missingKeys.has("content_policy")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-slate">Thể loại nhận</div>
              <textarea
                defaultValue={selected.accepted_content ?? ""}
                onBlur={(e) => patch({ accepted_content: e.target.value })}
                rows={2}
                className="w-full resize-y rounded-xl border border-cream px-3.5 py-3 text-sm leading-[1.6] outline-none focus:border-brand-gold"
              />
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-slate">Thể loại từ chối</div>
              <textarea
                defaultValue={selected.rejected_content ?? ""}
                onBlur={(e) => patch({ rejected_content: e.target.value })}
                rows={2}
                className="w-full resize-y rounded-xl border border-cream px-3.5 py-3 text-sm leading-[1.6] outline-none focus:border-brand-gold"
              />
            </div>
          </div>
        </NumberedField>

        <NumberedField num={8} label="Chính sách hủy/hoàn tiền theo mốc tiến độ" filled={!missingKeys.has("refund_policy")}>
          <RefundPolicyEditor policy={selected.refund_policy} onSave={(policy) => patch({ refund_policy: policy })} />
        </NumberedField>

        <NumberedField num={9} label={'Thời hạn "mất liên lạc" (ngày)'} filled={!missingKeys.has("lost_contact_days")}>
          <Field
            label={null}
            type="number"
            defaultValue={selected.lost_contact_days}
            onBlur={(e) => patch({ lost_contact_days: Number(e.target.value) })}
          />
        </NumberedField>

        <NumberedField num={10} label="Chính sách hiển thị" filled={!missingKeys.has("is_private")}>
          <Checkbox checked={selected.is_private} onChange={() => patch({ is_private: !selected.is_private })}>
            Dịch vụ riêng tư — không hiển thị công khai ở Kết nối (vẫn nhận đơn qua link trực tiếp)
          </Checkbox>
        </NumberedField>

        {selected.service_type !== "ghostwriting" && (
          <NumberedField num={11} label="Sample" filled={samples.length > 0}>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-cream px-4 py-3 text-xs font-medium text-stone-dark">
              <PlusCircleIcon size={16} /> Tải sample lên (ảnh hoặc mp3/wav)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/wav"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadSample(e.target.files[0])}
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {samples.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg border border-cream px-3 py-1.5 text-xs">
                  <span className="max-w-[160px] truncate">{s.file_url.split("/").pop()}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/profile/services/${selected.id}/samples/${s.id}`, { method: "DELETE" });
                      setSamples((prev) => prev.filter((x) => x.id !== s.id));
                    }}
                    className="cursor-pointer text-stone-light"
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
              ))}
              {samples.length === 0 && <div className="text-xs text-stone-light">Chưa có sample nào.</div>}
            </div>
          </NumberedField>
        )}
      </div>
    </div>
  );
}

function RowMenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-[12.5px] font-medium hover:bg-neutral-bg"
      style={{ color: danger ? "#A33A2B" : "#15110f" }}
    >
      {icon}
      {label}
    </button>
  );
}

// Đối chiếu numStyle/chipStyle của svcFields trong Vịnh Cá nhân.dc.html —
// mỗi trường bắt buộc là 1 thẻ đánh số, viền/nền đổi màu và có nhãn "Đã
// điền"/"Còn thiếu" theo trạng thái filled.
function NumberedField({
  num,
  label,
  filled,
  children,
}: {
  num: number;
  label: string;
  filled: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border px-[18px] py-4"
      style={{ borderColor: filled ? "#eceae7" : "#F0D9B5", background: filled ? "#fff" : "#FFFDF8" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11.5px] font-bold"
          style={{ background: filled ? "#EEF2F4" : "#F7EFD8", color: filled ? "#2C5870" : "#8A6414" }}
        >
          {num}
        </span>
        <span className="flex-1 text-[13px] font-semibold text-slate">{label}</span>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold"
          style={{ background: filled ? "#DBF3E8" : "#F7EFD8", color: filled ? "#2C7453" : "#8A6414" }}
        >
          {filled ? "Đã điền" : "Còn thiếu"}
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function PriceTiersEditor({
  tiers,
  onSave,
}: {
  tiers: { label: string; price: number }[];
  onSave: (tiers: { label: string; price: number }[]) => void;
}) {
  const [rows, setRows] = useState(tiers.length > 0 ? tiers : [{ label: "", price: 0 }]);
  return (
    <div>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={r.label}
              placeholder="Tên gói (vd: Cơ bản)"
              onChange={(e) => setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, label: e.target.value } : row)))}
              className="flex-1 rounded-lg border border-cream px-3 py-2 text-sm outline-none focus:border-brand-gold"
            />
            <input
              type="number"
              value={r.price || ""}
              placeholder="Giá (₫)"
              onChange={(e) =>
                setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, price: Number(e.target.value) } : row)))
              }
              className="w-32 rounded-lg border border-cream px-3 py-2 text-sm outline-none focus:border-brand-gold"
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { label: "", price: 0 }])}
          className="cursor-pointer text-xs font-semibold text-brand-gold-dark"
        >
          + Thêm mức giá
        </button>
        <button type="button" onClick={() => onSave(rows.filter((r) => r.label && r.price > 0))} className="cursor-pointer text-xs font-semibold text-brand-ink">
          Lưu giá
        </button>
      </div>
    </div>
  );
}

type RefundPolicy = { before_draft: number; draft_pending: number; draft_approved: number; delivered: number };

// 4 mốc CỐ ĐỊNH — calculate_refund() (server) tra thẳng key này để tự suy
// ra % hoàn khi hủy đơn, không so khớp text tự do được nữa (xem
// migrations/20260901_add_order_cancel_system.sql). Không cho seller gõ
// tên mốc tự do như bản cũ.
const REFUND_STAGES: { key: keyof RefundPolicy; label: string }[] = [
  { key: "before_draft", label: "Chưa gửi bản nháp nào" },
  { key: "draft_pending", label: "Có bản nháp, chưa được duyệt" },
  { key: "draft_approved", label: "Đã duyệt ít nhất 1 bản nháp" },
  { key: "delivered", label: "Đã bàn giao, chưa xác nhận nhận hàng" },
];

function RefundPolicyEditor({
  policy,
  onSave,
}: {
  policy: RefundPolicy | null;
  onSave: (policy: RefundPolicy) => void;
}) {
  const [values, setValues] = useState<RefundPolicy>(
    policy ?? { before_draft: 70, draft_pending: 40, draft_approved: 15, delivered: 0 }
  );
  return (
    <div>
      <div className="text-xs text-stone-light">
        % hoàn cho khách nếu KHÁCH là bên yêu cầu hủy. Nếu bạn (người cung cấp dịch vụ) là bên yêu cầu hủy, khách luôn được hoàn 100% —
        không cần khai riêng.
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {REFUND_STAGES.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-2">
            <div className="text-[13px] text-ink">{s.label}</div>
            <div className="flex shrink-0 items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                value={values[s.key]}
                onChange={(e) => setValues((prev) => ({ ...prev, [s.key]: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                className="w-20 rounded-lg border border-cream px-3 py-1.5 text-sm outline-none focus:border-brand-gold"
              />
              <span className="text-xs text-stone">%</span>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSave(values)}
        className="mt-2 cursor-pointer text-xs font-semibold text-brand-ink"
      >
        Lưu chính sách
      </button>
    </div>
  );
}
