"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  MagnifyingGlassIcon,
  SealCheckIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui";
import { AGREEMENTS } from "@/lib/legal/registry";

type AgreementRow = {
  id: string;
  name: string;
  desc: string;
  updatedAt: string; // ISO yyyy-MM-dd
  requiredForFeature: string | null;
  accepted: boolean;
  updatedSincePending: boolean;
  acceptedAt: string | null;
};

type LoadState = "loading" | "ready" | "error";

function formatVi(iso: string): string {
  // "2026-08-22" -> "22-08-2026" — cùng định dạng dd-MM-yyyy đã dùng ở
  // thiết kế gốc (Vịnh Cá nhân.dc.html).
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Tab "Cam kết & Thỏa thuận" — danh sách CÁC VĂN BẢN THẬT của Vịnh (cùng
 * nguồn nội dung với LegalLink ở footer/form đăng ký, xem
 * src/lib/legal/registry.ts), trạng thái xác nhận của người dùng hiện tại,
 * và popup đọc toàn văn + xác nhận. Một thỏa thuận có "Ngày cập nhật" mới
 * hơn lần xác nhận trước sẽ tự rơi về "Chưa xác nhận" (accepted=false,
 * updatedSincePending=true) — xem GET /api/profile/agreements.
 */
export function AgreementsTab() {
  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<AgreementRow[]>([]);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/profile/agreements");
    if (!res.ok) {
      setState("error");
      return;
    }
    const data: { agreements: AgreementRow[] } = await res.json();
    setRows(data.agreements);
    setState("ready");
  }

  useEffect(() => {
    // Không gọi thẳng load() ở đây (react-hooks/set-state-in-effect) — cùng
    // pattern inline fetch().then(...) + cờ `cancelled` đã dùng ở
    // daily-tasks-tab.tsx. load() vẫn giữ làm hàm riêng để accept() gọi lại
    // sau khi ghi nhận xác nhận (từ event handler, không phải trong effect).
    let cancelled = false;
    fetch("/api/profile/agreements")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { agreements: AgreementRow[] } | null) => {
        if (cancelled) return;
        if (data) {
          setRows(data.agreements);
          setState("ready");
        } else {
          setState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function accept(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/profile/agreements/${id}/accept`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Xác nhận thất bại. Vui lòng thử lại.");
        return;
      }
      await load();
    } finally {
      setPendingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.name + " " + r.desc).toLowerCase().includes(q));
  }, [rows, query]);

  const openRow = rows.find((r) => r.id === openId) ?? null;
  const openDoc = openId ? AGREEMENTS.find((a) => a.id === openId) : null;

  if (state === "loading") {
    return (
      <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
        <div className="text-[13.5px] text-stone-light">Đang tải…</div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
        <Alert tone="error">Không tải được danh sách thỏa thuận. Vui lòng thử lại.</Alert>
      </div>
    );
  }

  const acceptedCount = rows.filter((r) => r.accepted).length;

  return (
    <div className="px-4 pb-[60px] pt-[26px] sm:px-8 lg:px-11">
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3.5">
        <div>
          <div className="text-[19px] font-bold text-brand-ink">Cam kết &amp; Thỏa thuận</div>
          <div className="mt-1.5 text-[13.5px] text-stone-dark">
            Đã xác nhận {acceptedCount}/{rows.length} thỏa thuận · {rows.length - acceptedCount} đang chờ bạn
          </div>
        </div>
        <div className="flex w-[270px] items-center gap-2 rounded-full border border-cream-border bg-[#f4f4f5] px-4 py-2.5">
          <MagnifyingGlassIcon size={15} color="#9a9a9a" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm thỏa thuận…"
            className="min-w-0 flex-1 border-none bg-transparent text-[13.5px] outline-none"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-cream-border">
        <div className="grid min-w-[860px] grid-cols-[1.1fr_1.35fr_0.8fr_0.8fr_0.95fr] gap-4 border-b border-[#F0E3C4] bg-cream-card px-[22px] py-3.5 text-[12.5px] font-bold text-brand-ink">
          <div>Tên thỏa thuận</div>
          <div>Mô tả</div>
          <div>Ngày cập nhật</div>
          <div>Thời điểm đồng ý</div>
          <div className="text-right">Trạng thái</div>
        </div>
        {filtered.map((r, i) => (
          <div
            key={r.id}
            style={{ background: r.accepted ? "#fff" : "#FCFAF4", borderTop: i === 0 ? "none" : "1px solid #f3f2f0" }}
            className="grid min-w-[860px] grid-cols-[1.1fr_1.35fr_0.8fr_0.8fr_0.95fr] items-center gap-4 px-[22px] py-4"
          >
            <div>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="cursor-pointer text-left text-[13.5px] font-semibold text-brand-gold-dark underline decoration-1 underline-offset-[3px]"
              >
                {r.name}
              </button>
              {r.requiredForFeature && (
                <div className="mt-1.5 inline-block rounded-full border border-[#EBDCB4] bg-cream-card px-2.5 py-0.5 text-[10.5px] font-semibold text-brand-gold-dark">
                  Bắt buộc để: {r.requiredForFeature}
                </div>
              )}
            </div>
            <div className="text-[13px] leading-[1.55] text-stone-dark">{r.desc}</div>
            <div className="text-[13px] text-stone-dark">{formatVi(r.updatedAt)}</div>
            <div className={`text-[13px] ${r.accepted ? "font-medium text-ink" : "text-stone-light"}`}>
              {r.acceptedAt ? formatVi(r.acceptedAt) : "—"}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {r.accepted ? (
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#2F7A4F]">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#2F7A4F]" /> Đã xác nhận
                </div>
              ) : (
                <>
                  {r.updatedSincePending && (
                    <div className="rounded-full bg-[#FBF0DC] px-2.5 py-0.5 text-[10.5px] font-bold text-[#B7791F]">
                      Đã cập nhật
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => accept(r.id)}
                    disabled={pendingId === r.id}
                    className="cursor-pointer whitespace-nowrap rounded-lg border border-brand-ink bg-white px-[15px] py-1.5 text-[12.5px] font-semibold text-brand-ink disabled:cursor-default disabled:opacity-60"
                  >
                    Xác nhận
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {openRow && openDoc && (
        <AgreementDocumentModal
          row={openRow}
          html={openDoc.html}
          onClose={() => setOpenId(null)}
          onAccept={() => accept(openRow.id).then(() => setOpenId(null))}
          accepting={pendingId === openRow.id}
        />
      )}
    </div>
  );
}

function AgreementDocumentModal({
  row,
  html,
  onClose,
  onAccept,
  accepting,
}: {
  row: AgreementRow;
  html: string;
  onClose: () => void;
  onAccept: () => void;
  accepting: boolean;
}) {
  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-[95] flex items-center justify-center bg-brand-ink-dark/55 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_24px_60px_rgba(0,0,0,.3)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#f0f0ef] px-[26px] pb-[18px] pt-[22px]">
          <div className="min-w-0">
            <div className="text-[11.5px] font-semibold tracking-[1.3px] text-brand-gold-dark">
              VĂN BẢN THỎA THUẬN
            </div>
            <div className="mt-[7px] font-[family-name:var(--font-lora)] text-xl font-bold text-brand-ink">
              {row.name}
            </div>
            <div className="mt-2 text-[12.5px] text-stone-light">
              {row.desc} · Cập nhật: {formatVi(row.updatedAt)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#f4f4f5] text-stone-dark"
          >
            <XIcon size={17} />
          </button>
        </div>
        <div className="overflow-y-auto px-[26px] py-6">
          {row.updatedSincePending && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#F0E3C4] bg-[#FBF0DC] px-3.5 py-3">
              <WarningCircleIcon weight="fill" size={17} color="#B7791F" className="mt-px shrink-0" />
              <div className="text-[12.5px] leading-[1.6] text-[#7a5a1f]">
                Văn bản này vừa được cập nhật ngày {formatVi(row.updatedAt)}. Xác nhận trước đó của bạn không còn
                hiệu lực — vui lòng đọc lại và xác nhận.
              </div>
            </div>
          )}
          <div
            className="text-[14px] leading-[1.7] text-stone-dark [&_em]:text-stone [&_h1]:mt-6 [&_h1]:text-[16px] [&_h1]:font-bold [&_h1]:text-brand-ink [&_h1:first-child]:mt-0 [&_li]:mb-1.5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_strong]:font-semibold [&_strong]:text-brand-ink [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-[#f0f0ef] bg-[#fdfdfc] px-[26px] py-4">
          <div
            className="flex items-center gap-1.5 text-[13px] font-semibold"
            style={{ color: row.accepted ? "#2F7A4F" : row.updatedSincePending ? "#B7791F" : "var(--color-stone-light)" }}
          >
            {row.accepted && <SealCheckIcon weight="fill" size={16} />}
            {row.accepted
              ? `Đã xác nhận ngày ${row.acceptedAt ? formatVi(row.acceptedAt) : ""}`
              : row.updatedSincePending
                ? `Đã cập nhật ngày ${formatVi(row.updatedAt)} — cần xác nhận lại`
                : "Chưa xác nhận"}
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-full border border-cream-border px-5 py-2.5 text-[13.5px] font-medium text-stone-dark"
            >
              Đóng
            </button>
            {!row.accepted && (
              <button
                type="button"
                onClick={onAccept}
                disabled={accepting}
                className="cursor-pointer rounded-full bg-brand-gold px-[22px] py-2.5 text-[13.5px] font-semibold text-brand-ink disabled:cursor-default disabled:opacity-60"
              >
                Tôi đồng ý
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
