# Kế hoạch tối ưu tải Vercel và Supabase

Ngày bắt đầu: 16/10/2026. Mục tiêu: giảm function/database work trên gói hiện tại trước khi thêm hạ tầng queue. Chưa xác định giới hạn production: lượt 30 request/giây đạt 10 phút, lượt 40 và cả phép phục hồi 1 request/giây có timeout từ máy đo; chưa chứng minh database nghẽn.

## Dọn tài liệu

- Xóa hướng dẫn triển khai tính năng đã có code: `AUDIO_UPLOAD.md`, `CONTEST_CHAPTER_SELECTION.md`, `content-reports.md`. Có thể khôi phục từ lịch sử Git.
- Giữ tài liệu vận hành cron, migration, sự kiện và roadmap còn kiểm thử/chức năng chưa hoàn tất. Không coi mọi file có chữ “triển khai” là đã xong.

## Đợt 1 — Cache sự kiện công khai

- [x] Cache danh sách sự kiện 60 giây bằng client anon không có cookie/service role.
- [x] Chỉ lấy cột cần dùng; giữ điều kiện published, hidden=false và giới hạn 200.
- [x] Hết hạn ngay cache sau tạo/sửa/ẩn/hiện sự kiện và đổi nickname/bio/avatar người tổ chức qua API ứng dụng.
- [x] Trang chi tiết kiểm tra trạng thái trực tiếp, không dùng bản cache để quyết định sự kiện còn công khai.
- [x] 17 kiểm thử về truy vấn công khai, lỗi database, invalidation và API phân quyền; TypeScript, ESLint trực tiếp trên các thư mục/file đã sửa và production build đều qua.
- [ ] Deploy, kiểm tra hai tài khoản và admin; đo lại từ đường mạng đối chứng.

Không cache HTML có phiên đăng nhập, ví, quyền đọc hay dữ liệu riêng. Các thay đổi trực tiếp ngoài API chờ cơ chế làm mới theo thời gian; các API của ứng dụng hết hạn ngay tag. Dữ liệu đã gửi tới trình duyệt không thể thu hồi bằng invalidation. Không phục vụ bản danh sách cũ như bằng chứng quyền truy cập chi tiết.

Build xác nhận `/su-kien` trở thành trang prerender/ISR, revalidate 1 phút; `/su-kien/[eventId]` vẫn dynamic. Cache thời gian dùng stale-while-revalidate: 60 giây là thời điểm đủ điều kiện làm mới, không bảo đảm dữ liệu ngoài API hết cũ đúng sau 60 giây, nhất là khi backend lỗi. Các thao tác ẩn/ngừng công bố qua API dùng `revalidateTag(tag, { expire: 0 })` để lượt truy cập sau không cố ý nhận bản cũ trước khi làm mới. Profile chỉ cập nhật cache sau khi ghi thành công.

Đợt này không đổi schema hoặc cần dịch vụ mới. `unstable_cache` được dùng theo mô hình hiện có vì repo chưa bật Cache Components; đã đọc hướng dẫn đi kèm Next.js 16.3.0, không bật cờ toàn ứng dụng trong thay đổi này. Kiểm thử đơn vị mock cache API nên chưa thay thế kiểm tra invalidation trên deployment thật.

Kiểm tra sau deploy: mở danh sách hai lần để xem trạng thái CDN; tạo published → xem ở cửa sổ ẩn danh; chuyển draft hoặc admin ẩn → tải lại danh sách và mở link chi tiết phải không tìm thấy; đổi nickname/bio/avatar và kiểm tra thông tin người tổ chức. Không đặt ngưỡng chịu tải mới trước khi có phép đo đối chứng.

## Đợt 2 — Giảm tải từ trình duyệt

