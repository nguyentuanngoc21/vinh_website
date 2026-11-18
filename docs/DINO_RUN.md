# Dino Run — lớp nhúng và cấp vé của Vịnh

## Ranh giới triển khai

Game được phát triển và deploy độc lập, source ở `D:\DVKN-Workspace\Dino-Run-Migrated\web-game`. Web Vịnh chỉ chứa:

- Component iframe `src/components/events/games/dino-run.tsx` và đăng ký game trong registry.
- API `POST /api/events/dino/ticket` và helper ký vé `src/lib/events/dino-ticket.ts`.
- Tài liệu và tests cho việc cấp vé.

Web không chứa Canvas engine, sprite, câu hỏi, API phòng, bảng phòng hoặc realtime game. Các migration Dino cũ đã gỡ khỏi source; chưa có migration nào được áp vào database thật trong phiên phát triển này. Không có thao tác DROP trên database.

## Cấu hình server Vịnh

```
DINO_WEB_ORIGIN=https://<domain-web-vinh>
DINO_GAME_URL=https://<domain-game>/
DINO_GAME_TICKET_SECRET=<secret-ngau-nhien-it-nhat-32-byte>
```

Đặt secret riêng cho game, cùng giá trị ở backend game; không dùng tiền tố NEXT_PUBLIC, không đưa secret vào bundle hoặc iframe URL. Không dùng Supabase service role/session secret làm secret game. HTTPS bắt buộc ở production; localhost HTTP chỉ dành cho phát triển. Game phải khác origin web. Chưa tự đặt biến môi trường hoặc deploy.

Admin gắn metadata Dino Run vào sự kiện như các game đã duyệt khác. API chỉ cấp vé nếu người dùng đã đăng nhập, sự kiện published, không hidden và có game `dino-run`. Danh tính lấy từ Supabase getUser, quyền lấy mới từ profiles; client không truyền role.

## Luồng iframe

1. Popup gọi API vé với `{eventId, nonce}`; nonce là UUID ngẫu nhiên của lần mở này.
2. API trả gameUrl cố định từ cấu hình server và JWT HS256 hiệu lực 60 giây. Không có token trong URL, localStorage hoặc log.
3. Iframe gửi `{type:'vinh:dino:ready',protocol:1}`. Vịnh kiểm tra `event.origin` đúng origin game và `event.source` đúng cửa sổ iframe.
4. Vịnh gửi `{type:'vinh:dino:init',protocol:1,ticket,nonce}` bằng postMessage với targetOrigin cụ thể. Nếu tải game lâu, API cấp lại vé khi vé cũ gần hết hạn.
5. Frontend game chuyển vé đến backend riêng qua HTTPS. Backend xác minh và đổi vé một lần sang phiên game. Sau thành công iframe gửi `{type:'vinh:dino:authenticated',protocol:1,nonce}`.
6. Vịnh bỏ màn hình chờ. Game gửi `vinh:dino:close` cùng nonce để đóng popup. Khi unmount Vịnh gửi `vinh:dino:dispose`; game cũng phải cleanup trên pagehide và backend phải có timeout mất kết nối.

Sai origin/source/nonce bị bỏ qua. Timeout 45 giây hiện nút Thử lại. Iframe chỉ được phép scripts/same-origin, fullscreen/autoplay; không được điều hướng top window.

## Hợp đồng backend game

JWT chứa `v,iss,aud,sub,eventId,name,role,canHost,nonce,iat,exp,jti`:

- `iss`: DINO_WEB_ORIGIN, `aud`: origin DINO_GAME_URL; `sub`: UUID người dùng Vịnh.
- `role`: user/admin/super_admin; `canHost` chỉ true với hai quyền admin.
- `jti`: mã vé duy nhất, `nonce`: gắn với lần mở popup.

Backend game bắt buộc kiểm tra HS256, chữ ký, issuer, audience, exp/iat, nonce và thời hạn tối đa 60 giây; consume jti nguyên tử một lần bằng shared storage TTL trước khi tạo phiên game. Vé không phải token gọi API Vịnh; backend game không được nhận cookie Supabase hoặc service role của Vịnh.

Bộ source game đã có backend Node.js độc lập: `POST /api/session/redeem`, `POST /api/room`, `POST /api/session/logout`, `/realtime` WebSocket và entrypoint `play.html`. Vé được consume nguyên tử trong SQLite riêng, token phiên game ngẫu nhiên giữ trong RAM trình duyệt, database chỉ lưu hash token. Phiên game hiệu lực ba giờ; một phiên mới cùng user/sự kiện thay phiên cũ và kết thúc lượt/phòng cũ. Không hỗ trợ khôi phục lượt chạy sau reload.

Game triển khai một instance; phòng/snapshot ở RAM, SQLite ở persistent volume chỉ giữ phiên và vé đã dùng. Không ghi snapshot vào database. Restart dịch vụ kết thúc các phòng đang chơi nhưng vé đã dùng vẫn không dùng lại được khi volume còn nguyên. Không chạy nhiều replica chia sẻ SQLite; nếu cần scale ngang phải chuyển state phòng/pubsub/session sang store và cơ chế điều phối phù hợp. Các SQL Supabase cũ chỉ lưu tham khảo trong integration/legacy, không sync sang Vịnh.

Cấu hình backend game: `DINO_WEB_ORIGIN` giống web, `DINO_GAME_ORIGIN` là origin của DINO_GAME_URL, `DINO_GAME_TICKET_SECRET` giống web. `web-game/README.md` có hướng dẫn chạy Node/Docker Compose và volume. Chưa chọn host/domain hay tự đặt secret production.

Khi deploy game: cấu hình CSP `frame-ancestors` chỉ cho origin Vịnh; backend kiểm tra Origin và gắn phiên với eventId. Chính sách CSP frame-src của web/hosting nếu có cũng phải cho origin game. Không tin role do frontend game tự gửi. Các quyền phòng/điểm thuộc backend game.

## Kiểm thử và trạng thái

- API tests kiểm tra auth, event, role, expiry, chữ ký, cấu hình URL và rate limit.
- 19 tests ở folder game đã qua: gameplay/bridge, vé, SQLite, HTTP, WebSocket, năm join đồng thời chỉ nhận bốn người, phân quyền và timeout.
- Kiểm thử Edge headless đã qua với hai origin localhost và năm danh tính ký vé mô phỏng: join/ready/start, admin 2 × 2, nhảy, hồi sinh độc lập, reset và Host leave; có kiểm tra viewport 390 × 844. Chưa coi đây là kiểm thử tài khoản Vịnh production hoặc điện thoại thật.
- Chưa deploy hoặc cấu hình domain/secret production. Dockerfile/Compose đã chuẩn bị; chưa build Docker trong môi trường này vì không có Docker CLI.
- Limiter API vé dùng memory có sẵn của web, best-effort từng instance. Backend game có limiter và giới hạn payload riêng. Dữ liệu gameplay/điểm vẫn do client báo, chỉ dùng giao lưu khi chưa có xác minh chống gian lận.
