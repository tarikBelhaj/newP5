# ================================================================
# Wan2.2-Animate Worker — ComfyUI Self-Hosted
# ================================================================
#
# Build:
#   docker build -t wan-animate-worker:local .
#
# GPU requirements: ≥16GB VRAM (RTX 4090 24GB recommended)
# Model weights: ~22GB, downloaded separately (see MODELS.md)
#
# RunPod Pod (debug phase):
#   Use a Pod with RTX 4090, mount models via Network Volume
#
# RunPod Serverless (production):
#   Deploy when ComfyUI workflow is validated on a Pod

FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# ── System deps ──────────────────────────────────────────────────

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    wget \
    curl \
    python3-pip \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN ffmpeg -version | head -1 && ffprobe -version | head -1

# ── Python deps ──────────────────────────────────────────────────

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir huggingface_hub

# ── ComfyUI ──────────────────────────────────────────────────────

RUN git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git /comfyui
RUN cd /comfyui && pip install --no-cache-dir -r requirements.txt
RUN mkdir -p /comfyui/{input,output,temp,models/{diffusion_models/WanVideo,vae,text_encoders,clip_vision,detection,sam2,loras/WanVideo/Lightx2v}}

# ── Custom node 1: ComfyUI-WanVideoWrapper (kijai) ───────────────
# Main Wan2.2 nodes: WanVideoModelLoader, WanVideoSampler, WanVideoDecode, etc.

RUN cd /comfyui/custom_nodes && \
    git clone --depth 1 https://github.com/kijai/ComfyUI-WanVideoWrapper.git && \
    cd ComfyUI-WanVideoWrapper && \
    pip install --no-cache-dir -r requirements.txt

# ── Custom node 2: ComfyUI-WanAnimatePreprocess (kijai) ──────────
# Preprocessing nodes: OnnxDetectionModelLoader, PoseAndFaceDetection

RUN cd /comfyui/custom_nodes && \
    git clone --depth 1 https://github.com/kijai/ComfyUI-WanAnimatePreprocess.git && \
    cd ComfyUI-WanAnimatePreprocess && \
    pip install --no-cache-dir -r requirements.txt

# ── Custom node 3: ComfyUI-VideoHelperSuite (Kosinkadink) ────────
# Video I/O: VHS_LoadVideo, VHS_VideoCombine

RUN cd /comfyui/custom_nodes && \
    git clone --depth 1 https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git && \
    cd ComfyUI-VideoHelperSuite && \
    pip install --no-cache-dir -r requirements.txt 2>/dev/null || true

# ── Custom node 4: ComfyUI-segment-anything-2 ───────────────────
# SAM2 segmentation: SAM2ModelLoader, Sam2Segmentation

RUN cd /comfyui/custom_nodes && \
    git clone --depth 1 https://github.com/kijai/ComfyUI-segment-anything-2.git && \
    cd ComfyUI-segment-anything-2 && \
    pip install --no-cache-dir -r requirements.txt 2>/dev/null || true

# ── Worker files ─────────────────────────────────────────────────

COPY handler.py   /app/handler.py
COPY start.sh     /app/start.sh
COPY workflows/   /app/workflows/

RUN chmod +x /app/start.sh

# ── Environment defaults ──────────────────────────────────────────

ENV COMFYUI_HOST=http://127.0.0.1:8188
ENV COMFYUI_OUTPUT_DIR=/comfyui/output
ENV COMFYUI_MODELS=/comfyui/models
ENV WAN_WORKFLOW_PATH=/app/workflows/wan22_animate_replace_api.json
ENV LOCAL_TEST=false

# Model weights are mounted at runtime via:
#   -v /your/models:/comfyui/models:ro
# or via RunPod Network Volume mounted at /comfyui/models

CMD ["/app/start.sh"]