- [x] Rà polling tin nhắn/thông báo/heartbeat. Heartbeat đã có in-flight guard, visibility, idle 120 giây, nhịp 60 giây và kiểm tra quyền; giữ nguyên logic ghi tiến độ/nhiệm vụ.
- [x] Loại vòng GET `/api/messages` riêng của ChatTab, dùng chung provider với header/bubble. Cập nhật lạc quan sau gửi/đọc tin vẫn cập nhật nguồn chung.
- [x] Helper polling không gọi chồng request trong cùng vòng; đợi request hoàn tất mới tính nhịp tiếp. Chỉ gọi khi tab visible và trình duyệt không báo offline; quay lại tải ngay nếu không đang backoff.
- [x] Lỗi mạng hoặc HTTP không thành công giãn nhịp 2x, 4x... tối đa 120 giây, thành công về nhịp gốc. Focus/online không bỏ qua backoff đang có. Timeout request 15 giây; cleanup abort và không cho phản hồi đã hủy cập nhật state.
- [x] Hội thoại gắn với tài khoản đang đăng nhập; đổi tài khoản khởi động lại poll, ẩn snapshot của tài khoản cũ. NotificationBell và ChatTab remount theo handle để bỏ state cũ.
- [x] 6 unit tests helper: chồng lấn, tab ẩn/offline/online, backoff/reset, cleanup, timeout và cap 120 giây. Kiểm thử chung với đợt 1: 23 tests qua. Đổi tài khoản toàn luồng cần kiểm tra trình duyệt như bên dưới.
- [x] TypeScript, ESLint trên file thay đổi và production build đều qua sau đợt 2. Chưa commit/push/deploy các thay đổi code.
- [ ] Đo số API call thực tế một phiên trong trình duyệt và kiểm tra hai tài khoản sau deploy.

Ước tính từ cấu hình, không phải phép đo production: danh sách hội thoại khi mở ChatTab trước có hai vòng 15 giây (~8 request/phút); nay còn một (~4/phút), giảm khoảng 50% riêng endpoint danh sách trong tình huống này, không phải giảm 50% toàn web. Chuông thông báo nhịp gốc 30 giây; luồng chat và đơn hàng nhịp gốc 5 giây. Thời gian request được cộng vào khoảng giữa các lần nên lưu lượng thực tế có thể thấp hơn. Chưa gộp vòng polling giữa nhiều browser tab hoặc giữa hai view cùng mở một thread.

Checklist trình duyệt: đăng nhập A → mở tab Hội thoại, Network chỉ một vòng GET `/api/messages`; ẩn tab/offline không có poll mới (request đã gửi có thể hoàn tất); trở lại visible/online tiếp tục; giả lập 500 hoặc mất mạng thấy nhịp giãn; đóng thread hủy request cũ; đổi A sang B không hiện danh sách/thông báo/thread của A; gửi/đọc tin cập nhật badge và danh sách chung; đọc chương vẫn ghi tiến độ và heartbeat như trước. Kiểm thử thời gian giả không thay thế các bước này.

Rollback đợt 2: revert helper và các caller liên quan cùng nhau; không đổi database, dịch vụ hoặc package. Không gộp polling với heartbeat vì quy tắc tính thời gian đọc khác nhau.

## Đợt 3 — Cache HTML công khai

- [x] Rà layout/header: SiteHeader/AuthCluster xử lý trạng thái đăng nhập phía client; trang chủ đang đọc cookie để lấy gợi ý, audio đang đọc cookie để lấy tiến độ nghe.
- [x] Tách gợi ý và tiến độ nghe khỏi HTML công khai: `/api/recommendations`, `/api/audio/listening-progress` lấy viewer từ phiên server, không nhận user ID của client; trả `private, no-store` và `Vary: Cookie` cho thành công, chưa đăng nhập và lỗi.
- [x] Client chỉ tải phần cá nhân khi đã đăng nhập, một lần mỗi mount/tài khoản, không polling. Snapshot gắn với handle và URL; đổi tài khoản/unmount abort request, không nhận phản hồi đã hủy. Gợi ý/tiến độ có thể hiện sau nội dung công khai; lỗi phần cá nhân không chặn đọc trang.
- [x] 8 unit tests API: guest bị từ chối trước truy vấn, mỗi request lấy viewer hiện tại (A/B), header chống cache ở mọi nhánh, lỗi không lộ nội dung nội bộ và danh sách rỗng không bị thay bằng dữ liệu giả. Tổng kiểm thử liên quan đợt 1–3: 31 tests qua; ESLint qua. Kiểm thử đổi tài khoản trong trình duyệt vẫn cần làm sau deploy.
- [x] Production build và manifest xác nhận `/` và `/audio` prerender/ISR 300 giây; TypeScript qua. HTTP bản production local: cả hai 200, `x-nextjs-cache: HIT`; HTML guest giống HTML khi gửi cookie giả không hợp lệ. Hai API cá nhân trả 401 cho guest và `private, no-store`. Phép kiểm tra cookie giả không thay thế kiểm thử tài khoản A/B thật.
- [ ] Kiểm tra hai tài khoản trên deployment: HTML công khai không có dữ liệu riêng, API A/B khác nhau và không dùng cache CDN.
- [ ] Đo cache hit, function invocations và database calls trước/sau. Không bật cache công khai đại trà bằng header.

