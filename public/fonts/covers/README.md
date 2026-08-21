# Font vendor cho bìa tự động

Dùng bởi `src/lib/covers/fonts.ts` cho nhánh xuất PNG (`?format=png` ở
`src/app/api/books/[id]/cover/route.ts`, qua `next/og`'s `ImageResponse`).
`ImageResponse` (Satori) cần buffer file font thật, không hiểu được cách
`next/font/google` nạp font qua CSS — nên phải vendor riêng, tách biệt
khỏi 2 font Be Vietnam Pro/Lora đã dùng qua `next/font/google` ở phần còn
lại của site (`src/app/layout.tsx`, các trang dùng `Lora`).

Chỉ vendor đúng 4 weight thực sự dùng trong
`src/lib/covers/genre-styles.ts` — không phải toàn bộ 6-8 weight mỗi
family có, để không tăng kích thước repo vô ích:

| File | Family | Weight | Nguồn |
|---|---|---|---|
| `BeVietnamPro-700.ttf` | Be Vietnam Pro | 700 (Bold) | Google Fonts |
| `BeVietnamPro-800.ttf` | Be Vietnam Pro | 800 (ExtraBold) | Google Fonts |
| `Lora-600.ttf` | Lora | 600 (SemiBold) | Google Fonts |
| `Lora-700.ttf` | Lora | 700 (Bold) | Google Fonts |

Tải qua `https://fonts.google.com/download/list?family=<tên font>` — API
nội bộ trang tải font của Google, trả file TTF đầy đủ glyph (bản dùng cho
thiết kế/nhúng, KHÔNG phải bản cắt theo `unicode-range` cho web như CSS2
API `fonts.googleapis.com/css2` trả về — bản CSS2 tách riêng subset
`vietnamese`/`latin`/`latin-ext` thành nhiều file khác nhau, mỗi file
thiếu 1 phần ký tự, không dùng được cho Satori vì Satori cần 1 buffer duy
nhất chứa đủ toàn bộ ký tự chữ thường lẫn có dấu).

**License: SIL Open Font License 1.1 (OFL)** — cả 2 family đều là Google
Fonts chính thức, cùng nguồn dữ liệu font đã dùng qua `next/font/google`
ở nơi khác trong repo (`src/app/layout.tsx` dùng Be Vietnam Pro,
`Lora({...})` lặp lại ở ~15 trang) — không phải font mới chưa xác nhận
license. Toàn văn OFL: https://openfontlicense.org — cho phép dùng
thương mại tự do, chỉ không được bán riêng bộ font.

Cập nhật font: xoá 4 file `.ttf`, lấy URL mới qua
`https://fonts.google.com/download/list?family=<tên font>` (JSON, bỏ 4
ký tự `)]}'` ở đầu response trước khi parse — chống JSON hijacking, không
phải lỗi), tìm đúng weight trong `manifest.fileRefs[].filename`, tải lại
theo `url` tương ứng.
