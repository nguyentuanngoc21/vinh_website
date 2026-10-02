"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { FlagIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Button, Field, Modal, Select, Textarea } from "@/components/ui";
import { REPORT_REASONS, type ReportReason } from "@/lib/moderation/content-reports";

/**
 * Nút + hộp thoại báo cáo tác phẩm (trang truyện) hoặc chương (trang đọc).
 * `triggerStyle`: trang đọc truyền màu theo chủ đề đang chọn (sáng/tối/…),
 * cùng cách các nút khác trong reader.tsx dùng `c.hair`/`c.ink`.
 */
export function ReportContentButton({
  bookId,
  chapterId,
  triggerStyle,
}: {
  bookId: string;
  chapterId?: string;
  triggerStyle?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("offensive");
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [sent, setSent] = useState(false);
  const target = chapterId ? "chương" : "tác phẩm";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setLogin(false);
    try {
      const res = await fetch("/api/content-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, chapterId, reason, description, evidenceUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Không thể gửi báo cáo.");
        setLogin(res.status === 401);
      } else setSent(true);
    } catch {
      setError("Không thể kết nối. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError("");
        }}
        style={triggerStyle}
        className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-cream-border px-5 py-2.5 text-sm font-semibold text-stone-dark transition-colors hover:border-brand-ink"
      >
        <FlagIcon /> Báo cáo {target}
      </button>
      <Modal open={open} onClose={() => !pending && setOpen(false)} panelClassName="max-w-lg p-6">
        <h2 className="text-xl font-bold text-brand-ink">Báo cáo {target}</h2>
        {sent ? (
          <div className="mt-4">
            <p role="status" className="text-sm leading-relaxed text-slate">
              Đã gửi báo cáo. Đội ngũ kiểm duyệt sẽ xem xét nội dung bạn cung cấp.
            </p>
            <div className="mt-5 flex justify-end">
              <Button type="button" variant="ghost" size="sm" fullWidth={false} onClick={() => setOpen(false)}>
                Đóng
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-3 grid gap-4">
            <p className="text-sm leading-relaxed text-stone-alt">
              Thông tin người báo cáo chỉ được dùng để kiểm duyệt. Vui lòng mô tả đoạn nội dung cần xem xét.
            </p>
            <Select label="Lý do" size="sm" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              {Object.entries(REPORT_REASONS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
            <Textarea
              label="Mô tả"
              size="sm"
              required
              minLength={10}
              maxLength={3000}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                reason === "age_rating"
                  ? "Nhãn hiện tại, độ tuổi đề xuất và đoạn nội dung không phù hợp…"
                  : reason === "plagiarism"
                    ? "Tên tác phẩm gốc, tác giả và đoạn nội dung tương đồng…"
                    : "Nêu chương, đoạn văn và nội dung phản cảm…"
              }
            />
            <Field
              label="Nguồn đối chiếu (không bắt buộc)"
              size="sm"
              type="url"
              maxLength={2000}
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://…"
            />
            {error && <Alert tone="error">{error}</Alert>}
            {login && (
              <Link
                className="text-sm font-semibold text-brand-gold-dark underline"
                href={`/dang-nhap?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname)}`}
              >
                Đăng nhập để tiếp tục
              </Link>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" fullWidth={false} disabled={pending} onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <Button type="submit" variant="dark" size="sm" fullWidth={false} disabled={pending}>
                {pending ? "Đang gửi…" : "Gửi báo cáo"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
