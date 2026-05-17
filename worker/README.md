# Wan2.2-Animate Worker — ComfyUI Self-Hosted

Character replacement via Wan2.2-Animate running in ComfyUI inside Docker.

**Current phase:** Debug on RunPod Pod
**Next phase:** Migrate to RunPod Serverless when workflow is validated

---

## Architecture

```
User's browser
  ↓ (Next.js API route)
RunPod Pod or Serverless
  ↓ (handler.py)
ComfyUI (port 8188, inside container)
  ↓ (wan22_animate_replace_api.json workflow)
Wan2.2-Animate-14B
  ↓ (mp4 output)
Supabase Storage  (or /tmp in LOCAL_TEST mode)
  ↓
User downloads output video
```

---

## Files

```
worker/
├── handler.py                           RunPod job handler
├── start.sh                             Startup: checks + ComfyUI + handler
├── Dockerfile                           Container image
├── requirements.txt                     Python deps (runpod)
├── test_payload.json                    Test job payload
├── MODELS.md                            All models: names, sources, paths, sizes
├── workflows/
│   ├── wan22_animate_replace_api.json   Real ComfyUI API workflow (replace mode)
│   └── wan_animate.json                 Animation mode (secondary)
└── README.md                            This file
```

---

## Prerequisites

### 1. Docker + NVIDIA GPU

```bash
# Verify GPU available
nvidia-smi

# Verify NVIDIA Container Toolkit
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

### 2. Model weights (~22GB)

Download all required models — see `worker/MODELS.md` for exact sources.

Quick download:
```bash
export BASE=/your/models/dir
pip install huggingface_hub
# Run the download script at the bottom of MODELS.md
```

### 3. Docker image

```bash
cd worker/
docker build -t wan-animate-worker:local .
# Takes 5-10 minutes
```

---

## Test locally

### Smoke test (no GPU, no models needed)

```bash
npm run test:worker-local    # verifies startup, nodes installed, workflow valid
```

### Full GPU test (requires GPU + models)

```bash
# Set model path and run
MODEL_PATH=/your/models npm run test:worker-gpu

# With custom test files
TEST_VIDEO=/path/to/video.mp4 \
TEST_IMAGE=/path/to/character.png \
MODEL_PATH=/your/models \
npm run test:worker-gpu
```

**Expected output:**
```
Phase 1 — Prerequisites     ✓ Docker, GPU found
Phase 2 — Model weights     ✓ All subdirectories present
Phase 3 — Docker image      ✓ Image exists
Phase 4 — ComfyUI nodes     ✓ All 15 required nodes loaded
Phase 5 — Real inference    [2-10 minutes on RTX 4090]
Phase 6 — Validation        ✓ Duration > 0, codec: h264, 480x854
Output: /tmp/wan-gpu-test/wan_output_XXXX.mp4
```

---

## RunPod Pod (debug phase)

Use a **RunPod Pod** (not Serverless) while validating the ComfyUI workflow.
Pods give you SSH access, persistent storage, and easier debugging.

### Step 1 — Create Pod

In the RunPod console:
- GPU: **RTX 4090 (24GB)** — needed for Wan2.2-Animate-14B
- Container image: `runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04`
- Disk: 100GB (for models + temp files)
- Expose port 8888 (Jupyter, optional)

### Step 2 — SSH into Pod and setup

```bash
# SSH in
ssh root@YOUR_POD_IP -p YOUR_PORT

# Clone your repo
git clone https://github.com/YOUR_ORG/motion-avatar.git
cd motion-avatar/worker

# Download models
pip install huggingface_hub
# Run download commands from MODELS.md:
BASE=/workspace/comfyui_models
mkdir -p $BASE/{diffusion_models/WanVideo,vae,text_encoders,clip_vision,detection,sam2}

huggingface-cli download Kijai/WanVideo_comfy_fp8_scaled \
  --include "Wan22Animate/*" --local-dir $BASE/diffusion_models/WanVideo

huggingface-cli download Kijai/WanVideo_comfy Wan2_1_VAE_bf16.safetensors \
  --local-dir $BASE/vae

huggingface-cli download Kijai/WanVideo_comfy umt5-xxl-enc-bf16.safetensors \
  --local-dir $BASE/text_encoders

huggingface-cli download Kijai/WanVideo_comfy clip_vision_h.safetensors \
  --local-dir $BASE/clip_vision

huggingface-cli download Wan-AI/Wan2.2-Animate-14B \
  process_checkpoint/det/yolov10m.onnx --local-dir /tmp/yolo-dl
