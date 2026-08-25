"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  FileArrowUpIcon,
  FileTextIcon,
  TextAlignLeftIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Alert, Button, Field } from "@/components/ui";
import { countWords, splitChapters, type SplitMode } from "@/lib/authoring/split-chapters";

type ImportManuscriptModalProps = {
  open: boolean;
  onClose: () => void;
  /** Danh sách truyện của tác giả để chọn "thêm vào truyện có sẵn" — chỉ
   * dùng khi không có destinationBookId (modal mở từ sidebar, chưa biết
   * đích). Không cần khi mở từ trang tổng quan 1 truyện cụ thể. */
  books: { id: string; title: string }[];
  /** Cố định đích nhập — mở từ trang tổng quan 1 truyện (book-overview.tsx)
   * thì bỏ hẳn bước chọn đích. */
  destinationBookId?: string;
};

const SPLIT_OPTIONS: { id: SplitMode; label: string }[] = [
  { id: "chuong", label: 'Theo "Chương x"' },
  { id: "blank", label: "Dòng trống kép" },
  { id: "none", label: "Một chương duy nhất" },
];

/**
 * Modal 2 bước: (1) chọn nguồn — tải file .docx/.txt hoặc dán văn bản;
 * (2) xem trước chương đã tách (tách lại tức thời ở client qua
 * split-chapters.ts, không gọi mạng khi đổi chế độ tách) rồi chọn đích —
 * tạo truyện mới hoặc thêm vào truyện có sẵn — và xác nhận.
 *
 * Khung modal giống reading-list-modal.tsx/custom-amount-modal.tsx (backdrop
 * + panel trắng bo góc, stopPropagation, tiêu đề Lora).
 */
