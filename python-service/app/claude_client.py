"""
PLACEHOLDER — chưa có prompt/pipeline sinh quest thật (Phase 2 đầy đủ:
tiền xử lý entity, few-shot từ quest_examples_pool, rule-based check —
xem prompt triển khai Quest System, mục "Pipeline" + "Ràng buộc kỹ thuật
khi generate câu hỏi"). Hàm dưới đây chỉ xác nhận đường dây gọi Claude
API thông suốt, log input/output tóm tắt — KHÔNG sinh quest thật, KHÔNG
ghi vào quest_candidates. Đổi hẳn nội dung hàm này khi cắm pipeline thật.
"""

import logging

import anthropic

from app.config import ANTHROPIC_API_KEY

logger = logging.getLogger("quest_worker")

# claude-opus-5 mặc định theo khuyến nghị hiện tại cho code Claude API
# mới — CHỈNH LẠI khi cắm pipeline thật (Phase 2 đầy đủ): lúc đó cân
# nhắc model/effort theo đúng khối lượng + độ khó của prompt generate
# quest thật, không phải theo mặc định của 1 lệnh ping test hạ tầng.
MODEL = "claude-opus-5"


def ping_claude_for_chapter(chapter_id: str) -> dict:
    """Gọi placeholder cho 1 job — trả dict tóm tắt để worker log/ghi lại.
    Raise lại mọi lỗi Claude API (không tự nuốt) để worker.py tự quyết
    retry/fail theo đúng attempts/MAX_ATTEMPTS."""
    if not ANTHROPIC_API_KEY:
        logger.warning(
            "ANTHROPIC_API_KEY chưa cấu hình — bỏ qua lời gọi Claude thật, trả kết quả giả cho chapter %s",
            chapter_id,
        )
        return {"stub": True, "chapter_id": chapter_id}

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=64,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Ping — xác nhận pipeline Quest System hoạt động cho chapter {chapter_id}. "
                        "Trả lời đúng 1 câu ngắn xác nhận đã nhận được."
                    ),
                }
            ],
        )
    except anthropic.AuthenticationError:
        logger.error("ANTHROPIC_API_KEY không hợp lệ.")
        raise
    except anthropic.RateLimitError as exc:
        retry_after = exc.response.headers.get("retry-after", "60") if exc.response else "60"
        logger.warning("Claude API rate limited — thử lại sau %ss (ở lượt poll kế tiếp).", retry_after)
        raise
    except anthropic.APIConnectionError:
        logger.error("Không kết nối được Claude API.")
        raise
    except anthropic.APIStatusError as exc:
        logger.error("Claude API lỗi (status %s): %s", exc.status_code, exc.message)
        raise

    text = next((block.text for block in response.content if block.type == "text"), "")
    logger.info("Claude ping OK cho chapter %s: %s", chapter_id, text[:200])
    return {"stub": False, "chapter_id": chapter_id, "response_text": text}
