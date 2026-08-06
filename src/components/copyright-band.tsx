import { FingerprintIcon, SealCheckIcon, ImageIcon } from "@phosphor-icons/react/dist/ssr";

const FEATURES = [
  {
    icon: FingerprintIcon,
    title: "Watermark động",
    desc: "Tên và ID người đọc dệt mờ vào từng trang, chống chụp màn hình.",
  },
  {
    icon: SealCheckIcon,
    title: "Dấu thứ tự công bố",
    desc: "Mọi bản thảo được đóng dấu thời gian khi xuất bản, làm bằng chứng ưu tiên.",
  },
  {
    icon: ImageIcon,
    title: "Render dạng ảnh",
    desc: "Nội dung hiển thị dưới dạng ảnh, không thể bôi đen sao chép.",
  },
];

const WATERMARK_TEXT =
  "Minh Khôi · @minhkhoi · ID 88245   Vịnh · Bản quyền   ".repeat(20);

export function CopyrightBand() {
  return (
    <section className="p-11">
      <div className="grid grid-cols-1 items-center gap-12 rounded-[22px] bg-ink p-11 text-white lg:grid-cols-[1fr_460px]">
        <div>
          <div className="text-xs font-semibold tracking-[1px] text-brand-gold-light">
            BẢO VỆ BẢN QUYỀN
          </div>
          <h2 className="my-3 text-[34px] font-bold leading-[1.2] tracking-[-.5px]">
            Tác phẩm của bạn, được bảo vệ ba lớp
          </h2>
          <div className="flex max-w-[480px] flex-col gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3.5">
                <f.icon size={24} color="var(--color-brand-gold-light)" className="shrink-0" />
                <div>
                  <div className="text-base font-semibold">{f.title}</div>
                  <div className="text-sm leading-[1.5] text-[#c9c3bd]">
                    {f.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-[#fbf8f0] p-9">
          <div
            aria-hidden="true"
            style={{ inset: "-40% -10%" }}
            className="pointer-events-none absolute rotate-[-22deg]"
          >
            <div
              style={{
                color: "rgba(120,90,60,.08)",
                lineHeight: 4.6,
                wordSpacing: "42px",
                letterSpacing: "2px",
              }}
              className="whitespace-pre-wrap text-base font-semibold"
            >
              {WATERMARK_TEXT}
            </div>
          </div>
          <div className="relative z-[1] mb-4 text-[11px] font-medium tracking-[1px] text-[#8a5a2f]">
            XEM TRƯỚC · WATERMARK ĐỘNG
          </div>
          <div className="relative z-[1] font-[family-name:var(--font-lora)] text-[17px] font-medium leading-[2] text-[#3a322a]">
            Gió từ vịnh thổi vào, mang theo mùi muối và một thứ im lặng rất
            cũ. Bà tôi nói biển nhớ tất cả những ai từng ra đi, và cất giữ tên
            họ dưới đáy nước sâu, nơi không ánh nắng nào với tới.
          </div>
        </div>
      </div>
    </section>
  );
}
