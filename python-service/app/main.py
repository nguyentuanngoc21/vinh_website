"""
FastAPI app — theo đúng khuyến nghị spec: viết theo cấu trúc FastAPI dù
giai đoạn đầu chỉ cần 1 worker loop chạy nền, để sau này dễ thêm endpoint
quản trị (vd admin trigger regenerate thủ công 1 chương) mà không phải
tái cấu trúc lại từ 1 script rời.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.worker import run_worker_loop

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    worker_task = asyncio.create_task(run_worker_loop())
    try:
        yield
    finally:
        worker_task.cancel()


app = FastAPI(title="Vinh Quest Generation Worker", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict:
    """Health check cho platform hosting (Railway/Render) — chỉ xác nhận
    process FastAPI còn chạy, KHÔNG tự kiểm worker loop có đang sống."""
    return {"ok": True}