`/truyen` tiếp tục dynamic vì đọc `searchParams` để lọc thể loại, giữ tương thích link hiện tại. `/truyen/[slug]` và `/read/...` tiếp tục kiểm tra quyền/cập nhật lượt đọc trực tiếp. Không dùng force-static hay header CDN để che các route có dữ liệu cá nhân. ISR trang chủ/audio dùng cache public 300 giây đã có; cập nhật theo tag hiện có. Thao tác ngoài API hoặc lỗi backend có thể khiến catalog cũ còn được phục vụ; cache không thay thế kiểm tra quyền ở nội dung chi tiết.

Tradeoff: người dùng đăng nhập thêm tối đa một request cá nhân khi mount trang chủ và một khi mount audio, nhưng khách không cần gọi hai API đó. Lợi ích kỳ vọng là HTML dùng chung không cần function/auth lookup cho mỗi lượt CDN hit; chưa có số đo invocations/quota production để khẳng định mức tiết kiệm. Trình duyệt tắt JavaScript vẫn xem được catalog công khai, không hiển thị phần cá nhân.

Rollback đợt 3: đưa truy vấn gợi ý/tiến độ về Server Component cùng các trang, gỡ client wrappers/hook và hai GET endpoint mới. Không đổi schema, package hoặc dữ liệu.

## Đợt 4 — Kiểm soát endpoint nặng

- [x] Rà auth/tìm kiếm/upload/OCR. Auth login/OTP/reset đã có limiter; register/availability có giới hạn theo IP best-effort và Supabase Auth là lớp giới hạn riêng. Không thay quy tắc auth trong đợt này.
- [x] Thêm chốt trước công việc nặng cho ba endpoint đã xác thực, theo tài khoản: OCR CCCD 5 lần/10 phút, DOCX 6 lần/10 phút, cấp link audio 30 lần/10 phút. Chỉ tính khi đầu vào cơ bản hợp lệ; lần xử lý thất bại vẫn tính vì đã tiêu thụ tài nguyên. Đây là ngưỡng đề xuất ban đầu, KHÔNG được suy từ tải GET trong stress test; cần hiệu chỉnh theo số liệu sử dụng thật.
- [x] Chuẩn bị lựa chọn dùng chung giữa instance: RPC UPSERT nguyên tử trên Supabase, bảng khóa theo `(subject, scope)`; chỉ service_role được gọi, subject lấy từ phiên đã xác thực. Tối đa ba dòng mỗi tài khoản, tái sử dụng khi hết hạn và cascade khi xóa auth user. Không ghi IP, email, số CCCD, file hoặc nội dung vào bảng giới hạn.
- [x] Mặc định `HEAVY_REQUEST_LIMIT_STORE` chưa đặt hoặc `memory`: best-effort như limiter cũ, KHÔNG có bảo đảm toàn hệ thống. `supabase` kích hoạt RPC; lỗi store/config trả 503 + Retry-After 30, không tự rơi về memory hoặc cho công việc chạy tiếp.
- [x] Khi chạm giới hạn trả 429 + Retry-After, private/no-store. Tài khoản/action tách bucket nên hai người dùng chung IP không chia sẻ quota của ba thao tác mới. Không giới hạn số người dùng toàn web hoặc số function chạy đồng thời.
- [x] 62 tests liên quan đợt 1–4 qua; TypeScript, ESLint, production build và kiểm tra schema tổng hợp đều qua. Các test chặn OCR/DOCX/upload xác nhận không gọi công việc nặng khi limiter từ chối; shared-store tests dùng mock, SQL regression chưa chạy trên DB thật.
- [ ] Chạy SQL regression và kiểm tra đồng thời trên dev/staging; bật shared mode sau migration và xác nhận trên deployment thật.
- [ ] Thu thập tần suất/chi phí auth, tìm kiếm, OCR và upload thật để điều chỉnh ngưỡng. Chưa thêm giới hạn IP rộng cho tìm kiếm vì không có dữ liệu để chọn ngưỡng tránh khóa người dùng dùng chung mạng; chưa thay limiter auth thành distributed.

