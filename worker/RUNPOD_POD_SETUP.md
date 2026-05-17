# RunPod Pod — Setup Checklist

Use a **Pod** (not Serverless) during the validation phase.
Pods have SSH access, persistent volumes, and easy debugging.

---

## 1. GPU choice

| GPU | VRAM | Status |
|-----|------|--------|
| RTX 4090 | 24 GB | ✅ Recommended — fits fp8 model comfortably |
| A100 SXM | 40/80 GB | ✅ Ideal for production |
| RTX 3090 | 24 GB | ✅ Works, slower |
| RTX 4080 | 16 GB | ⚠ Minimum — may OOM on longer videos |
| RTX 3080 | 10 GB | ✗ Too small |

**Minimum VRAM: 16 GB**
**Recommended: 24 GB (RTX 4090)**

---

## 2. RunPod template

In the RunPod console:
- Click **Deploy** → **GPU Pod**
- GPU: **RTX 4090**
- Container image: `runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04`
  *(This is the same base as the Dockerfile — no version mismatch)*
- Container disk: **50 GB** (for Docker image layers + temp files)
- Volume: **100 GB** (for model weights — ~22GB needed, leave room)
- Volume mount path: `/workspace`
- Expose TCP ports: `8888` (optional Jupyter), `8188` (ComfyUI UI if needed)

---

## 3. Network Volume (avoid re-downloading models)

Create a **Network Volume** once, mount it for every session:

1. RunPod console → **Storage** → **Network Volumes** → **Create**
2. Name: `wan-models`
3. Size: **50 GB**
4. Region: same as your Pod
5. When creating a Pod, under **Volumes**, attach this volume at `/workspace/models`

This way models persist across Pod restarts — you only download once.

---

## 4. First session — full setup

```bash
# SSH into the Pod
ssh root@<POD_IP> -p <PORT>

# Install tools
pip install huggingface_hub

# Download all model weights (~22GB)
git clone https://github.com/YOUR_ORG/motion-avatar.git /workspace/motion-avatar
cd /workspace/motion-avatar

bash worker/scripts/download-models.sh /workspace/models

# Verify
MODEL_PATH=/workspace/models npm run test:models

# Build Docker image
docker build -t wan-animate-worker:local worker/
# Takes ~10 minutes on first build

# Run GPU test
MODEL_PATH=/workspace/models npm run test:worker-gpu
```

---

## 5. Subsequent sessions (Volume already has models)

```bash
ssh root@<POD_IP> -p <PORT>
cd /workspace/motion-avatar

# Models already on volume — skip download
MODEL_PATH=/workspace/models npm run test:models      # quick check
MODEL_PATH=/workspace/models npm run test:worker-gpu  # full test
```

---

## 6. Where models go

All relative to your `MODEL_PATH` (e.g. `/workspace/models`):

```
models/
├── diffusion_models/
│   └── WanVideo/
│       └── Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors  (~14GB)
├── vae/
│   └── Wan2_1_VAE_bf16.safetensors                               (~1.5GB)
├── text_encoders/
│   └── umt5-xxl-enc-bf16.safetensors                             (~5GB)
├── clip_vision/
│   └── clip_vision_h.safetensors                                 (~600MB)
├── detection/
│   ├── yolov10m.onnx                                             (~32MB)
│   └── vitpose-l-wholebody.onnx                                  (~200MB)
├── sam2/
│   └── sam2_hiera_large.safetensors                              (~900MB)
└── loras/
    └── WanVideo/
        └── Lightx2v/
            └── lightx2v_I2V_14B_480p_...bf16.safetensors         (~400MB, optional)
```

---

## 7. Pod cost estimate

- RTX 4090: ~$0.74/hr on RunPod
- One GPU test (quality=fast): ~3-5 minutes → **~$0.05**
- Model download session (one-time): ~30 minutes → **~$0.37**

Stop the Pod when not in use. Models persist on the Network Volume.
