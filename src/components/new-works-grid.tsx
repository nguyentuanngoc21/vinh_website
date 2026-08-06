import { newWorks } from "@/lib/books";

export function NewWorksGrid() {
  return (
    <section className="px-11 pb-2 pt-9">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">Truyện mới cập nhật</h2>
        <span className="cursor-default text-[13px] font-medium text-brand-gold-dark">
          Xem tất cả →
        </span>
      </div>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {newWorks.map((work) => (
          <div
            key={work.title}
            className="cursor-pointer overflow-hidden rounded-xl transition-[transform,box-shadow] duration-[250ms] hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(0,0,0,.12)]"
          >
            <div style={{ background: work.gradient }} className="h-[210px]" />
            <div className="px-1 py-3">
              <div className="text-[15px] font-semibold">{work.title}</div>
              <div className="mt-0.5 text-[13px] text-[#9a9a9a]">
                {work.author}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
