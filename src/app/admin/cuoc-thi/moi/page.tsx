import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui";
import { ContestForm } from "@/components/admin/contests/contest-form";

export const metadata: Metadata = { title: "Tạo cuộc thi · Vịnh Admin" };

export default function NewContestPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Cuộc thi", href: "/admin/cuoc-thi" }, { label: "Tạo cuộc thi" }]} />
      <div className="mb-6 mt-2">
        <h1 className="text-[26px] font-bold text-brand-ink">Tạo cuộc thi</h1>
        <p className="mt-0.5 text-sm text-stone-alt">Cuộc thi mới ở trạng thái nháp — chỉ quản trị viên thấy cho đến khi công bố.</p>
      </div>
      <ContestForm contest={null} />
    </>
  );
}
