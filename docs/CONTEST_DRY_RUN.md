# Chạy thử toàn trình một mùa thi (dev/staging)

Mục đích: đi hết một mùa thi thật ngắn (khoảng 2 giờ 30 phút) trên dev/staging trước cuộc thi thật đầu tiên. Mỗi bước có **Kết quả mong đợi**; chỗ nào lệch thì ghi vào bảng ở mục 5 kèm ảnh chụp màn hình.

**Không chạy trên production.** Không gọi cron trên máy local: mọi chuyển trạng thái trong kịch bản này do admin bấm tay. Chụp hạng ▲▼ thì chạy SQL (mục 3.5).

---

## 1. Chuẩn bị (làm trước, không tính giờ)

### 1.1. Tài khoản

| Vai trò | Số lượng | Yêu cầu |
|---|---|---|
| Admin, đồng thời là giám khảo | 1 (tài khoản của bạn) | `role = admin` hoặc `super_admin` |
| Tác giả | 3: TG1, TG2, TG3 | Đã xác minh email; có ngày sinh nếu thể lệ đặt tuổi tối thiểu |
| Độc giả | 3: DG1, DG2, DG3 | Tài khoản thường |

### 1.2. Truyện

- TG1: truyện **A** (đạt điều kiện) và truyện **X**, cố tình không đạt (vd chưa đăng hoặc thiếu chương).
- TG2: truyện **B**, TG3: truyện **C** (đều đạt).
- Mỗi chương khoảng **100–200 chữ**. Ngưỡng đọc thật = max(30 giây, 40% thời gian đọc ước tính ở 250 chữ/phút), nên chương ngắn cần đọc khoảng 30 giây mới được tính.

### 1.3. Mốc thời gian

Gọi **T** là lúc bạn bắt đầu bước 2.1. Tất cả là giờ Việt Nam. Mọi mốc phải nhập **khi cuộc thi còn là bản nháp**: khung chấm chính thức bị khoá khi đã bắt đầu.

| Trường trong form | Giá trị | Ghi chú |
|---|---|---|
| Mở nhận bài | T + 15 phút | |
| Đóng nhận bài | T + 45 phút | |
| Mở bình chọn | T + 50 phút | Phải ≥ Đóng nhận bài |
| Kết thúc bình chọn | T + 1 giờ 35 phút | |
| Bắt đầu chấm | T + 1 giờ 40 phút | Phải sau Kết thúc bình chọn |
| Kết thúc chấm | T + 2 giờ 10 phút | |
| Dự kiến công bố | T + 2 giờ 15 phút | Chỉ để hiển thị; kết quả công bố lúc admin bấm |
| Khung chấm chính thức: bắt đầu | T + 45 phút | ≥ Đóng nhận bài, phải bao trọn khung bình chọn |
| Khung chấm chính thức: kết thúc | T + 1 giờ 40 phút | "Tính chính thức" chỉ chạy được sau mốc này |

### 1.4. Thể lệ (nhập trong bản nháp; sau bản nháp sẽ bị khoá)

- Slug: `thu-nghiem-mua-1` (các truy vấn dưới đây dùng slug này).
- Bình chọn: **Số ngày tuổi tài khoản tối thiểu = 0** để độc giả mới tạo vẫn bầu được. Giữ **"Phải đọc hết 1 chương"**.
- Điều kiện dự thi: đặt ít nhất 1 điều kiện mà truyện X không đạt (vd số chương tối thiểu).
- Bật "Cho gửi lại sau khi rút bài" để thử luồng rút và gửi lại.
- Giải thưởng: ít nhất 2 giải có tiền (VND), vd "Giải Nhất" và "Giải Nhì". Token = VND / 200.

---

## 2. Truy vấn theo dõi (chỉ đọc, chạy bất cứ lúc nào)

