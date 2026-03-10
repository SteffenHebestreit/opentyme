FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# CPU-only PyTorch (no GPU dependencies)
RUN pip install --no-cache-dir \
    torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# ASR dependencies
RUN pip install --no-cache-dir \
    "qwen-asr>=0.0.5" \
    "fastapi>=0.104.0" \
    "uvicorn[standard]>=0.24.0" \
    "python-multipart>=0.0.6" \
    "soundfile>=0.12.0" \
    "numpy>=1.24.0,<2.0.0" \
    "aiofiles>=23.1.0" \
    "librosa>=0.10.0"

# Build context is ./services/ — copy app from submodule
COPY tts-stt-playground/qwen3-asr-service/app.py .

EXPOSE 5002

ENV QWEN3_ASR_MODEL=Qwen/Qwen3-ASR-1.7B

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:5002/health || exit 1

CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5002"]
