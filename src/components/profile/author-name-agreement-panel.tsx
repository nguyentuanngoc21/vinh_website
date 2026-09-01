"use client";

import { useEffect, useState } from "react";
import { SealCheckIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, Checkbox } from "@/components/ui";

type Agreement = {
  id: string;
  ghostwriter_id: string;
  ghostwriter_confirmed_at: string | null;
  ghostwriter_statement_text: string | null;
  customer_id: string;
  customer_confirmed_at: string | null;
  customer_statement_text: string | null;
  author_display_choice: "customer_name" | "co_authorship";
  ghostwriter_sample_visible: boolean;
  customer_profile_visible: boolean;
};

type AuthorNameAgreementPanelProps = { orderId: string; viewerId: string };

/**
 * Đứng tên tác giả thay (Module 5 đặc tả) — chỉ hiện sau khi đơn
 * ghostwriting đã delivered/completed, TÁCH RIÊNG khỏi bước "Bắt đầu giao
 * dịch" (đúng yêu cầu đặc tả). 3 ý pháp lý ở màn hình cảnh báo do người
 * yêu cầu cung cấp nguyên văn (không tự viết) — hiển thị trước khi cho
 * chọn author_display_choice/xác nhận.
 */
export function AuthorNameAgreementPanel({ orderId, viewerId }: AuthorNameAgreementPanelProps) {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [choice, setChoice] = useState<"customer_name" | "co_authorship">("customer_name");
  const [ghostwriterVisible, setGhostwriterVisible] = useState(false);
  const [customerVisible, setCustomerVisible] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/orders/${orderId}/author-name-agreement`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setAgreement(data?.agreement ?? null);
        setLoaded(true);
      });
  }, [orderId]);

  const start = async () => {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${orderId}/author-name-agreement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        choice,
        ghostwriterSampleVisible: ghostwriterVisible,
        customerProfileVisible: customerVisible,
      }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không khởi tạo được thỏa thuận.");
      return;
    }
    setAgreement(data.agreement);
  };

  const confirm = async () => {
    if (!agreement) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/orders/${orderId}/author-name-agreement/${agreement.id}`, { method: "PATCH" });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError((data && data.error) || "Không xác nhận được.");
      return;
    }
    setAgreement(data.agreement);
  };

  if (!loaded) return null;

  const myPendingConfirm =
    agreement &&
    ((viewerId === agreement.ghostwriter_id && !agreement.ghostwriter_confirmed_at) ||
      (viewerId === agreement.customer_id && !agreement.customer_confirmed_at));
  const bothConfirmed = agreement?.ghostwriter_confirmed_at && agreement?.customer_confirmed_at;
  const myStatement =
    agreement && viewerId === agreement.ghostwriter_id ? agreement.ghostwriter_statement_text : agreement?.customer_statement_text;

  return (
    <div className="mt-3 rounded-xl border border-cream bg-[#FBFAF8] p-4">
      <div className="flex items-center gap-2 text-[13.5px] font-bold text-brand-ink">
        <SealCheckIcon size={16} /> Đứng tên tác giả thay
      </div>

      {error && (
        <div className="mt-2">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {!agreement && (
        <div className="mt-2.5">
          <div className="rounded-lg border border-[#F0D9B5] bg-[#FDF3E7] p-3.5 text-xs leading-[1.7] text-[#5c4a1e]">
            <div className="mb-1.5 font-bold text-[#7a5a12]">Trước khi xác nhận, cả hai bên cần hiểu rõ:</div>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>
                Đây là thỏa thuận thực tế giữa hai bên, không phải chuyển nhượng quyền đứng tên theo nghĩa pháp lý tuyệt đối — vì
                luật không cho phép chuyển nhượng quyền này.
              </li>
              <li>
                Người viết hộ vẫn giữ khả năng khẳng định lại quyền tác giả của mình sau này theo pháp luật, bất kể đã thỏa thuận
                với khách hàng.
              </li>
              <li>
                Nền tảng ghi nhận đây là thỏa thuận tự nguyện tại thời điểm xác nhận, không đảm bảo hiệu lực tuyệt đối trước pháp
                luật; khuyến nghị hai bên cân nhắc kỹ, đặc biệt với tác phẩm có khả năng phát sinh giá trị lớn sau này.
              </li>
            </ol>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                checked={choice === "customer_name"}
                onChange={() => setChoice("customer_name")}
              />
              Khách hàng đứng tên tác giả duy nhất
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" checked={choice === "co_authorship"} onChange={() => setChoice("co_authorship")} />
              Đồng sáng tác — hiển thị cả 2 tên
            </label>
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            <Checkbox checked={ghostwriterVisible} onChange={() => setGhostwriterVisible((v) => !v)}>
              Hiển thị tác phẩm này trong danh sách sample của tôi (người viết hộ)
            </Checkbox>
            <Checkbox checked={customerVisible} onChange={() => setCustomerVisible((v) => !v)}>
              Hiển thị tác phẩm này ở hồ sơ khách hàng
            </Checkbox>
            <Checkbox checked={acknowledged} onChange={() => setAcknowledged((v) => !v)}>
              Tôi đã đọc và hiểu hệ quả pháp lý ở trên
            </Checkbox>
          </div>
          <button
            type="button"
            disabled={pending || !acknowledged}
            onClick={start}
            className="mt-3 cursor-pointer rounded-full bg-brand-gold px-4 py-2 text-xs font-bold text-brand-ink disabled:cursor-default disabled:opacity-60"
          >
            Bắt đầu thỏa thuận
          </button>
        </div>
      )}

      {agreement && !bothConfirmed && (
        <div className="mt-2.5">
          {myPendingConfirm ? (
            <>
              <div className="rounded-lg border border-cream bg-white p-3 text-xs leading-[1.6] text-ink">{myStatement}</div>
              <button
                type="button"
                disabled={pending}
                onClick={confirm}
                className="mt-2.5 cursor-pointer rounded-full bg-brand-gold px-4 py-2 text-xs font-bold text-brand-ink disabled:opacity-60"
              >
                Tôi đồng ý
              </button>
            </>
          ) : (
            <div className="text-xs text-stone">Đang chờ bên còn lại xác nhận.</div>
          )}
        </div>
      )}

      {bothConfirmed && (
        <div className="mt-2.5 text-xs font-semibold text-[#1f5738]">
          Đã hoàn tất — {agreement?.author_display_choice === "customer_name" ? "khách hàng đứng tên tác giả" : "cả 2 cùng đứng tên đồng tác giả"}.
        </div>
      )}
    </div>
  );
}
