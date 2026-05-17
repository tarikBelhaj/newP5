# Wan2.2-Animate — Required Models

All paths are relative to the ComfyUI root directory (`/comfyui/`).

---

## 1. Diffusion model (main model) — REQUIRED

| Field | Value |
|-------|-------|
| File | `Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors` |
| Source | https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled/tree/main/Wan22Animate |
| Path | `models/diffusion_models/WanVideo/` |
| Size | ~14 GB |
| Notes | fp8 scaled version — smaller, faster, minimal quality loss vs bf16 |

**Alternative (bf16, higher quality, larger):**

| File | `wan2.2_animate_14B_bf16.safetensors` |
|------|---------------------------------------|
| Source | https://huggingface.co/Wan-AI/Wan2.2-Animate-14B |
| Path | `models/diffusion_models/WanVideo/` |
| Size | ~28 GB |

**Download:**
```bash
# fp8 (recommended for most GPUs)
huggingface-cli download Kijai/WanVideo_comfy_fp8_scaled \
  --include "Wan22Animate/*" \
  --local-dir /comfyui/models/diffusion_models/WanVideo
```

---

## 2. VAE — REQUIRED

| Field | Value |
|-------|-------|
| File | `Wan2_1_VAE_bf16.safetensors` |
| Source | https://huggingface.co/Kijai/WanVideo_comfy/blob/main/Wan2_1_VAE_bf16.safetensors |
| Path | `models/vae/` |
| Size | ~1.5 GB |

```bash
huggingface-cli download Kijai/WanVideo_comfy \
  Wan2_1_VAE_bf16.safetensors \
  --local-dir /comfyui/models/vae
```

---

## 3. Text encoder (UMT5-XXL) — REQUIRED

| Field | Value |
|-------|-------|
| File | `umt5-xxl-enc-bf16.safetensors` |
| Source | https://huggingface.co/Kijai/WanVideo_comfy/blob/main/umt5-xxl-enc-bf16.safetensors |
| Path | `models/text_encoders/` |
| Size | ~5 GB |

```bash
huggingface-cli download Kijai/WanVideo_comfy \
  umt5-xxl-enc-bf16.safetensors \
  --local-dir /comfyui/models/text_encoders
```

---

## 4. CLIP Vision — REQUIRED

| Field | Value |
|-------|-------|
| File | `clip_vision_h.safetensors` |
| Source | https://huggingface.co/Kijai/WanVideo_comfy/blob/main/clip_vision_h.safetensors |
| Path | `models/clip_vision/` |
| Size | ~600 MB |

```bash
huggingface-cli download Kijai/WanVideo_comfy \
  clip_vision_h.safetensors \
  --local-dir /comfyui/models/clip_vision
```

---

## 5. YOLO detection model — REQUIRED (preprocessing)

| Field | Value |
|-------|-------|
| File | `yolov10m.onnx` |
| Source | https://huggingface.co/Wan-AI/Wan2.2-Animate-14B/blob/main/process_checkpoint/det/yolov10m.onnx |
| Path | `models/detection/` |
| Size | ~32 MB |

```bash
huggingface-cli download Wan-AI/Wan2.2-Animate-14B \
  process_checkpoint/det/yolov10m.onnx \
  --local-dir /tmp/wan-animate-det

mkdir -p /comfyui/models/detection
cp /tmp/wan-animate-det/process_checkpoint/det/yolov10m.onnx \
   /comfyui/models/detection/yolov10m.onnx
```

---

## 6. ViTPose ONNX (pose estimation) — REQUIRED (preprocessing)

Use the Large model (simpler, single file):

| Field | Value |
|-------|-------|
| File | `vitpose-l-wholebody.onnx` |
| Source | https://huggingface.co/JunkyByte/easy_ViTPose/blob/main/onnx/wholebody/vitpose-l-wholebody.onnx |
| Path | `models/detection/` |
| Size | ~200 MB |

```bash
huggingface-cli download JunkyByte/easy_ViTPose \
  onnx/wholebody/vitpose-l-wholebody.onnx \
  --local-dir /tmp/vitpose

cp /tmp/vitpose/onnx/wholebody/vitpose-l-wholebody.onnx \
   /comfyui/models/detection/vitpose-l-wholebody.onnx
```

---

## 7. SAM2 — REQUIRED (background masking)

