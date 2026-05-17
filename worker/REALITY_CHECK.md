# Wan2.2-Animate via ComfyUI — Reality Check

This document replaces the optimistic assumptions in the original worker implementation
with what is actually required to run Wan2.2-Animate via ComfyUI in a Docker container.

## What the original worker assumed (INCORRECT)

The original workflow used nodes that don't exist:
- `WanVideoAnimateSampler` — does NOT exist in ComfyUI-WanVideoWrapper
- `WanVideoWrapperModelLoader` — does NOT exist (real name is `WanVideoModelLoader`)

The original workflow also assumed a simple 5-node pipeline. The real pipeline is 25+ nodes.

## What Wan2.2-Animate actually requires

### Models required (total ~40GB+)

| Model | Size | Path |
|-------|------|------|
| `wan2.2_animate_14B_bf16.safetensors` or `Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors` | ~28GB | `models/diffusion_models/` |
| `wan_2.1_vae.safetensors` | ~1.5GB | `models/vae/` |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | ~5GB | `models/text_encoders/` |
| `clip_vision_h.safetensors` | ~1GB | `models/clip_visions/` |
| `yolov10m.onnx` (from Wan2.2-Animate-14B repo) | ~30MB | `models/detection/` |
| `vitpose-l-wholebody.onnx` | ~200MB | `models/detection/` |
| SAM2 model | ~300MB | `models/` |

### Custom nodes required

- `ComfyUI-WanVideoWrapper` (kijai) — main Wan nodes
- `ComfyUI-WanAnimatePreprocess` (kijai) — ViTPose + YOLO preprocessing
- `ComfyUI-VideoHelperSuite` (Kosinkadink) — video I/O
- `ComfyUI-segment-anything-2` — SAM2 masking

### Real pipeline (simplified)

```
VHS_LoadVideo (driving video)
  ↓
WanAnimatePreprocess (ViTPose + YOLO → keypoints, face crops)
  ↓
SAM2 (segment the person → mask)
  ↓
LoadImage (reference/character image)
  ↓
WanVideoModelLoader (loads diffusion model + VAE + text encoder)
  ↓
WanVideoTextEncode (T5 text embeddings)
  ↓
WanVideoAnimateEmbeds (combines pose keypoints + face crops + clip vision)
  ↓
WanVideoSampler (KSampler-like, runs diffusion)
  ↓
WanVideoVAEDecode
  ↓
VHS_VideoCombine (output mp4)
```

## Recommended approach for MVP

### Option A — fal.ai managed API (RECOMMENDED for MVP)

Use `fal-ai/wan/v2.2-14b/animate/replace` directly.
- No model management
- No Docker complexity
- Pay per video-second
- Works today with `AI_PROVIDER=wan-animate`

### Option B — RunPod with fal.ai proxy

Deploy the RunPod worker but have it call fal.ai internally instead of running ComfyUI.
Adds latency overhead but separates cost from fal.ai's per-second billing.

### Option C — Full self-hosted ComfyUI (complex, production-grade)

Build the proper 25+ node workflow, download all models (~40GB), deploy to RunPod with
a large Network Volume. This is the path to full control and cost optimization at scale.
Use the example workflow from:
https://github.com/kijai/ComfyUI-WanVideoWrapper/blob/main/example_workflows/wanvideo_WanAnimate_preprocess_example_02.json

## Status of this worker

The current `handler.py` is architecturally correct for a ComfyUI-based worker but:
1. The `workflows/wan_replace.json` uses incorrect node names (stubs, not real ComfyUI nodes)
2. The real workflow requires downloading and adapting the official kijai example workflow
3. Additional preprocessing models (ViTPose, YOLO, SAM2) are needed

**To make this worker production-ready:**
1. Download the real workflow JSON from kijai's repo
2. Download all required models (~40GB)
3. Adapt `patch_workflow()` in handler.py to match real node names
4. Test with the 3-level test system (`npm run test:worker-local` → `npm run test:worker-gpu`)
