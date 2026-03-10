FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    build-essential \
    pkg-config \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libavfilter-dev \
    libswscale-dev \
    libswresample-dev \
    && rm -rf /var/lib/apt/lists/*

# CPU-only PyTorch (only used for device detection in app.py)
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu

# Install av from binary only first (faster-whisper 0.10.x dependency, avoid source compile)
RUN pip install --no-cache-dir av --only-binary :all: || true

# faster-whisper + dependencies
RUN pip install --no-cache-dir \
    "faster-whisper>=1.0.0" \
    "fastapi>=0.104.0" \
    "uvicorn[standard]>=0.24.0" \
    "python-multipart>=0.0.6" \
    "huggingface-hub>=0.20.0" \
    "tokenizers>=0.13.0" \
    "onnxruntime>=1.13.0" \
    "soundfile>=0.12.0" \
    "librosa"

# Build context is ./services/ — copy app from submodule
COPY tts-stt-playground/stt-service/app.py .

EXPOSE 8000

ENV WHISPER_MODEL_SIZE=distil-large-v3
ENV USE_CUDA=false

HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
