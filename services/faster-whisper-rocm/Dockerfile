FROM rocm/dev-ubuntu-22.04:6.2-complete

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3-pip \
    ffmpeg \
    curl \
    git \
    pkg-config \
    libavformat-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavutil-dev \
    libavfilter-dev \
    libswscale-dev \
    libswresample-dev \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    ln -sf /usr/bin/python3.11 /usr/bin/python

RUN pip3 install --upgrade pip wheel setuptools

# Non-torch deps first
RUN pip3 install --no-cache-dir \
    "fastapi>=0.104.0" \
    "uvicorn[standard]>=0.24.0" \
    "python-multipart>=0.0.6" \
    "huggingface-hub>=0.20.0" \
    "tokenizers>=0.13.0" \
    "onnxruntime>=1.13.0" \
    "soundfile>=0.12.0" \
    "librosa"

# ROCm PyTorch LAST — must not be overwritten by any dep
RUN pip3 install --no-cache-dir torch torchaudio \
    --index-url https://download.pytorch.org/whl/rocm6.2

# CTranslate2 4.x+ has experimental HIP support; falls back gracefully to CPU in app.py
RUN pip3 install --no-cache-dir "ctranslate2>=4.0.0" || \
    pip3 install --no-cache-dir "ctranslate2>=3.8.0"

# faster-whisper after ctranslate2 so it uses the already-installed version
RUN pip3 install --no-cache-dir "faster-whisper>=1.0.0" --no-deps && \
    pip3 install --no-cache-dir "faster-whisper>=1.0.0"

# Build context is ./services/ — copy app from submodule
COPY tts-stt-playground/stt-service/app.py .

EXPOSE 8000

ENV WHISPER_MODEL_SIZE=large-v3
ENV FORCE_ACCELERATION=rocm

HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
