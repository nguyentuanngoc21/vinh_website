"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Dùng chung bởi nút "Viết truyện" (auth-cluster.tsx) và "+ Tác phẩm mới"
 * (works-sidebar.tsx) — bấm là tạo sách mới NGAY (không hỏi tên/thể loại
 * qua modal như trước) rồi điều hướng thẳng vào trang viết. Tên mặc định
 * "Truyện mới" do API tự đặt (src/app/api/authoring/books/route.ts) — sửa
 * lại ngay trong publish-panel.tsx sau khi đã vào trang viết.
 */
export function useCreateWork() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const createWork = async () => {
    if (pending) return;
    setPending(true);

    let res: Response;
    try {
      res = await fetch("/api/authoring/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      alert("Không thể kết nối máy chủ. Vui lòng thử lại sau.");
      setPending(false);
      return;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.bookId || !data?.chapterId) {
      alert((data && typeof data.error === "string" && data.error) || "Không tạo được truyện. Vui lòng thử lại.");
      setPending(false);
      return;
    }

    router.push(`/author/${data.bookId}/${data.chapterId}`);
    // Không setPending(false) ở nhánh thành công — trang điều hướng đi
    // ngay, giữ pending=true để nút không nhấp nháy lại "sẵn sàng" trong
    // khoảnh khắc chuyển trang.
  };

  return { createWork, pending };
}
