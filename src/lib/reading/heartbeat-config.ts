/**
 * Nhịp gửi từ reader (P1: 60 giây). Server tự đo khoảng thật giữa 2 nhịp và chỉ cộng khi
 * ≤ 90 giây (record_reading_heartbeat), nên số này chỉ để client hẹn giờ — đổi ở đây phải giữ
 * nhỏ hơn 90 giây. Tách riêng để reader.tsx (client) không kéo theo code server.
 */
export const HEARTBEAT_INTERVAL_MS = 60_000;
