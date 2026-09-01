"use client";

import { useEffect, useState } from "react";
import { WalletIcon, ClockCountdownIcon, CheckCircleIcon, WarningOctagonIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, Alert } from "@/components/ui";
import { AuthorNameAgreementPanel } from "@/components/profile/author-name-agreement-panel";

export type OrderRow = {
  id: string;
  code: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  usage_scope: string | null;
  scope_note: string | null;
  brief: string;
  brief_locked_at: string | null;
  price: number;
  paid: number;
  deposit_pct: number;
  revisions_max: number;
  revisions_used: number;
  draft_number: number;
  drafts_approved: number;
  delivered_at: string | null;
  auto_confirm_at: string | null;
  completed_at: string | null;
  book_id: string | null;
  service_listings: { name: string; service_type: string } | null;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Đang soạn",
  brief_confirmed: "Đã duyệt brief",
  deposit_paid: "Đã đặt cọc",
  in_progress: "Đang thực hiện",
  delivered: "Đã bàn giao",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  disputed: "Đang tranh chấp",
};

const SCOPE_OPTIONS = [
  { value: "personal", label: "Cá nhân" },
  { value: "commercial_limited", label: "Thương mại giới hạn" },
  { value: "commercial_full", label: "Thương mại toàn phần" },
];

function formatVnd(n: number): string {
  return n.toLocaleString("vi-VN") + "₫";
}

type OrderCardProps = { order: OrderRow; viewerId: string; onChanged: (order: OrderRow) => void };

/**
 * Thẻ đơn hàng trong Hội thoại — máy trạng thái thật, gọi các route
 * src/app/api/orders/:orderId/*. Chỉ render hành động hợp lệ với đúng vai
 * trò (buyer/seller) và đúng trạng thái hiện tại — không tự đoán, mọi
 * validate cuối cùng vẫn nằm ở các hàm SQL (migrations/
 * 20260901_add_order_system_core.sql), lỗi trả về hiện qua `error`.
 *
 * CHƯA có ở phase này (sẽ thêm ở các phase sau): hủy đơn + hoàn tiền, mở
 * tranh chấp, báo giá phát sinh.
 */
