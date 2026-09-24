import { mobileApi } from './api';
import { requireSupabase } from './supabase';

export type OrderStatus = 'draft' | 'brief_confirmed' | 'deposit_paid' | 'in_progress' | 'delivered' | 'completed' | 'cancelled' | 'disputed';
export type Order = {
  id: string; code: string; status: OrderStatus; buyer_id: string; seller_id: string; listing_id: string;
  usage_scope: string | null; scope_note: string | null; brief: string; brief_locked_at: string | null;
  price: number; paid: number; deposit_pct: number; revisions_max: number; revisions_used: number;
  draft_number: number; drafts_approved: number; delivered_at: string | null; auto_confirm_at: string | null;
  completed_at: string | null; cancelled_at: string | null; created_at: string; book_id: string | null;
  service_listings: { name: string; service_type: string } | null;
  role: 'buyer' | 'seller';
  counterpart: { id: string; nickname: string | null; username: string | null };
};
export type OrderEvent = { id: string; event_type: string; actor_id: string | null; payload: Record<string, unknown>; created_at: string };
export type OrderAsset = { kind: 'illustration_preview' | 'voice_original' | string; url: string };

export function listOrders(userId: string, withUserId?: string) {
  const query = withUserId ? `?withUserId=${encodeURIComponent(withUserId)}` : '';
  return mobileApi<{ orders: Order[] }>(`orders${query}`, userId).then(r => r.orders);
}
export function getOrder(userId: string, orderId: string) {
  return mobileApi<{ order: Order }>(`orders/${encodeURIComponent(orderId)}`, userId).then(r => r.order);
}
export function getOrderEvents(userId: string, orderId: string) {
  return mobileApi<{ events: OrderEvent[] }>(`orders/${encodeURIComponent(orderId)}/events`, userId).then(r => r.events);
}
/** Short-lived signed URLs (15 minutes) — fetch again instead of caching them. */
export function getOrderAssets(userId: string, orderId: string) {
  return mobileApi<{ assets: OrderAsset[] }>(`orders/${encodeURIComponent(orderId)}/asset`, userId).then(r => r.assets);
}

// Same wording as the web's order-card.tsx.
export const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Đang soạn', brief_confirmed: 'Đã duyệt brief', deposit_paid: 'Đã đặt cọc', in_progress: 'Đang thực hiện',
  delivered: 'Đã bàn giao', completed: 'Hoàn tất', cancelled: 'Đã hủy', disputed: 'Đang tranh chấp',
};
export const SCOPE_LABELS: Record<string, string> = {
  personal: 'Cá nhân', commercial_limited: 'Thương mại giới hạn', commercial_full: 'Thương mại toàn phần',
};
export const SERVICE_LABELS: Record<string, string> = { illustration: 'Minh họa', voice: 'Thu âm', ghostwriting: 'Viết thuê' };
const EVENT_LABELS: Record<string, string> = {
  order_created: 'Tạo đơn hàng', scope_selected: 'Chọn phạm vi sử dụng', brief_confirmed: 'Chốt brief',
  payment_received: 'Nhận thanh toán', deposit_paid: 'Đã đặt cọc', work_started: 'Bắt đầu thực hiện',
  draft_submitted: 'Gửi bản nháp', draft_approved: 'Duyệt bản nháp', revision_requested: 'Yêu cầu chỉnh sửa',
  delivered: 'Bàn giao sản phẩm', buyer_confirmed: 'Người mua xác nhận nhận hàng', auto_confirmed_by_system: 'Hệ thống tự xác nhận',
  book_attached: 'Gắn truyện vào đơn', file_request_created: 'Yêu cầu tệp gốc', file_request_agreed: 'Đồng ý gửi tệp gốc',
  file_request_declined: 'Từ chối gửi tệp gốc', cancel_requested: 'Yêu cầu hủy đơn', cancel_declined: 'Từ chối hủy đơn',
  cancelled: 'Đã hủy đơn', reminder_sent: 'Nhắc phản hồi', lost_contact_reported: 'Báo cáo mất liên lạc',
  dispute_opened: 'Mở tranh chấp', disputed: 'Đang tranh chấp', author_name_agreement_initiated: 'Đề xuất thỏa thuận tên tác giả',
  author_name_agreement_confirmed: 'Xác nhận thỏa thuận tên tác giả', author_name_agreement_finalized: 'Hoàn tất thỏa thuận tên tác giả',
};
export function eventLabel(type: string) { return EVENT_LABELS[type] ?? 'Cập nhật đơn hàng'; }

