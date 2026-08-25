"use client";

import { useEffect, useState } from "react";
import { CheckIcon, PlusIcon, XIcon } from "@phosphor-icons/react/dist/ssr";

type ReadingList = { id: string; name: string; createdAt: string; containsBook: boolean };

type ReadingListModalProps = {
  open: boolean;
  onClose: () => void;
  bookId: string;
  bookTitle: string;
};

/**
 * Modal "Thêm vào danh sách đọc" — KHÔNG fully-controlled như
 * custom-amount-modal.tsx: tự fetch danh sách của user lúc mở và tự quản
 * state tạo/thêm/gỡ, vì đây là 1 mảng việc tự thân (reader.tsx không cần
 * ôm state của việc này). Cùng khung backdrop/panel với
 * src/components/topup/custom-amount-modal.tsx.
 */
export function ReadingListModal({ open, onClose, bookId, bookTitle }: ReadingListModalProps) {
  const [lists, setLists] = useState<ReadingList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;

    // Định nghĩa + gọi 1 async fn riêng (giống loadPenalty trong
    // reader.tsx) — không setState đồng bộ ngay đầu thân effect.
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/reading-lists?bookId=${bookId}`);
        const data = await res.json();
        setLists(Array.isArray(data?.lists) ? data.lists : []);
      } catch {
        setError("Không tải được danh sách đọc.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, bookId]);

  if (!open) return null;

  const setPending = (id: string, on: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleList = async (list: ReadingList) => {
    if (pendingIds.has(list.id)) return;
    setPending(list.id, true);
    const nextContains = !list.containsBook;
    setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, containsBook: nextContains } : l)));

    try {
      const res = nextContains
        ? await fetch(`/api/reading-lists/${list.id}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookId }),
          })
        : await fetch(`/api/reading-lists/${list.id}/items/${bookId}`, { method: "DELETE" });
      if (!res.ok) {
        // Rollback nếu request thất bại.
        setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, containsBook: !nextContains } : l)));
      }
    } catch {
      setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, containsBook: !nextContains } : l)));
    } finally {
      setPending(list.id, false);
    }
  };

  const createList = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/reading-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        setError((data && typeof data.error === "string" && data.error) || "Không tạo được danh sách.");
        return;
      }

      // Tạo danh sách ngay lúc đang thêm 1 sách — thêm luôn sách này vào
      // danh sách mới, giống YouTube "tạo playlist mới" trong lúc lưu video.
      await fetch(`/api/reading-lists/${data.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });

      setLists((prev) => [{ id: data.id, name: data.name, createdAt: data.createdAt, containsBook: true }, ...prev]);
      setNewName("");
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[95] flex items-center justify-center bg-brand-ink-dark/55 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-[20px] bg-white p-7 shadow-[0_24px_60px_rgba(0,0,0,.28)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-[family-name:var(--font-lora)] text-xl font-bold text-brand-ink">Thêm vào danh sách đọc</div>
            <div className="mt-1 truncate text-[13px] leading-[1.6] text-stone-dark">{bookTitle}</div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 cursor-pointer text-stone">
            <XIcon size={20} />
          </button>
        </div>

        <div className="mt-5 flex max-h-[240px] flex-col gap-1 overflow-y-auto">
          {loading && <div className="py-3 text-center text-sm text-stone">Đang tải…</div>}
          {!loading && lists.length === 0 && (
            <div className="py-3 text-center text-sm text-stone">Chưa có danh sách nào — tạo mới bên dưới.</div>
          )}
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              onClick={() => toggleList(list)}
              disabled={pendingIds.has(list.id)}
              className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-cream-card disabled:cursor-default"
            >
              <span
                className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                  list.containsBook ? "border-brand-ink bg-brand-ink" : "border-border-light bg-white"
                }`}
              >
                <CheckIcon weight="bold" size={12} className={`text-white ${list.containsBook ? "opacity-100" : "opacity-0"}`} />
              </span>
              <span className="min-w-0 flex-1 truncate">{list.name}</span>
            </button>
          ))}
        </div>

        {error && <div className="mt-3 text-[12.5px] font-medium text-[#B02A37]">{error}</div>}

        <div className="mt-4 flex items-center gap-2 border-t border-[#f1efec] pt-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createList()}
            placeholder="Tên danh sách mới"
            className="flex-1 rounded-lg border border-border-light px-3 py-2.5 text-sm outline-none focus:border-brand-ink"
          />
          <button
            type="button"
            onClick={createList}
            disabled={creating || !newName.trim()}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-gold px-3.5 py-2.5 text-sm font-bold text-brand-ink disabled:cursor-default disabled:opacity-60"
          >
            <PlusIcon weight="bold" /> Tạo
          </button>
        </div>
      </div>
    </div>
  );
}
