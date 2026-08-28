"""
Poll -> process -> sleep, đúng khuyến nghị spec ("bắt đầu bằng bảng
quest_generation_jobs + skeleton FastAPI worker (poll -> gọi Claude API
placeholder -> ghi log)"). Retry: lỗi -> tăng attempts, đưa job về
'queued' để lượt poll SAU tự nhặt lại (đây chính là "backoff" ở phase
skeleton này — khoảng cách giữa các lần retry = POLL_INTERVAL_SECONDS,
không có backoff tăng dần riêng) — tối đa MAX_ATTEMPTS lần, sau đó
status='failed' hẳn + ghi error_message, không kẹt vô hạn ở 'processing'.
"""

import asyncio
import logging
from datetime import datetime, timezone

from app.claude_client import ping_claude_for_chapter
from app.config import JOB_BATCH_SIZE, MAX_ATTEMPTS, POLL_INTERVAL_SECONDS
from app.supabase_client import get_client

logger = logging.getLogger("quest_worker")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def claim_queued_jobs() -> list[dict]:
    """
    Lấy tối đa JOB_BATCH_SIZE job 'queued', chuyển sang 'processing'.

    KHÔNG atomic ở mức "1 UPDATE ... RETURNING" (khác pattern claim của
    deposit-service.ts) — chấp nhận được ở phase skeleton này vì CHỈ
    CHẠY 1 INSTANCE worker duy nhất. Nếu sau này scale ra nhiều instance
    cùng lúc, PHẢI đổi sang 1 UPDATE atomic (select for update skip
    locked, hoặc update...returning trực tiếp) để 2 worker không cùng
    nhặt trùng 1 job.
    """
    supabase = get_client()
    result = (
        supabase.table("quest_generation_jobs")
        .select("*")
        .eq("status", "queued")
        .order("created_at")
        .limit(JOB_BATCH_SIZE)
        .execute()
    )
    jobs = result.data or []
    if not jobs:
        return []

    ids = [job["id"] for job in jobs]
    supabase.table("quest_generation_jobs").update({"status": "processing", "updated_at": _now_iso()}).in_(
        "id", ids
    ).execute()
    return jobs


def process_job(job: dict) -> None:
    supabase = get_client()
    job_id = job["id"]
    chapter_id = job["chapter_id"]
    attempts = job["attempts"] + 1

    try:
        result = ping_claude_for_chapter(chapter_id)
        logger.info("Job %s xử lý xong: %s", job_id, result)
        supabase.table("quest_generation_jobs").update(
            {"status": "done", "attempts": attempts, "updated_at": _now_iso(), "error_message": None}
        ).eq("id", job_id).execute()
    except Exception as exc:  # noqa: BLE001 — worker phải sống sót qua MỌI lỗi 1 job, không crash cả loop
        logger.exception("Job %s lỗi (lần %s/%s)", job_id, attempts, MAX_ATTEMPTS)
        next_status = "failed" if attempts >= MAX_ATTEMPTS else "queued"
        supabase.table("quest_generation_jobs").update(
            {
                "status": next_status,
                "attempts": attempts,
                "updated_at": _now_iso(),
                "error_message": str(exc)[:2000],
            }
        ).eq("id", job_id).execute()


async def run_worker_loop() -> None:
    logger.info("Quest generation worker started — poll mỗi %ss.", POLL_INTERVAL_SECONDS)
    while True:
        try:
            jobs = claim_queued_jobs()
            for job in jobs:
                process_job(job)
        except Exception:  # noqa: BLE001 — 1 lượt poll lỗi không được dừng cả worker
            logger.exception("Lỗi ở vòng poll — thử lại ở lượt kế tiếp.")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