| Field | Value |
|-------|-------|
| File | `sam2_hiera_large.pt` |
| Source | https://huggingface.co/Kijai/sam2-safetensors/blob/main/sam2_hiera_large.safetensors |
| Path | `models/sam2/` |
| Size | ~900 MB |

```bash
huggingface-cli download Kijai/sam2-safetensors \
  sam2_hiera_large.safetensors \
  --local-dir /comfyui/models/sam2
```

---

## 8. Lightx2v LoRA (4-step acceleration) — OPTIONAL but recommended

| Field | Value |
|-------|-------|
| File | `lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors` |
| Source | https://huggingface.co/Kijai/WanVideo_comfy/tree/main/Lightx2v |
| Path | `models/loras/WanVideo/Lightx2v/` |
| Size | ~400 MB |
| Effect | Reduces inference from 20 steps to 4-6 steps — ~5x faster |

```bash
huggingface-cli download Kijai/WanVideo_comfy \
  --include "Lightx2v/*" \
  --local-dir /comfyui/models/loras/WanVideo
```

---

## Summary table

| # | Model | Required | Size | Path |
|---|-------|----------|------|------|
| 1 | Wan2.2-Animate fp8 diffusion model | ✅ YES | ~14 GB | `models/diffusion_models/WanVideo/` |
| 2 | Wan2.1 VAE bf16 | ✅ YES | ~1.5 GB | `models/vae/` |
| 3 | UMT5-XXL text encoder bf16 | ✅ YES | ~5 GB | `models/text_encoders/` |
| 4 | CLIP Vision H | ✅ YES | ~600 MB | `models/clip_vision/` |
| 5 | YOLOv10m ONNX | ✅ YES | ~32 MB | `models/detection/` |
| 6 | ViTPose-L wholebody ONNX | ✅ YES | ~200 MB | `models/detection/` |
| 7 | SAM2 hiera large | ✅ YES | ~900 MB | `models/sam2/` |
| 8 | Lightx2v LoRA (step distill) | ⚡ Optional | ~400 MB | `models/loras/WanVideo/Lightx2v/` |

**Total required: ~22 GB** (fp8 diffusion model)
**Total with bf16 diffusion model: ~35 GB**

---

## Download all required models (script)

```bash
#!/bin/bash
# Run this on the RunPod Pod or any machine with enough disk space
# Requires: pip install huggingface_hub

BASE=/comfyui/models
mkdir -p $BASE/{diffusion_models/WanVideo,vae,text_encoders,clip_vision,detection,sam2,loras/WanVideo/Lightx2v}

# 1. Diffusion model (fp8, ~14GB)
huggingface-cli download Kijai/WanVideo_comfy_fp8_scaled \
  --include "Wan22Animate/*" \
  --local-dir $BASE/diffusion_models/WanVideo

# 2. VAE
huggingface-cli download Kijai/WanVideo_comfy \
  Wan2_1_VAE_bf16.safetensors \
  --local-dir $BASE/vae

# 3. Text encoder
huggingface-cli download Kijai/WanVideo_comfy \
  umt5-xxl-enc-bf16.safetensors \
  --local-dir $BASE/text_encoders

# 4. CLIP Vision
huggingface-cli download Kijai/WanVideo_comfy \
  clip_vision_h.safetensors \
  --local-dir $BASE/clip_vision

# 5. YOLO
huggingface-cli download Wan-AI/Wan2.2-Animate-14B \
  process_checkpoint/det/yolov10m.onnx \
  --local-dir /tmp/yolo-dl
cp /tmp/yolo-dl/process_checkpoint/det/yolov10m.onnx $BASE/detection/yolov10m.onnx

# 6. ViTPose
huggingface-cli download JunkyByte/easy_ViTPose \
  onnx/wholebody/vitpose-l-wholebody.onnx \
  --local-dir /tmp/vitpose-dl
cp /tmp/vitpose-dl/onnx/wholebody/vitpose-l-wholebody.onnx $BASE/detection/vitpose-l-wholebody.onnx

# 7. SAM2
huggingface-cli download Kijai/sam2-safetensors \
  sam2_hiera_large.safetensors \
  --local-dir $BASE/sam2

# 8. Lightx2v LoRA (optional, but recommended)
huggingface-cli download Kijai/WanVideo_comfy \
  --include "Lightx2v/*" \
  --local-dir $BASE/loras/WanVideo

echo "All models downloaded."
du -sh $BASE
```
