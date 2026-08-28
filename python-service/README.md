# Quest Generation Worker (Phase 2 skeleton)

Python service cho hạ tầng sinh quest bằng AI (spec "Hạ tầng Python
server") — hiện tại là **skeleton**: poll `quest_generation_jobs` →
gọi Claude API placeholder (chỉ ping xác nhận, không sinh quest thật) →
ghi log + cập nhật status. Logic prompt/pipeline thật (tiền xử lý,
few-shot, rule-based check) cắm sau, khi hạ tầng này đã chạy ổn định.

## Chạy local

```bash
cd python-service
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # điền SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (bắt buộc)
uvicorn app.main:app --reload
```

`ANTHROPIC_API_KEY` để trống vẫn chạy được — worker vẫn poll/process/log
đúng, chỉ bỏ qua lời gọi Claude thật (log cảnh báo, trả kết quả giả) cho
tới khi bạn điền key thật.

Test bằng cách chèn tay 1 job (SQL Editor, `chapter_id` phải là 1 chương
có thật):

```sql
insert into public.quest_generation_jobs (chapter_id) values ('<uuid chương>');
```

Đợi tối đa `POLL_INTERVAL_SECONDS`, kiểm lại:

```sql
select * from public.quest_generation_jobs order by created_at desc limit 5;
```

`GET /healthz` — health check cho platform hosting (không kiểm worker
loop, chỉ xác nhận process FastAPI sống).

## Deploy

Container hoá qua `Dockerfile` có sẵn — build/run:

```bash
docker build -t quest-worker .
docker run --env-file .env -p 8000:8000 quest-worker
```

Deploy lên Railway/Render/VPS (spec không chốt platform cụ thể) — set
đúng 4 biến môi trường bắt buộc: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `POLL_INTERVAL_SECONDS`
(xem `.env.example` cho danh sách đầy đủ + mô tả).

**Bảo mật:** `SUPABASE_SERVICE_ROLE_KEY` ở đây là key RIÊNG cho service
này (không dùng chung key của Next.js) — bypass RLS hoàn toàn, không bao
giờ lộ ra frontend/log/commit.

## Cấu trúc

```
app/
  main.py             # FastAPI app + lifespan khởi động worker loop nền
  worker.py           # poll -> process -> sleep, retry/backoff
  claude_client.py    # PLACEHOLDER — chưa có pipeline sinh quest thật
  supabase_client.py  # 1 client dùng chung, service-role key
  config.py           # đọc biến môi trường
```

## Chưa làm (ngoài phạm vi skeleton này)

- Next.js **chưa** tự insert job vào `quest_generation_jobs` khi publish
  chương — test bằng insert tay cho tới khi hạ tầng này được xác nhận ổn
  định, rồi mới wire route publish chương thật.
- Chưa có `quest_candidates`, chưa có entity extraction, chưa có
  few-shot từ `quest_examples_pool`, chưa có rule-based check
  (verifiability/dedup/spoiler_risk) — đây là toàn bộ Phase 2 đầy đủ,
  cắm sau khi hạ tầng poll/process/log này chạy ổn định trên môi trường
  thật (đúng khuyến nghị thứ tự trong spec).
- Chưa scale nhiều worker instance cùng lúc — `claim_queued_jobs()`
  trong `worker.py` có ghi rõ cần đổi sang claim atomic (UPDATE ...
  RETURNING) trước khi chạy >1 instance.
