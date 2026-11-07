FROM python:3.12-slim AS builder

WORKDIR /app
RUN pip install --no-cache-dir uv

COPY pyproject.toml .
RUN uv pip install --system --no-cache .

# ─────────────────────────────────────
FROM python:3.12-slim AS runner

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Install Playwright + Chromium for browser automation (adds ~400 MB)
RUN pip install --no-cache-dir playwright && \
    playwright install --with-deps chromium

COPY src ./src

EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
