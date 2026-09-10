import { LoadingScreen } from "@/components/ui/loading-screen";

/**
 * File đặc biệt của Next App Router — tự hiện khi chuyển sang 1 route
 * (hoặc route con) đang chờ Server Component/data render xong (Suspense
 * boundary Next tự bọc quanh mỗi segment). Đặt ở gốc app/ nên áp dụng
 * cho MỌI trang chưa có loading.tsx riêng — không cần import/gọi tay ở
 * đâu cả.
 */
export default function Loading() {
  return <LoadingScreen />;
}