cp /tmp/yolo-dl/process_checkpoint/det/yolov10m.onnx $BASE/detection/yolov10m.onnx

huggingface-cli download JunkyByte/easy_ViTPose \
  onnx/wholebody/vitpose-l-wholebody.onnx --local-dir /tmp/vitpose-dl
cp /tmp/vitpose-dl/onnx/wholebody/vitpose-l-wholebody.onnx $BASE/detection/vitpose-l-wholebody.onnx

huggingface-cli download Kijai/sam2-safetensors sam2_hiera_large.safetensors \
  --local-dir $BASE/sam2
```

### Step 3 — Build and run

```bash
# Build image
cd motion-avatar/worker
docker build -t wan-animate-worker:local .

# Run GPU test
docker run --rm --gpus all \
  -e LOCAL_TEST=true \
  -e COMFYUI_HOST=http://127.0.0.1:8188 \
  -e WAN_WORKFLOW_PATH=/app/workflows/wan22_animate_replace_api.json \
  -e COMFYUI_OUTPUT_DIR=/comfyui/output \
  -v /workspace/comfyui_models:/comfyui/models:ro \
  -v /tmp/gpu-output:/tmp \
  -e RUNPOD_TEST_INPUT='{"id":"pod-test-001","input":{"user_video_url":"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4","character_image_url":"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&h=512&fit=crop&crop=face","quality":"fast","mode":"replacement","keep_original_audio":true}}' \
  wan-animate-worker:local \
  bash -c '
    /app/start.sh &
    sleep 120
    python3 -c "
import json, os, types, runpod, sys
runpod.serverless = types.SimpleNamespace(start=lambda cfg: None)
sys.path.insert(0, \"/app\")
import handler
result = handler.handler(json.loads(os.environ[\"RUNPOD_TEST_INPUT\"]))
print(\"RESULT:\", json.dumps(result, indent=2))
"
  '
```

### Step 4 — Retrieve output

```bash
# Output is saved to /tmp/gpu-output/ (mapped to container's /tmp)
ls -la /tmp/gpu-output/
# Download from Pod
scp root@YOUR_POD_IP:/tmp/gpu-output/*.mp4 ./output/
```

---

## RunPod Serverless (production, after validation)

**Only migrate to Serverless after the Pod test produces a real video.**

Serverless endpoint settings:
| Setting | Value |
|---------|-------|
| Container image | `your-registry/wan-animate-worker:latest` |
| GPU | RTX 4090 (24GB) |
| Min workers | **0** (scale-to-zero) |
| Max workers | 1 |
| Idle timeout | **5 seconds** |
| Flash boot | **ON** |
| Network Volume | Mount at `/comfyui/models` |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCAL_TEST` | `false` | Save to `/tmp` instead of uploading to Supabase |
| `COMFYUI_HOST` | `http://127.0.0.1:8188` | ComfyUI API URL |
| `COMFYUI_OUTPUT_DIR` | `/comfyui/output` | ComfyUI output directory |
| `COMFYUI_MODELS` | `/comfyui/models` | ComfyUI models root |
| `WAN_WORKFLOW_PATH` | `/app/workflows/wan22_animate_replace_api.json` | Workflow JSON |
| `SUPABASE_URL` | — | Required unless `LOCAL_TEST=true` |
| `SUPABASE_SERVICE_KEY` | — | Required unless `LOCAL_TEST=true` |
| `WAN_DIFFUSION_MODEL` | (auto-detected) | Override diffusion model filename |
| `WAN_VAE_MODEL` | (auto-detected) | Override VAE filename |

---

## ⚠ This worker is NOT production-ready until

`npm run test:worker-gpu` produces a real video with:
- Duration > 0
- Resolution detected by ffprobe
- Codec: h264
- Visible character replacement (not just a copy of the input)

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `WanVideoModelLoader not loaded` | Custom node not installed | Rebuild Docker image |
| `CUDA out of memory` | <16GB VRAM | Use `quality=fast`, or upgrade GPU |
| `No prompt_id returned` | ComfyUI rejected workflow | Check node names match installed version |
| `No output video found` | ComfyUI completed but no file | Check ComfyUI logs, model weights |
| `diffusion model not found` | Wrong model path | Check `MODELS.md`, verify `WAN_DIFFUSION_MODEL` |
| `SAM2 model not found` | SAM2 weights missing | Download `sam2_hiera_large.safetensors` |
| `ffmpeg not found` | Not in PATH | Verify Dockerfile `apt-get install ffmpeg` |
| `Supabase 401/403` | Wrong key or bucket missing | Check `SUPABASE_SERVICE_KEY`, create bucket |
