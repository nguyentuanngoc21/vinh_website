"""
Cấu hình từ biến môi trường — tối thiểu theo đúng spec ("Hạ tầng Python
server"): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
POLL_INTERVAL_SECONDS. Service role key này RIÊNG cho Python, KHÔNG dùng
chung anon key với Next.js — cần quyền đọc `chapters`, đọc/ghi
`quest_generation_jobs` (chưa đọc/ghi `quest_candidates` — bảng đó thuộc
pipeline đầy đủ Phase 2, chưa cắm ở phase skeleton này).
"""

import os

from dotenv import load_dotenv

load_dotenv()


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


SUPABASE_URL = _require("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = _require("SUPABASE_SERVICE_ROLE_KEY")

# KHÔNG bắt buộc lúc khởi động — worker chạy được ở dạng "khung" (poll/
# process/log) mà chưa có key thật; gọi Claude API sẽ tự log cảnh báo và
# trả kết quả giả (xem app/claude_client.py) thay vì crash toàn service.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "45"))
MAX_ATTEMPTS = int(os.environ.get("MAX_ATTEMPTS", "3"))
JOB_BATCH_SIZE = int(os.environ.get("JOB_BATCH_SIZE", "5"))