File triển khai: `migrations/20261016_heavy_request_limits.sql`; baseline cho DB mới `migrations/baseline/18_heavy_request_limits.sql`, schema tổng hợp đã sinh lại. SQL test `docs/supabase/tests/20261016_heavy_request_limits.test.sql` có transaction rollback và fixture auth user chỉ dùng dev/staging. Chưa chạy SQL test hoặc migration từ workspace. Tests TypeScript mock RPC chỉ kiểm tra hợp đồng gọi/response, không chứng minh đồng thời trên Postgres.

Thứ tự kích hoạt:

1. Áp migration lên dev/staging, chạy SQL test. Kiểm tra anon/authenticated không được execute RPC; dùng hai phiên service_role thử đồng thời cùng subject/scope, tổng được phép không vượt ngưỡng.
2. Sau staging đạt, áp migration lên đúng Supabase production. Nếu mobile trỏ project riêng, áp trên project đó trước khi bật biến dùng chung vì endpoint DOCX/identity dùng admin factory của đúng project xác thực.
3. Deploy code, đặt biến server `HEAVY_REQUEST_LIMIT_STORE=supabase` rồi redeploy. Không dùng tiền tố NEXT_PUBLIC. Audio upload web dùng service role của project web, vẫn giữ RLS client khi cấp signed upload URL.
4. Kiểm tra tài khoản thử trong staging: chạm limit → 429 đúng Retry-After, tài khoản khác vẫn dùng; lỗi RPC → 503 và không tạo upload token/khởi chạy OCR/DOCX. Không dùng CCCD thật để tạo tải thử.

RPC thêm một lượt ghi DB cho mỗi yêu cầu nặng hợp lệ, kể cả bị từ chối; vì vậy không gắn lên mọi GET/heartbeat. Rate limit không thay thế queue hoặc giới hạn concurrency: một burst nhỏ vẫn có thể chạy đồng thời trong quota. Endpoint đăng ký vẫn có OCR và hiện chỉ được bảo vệ bởi limiter auth cũ; cần giải pháp chống abuse pre-auth riêng nếu số liệu cho thấy vấn đề.

Rollback: đặt `HEAVY_REQUEST_LIMIT_STORE=memory` hoặc bỏ biến và redeploy để về giới hạn theo instance, giảm mức bảo vệ phân tán. Không cần xóa bảng ngay; chỉ gỡ RPC/table sau khi không còn deployment sử dụng. Không sửa môi trường, migration hay deploy tự động trong phiên này.

## Tiến trình kích hoạt sau migration

Chủ web xác nhận đã chạy migration ngày 16/10/2026. Preflight trực tiếp project production `jucctqgbutjfcupehmzc.supabase.co` bằng `scripts/verify-heavy-limit.mjs` đã qua: đọc bảng limit=0 thành công, service-role RPC trả lỗi kiểm tra đầu vào mong đợi với subject null, khóa public bị từ chối execute (42501). Không ghi dòng mới hoặc dùng quota người thật. Chưa xác nhận bằng SQL regression/kiểm thử hai kết nối; không coi preflight là nghiệm thu đồng thời.

Workspace có Git remote và liên kết project Vercel nhưng không có phiên CLI/API để sửa Environment Variables. Chủ web được hướng dẫn đặt biến Production `HEAVY_REQUEST_LIMIT_STORE=supabase`; chưa có xác nhận bước này tại thời điểm chuẩn bị commit. Code mặc định memory vẫn hoạt động nếu chưa bật biến. User đã yêu cầu làm các bước tiếp sau migration, nên đợt này tiến hành commit/push riêng phần tối ưu để Git integration triển khai; các hạn chế không deploy ở giai đoạn sửa code phía trên áp dụng cho giai đoạn trước.