```sql
with c as (select * from public.contests where slug = 'thu-nghiem-mua-1')
select c.status, c.results_published_at,
  (select count(*) from public.contest_submissions s where s.contest_id = c.id)                                          as bai_nop,
  (select count(*) from public.contest_submissions s where s.contest_id = c.id and s.status in ('eligible','shortlisted')) as bai_hop_le,
  (select count(*) from public.contest_submission_snapshots x where x.contest_id = c.id)                                 as ban_chup_bai,
  (select count(*) from public.contest_votes v where v.contest_id = c.id)                                                 as phieu_tho,
  (select coalesce(sum(sc.filtered_votes), 0) from public.contest_submission_scores sc where sc.contest_id = c.id)       as phieu_da_loc,
  (select coalesce(sum(sc.valid_readers), 0) from public.contest_submission_scores sc where sc.contest_id = c.id)        as doc_gia_hop_le,
  (select count(*) from public.contest_fraud_signals f where f.contest_id = c.id)                                         as tin_hieu_gian_lan,
  (select count(*) from public.contest_judge_scorecards j where j.contest_id = c.id and j.finalized_at is not null)       as phieu_cham_da_chot,
  (select count(*) from public.contest_score_runs r where r.contest_id = c.id and r.published_at is not null and r.superseded_at is null) as luot_tinh_cong_bo,
  (select count(*) from public.contest_awards a where a.contest_id = c.id)                                                as giai,
  (select count(*) from public.contest_awards a where a.contest_id = c.id and a.paid_at is not null)                      as giai_da_tra,
  (select count(*) from public.contest_rank_snapshots k where k.contest_id = c.id)                                        as dong_chup_hang,
  (select count(*) from public.contest_passports p where p.contest_id = c.id)                                             as huy_hieu_passport
from c;
```

---

## 3. Kịch bản

Mỗi bước: **làm** → **kết quả mong đợi**. Với mọi trang công khai, xem cả trên điện thoại (hoặc DevTools ở độ rộng 375px).

### 3.1. Bản nháp → Sắp mở nhận bài (T)

1. Admin → `/admin/cuoc-thi` → "Tạo cuộc thi". Nhập theo mục 1.3–1.4 → "Tạo cuộc thi (bản nháp)".
2. Tab "Chấm điểm" → "Cấu hình chấm chung cuộc": giữ tiêu chí mặc định → **"Lưu version mới"**. Nếu thiếu bước này, giám khảo sẽ gặp lỗi `scoring_config_missing`.
3. Tab "Chấm điểm" → "Giám khảo": nhập tên đăng nhập của bạn → "Gán".
4. Tab "Vòng đời" → "Chuyển sang: Sắp mở nhận bài" → "Xác nhận".
5. Đăng nhập DG1 → `/cuoc-thi/thu-nghiem-mua-1` → bấm nhắc khi mở.

Kết quả mong đợi:
- Cuộc thi hiện ở hub `/cuoc-thi`. Nút chính ở giai đoạn này là "Nhắc tôi khi mở" (chưa có nút nộp bài); trang `/gui-bai` báo "Cuộc thi chưa mở nhận bài".
- Form admin báo thể lệ đã khoá; ngày giờ và tiêu đề vẫn sửa được.

### 3.2. Nhận bài (từ T + 15 phút)

1. Admin → "Chuyển sang: Đang nhận bài".
2. TG1 → nộp truyện X qua "Gửi tác phẩm dự thi".
3. TG1 nộp A. TG2 nộp B. TG3 nộp C.
4. TG3 "Rút bài" C → "Gửi lại".
5. Admin → tab "Bài dự thi" → bài B → "Gắn cờ “Cần bổ sung”" (tích "Tác giả thấy cờ này").
6. DG1 → mở `/nhiem-vu`.
7. DG1 → đọc hết 1 chương của A (đọc thật khoảng 30 giây, cuộn tới cuối) → mở tab Khám phá của cuộc thi.

Kết quả mong đợi:
- Bước 1: DG1 nhận thông báo nhắc mở nhận bài.
- Bước 2: checklist đánh dấu đúng điều kiện X không đạt; không gửi được.
- Bước 3: cả 3 bài hiện "Hợp lệ" ở trang admin.
- Bước 4: rút và gửi lại thành công.
- Bước 5: TG2 thấy nhãn "Cần bổ sung" và nội dung cờ ở `/author/contests`.
- Bước 6: có 1 ô **"Sự kiện"** mang tên cuộc thi. Đổi ô sự kiện được 1 lần.
- Bước 7: "Hành trình của bạn" có mốc "Đọc 1 bài" đã đạt. Tiến độ nhiệm vụ sự kiện (nếu là nhiệm vụ đọc) tăng.

