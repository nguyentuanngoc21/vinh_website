"""
1 client dùng chung cho cả worker — supabase-py với service role key,
bypass RLS hoàn toàn. Đúng ý: `quest_generation_jobs`/`chapters` không
có policy nào cho phép Python đọc/ghi qua RLS thường (xem
migrations/20260828_add_quest_generation_jobs.sql) — chỉ service role
key mới đọc/ghi được.
"""

from supabase import Client, create_client

from app.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _client
