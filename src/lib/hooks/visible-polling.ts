/**
 * Gọi `fn` ngay, rồi mỗi `ms` — nhưng BỎ QUA các nhịp khi tab đang ẩn, và
 * gọi bù ngay 1 lần khi người dùng quay lại tab. Dùng cho các vòng poll
 * (tin nhắn, thông báo): tab nền không tốn function invocation/DB query
 * nào. Trả về hàm dọn dẹp cho useEffect.
 */
export function startVisiblePolling(fn: () => unknown, ms: number): () => void {
  const tick = () => {
    if (document.visibilityState === "visible") void fn();
  };
  tick();
  const interval = setInterval(tick, ms);
  document.addEventListener("visibilitychange", tick);
  return () => {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", tick);
  };
}