Lệnh preflight không in key: `node --env-file=.env.prod scripts/verify-heavy-limit.mjs`. Không commit `.env.prod`. Chưa triển khai queue tác vụ nền trong đợt kích hoạt này.

Cập nhật sau đó: commit `377f8df` đã push lên production; kiểm tra trực tiếp website xác nhận `/`, `/audio`, `/su-kien` trả 200 và được phục vụ prerender/ISR; hai API cá nhân trả 401/no-store cho guest. Chủ web đã xác nhận đặt `HEAVY_REQUEST_LIMIT_STORE=supabase`. Kiểm tra đọc lúc 17:18 ngày 16/10/2026 (10:18 UTC) cho thấy bảng bộ đếm còn rỗng; chưa thể xác nhận biến đã được deployment áp dụng hoặc đường authenticated thực sự gọi RPC. Cần redeploy nếu đặt biến sau bản build hiện tại, rồi dùng một file DOCX nhỏ đến bước xem trước để phát sinh một lần extract; không cần tạo truyện/chương hay dùng CCCD thật. Sau đó kiểm tra bucket `manuscript-extract` và kết quả HTTP. Không yêu cầu người dùng gửi cookie/token.

## Đợt 5 — Queue tác vụ nền

Xác nhận kích hoạt đợt 4: chủ web thử nhập DOCX trên production nhận HTTP 200. Kiểm tra chỉ đọc lúc 17:22 ngày 16/10/2026 (10:22 UTC) thấy bucket `manuscript-extract`, `hits=1`, `reset_at=10:31:10 UTC` (17:31:10 giờ Việt Nam), trong khi lần đọc 17:18 chưa có dòng. Kết hợp thao tác người dùng và bucket mới, xác nhận luồng DOCX đã gọi bộ đếm Supabase. Không suy rộng thành đã kiểm thử chạm quota, mọi endpoint hoặc tính nguyên tử khi chạy đồng thời; các mục SQL/staging còn mở vẫn giữ nguyên. Không tiếp tục gửi DOCX để làm đầy quota của tài khoản thật.

Khảo sát ban đầu: chọn nhập DOCX làm ứng viên đầu tiên vì không cần quyết định xác minh danh tính/thanh toán ngay lập tức, và có modal xem trước để thể hiện trạng thái xử lý. Chưa có số đo CPU/thời gian DOCX production; chưa chọn giải pháp queue để đưa vào chạy thật. Worker Python hiện là skeleton riêng cho quest generation, claim chưa nguyên tử, không tái sử dụng như worker đa-instance nếu chưa sửa cơ chế claim.

Thiết kế dự kiến để review: file tạm trong bucket private, job chỉ lưu đường dẫn và owner (không lưu nội dung bản thảo trong log), API trả job ID và 202 sau khi enqueue bền vững, worker claim nguyên tử có lease/fencing và concurrency giới hạn, trạng thái chỉ owner được đọc. Client poll có backoff/visibility thay vì giữ HTTP chờ. Cần giới hạn file đầu vào/độ nở DOCX, quota dung lượng/backlog, thời hạn xóa file/kết quả, idempotency và retry hữu hạn trước khi đổi luồng đang hoạt động. Cơ chế gọi worker định kỳ bằng Supabase Cron/pg_net là ứng viên dùng hạ tầng sẵn có, chưa được cấu hình. Không dùng nền fire-and-forget sau response Vercel.

