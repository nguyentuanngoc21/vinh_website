import { mobileApi } from './api';

export type OrderStatus = 'draft' | 'brief_confirmed' | 'deposit_paid' | 'in_progress' | 'delivered' | 'completed' | 'cancelled' | 'disputed';
export type Order = {
  id: string; code: string; status: OrderStatus; buyer_id: string; seller_id: string; listing_id: string;
  usage_scope: string | null; scope_note: string | null; brief: string; brief_locked_at: string | null;
  price: number; paid: number; deposit_pct: number; revisions_max: number; revisions_used: number;
  draft_number: number; drafts_approved: number; delivered_at: string | null; auto_confirm_at: string | null;
  completed_at: string | null; cancelled_at: string | null; created_at: string;
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