export function ImportManuscriptModal({
  open,
  onClose,
  books,
  destinationBookId,
}: ImportManuscriptModalProps) {
  const router = useRouter();

  const [step, setStep] = useState<"input" | "review">("input");
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [pastedText, setPastedText] = useState("");
  const [rawText, setRawText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>("chuong");
  const [destinationMode, setDestinationMode] = useState<"new" | "existing">(
    destinationBookId ? "existing" : "new"
  );
  const [existingBookId, setExistingBookId] = useState(destinationBookId ?? books[0]?.id ?? "");
  const [newBookTitle, setNewBookTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset sạch mỗi lần mở lại (modal dùng lại cho nhiều lượt nhập, không
  // muốn giữ file/văn bản của lượt trước) — set state trực tiếp trong lúc
  // render, theo dõi "open lần trước" bằng useState (không dùng ref — repo
  // này lint chặn đọc/ghi ref trong lúc render), theo đúng pattern
  // "Adjusting state when a prop changes" của React docs.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("input");
      setInputMode("file");
      setPastedText("");
      setRawText("");
      setSourceLabel("");
      setExtracting(false);
      setSplitMode("chuong");
      setDestinationMode(destinationBookId ? "existing" : "new");
      setExistingBookId(destinationBookId ?? books[0]?.id ?? "");
      setNewBookTitle("");
      setSubmitting(false);
      setError(null);
    }
  }

  const { chapters: detected, truncated, fellBackToSingle } = useMemo(
    () => splitChapters(rawText, splitMode),
    [rawText, splitMode]
  );

  if (!open) return null;

  const handleFile = async (file: File) => {
    setError(null);
    const lower = file.name.toLowerCase();

    if (lower.endsWith(".txt")) {
      const text = await file.text();
      setRawText(text);
      setSourceLabel(file.name);
      setStep("review");
      return;
    }

    if (!lower.endsWith(".docx")) {
      setError("Chỉ hỗ trợ file .docx hoặc .txt (không hỗ trợ .doc hoặc .epub).");
      return;
    }

    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/authoring/manuscripts/extract", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.text !== "string") {
        setError((data && typeof data.error === "string" && data.error) || "Không đọc được file này.");
        return;
      }
      setRawText(data.text);
      setSourceLabel(file.name);
      setStep("review");
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setExtracting(false);
    }
  };

  const handlePasteContinue = () => {
    if (!pastedText.trim()) return;
    setRawText(pastedText);
    setSourceLabel(`${countWords(pastedText).toLocaleString("vi-VN")} chữ đã dán`);
    setStep("review");
  };

  const handleConfirm = async () => {
    if (!detected.length || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      if (destinationMode === "new") {
        const title = newBookTitle.trim() || detected[0].title || "Bản thảo mới";
        const createRes = await fetch("/api/authoring/books", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        const createData = await createRes.json().catch(() => null);
        if (!createRes.ok || !createData?.bookId || !createData?.chapterId) {
          setError(
            (createData && typeof createData.error === "string" && createData.error) ||
              "Không tạo được truyện. Vui lòng thử lại."
          );
          return;
        }

        const first = detected[0];
        const patchRes = await fetch(`/api/authoring/chapters/${createData.chapterId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: first.title, content: first.content }),
        });
        if (!patchRes.ok) {
          onClose();
          router.push(`/author/${createData.bookId}/${createData.chapterId}`);
          return;
        }

        if (detected.length > 1) {
          const bulkRes = await fetch(`/api/authoring/books/${createData.bookId}/chapters`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chapters: detected.slice(1).map((c) => ({ title: c.title, content: c.content })),
            }),
          });
          if (!bulkRes.ok) {
            // Chương 1 đã lưu thành công — vẫn điều hướng vào đó để tác
            // giả tự thêm tay các chương còn lại, thay vì kẹt trong modal.
            onClose();
            router.push(`/author/${createData.bookId}/${createData.chapterId}`);
            return;
          }
        }

        onClose();
        router.push(`/author/${createData.bookId}/${createData.chapterId}`);
      } else {
        const targetId = destinationBookId ?? existingBookId;
        if (!targetId) {
          setError("Vui lòng chọn truyện.");
          return;
        }
        const bulkRes = await fetch(`/api/authoring/books/${targetId}/chapters`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapters: detected.map((c) => ({ title: c.title, content: c.content })) }),
        });
        const bulkData = await bulkRes.json().catch(() => null);
        if (!bulkRes.ok) {
          setError(
            (bulkData && typeof bulkData.error === "string" && bulkData.error) ||
              "Không thêm được chương. Vui lòng thử lại."
          );
          return;
        }
        onClose();
        router.push(`/author/${targetId}`);
      }
    } catch {
      setError("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[95] flex items-center justify-center bg-brand-ink-dark/55 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[86vh] w-full max-w-[640px] overflow-y-auto rounded-[20px] bg-white p-7 shadow-[0_24px_60px_rgba(0,0,0,.28)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-[family-name:var(--font-lora)] text-xl font-bold text-brand-ink">
              Nhập bản thảo
            </div>
            <div className="mt-1 text-[13px] leading-[1.6] text-stone-dark">
              Tải file có sẵn hoặc dán văn bản — hệ thống tự tách chương, bạn xem lại trước khi nhập.
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 cursor-pointer text-stone">
            <XIcon size={20} />
          </button>
        </div>

        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {step === "input" ? (
          <div className="mt-5">
            <div className="mb-4 flex w-fit gap-1.5 rounded-[9px] border border-cream-border bg-white p-1">
              <button
                type="button"
                onClick={() => setInputMode("file")}
                className={`flex items-center gap-1.5 rounded-[6px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  inputMode === "file" ? "bg-info-bg text-brand-ink" : "text-stone-alt"
                }`}
              >
                <FileArrowUpIcon size={15} /> Tải file
              </button>
              <button
                type="button"
                onClick={() => setInputMode("paste")}
                className={`flex items-center gap-1.5 rounded-[6px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  inputMode === "paste" ? "bg-info-bg text-brand-ink" : "text-stone-alt"
                }`}
              >
                <TextAlignLeftIcon size={15} /> Dán văn bản
              </button>
            </div>

            {inputMode === "file" ? (
              <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-border-light bg-[#fdfdfc] p-6 text-center transition-colors hover:border-brand-gold hover:bg-[#FCFAF4]">
                <input
                  type="file"
                  accept=".docx,.txt"
                  className="hidden"
                  disabled={extracting}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) handleFile(file);
                  }}
                />
                <FileArrowUpIcon size={28} color="var(--color-brand-gold)" />
                <div className="text-[14.5px] font-semibold text-brand-ink">
                  {extracting ? "Đang đọc file…" : "Kéo thả file vào đây, hoặc bấm để chọn"}
                </div>
                <div className="text-[12.5px] text-stone-light">Hỗ trợ .docx, .txt · tối đa 4MB</div>
              </label>
            ) : (
              <div>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={
                    'Dán toàn bộ bản thảo vào đây… Dùng "Chương 1", "Chương 2" ở đầu mỗi chương để hệ thống tự tách.'
                  }
                  className="h-[220px] w-full resize-none rounded-[10px] border border-border-light p-3.5 text-sm leading-[1.7] text-ink outline-none focus:border-brand-ink"
                />
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    onClick={handlePasteContinue}
                    disabled={!pastedText.trim()}
                    className="w-auto px-5"
                  >
                    Tiếp tục
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setStep("input")}
              className="mb-3.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-ink-dark"
            >
              <ArrowLeftIcon size={13} /> Đổi nguồn nhập
            </button>

            <div className="mb-4 flex items-center gap-2.5 rounded-[10px] border border-cream-border bg-white px-3.5 py-2.5">
              <FileTextIcon size={18} color="var(--color-brand-gold)" />
              <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-brand-ink">
                {sourceLabel}
              </div>
              <div className="shrink-0 text-xs font-medium text-stone-light">
                {detected.length} chương phát hiện
              </div>
            </div>

            {fellBackToSingle && (
              <div className="mb-3.5">
                <Alert tone="info">
                  Không tìm thấy mốc &quot;Chương N&quot; trong văn bản — đang xem là 1 chương duy nhất. Thử đổi
                  cách tách bên dưới.
                </Alert>
              </div>
            )}
            {truncated && (
              <div className="mb-3.5">
                <Alert tone="info">
                  Phát hiện hơn 300 chương — chỉ hiển thị và nhập 300 chương đầu.
                </Alert>
              </div>
            )}

            <div className="mb-1.5 text-[13px] font-semibold text-[#5C5650]">Tách chương theo</div>
            <div className="mb-4 flex w-fit gap-1.5 rounded-[9px] border border-cream-border bg-white p-1">
              {SPLIT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSplitMode(opt.id)}
                  className={`rounded-[6px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    splitMode === opt.id ? "bg-info-bg text-brand-ink" : "text-stone-alt"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="mb-4 max-h-[180px] overflow-y-auto rounded-xl border border-cream-border">
              {detected.map((c) => (
                <div
                  key={c.no + c.title}
                  className="flex items-center gap-3 border-b border-[#F2ECE0] px-3.5 py-2.5 last:border-b-0"
                >
                  <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-cream-card-alt text-[11.5px] font-bold text-stone-alt">
                    {c.no}
                  </div>
                  <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-brand-ink">
                    {c.title}
                  </div>
                  <div className="shrink-0 text-xs text-stone-light">
                    {c.words.toLocaleString("vi-VN")} chữ
                  </div>
                </div>
              ))}
              {detected.length === 0 && (
                <div className="px-3.5 py-4 text-center text-sm text-stone-light">
                  Không có nội dung để nhập.
                </div>
              )}
            </div>

            {!destinationBookId && (
              <>
                <div className="mb-1.5 text-[13px] font-semibold text-[#5C5650]">Nhập vào</div>
                <div className="mb-3.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDestinationMode("new")}
                    className={`flex-1 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                      destinationMode === "new"
                        ? "bg-brand-ink text-white"
                        : "border border-cream-border bg-white text-stone-alt"
                    }`}
                  >
                    Truyện mới
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestinationMode("existing")}
                    disabled={books.length === 0}
                    className={`flex-1 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                      destinationMode === "existing"
                        ? "bg-brand-ink text-white"
                        : "border border-cream-border bg-white text-stone-alt"
                    }`}
                  >
                    Truyện có sẵn
                  </button>
                </div>

                {destinationMode === "new" ? (
                  <div className="mb-5">
                    <Field
                      label="Tên tác phẩm"
                      value={newBookTitle}
                      onChange={(e) => setNewBookTitle(e.target.value)}
                      placeholder={detected[0]?.title || "Bản thảo mới"}
                    />
                  </div>
                ) : (
                  <div className="mb-5 flex max-h-[150px] flex-col gap-0.5 overflow-y-auto rounded-[10px] border border-border-light p-1">
                    {books.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setExistingBookId(b.id)}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${
                          existingBookId === b.id ? "bg-cream-card text-brand-ink" : "text-stone-dark"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full border-[1.5px] border-brand-gold ${
                            existingBookId === b.id ? "bg-brand-gold" : "bg-transparent"
                          }`}
                        />
                        <span className="min-w-0 flex-1 truncate">{b.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[9px] border border-cream-border px-4 py-2.5 text-[13.5px] font-semibold text-stone-alt"
              >
                Hủy
              </button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={!detected.length || submitting}
                className="w-auto px-5"
              >
                {submitting ? "Đang nhập…" : `Nhập ${detected.length} chương`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