- [x] Chọn nhập DOCX; `.txt`/văn bản dán vẫn xử lý tại trình duyệt. Mã mới chỉ enqueue khi `MANUSCRIPT_QUEUE_ENABLED=true`, web gửi `async=1` và UUID `x-import-id`; client cũ/mobile không opt-in vẫn dùng response đồng bộ hiện tại. Vì giữ tương thích, queue chưa phải giới hạn concurrency cho mọi đường parse cũ.
- [x] Queue bền vững trên Postgres + bucket private `manuscript-imports`, không thêm package/dịch vụ trả phí. Enqueue trả 202 sau reserve/upload/chuyển queued. RPC admission khóa nguyên tử giới hạn 2 job active/tài khoản và 20 active toàn project, idempotent theo job ID + owner; retry cùng ID không tạo job/upload mới nhưng vẫn đi qua limiter thao tác.
- [x] Worker xác thực CRON_SECRET cả dev, xử lý một job mỗi HTTP call; claim nguyên tử một slot toàn project, lease 180 giây, token mới khi reclaim, max 3 lần thử; transient errors giãn 30/60 giây trước hai lần thử lại, tài liệu không hợp lệ thất bại ngay. Commit dùng token/lease còn hạn, không cho worker cũ ghi đè. Không xóa input/output khi kết quả RPC có thể đã commit nhưng HTTP response bị mất.
- [x] Chốt giới hạn parse queue: input 4 MiB, tối đa 256 ZIP entries, tổng giải nén thực tế 12 MiB, không ZIP64/multi-volume/encrypted/DTD/entity/path traversal; kiểm tra inflate thực tế trước Mammoth. Text tối đa 500.000 ký tự, 300 heading chapters và JSON kết quả tối đa 2 MiB; không nhúng ảnh hoặc cho truy cập file bên ngoài. Một số DOCX hợp lệ nhưng quá nhiều phần/định dạng sẽ được yêu cầu chia nhỏ.
- [x] API GET job luôn xác thực, lọc owner, no-store và giới hạn poll best-effort 30/phút/tài khoản. Không lộ đường dẫn Storage. UI đợi kết quả, không poll tab ẩn/offline, backoff lỗi/429, tối đa 30 phút; đóng modal/đổi file abort theo dõi, không tự tạo truyện/chương. Đóng modal không hủy job server: job có thể tiếp tục rồi được dọn theo TTL, ID chưa lưu để phục hồi sau reload.
- [x] TTL job/kết quả 1 giờ, worker dọn tối đa 10 job hết hạn mỗi call và chỉ xóa metadata sau khi xóa Storage thành công. Queue tắt vẫn cho worker đã xác thực chạy cleanup. Không claim job còn dưới 3 phút trước hạn; uploading gián đoạn quá 5 phút chuyển failed. Xóa auth user không xóa metadata cleanup ngay; nội dung tạm vẫn chỉ accessible qua owner API khi có phiên hợp lệ.
- [ ] Chạy SQL regression/concurrency và e2e có tài khoản trên staging; đo CPU/thời gian DOCX thực tế, thời gian chờ và tốc độ dọn.
- [ ] Áp migration, cấu hình cron, deploy và bật cờ sau staging đạt. Chưa áp dụng/bật trong phiên phát triển này.

Kiểm tra local đợt queue: 94 unit tests liên quan đợt 1–5 đã qua (gồm DOCX thật tối giản, ZIP khai gian kích thước, stale lease, commit mất phản hồi, upload thất bại, cleanup lỗi, owner-scoped status, cron authentication, polling hidden/abort/429 và tương thích synchronous/mobile); ESLint, TypeScript, production build và schema check qua. HTTP bản production local xác nhận GET job không đăng nhập trả 401/no-store, worker không có secret trả 401, `/` và `/audio` vẫn cache HIT. Unit tests mock database/storage không thay thế SQL concurrency hoặc luồng enqueue/worker/download thật. Chưa push/deploy code queue, chưa chạy migration/cron mới.

### File và thứ tự triển khai queue

