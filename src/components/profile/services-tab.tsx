"use client";

import { useEffect, useState } from "react";
import {
  PaletteIcon,
  WaveformIcon,
  PenNibIcon,
  PlusCircleIcon,
  ArrowLeftIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Field, Alert, Checkbox } from "@/components/ui";

type Listing = {
  id: string;
  service_type: "illustration" | "voice" | "ghostwriting";
  name: string;
  scope_description: string;
  price_tiers: { label: string; price: number }[];
  deposit_pct: number | null;
  delivery_days: number | null;
  revisions_max: number | null;
  tags: Record<string, string[]>;
  default_usage_scope: string | null;
  refund_policy: { before_draft: number; draft_pending: number; draft_approved: number; delivered: number } | null;
  lost_contact_days: number;
  accepted_content: string | null;
  rejected_content: string | null;
  is_private: boolean;
  is_accepting_orders: boolean;
};

type Sample = { id: string; file_url: string; source: string; unverified_external: boolean };
type TagGroup = { key: string; label: string; options: string[] };
type MissingField = { key: string; label: string };

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

/**
 * Tab "Dịch vụ" — khai báo gói dịch vụ commission (Mục 2 đặc tả). Validate
 * đủ 11 trường trước khi bật "Nhận đơn" luôn nằm ở server
 * (src/lib/orders/service-listing-service.ts) — component này chỉ hiển
 * thị lại danh sách thiếu do server trả về, không tự đoán.
 */
