FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# 1 process, 1 container: FastAPI app + worker loop chạy nền trong cùng
# process (xem app/main.py lifespan) — không cần 2 container riêng cho
# API vs worker ở quy mô hiện tại.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