1. Chạy `migrations/20261016_manuscript_import_queue.sql` ở dev/staging; baseline mới là `19_manuscript_import_queue.sql`, schema tổng hợp đã sinh lại. Chạy `docs/supabase/tests/20261016_manuscript_import_queue.test.sql` trên queue staging trống: transaction rollback fixture, kiểm tra owner/global cap, quyền, idempotency, lease và fencing. SQL test chưa được chạy từ workspace.
2. Deploy code với queue OFF (chưa đặt biến hoặc false). Luồng DOCX cũ tiếp tục nhận 200; frontend mới hiểu cả 200 và 202.
3. Tạo/kiểm tra CRON_SECRET trên Vercel. Supabase Vault dùng `publication_site_url` và `publication_cron_secret` như cron đăng chương; giá trị secret phải khớp, không gửi qua chat. Chạy `scripts/setup-manuscript-import-cron.sql` trong đúng project web. Script không tự ghi Vault và chạy lại cập nhật cùng tên job.
4. Đặt Config `MANUSCRIPT_QUEUE_ENABLED=true` ở môi trường staging tương ứng và redeploy. Test file nhỏ: POST 202 → GET queued/processing → succeeded → xem trước; tài khoản khác GET job trả 404, invalid DOCX failed, đóng modal không ghi state muộn. Không dùng bản thảo thật để tạo tải. Preflight chỉ đọc/đầu vào vô hiệu: `node --env-file=.env.prod scripts/verify-manuscript-queue.mjs` (chỉ chạy sau migration đúng môi trường).
5. Sau staging đạt mới lặp lại production. Cron Supabase mỗi phút, mỗi call một job, nên tốc độ khởi điểm khoảng 1 job/phút với tối đa một worker; queue hấp thụ burst nhưng không tăng năng lực xử lý. Backlog 20 có thể chờ khoảng 20 phút hoặc lâu hơn nếu có retry/timeout. Theo dõi và giảm backlog/tăng worker budget sau khi có số đo, không hứa thời gian hoàn thành cố định.

Nếu cron/secret/mạng bị lỗi, queue và dữ liệu tạm có thể tồn tại quá 1 giờ vì TTL chỉ được thực thi khi cleanup chạy; cần theo dõi HTTP worker, tuổi job cũ nhất và dung lượng bucket. Không coi Cron History “Succeeded” là job xử lý thành công, vì pg_net mới chỉ xếp HTTP. Không có timer/worker chạy trong background của response Vercel, không thêm cron Vercel mỗi phút. Worker chỉ đọc project web; mobile bearer client giữ luồng cũ, không enqueue vào project mobile riêng.

Rollback queue: đặt `MANUSCRIPT_QUEUE_ENABLED=false`, redeploy để nhận đồng bộ; giữ cron/worker hoạt động tối thiểu cho tới khi dọn hết file/job cũ. Không xóa bucket/bảng khi còn jobs, không xóa cron ngay khi tắt cờ vì sẽ ngừng cleanup. Chi phí bổ sung: upload tạm, poll trạng thái, DB updates và worker invocations; cần đo trước khi mở rộng.

## Điều kiện nghiệm thu và triển khai

### Cập nhật kích hoạt queue ngày 16/10/2026

Chủ web xác nhận đã chạy migration queue, SQL regression trả `Success. No rows returned`, đăng ký cron trả `schedule: 2`, và đặt `MANUSCRIPT_QUEUE_ENABLED=true` trên Vercel. Preflight từ workspace trên project production đã qua: bảng tồn tại, bucket private, guard reserve/finish hoạt động và anon bị từ chối. Đây chưa phải xác nhận cron HTTP hoặc xử lý DOCX thành công.

Code queue được chuẩn bị push lên nhánh production theo yêu cầu tiếp tục triển khai. Sau deployment mới, cần thử một DOCX nhỏ: POST extract trả 202, GET job chuyển sang succeeded và modal hiện bản xem trước. Nếu POST vẫn 200, kiểm tra deployment mới và biến Production; nếu job chờ quá 2–3 phút, kiểm tra worker HTTP/CRON_SECRET và Vault. Không gửi secret qua chat. Các mục chưa nghiệm thu ở trên tiếp tục giữ mở.

Hoàn thành code + kiểm thử local trước; đánh dấu rõ mục còn cần kiểm tra production. Không tự chạy migration/deploy/load test trong đợt sửa code này. Không sửa thay đổi có sẵn trong chapter editor. Đo lại cùng workload, thời lượng và đường mạng ổn định; p95 <= 2 giây, lỗi <= 1% là mục tiêu bài đo, không phải SLA hay số người dùng cam kết.

Rollback đợt 1: revert cache sự kiện và invalidation về truy vấn trực tiếp; không đổi schema, bucket hoặc dữ liệu nên không có rollback SQL.