export function depositAmount(order: Pick<Order, 'price' | 'deposit_pct'>) {
  // Same rounding as the web card and record_order_payment() (migrations/20260924_enforce_order_payment_amounts.sql).
  return Math.round((order.price * order.deposit_pct) / 100);
}
/** What the buyer still has to pay, and when — payment itself happens on the web for now. */
export function paymentDue(order: Order) {
  if (order.role !== 'buyer') return null;
  if (order.status === 'brief_confirmed') return { label: 'Tiền cọc', amount: depositAmount(order) };
  if ((order.status === 'deposit_paid' || order.status === 'in_progress') && order.price > order.paid)
    return { label: 'Phần còn lại', amount: order.price - order.paid };
  return null;
}
export function partyName(order: Pick<Order, 'counterpart'>) {
  return order.counterpart.nickname || (order.counterpart.username ? `@${order.counterpart.username}` : 'Người dùng Vịnh');
}
export function formatDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type FileRequest = { id: string; requested_by: string; status: 'pending' | 'agreed' | 'declined'; created_at: string };
export type CancelRequest = { id: string; requested_by: string; cancelled_by: 'buyer' | 'seller'; refund_amount: number; status: string };
export type OrderAction = 'set-scope' | 'save-brief' | 'confirm-brief' | 'submit-draft' | 'approve-draft' | 'request-revision'
  | 'deliver' | 'confirm-received' | 'attach-book' | 'request-original' | 'resolve-original'
  | 'request-cancel' | 'resolve-cancel' | 'send-reminder' | 'report-lost-contact' | 'open-dispute'
  | 'start-author-agreement' | 'confirm-author-agreement';

/** Every order change goes through the web routes and their atomic RPCs (see /api/mobile/orders/[orderId]/action). */
export function orderAction(userId: string, orderId: string, action: OrderAction, fields: Record<string, unknown> = {}) {
  // Delivering makes the server download, watermark and re-store the file, which can take a while.
  return mobileApi<{ order?: Order; request?: FileRequest; agreement?: AuthorAgreement }>(`orders/${encodeURIComponent(orderId)}/action`, userId, { action, ...fields },
    { timeoutMs: action === 'deliver' ? 120000 : undefined });
}
export function getOrderRequests(userId: string, orderId: string) {
  return mobileApi<{ fileRequest: FileRequest | null; cancelRequest: CancelRequest | null }>(`orders/${encodeURIComponent(orderId)}/requests`, userId);
}
/** Only works once both parties agreed to release the original file; the link lasts 15 minutes. */
export async function getOriginalFileUrl(userId: string, orderId: string) {
  const { url } = await mobileApi<{ url: string | null }>(`orders/${encodeURIComponent(orderId)}/original-file`, userId);
  if (!url) throw new Error('Chưa lấy được link tệp gốc. Vui lòng thử lại.');
  return url;
}
export function getSellerBooks(userId: string, orderId: string) {
  return mobileApi<{ books: { id: string; title: string }[] }>(`orders/${encodeURIComponent(orderId)}/books`, userId).then(r => r.books);
}

export type DeliverFile = { uri: string; name: string; mimeType: string; size?: number };
export const DELIVER_MAX_BYTES = 30 * 1024 * 1024;
/** Upload straight to private Storage through a signed URL (avoids the backend body limit), then deliver. */
export async function deliverWithFile(userId: string, orderId: string, file: DeliverFile) {
  if (file.size && file.size > DELIVER_MAX_BYTES) throw new Error('Tệp bàn giao tối đa 30 MB.');
  const target = await mobileApi<{ path: string; token: string }>(`orders/${encodeURIComponent(orderId)}/action`, userId,
    { action: 'deliver-upload-url', contentType: file.mimeType });
  const bytes = await (await fetch(file.uri)).arrayBuffer();
  if (bytes.byteLength > DELIVER_MAX_BYTES) throw new Error('Tệp bàn giao tối đa 30 MB.');
  const { error } = await requireSupabase().storage.from('order-deliverables')
    .uploadToSignedUrl(target.path, target.token, bytes, { contentType: file.mimeType });
  if (error) throw new Error('Tải tệp bàn giao thất bại. Kiểm tra mạng rồi thử lại.');
  return orderAction(userId, orderId, 'deliver', { uploadPath: target.path });
}

export type RefundPreview = { stage: string | null; pct: number; refund_amount: number; seller_amount: number; used_platform_minimum: boolean };
/** Server-computed refund if the caller cancels now (the request itself re-computes it; nothing is trusted from the app). */
export function getCancelPreview(userId: string, orderId: string) {
  return mobileApi<{ preview: RefundPreview }>(`orders/${encodeURIComponent(orderId)}/cancel-preview`, userId).then(r => r.preview);
}
export type LostContactStatus = { eligible: boolean; firstReminderAt: string | null; lastMessageAt: string | null };
export function getLostContact(userId: string, orderId: string) {
  return mobileApi<LostContactStatus>(`orders/${encodeURIComponent(orderId)}/lost-contact`, userId);
}
export type AuthorAgreement = {
  id: string; ghostwriter_id: string; ghostwriter_confirmed_at: string | null; ghostwriter_statement_text: string | null;
  customer_id: string; customer_confirmed_at: string | null; customer_statement_text: string | null;
  author_display_choice: 'customer_name' | 'co_authorship'; ghostwriter_sample_visible: boolean; customer_profile_visible: boolean;
};
export function getAuthorAgreement(userId: string, orderId: string) {
  return mobileApi<{ agreement: AuthorAgreement | null }>(`orders/${encodeURIComponent(orderId)}/author-name-agreement`, userId).then(r => r.agreement);
}
// Same reasons and wording as the web's dispute form (order-card.tsx).
export const DISPUTE_REASONS: [string, string][] = [
  ['not_as_described', 'Sản phẩm không đúng như thỏa thuận'], ['no_delivery', 'Không bàn giao đúng hạn'],
  ['payment_issue', 'Vấn đề thanh toán/hoàn tiền'], ['off_platform', 'Bị yêu cầu giao dịch ngoài nền tảng'], ['other', 'Khác'],
];