export function OrderCard({ order, viewerId, onChanged }: OrderCardProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefDraft, setBriefDraft] = useState(order.brief);
  const [scopeNote, setScopeNote] = useState(order.scope_note ?? "");
  const [assets, setAssets] = useState<{ kind: string; url: string }[]>([]);
  const [fileRequest, setFileRequest] = useState<{ id: string; status: string; requested_by: string } | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [myBooks, setMyBooks] = useState<{ id: string; title: string }[]>([]);
  const [pickedBookId, setPickedBookId] = useState("");
  const [cancelPreview, setCancelPreview] = useState<{ refund_amount: number; pct: number; used_platform_minimum: boolean } | null>(
    null
  );
  const [cancelRequest, setCancelRequest] = useState<{ id: string; requested_by: string; refund_amount: number } | null>(null);
  const [lostContact, setLostContact] = useState<{ eligible: boolean; firstReminderAt: string | null } | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDescription, setDisputeDescription] = useState("");

  const isOpenOrder = !["completed", "cancelled", "disputed"].includes(order.status);

  const isBuyer = viewerId === order.buyer_id;
  const isSeller = viewerId === order.seller_id;
  const serviceType = order.service_listings?.service_type;
  const needsDeliverFile = serviceType === "illustration" || serviceType === "voice";
  const needsBookAttach = serviceType === "ghostwriting" && isSeller && !order.book_id && isOpenOrder;

  useEffect(() => {
    if (!needsBookAttach) return;
    fetch("/api/authoring/books")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMyBooks(data?.books ?? []));
  }, [needsBookAttach]);

  const attachBook = async () => {
    if (!pickedBookId) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/attach-book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: pickedBookId }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không gắn được truyện.");
      return;
    }
    onChanged(data.order);
  };

  useEffect(() => {
    if (order.status !== "delivered" && order.status !== "completed") return;
    fetch(`/api/orders/${order.id}/asset`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAssets(data?.assets ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.status]);

  useEffect(() => {
    if (!isOpenOrder) return;
    fetch(`/api/orders/${order.id}/lost-contact`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setLostContact(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.status]);

  const call = async (path: string, method: string, body?: Record<string, unknown>) => {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${order.id}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Thao tác thất bại.");
      return;
    }
    onChanged(data.order);
  };

  const deliverWithFile = async (file: File) => {
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/orders/${order.id}/deliver`, { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Bàn giao thất bại.");
      return;
    }
    onChanged(data.order);
  };

  const requestOriginal = async () => {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/original-file`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không gửi được yêu cầu.");
      return;
    }
    setFileRequest(data.request);
  };

  const resolveOriginal = async (agree: boolean) => {
    if (!fileRequest) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/original-file/${fileRequest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agree }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không xử lý được yêu cầu.");
      return;
    }
    setFileRequest(data.request);
    if (agree) {
      const r = await fetch(`/api/orders/${order.id}/original-file`);
      const d = await r.json().catch(() => null);
      if (r.ok) setOriginalUrl(d?.url ?? null);
    }
  };

  const previewCancel = async () => {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/cancel`);
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không xem trước được số tiền hoàn.");
      return;
    }
    setCancelPreview(data.preview);
  };

  const confirmCancel = async () => {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không gửi được yêu cầu hủy.");
      return;
    }
    setCancelPreview(null);
    setCancelRequest(data.request);
  };

  const resolveCancel = async (agree: boolean) => {
    if (!cancelRequest) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/cancel/${cancelRequest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agree }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không xử lý được yêu cầu hủy.");
      return;
    }
    setCancelRequest(null);
    onChanged(data.order);
  };

  const sendReminder = async () => {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/lost-contact/reminder`, { method: "POST" });
    setPending(false);
    if (!res.ok) {
      setError("Không gửi được nhắc nhở.");
      return;
    }
    setLostContact((prev) => (prev ? { ...prev, firstReminderAt: prev.firstReminderAt ?? new Date().toISOString() } : prev));
  };

  const reportLostContact = async () => {
    if (!window.confirm("Báo cáo mất liên lạc cho đơn này? Nền tảng sẽ xem xét.")) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/lost-contact/report`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không gửi được báo cáo.");
      return;
    }
    setError("Đã gửi báo cáo mất liên lạc.");
  };

  const submitDispute = async () => {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/dispute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasonCategory: disputeReason, description: disputeDescription }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không mở được tranh chấp.");
      return;
    }
    setDisputeOpen(false);
    onChanged({ ...order, status: "disputed" });
  };

  const depositAmount = Math.round((order.price * order.deposit_pct) / 100);
  const remaining = order.price - order.paid;

  return (
    <div style={{ background: "#FBFAF8" }} className="border-b border-[#f0f0ef] px-[18px] py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#EEF2F4] px-2.5 py-1 text-[11px] font-bold text-[#2C5870]">
          {order.code}
        </span>
        <span className="rounded-full bg-brand-ink px-2.5 py-1 text-[11px] font-bold text-white">
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>
      <div className="mt-2 text-[14.5px] font-bold text-brand-ink">
        {order.service_listings?.name || "Đơn dịch vụ"}
      </div>
      <div className="mt-0.5 text-xs text-stone">
        {formatVnd(order.price)} · đã thanh toán {formatVnd(order.paid)}
      </div>

      {error && (
        <div className="mt-2.5">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {needsBookAttach && (
        <div className="mt-3 rounded-lg border border-dashed border-cream bg-white p-3">
          <div className="text-xs font-semibold text-ink">Gắn truyện đang viết vào đơn này</div>
          <div className="mt-0.5 text-xs text-stone-light">Khách hàng sẽ được cấp quyền xem bản thảo ngay sau khi gắn.</div>
          <div className="mt-2 flex gap-2">
            <select
              value={pickedBookId}
              onChange={(e) => setPickedBookId(e.target.value)}
              className="flex-1 rounded-lg border border-cream px-3 py-2 text-sm outline-none focus:border-brand-gold"
            >
              <option value="">Chọn truyện…</option>
              {myBooks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
            <Button type="button" disabled={pending || !pickedBookId} onClick={attachBook} className="rounded-lg px-4 py-2 text-xs font-semibold">
              Gắn
            </Button>
          </div>
        </div>
      )}

      {/* draft: buyer chọn phạm vi quyền sử dụng trước, rồi soạn/duyệt brief */}
      {order.status === "draft" && isBuyer && !order.usage_scope && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-ink">Chọn phạm vi quyền sử dụng</div>
          <input
            value={scopeNote}
            onChange={(e) => setScopeNote(e.target.value)}
            placeholder="Mô tả mục đích sử dụng thương mại (bắt buộc nếu chọn Thương mại giới hạn)"
            className="mt-1.5 w-full rounded-lg border border-cream px-3 py-2 text-xs outline-none focus:border-brand-gold"
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SCOPE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={pending}
                onClick={() =>
                  call("/scope", "POST", {
                    usageScope: o.value,
                    scopeNote: o.value === "commercial_limited" ? scopeNote : null,
                  })
                }
                className="cursor-pointer rounded-full border border-cream px-3 py-1.5 text-xs font-medium text-ink disabled:cursor-default disabled:opacity-60"
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {order.status === "draft" && isBuyer && order.usage_scope && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-ink">Brief yêu cầu</div>
          <textarea
            value={briefDraft}
            onChange={(e) => setBriefDraft(e.target.value)}
            onBlur={() => briefDraft !== order.brief && call("/brief", "PATCH", { brief: briefDraft })}
            rows={3}
            placeholder="Mô tả yêu cầu, tông màu, hạn mong muốn…"
            className="mt-1.5 w-full resize-y rounded-lg border border-cream px-3 py-2 text-sm outline-none focus:border-brand-gold"
          />
          <Button
            type="button"
            disabled={pending || !briefDraft.trim()}
            onClick={() => call("/brief", "POST")}
            className="mt-2 rounded-lg px-4 py-2 text-xs font-semibold"
          >
            Duyệt brief
          </Button>
        </div>
      )}

      {order.status === "brief_confirmed" && isBuyer && (
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() => call("/deposit", "POST", { amount: depositAmount })}
            className="rounded-full px-4 py-2 text-xs font-bold"
          >
            <WalletIcon size={14} className="mr-1 inline" /> Đặt cọc {formatVnd(depositAmount)}
          </Button>
        </div>
      )}

      {(order.status === "deposit_paid" || order.status === "in_progress") && remaining > 0 && isBuyer && (
        <div className="mt-3">
          <Button
            type="button"
            disabled={pending}
            onClick={() => call("/deposit", "POST", { amount: remaining })}
            className="rounded-full px-4 py-2 text-xs font-bold"
          >
            Thanh toán phần còn lại {formatVnd(remaining)}
          </Button>
        </div>
      )}

      {order.status === "in_progress" && isSeller && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() => call("/draft", "POST", { asset: {} })}
            className="rounded-lg px-4 py-2 text-xs font-semibold"
          >
            Gửi bản nháp
          </Button>
          {needsDeliverFile ? (
            <label className="cursor-pointer rounded-lg border border-brand-ink px-4 py-2 text-xs font-semibold text-brand-ink">
              {pending ? "Đang xử lý…" : "Đánh dấu đã bàn giao"}
              <input
                type="file"
                accept={order.service_listings?.service_type === "voice" ? "audio/mpeg,audio/wav" : "image/jpeg,image/png,image/webp"}
                className="hidden"
                disabled={pending}
                onChange={(e) => e.target.files?.[0] && deliverWithFile(e.target.files[0])}
              />
            </label>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => call("/deliver", "POST", { asset: {} })}
              className="cursor-pointer rounded-lg border border-brand-ink px-4 py-2 text-xs font-semibold text-brand-ink disabled:cursor-default disabled:opacity-60"
            >
              Đánh dấu đã bàn giao
            </button>
          )}
        </div>
      )}

      {order.status === "in_progress" && isBuyer && order.draft_number > order.drafts_approved && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="text-xs text-stone">
            Bản nháp #{order.draft_number} · còn {order.revisions_max - order.revisions_used} lần sửa
          </div>
          <Button
            type="button"
            disabled={pending}
            onClick={() => call("/draft/approve", "POST")}
            className="rounded-lg px-4 py-2 text-xs font-bold"
          >
            Duyệt bản nháp
          </Button>
          {order.revisions_used < order.revisions_max && (
            <button
              type="button"
              disabled={pending}
              onClick={() => call("/draft/revise", "POST", {})}
              className="cursor-pointer rounded-lg border border-brand-ink px-4 py-2 text-xs font-semibold text-brand-ink disabled:cursor-default disabled:opacity-60"
            >
              Yêu cầu sửa
            </button>
          )}
        </div>
      )}

      {order.status === "delivered" && (
        <div className="mt-3">
          {order.auto_confirm_at && (
            <div className="mb-2 flex items-center gap-1.5 text-xs text-stone">
              <ClockCountdownIcon size={14} /> Tự động xác nhận vào{" "}
              {new Date(order.auto_confirm_at).toLocaleString("vi-VN")} nếu bạn không thao tác.
            </div>
          )}
          {isBuyer && (
            <Button
              type="button"
              disabled={pending}
              onClick={() => call("/confirm", "POST")}
              className="rounded-full px-4 py-2 text-xs font-bold"
            >
              Xác nhận đã nhận
            </Button>
          )}
        </div>
      )}

      {order.status === "completed" && (
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#1f5738]">
          <CheckCircleIcon weight="fill" size={16} className="text-[#2F7A4F]" /> Đơn hàng đã hoàn tất.
        </div>
      )}

      {order.status === "cancelled" && (
        <div className="mt-3 text-xs font-semibold text-[#B02A37]">Đơn hàng đã hủy.</div>
      )}

      {order.status === "disputed" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#F3C3C3] bg-[#FDECEC] px-3 py-2.5 text-xs font-semibold text-[#B02A37]">
          <WarningOctagonIcon weight="fill" size={16} /> Đơn hàng đang được Nền tảng xem xét — thao tác tạm khóa.
        </div>
      )}

      {serviceType === "ghostwriting" &&
        order.book_id &&
        (order.status === "delivered" || order.status === "completed") && (
          <AuthorNameAgreementPanel orderId={order.id} viewerId={viewerId} />
        )}

      {(order.status === "delivered" || order.status === "completed") && needsDeliverFile && (
        <div className="mt-3">
          {assets.map((a) =>
            a.kind === "illustration_preview" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={a.kind} src={a.url} alt="Bản bàn giao (đã watermark)" className="max-h-[260px] rounded-lg border border-cream object-contain" />
            ) : (
              <audio key={a.kind} src={a.url} controls className="w-full" />
            )
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!fileRequest && (
              <button
                type="button"
                disabled={pending}
                onClick={requestOriginal}
                className="cursor-pointer rounded-full border border-dashed border-brand-gold px-3.5 py-1.5 text-xs font-semibold text-brand-gold-dark disabled:opacity-60"
              >
                Yêu cầu file gốc (không watermark)
              </button>
            )}
            {fileRequest?.status === "pending" && fileRequest.requested_by !== viewerId && (
              <>
                <span className="text-xs text-stone">Bên kia yêu cầu mở file gốc.</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => resolveOriginal(true)}
                  className="cursor-pointer rounded-full bg-brand-gold px-3.5 py-1.5 text-xs font-bold text-brand-ink disabled:opacity-60"
                >
                  Đồng ý
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => resolveOriginal(false)}
                  className="cursor-pointer rounded-full border border-cream px-3.5 py-1.5 text-xs font-semibold text-stone-dark disabled:opacity-60"
                >
                  Từ chối
                </button>
              </>
            )}
            {fileRequest?.status === "pending" && fileRequest.requested_by === viewerId && (
              <span className="text-xs text-stone">Đang chờ bên kia đồng ý mở file gốc.</span>
            )}
            {originalUrl && (
              <a href={originalUrl} className="text-xs font-semibold text-brand-gold-dark underline">
                Tải file gốc
              </a>
            )}
          </div>
        </div>
      )}

      {isOpenOrder && (
        <div className="mt-3 border-t border-[#f0f0ef] pt-3">
          {cancelRequest ? (
            cancelRequest.requested_by === viewerId ? (
              <div className="text-xs text-stone">
                Đang chờ bên kia đồng ý hủy đơn — hoàn {formatVnd(cancelRequest.refund_amount)} nếu đồng ý.
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-stone">Bên kia yêu cầu hủy đơn — hoàn {formatVnd(cancelRequest.refund_amount)} cho buyer.</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => resolveCancel(true)}
                  className="cursor-pointer rounded-full bg-brand-gold px-3.5 py-1.5 text-xs font-bold text-brand-ink disabled:opacity-60"
                >
                  Đồng ý hủy
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => resolveCancel(false)}
                  className="cursor-pointer rounded-full border border-cream px-3.5 py-1.5 text-xs font-semibold text-stone-dark disabled:opacity-60"
                >
                  Từ chối
                </button>
              </div>
            )
          ) : cancelPreview ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-stone">
                Nếu hủy: buyer được hoàn {formatVnd(cancelPreview.refund_amount)} ({cancelPreview.pct}%)
                {cancelPreview.used_platform_minimum && " — áp dụng mức sàn của Nền tảng, dịch vụ chưa tự khai chính sách hủy/hoàn tiền"}.
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={confirmCancel}
                className="cursor-pointer rounded-full border border-[#F3C3C3] px-3.5 py-1.5 text-xs font-semibold text-[#B02A37] disabled:opacity-60"
              >
                Xác nhận gửi yêu cầu hủy
              </button>
              <button type="button" onClick={() => setCancelPreview(null)} className="cursor-pointer text-xs text-stone">
                Hủy bỏ
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={previewCancel}
                className="cursor-pointer rounded-full border border-[#e6e2dd] px-3.5 py-1.5 text-xs font-medium text-stone-dark disabled:opacity-60"
              >
                Yêu cầu hủy đơn
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={sendReminder}
                className="cursor-pointer text-xs font-medium text-stone-dark disabled:opacity-60"
              >
                Nhắc phản hồi
              </button>
              <button
                type="button"
                disabled={pending || !lostContact?.eligible}
                title={
                  lostContact?.eligible
                    ? undefined
                    : "Cần nhắc phản hồi ít nhất 1 lần, đợi ≥7 ngày kể từ lần nhắc đầu và không ai nhắn thêm trong ≥72 giờ."
                }
                onClick={reportLostContact}
                className="cursor-pointer rounded-full border border-[#F3C3C3] px-3.5 py-1.5 text-xs font-medium text-[#B02A37] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Báo cáo mất liên lạc
              </button>
              {disputeOpen ? (
                <div className="mt-1 flex w-full flex-col gap-2 rounded-lg border border-[#F3C3C3] bg-[#FDECEC] p-3">
                  <select
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className="rounded-lg border border-cream px-3 py-1.5 text-xs outline-none"
                  >
                    <option value="">Chọn lý do…</option>
                    <option value="not_as_described">Sản phẩm không đúng như thỏa thuận</option>
                    <option value="no_delivery">Không bàn giao đúng hạn</option>
                    <option value="payment_issue">Vấn đề thanh toán/hoàn tiền</option>
                    <option value="off_platform">Bị yêu cầu giao dịch ngoài nền tảng</option>
                    <option value="other">Khác</option>
                  </select>
                  <textarea
                    value={disputeDescription}
                    onChange={(e) => setDisputeDescription(e.target.value)}
                    rows={2}
                    placeholder="Mô tả chi tiết…"
                    className="rounded-lg border border-cream px-3 py-2 text-xs outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending || !disputeReason || !disputeDescription.trim()}
                      onClick={submitDispute}
                      className="cursor-pointer rounded-full bg-[#B02A37] px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                    >
                      Gửi tranh chấp
                    </button>
                    <button type="button" onClick={() => setDisputeOpen(false)} className="cursor-pointer text-xs text-stone">
                      Hủy bỏ
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDisputeOpen(true)}
                  className="cursor-pointer rounded-full border border-[#F3C3C3] px-3.5 py-1.5 text-xs font-medium text-[#B02A37]"
                >
                  Mở tranh chấp
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
