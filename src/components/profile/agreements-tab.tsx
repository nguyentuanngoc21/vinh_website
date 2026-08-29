"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui";
import { AGREEMENTS } from "@/lib/legal/registry";
import { AgreementDocumentViewer, formatVi, type AgreementRow } from "@/components/legal/agreement-document-viewer";

type LoadState = "loading" | "ready" | "error";

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
        <AgreementDocumentViewer
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