export function ServicesTab() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<MissingField[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [pending, setPending] = useState(false);

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
    setMissingFields([]);
    setSelectedId(data.listing.id);
  };

  const patch = async (fields: Record<string, unknown>) => {
    if (!selected) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/profile/services/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không lưu được.");
      setMissingFields(data?.missingFields ?? []);
      return;
    }
    setListings((prev) => prev.map((l) => (l.id === selected.id ? data.listing : l)));
    if (data.forcedOff) {
      setError("Đã tự tắt \"Nhận đơn\" vì thiếu trường bắt buộc.");
      setMissingFields(data.missingFields ?? []);
    } else {
      setMissingFields([]);
    }
  };

  const toggleTag = (groupKey: string, label: string) => {
    if (!selected) return;
    const current = selected.tags[groupKey] ?? [];
    const next = current.includes(label) ? current.filter((v) => v !== label) : [...current, label];
    patch({ tags: { ...selected.tags, [groupKey]: next } });
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
          Khai báo đầy đủ từng loại dịch vụ. Chỉ khi đủ 11 mục bắt buộc thì công tắc &quot;Nhận đơn&quot; mới bật được.
        </div>

        {error && (
          <div className="mt-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2.5">
          {listings.map((l) => {
            const Icon = TYPE_META[l.service_type].icon;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setMissingFields([]);
                  setSelectedId(l.id);
                }}
                className="flex cursor-pointer items-center gap-3.5 rounded-2xl border border-cream px-4 py-3.5 text-left transition-colors hover:bg-cream-card"
              >
                <Icon size={20} className="shrink-0 text-brand-gold-dark" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{l.name || `(Chưa đặt tên) — ${TYPE_META[l.service_type].label}`}</div>
                  <div className="mt-0.5 text-xs text-stone">{TYPE_META[l.service_type].label}</div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    l.is_accepting_orders ? "bg-[#DBF3E8] text-[#2C7453]" : "bg-neutral-bg text-stone"
                  }`}
                >
                  {l.is_accepting_orders ? "Đang nhận đơn" : "Chưa đủ điều kiện"}
                </span>
              </button>
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
  const missingKeys = new Set(missingFields.map((m) => m.key));
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
        <div>
          <div className="text-base font-bold text-brand-ink">{TYPE_META[selected.service_type].label}</div>
          <div className="mt-0.5 text-xs text-stone">{selected.name || "Chưa đặt tên gói"}</div>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="text-xs font-semibold text-ink">Nhận đơn</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => patch({ isAcceptingOrders: !selected.is_accepting_orders })}
            style={{ background: selected.is_accepting_orders ? "var(--color-brand-ink)" : "#dcdcdc" }}
            className="h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors disabled:cursor-default"
          >
            <div
              className="h-5 w-5 rounded-full bg-white transition-transform"
              style={{ transform: selected.is_accepting_orders ? "translateX(20px)" : "translateX(0)" }}
            />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {missingFields.length > 0 && (
        <div className="mt-3 rounded-xl border border-[#F0D9B5] bg-[#FDF3E7] px-4 py-3">
          <div className="text-xs font-bold text-[#7a5a12]">Còn thiếu để bật &quot;Nhận đơn&quot;:</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {missingFields.map((m) => (
              <span key={m.key} className="rounded-full border border-[#F0D9B5] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#8a6f3a]">
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4">
        <Field
          label="Tên gói dịch vụ"
          defaultValue={selected.name}
          onBlur={(e) => e.target.value !== selected.name && patch({ name: e.target.value })}
          status={missingKeys.has("name") ? { tone: "error", message: "Bắt buộc" } : undefined}
        />
        <div>
          <div className="mb-1.5 text-[13px] font-semibold text-slate">Phạm vi công việc</div>
          <textarea
            defaultValue={selected.scope_description}
            onBlur={(e) => e.target.value !== selected.scope_description && patch({ scope_description: e.target.value })}
            rows={3}
            className="w-full resize-y rounded-xl border border-cream px-3.5 py-3 text-sm leading-[1.65] outline-none focus:border-brand-gold"
          />
        </div>

        <PriceTiersEditor
          tiers={selected.price_tiers}
          hasError={missingKeys.has("price_tiers")}
          onSave={(tiers) => patch({ price_tiers: tiers })}
        />

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

        <div>
          <div className="mb-1.5 text-[13px] font-semibold text-slate">Phạm vi quyền sử dụng mặc định</div>
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
        </div>

        {tagGroups.map((g) => (
          <div key={g.key}>
            <div className="mb-1.5 text-[13px] font-semibold text-slate">{g.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {g.options.map((label) => {
                const checked = (selected.tags[g.key] ?? []).includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleTag(g.key, label)}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${
                      checked ? "border-brand-ink bg-brand-ink text-white" : "border-cream text-ink"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

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

        <RefundPolicyEditor
          policy={selected.refund_policy}
          hasError={missingKeys.has("refund_policy")}
          onSave={(policy) => patch({ refund_policy: policy })}
        />

        <Field
          label='Thời hạn "mất liên lạc" (ngày)'
          type="number"
          defaultValue={selected.lost_contact_days}
          onBlur={(e) => patch({ lost_contact_days: Number(e.target.value) })}
        />

        <Checkbox checked={selected.is_private} onChange={() => patch({ is_private: !selected.is_private })}>
          Dịch vụ riêng tư — không hiển thị công khai ở Kết nối (vẫn nhận đơn qua link trực tiếp)
        </Checkbox>

        {selected.service_type !== "ghostwriting" && (
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-slate">Sample</div>
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
          </div>
        )}
      </div>
    </div>
  );
}

function PriceTiersEditor({
  tiers,
  hasError,
  onSave,
}: {
  tiers: { label: string; price: number }[];
  hasError: boolean;
  onSave: (tiers: { label: string; price: number }[]) => void;
}) {
  const [rows, setRows] = useState(tiers.length > 0 ? tiers : [{ label: "", price: 0 }]);
  return (
    <div>
      <div className={`mb-1.5 text-[13px] font-semibold ${hasError ? "text-[#B02A37]" : "text-slate"}`}>Giá / thanh toán</div>
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
  hasError,
  onSave,
}: {
  policy: RefundPolicy | null;
  hasError: boolean;
  onSave: (policy: RefundPolicy) => void;
}) {
  const [values, setValues] = useState<RefundPolicy>(
    policy ?? { before_draft: 70, draft_pending: 40, draft_approved: 15, delivered: 0 }
  );
  return (
    <div>
      <div className={`mb-1.5 text-[13px] font-semibold ${hasError ? "text-[#B02A37]" : "text-slate"}`}>
        Chính sách hủy/hoàn tiền theo mốc tiến độ
      </div>
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