### 3.3. Đóng nhận bài (từ T + 45 phút)

1. Admin → "Chuyển sang: Đã đóng nhận bài".
2. TG1 sửa nội dung 1 chương của A.
3. Admin → mở màn chấm (`/giam-khao/thu-nghiem-mua-1`).

Kết quả mong đợi:
- Truy vấn mục 2: `ban_chup_bai` = `bai_hop_le` (3).
- Nút nộp bài ghi "Đã hết hạn nhận bài". Tác giả không rút bài được nữa — kể cả khi admin đóng **sớm** hơn hạn.
- Bước 2: truyện A trên web đổi, nhưng màn chấm vẫn hiện bản lúc đóng cổng.
- Bước 3: bài hiện mã ẩn danh (#01…), không lộ tên tác giả.

### 3.4. Chấm thử (T + 45 phút → trước T + 1 giờ 40 phút, song song với bình chọn)

1. Admin/giám khảo chấm cả 3 bài: "Lưu nháp" 1 bài, rồi "Chốt điểm" cả 3.
2. Tab "Chấm điểm" → "Kết quả chấm" → **"Tính thử"**.
3. Admin "Mở lại" 1 phiếu chấm (nhập lý do) → giám khảo chốt lại.

Kết quả mong đợi:
- Bước 1: "Chốt điểm" chỉ bấm được khi đủ mọi tiêu chí.
- Bước 2: có bảng xếp hạng thử, kèm cờ cảnh báo nếu có (vd `award_tie`).
- Bước 3: lượt tính thử cũ hiện "Cần tính lại".

### 3.5. Bình chọn (từ T + 50 phút)

1. Admin → "Chuyển sang: Đang bình chọn".
2. DG2 bấm "Bình chọn" ở bài B **khi chưa đọc**.
3. DG2 đọc hết 1 chương B (khoảng 30 giây) → bình chọn B. DG3 làm tương tự với B và C. DG1 bình chọn A.
4. TG1 bình chọn A (bài của chính mình).
5. DG3 rút phiếu C rồi bầu lại.
6. Chụp hạng: chạy SQL dưới đây (ghi dữ liệu thật; chỉ chạy trên dev).
   ```sql
   select public.snapshot_contest_ranks(id) from public.contests where slug = 'thu-nghiem-mua-1';
   ```
   Sau đó DG1 đọc và bầu C → mở lại BXH.
7. Admin → tab "Gian lận" → "Quét lại".

Kết quả mong đợi:
- Bước 2: nút báo "Đọc hết 1 chương để bình chọn".
- Bước 3: bầu được.
- Bước 4: bị từ chối.
- Bước 5: rút và bầu lại được.
- Bước 6: cột **"Thay đổi"** hiện ▲ / ▼ / — (desktop; điện thoại không có cột này).
- BXH "Bảng phiếu bình chọn" có hạng nhưng **số phiếu hiện "Ẩn"**.
- Truy vấn mục 2: `phieu_da_loc` ≤ `phieu_tho`. Phiếu của người không đọc thật bị loại.
- Bảng phiếu (khi đã hết bình chọn) hiện **phiếu đã lọc** — cùng số `phieu_da_loc`, không phải phiếu thô.
- Bước 7: dữ liệu nhỏ nên thường không có tín hiệu. Nếu có, thử "Bỏ qua" và "Mở lại".
- DG1 kiểm tra "Hành trình của bạn". Muốn thử huy hiệu thì cần đủ 7 mốc: đọc bài của 3 tác giả, đọc hết 1 tác phẩm, đọc 1 Viên ngọc ẩn, bình luận 1 bài, bầu 3 bài, quay lại 3 ngày khác nhau. Mốc cuối không đạt được trong 1 buổi, nên bỏ qua nếu không chạy nhiều ngày.

### 3.6. Chấm và công bố (từ T + 1 giờ 40 phút)

1. Admin → "Chuyển sang: Ban giám khảo đang chấm".
2. "Kết quả chấm" → **"Tính chính thức"** → xem → "Công bố lượt này làm kết quả →".
3. Tab "Giải thưởng" → "Đề xuất từ kết quả chấm đã công bố" → "Xác nhận".
4. "Chuyển sang: Đã có kết quả".
5. Tab "Giải thưởng" → "Chi trả" cho từng giải.
6. Thử "Thu hồi" 1 giải **chưa trả** (nếu có).

Kết quả mong đợi:
- Bước 1: số phiếu trên BXH hiện ra (vì đã hết khung bình chọn).
- Bước 2: tính được (mọi phiếu chấm đã chốt).
- Bước 3: tạo giải đúng hạng, số tiền khớp tên giải trong phần giải thưởng.
- Bước 4: microsite chuyển sang tab "Kết quả": bục trao giải, bảng "Chung cuộc" và "Ban giám khảo".
- Bước 5: ví tác giả đoạt giải tăng đúng số token. Lịch sử giao dịch có dòng thưởng. Bấm lần 2 bị từ chối.
- Bước 6: giải vẫn hiện trên trang kết quả nhưng gạch ngang, ghi "Đã thu hồi" (giữ để minh bạch). Thu hồi giải **đã trả** thì trang admin cảnh báo token không tự trừ lại.

### 3.7. Sau kết quả

1. Mở `/ket-noi`, xem hồ sơ TG1, TG2, TG3 → mục **"Cuộc thi"**.
2. TG2 → `/author/contests` → "Thống kê dự thi".
3. Admin → "Chuyển sang: Đã lưu trữ" → mở tab "Dấu ấn".
4. Mở `/truyen/<slug truyện A>`.

Kết quả mong đợi:
- Bước 1: mỗi người có dòng tên cuộc thi, tên giải và "Hạng #N chung cuộc".
- Bước 2: số liệu độc giả, phiếu và hạng khớp BXH công khai.
- Bước 3: tab "Dấu ấn" có số liệu cả mùa.
- Bước 4: có thẻ cuộc thi hoặc huy hiệu giải.

---

## 4. Điểm đã biết trước (xem kỹ khi chạy)

Đây là những điểm đọc code thấy có thể gây bất ngờ. Chạy thử xong, tôi sẽ đề xuất cách xử lý từng điểm.

| # | Điểm | Ảnh hưởng |
|---|---|---|
| 1 | ~~Admin đóng nhận bài sớm thì tác giả vẫn rút bài được tới đúng hạn~~ | **Đã sửa (28/09):** đóng sớm là chặn rút ngay |
| 2 | Thu hồi một giải **đã chi trả** không thu hồi token | **Đã chốt (28/09):** admin xử lý tay; trang admin cảnh báo khi thu hồi |
| 3 | Hạn "bổ sung trước" của cờ "Cần bổ sung" chỉ để hiển thị, không tự loại bài | Admin tự theo dõi |
| 4 | Giám khảo không có đường vào `/giam-khao` từ menu | Phải gửi link trực tiếp |
| 5 | Ngày của nhiệm vụ (kể cả ô sự kiện) tính theo UTC → sang ngày mới lúc 07:00 giờ VN | Có từ trước Phase 3; khác với Passport (theo giờ VN) |
| 6 | Trang admin không có bộ lọc "Chờ duyệt" | Bài hợp lệ tự vào "Hợp lệ" nên hiếm khi cần |
| 7 | Chưa có ô chỉnh công thức BXH phiếu / ngưỡng đọc thật trong form | Luôn dùng mặc định |
| 8 | Trên staging, cron không tự chạy: mở/đóng nhận bài, nhắc mở, chụp hạng phải làm tay | Production có cron 00:05 giờ VN |

---

## 5. Ghi kết quả

| Bước | Đạt / Lỗi | Mô tả lỗi (thấy gì, mong đợi gì) | Ảnh / thiết bị |
|---|---|---|---|
| 3.1 | | | |
| 3.2 | | | |
| 3.3 | | | |
| 3.4 | | | |
| 3.5 | | | |
| 3.6 | | | |
| 3.7 | | | |
