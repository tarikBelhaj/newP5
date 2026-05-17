#!/bin/bash
# ================================================================
# Wan2.2-Animate Worker — Startup Script
# ================================================================
set -euo pipefail

echo "================================================================"
echo " Wan2.2-Animate Worker (ComfyUI self-hosted)"
echo " LOCAL_TEST=${LOCAL_TEST:-false}"
echo " $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "================================================================"

# ── Pre-flight ───────────────────────────────────────────────────

echo ""
echo "── System checks ──────────────────────────────────────────────"
command -v ffmpeg &>/dev/null \
    && echo "  ✓ ffmpeg: $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')" \
    || { echo "  ✗ ffmpeg not found"; exit 1; }
command -v ffprobe &>/dev/null \
    && echo "  ✓ ffprobe: OK" \
    || echo "  ⚠ ffprobe not found"
echo "  ✓ Python: $(python3 --version)"
[ -f /comfyui/main.py ] \
    && echo "  ✓ ComfyUI: /comfyui/main.py" \
    || { echo "  ✗ ComfyUI not found"; exit 1; }

echo ""
echo "── Custom nodes ───────────────────────────────────────────────"
for node in \
    "ComfyUI-WanVideoWrapper:WanVideoModelLoader" \
    "ComfyUI-WanAnimatePreprocess:OnnxDetectionModelLoader" \
    "ComfyUI-VideoHelperSuite:VHS_LoadVideo" \
    "ComfyUI-segment-anything-2:SAM2ModelLoader"
do
    dir="${node%%:*}"
    sample="${node##*:}"
    if [ -d "/comfyui/custom_nodes/$dir" ]; then
        echo "  ✓ $dir"
    else
        echo "  ✗ $dir — MISSING (rebuild Docker image)"
    fi
done

echo ""
echo "── Model weights ──────────────────────────────────────────────"
MODELS_BASE="${COMFYUI_MODELS:-/comfyui/models}"
declare -A EXPECTED_MODELS=(
    ["diffusion_models/WanVideo"]="Wan2.2-Animate diffusion model"
    ["vae"]="VAE"
    ["text_encoders"]="UMT5 text encoder"
    ["clip_vision"]="CLIP Vision"
    ["detection"]="YOLO + ViTPose"
    ["sam2"]="SAM2"
)

ALL_MODELS_OK=true
for subdir in "${!EXPECTED_MODELS[@]}"; do
    label="${EXPECTED_MODELS[$subdir]}"
    full="$MODELS_BASE/$subdir"
    if [ -d "$full" ] && [ "$(ls -A "$full" 2>/dev/null)" ]; then
        count=$(ls "$full" | wc -l)
        echo "  ✓ $label ($count files in $subdir)"
    else
        echo "  ⚠ $label NOT FOUND in $full"
        echo "    See worker/MODELS.md for download instructions"
        ALL_MODELS_OK=false
    fi
done

if ! $ALL_MODELS_OK; then
    echo ""
    echo "  WARNING: Some model weights are missing."
    echo "  ComfyUI will start but inference will fail."
    echo "  Download models with: bash worker/MODELS.md"
    echo ""
fi

echo ""
echo "── Workflow file ──────────────────────────────────────────────"
WF="${WAN_WORKFLOW_PATH:-/app/workflows/wan22_animate_replace_api.json}"
if [ -f "$WF" ]; then
    NODE_COUNT=$(python3 -c "import json; d=json.load(open('$WF')); print(len([k for k in d if k != '_info']))" 2>/dev/null || echo "?")
    echo "  ✓ $WF ($NODE_COUNT nodes)"
else
    echo "  ✗ $WF — NOT FOUND"
    exit 1
fi

# ── Start ComfyUI ────────────────────────────────────────────────

echo ""
echo "── Starting ComfyUI ───────────────────────────────────────────"

python3 /comfyui/main.py \
    --listen 127.0.0.1 \
    --port 8188 \
    --disable-auto-launch \
    --preview-method none \
    --log-stdout \
    &

CPID=$!
echo "  PID: $CPID"

# ── Wait for ComfyUI ready ───────────────────────────────────────

echo ""
echo "── Waiting for ComfyUI ────────────────────────────────────────"
MAX_WAIT=180
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep 4
    ELAPSED=$((ELAPSED + 4))

    kill -0 $CPID 2>/dev/null || { echo "  ✗ ComfyUI process died"; exit 1; }

    if curl -sf --max-time 3 http://127.0.0.1:8188/system_stats >/dev/null 2>&1; then
        echo "  ✓ ComfyUI ready after ${ELAPSED}s"
        break
    fi

    echo "  [${ELAPSED}s] Waiting..."
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "  ✗ ComfyUI did not respond in ${MAX_WAIT}s"
    exit 1
fi

# ── Verify required nodes loaded ─────────────────────────────────

echo ""
echo "── Node verification ──────────────────────────────────────────"

NODES_JSON=$(curl -sf --max-time 10 http://127.0.0.1:8188/object_info 2>/dev/null || echo "{}")

python3 << 'PYCHECK'
import json, sys

try:
    with open("/tmp/comfyui_nodes.json", "w") as f:
        import urllib.request
        with urllib.request.urlopen("http://127.0.0.1:8188/object_info", timeout=10) as r:
            data = r.read()
            f.write(data.decode())
        nodes = json.loads(data)
except Exception as e:
    print(f"  ⚠ Could not fetch node list: {e}")
    sys.exit(0)

required = {
    # ComfyUI-WanVideoWrapper
    "WanVideoModelLoader":       "ComfyUI-WanVideoWrapper",
    "WanVideoVAELoader":         "ComfyUI-WanVideoWrapper",
    "WanVideoTextEncodeCached":  "ComfyUI-WanVideoWrapper",
    "WanVideoClipVisionEncode":  "ComfyUI-WanVideoWrapper",
    "WanVideoAnimateEmbeds":     "ComfyUI-WanVideoWrapper",
    "WanVideoSampler":           "ComfyUI-WanVideoWrapper",
    "WanVideoDecode":            "ComfyUI-WanVideoWrapper",
    # ComfyUI-WanAnimatePreprocess
    "OnnxDetectionModelLoader":  "ComfyUI-WanAnimatePreprocess",
    "OnnxPoseModelLoader":       "ComfyUI-WanAnimatePreprocess",
    "PoseAndFaceDetection":      "ComfyUI-WanAnimatePreprocess",
    # ComfyUI-VideoHelperSuite
    "VHS_LoadVideo":             "ComfyUI-VideoHelperSuite",
    "VHS_VideoCombine":          "ComfyUI-VideoHelperSuite",
    # ComfyUI-segment-anything-2
    "SAM2ModelLoader":           "ComfyUI-segment-anything-2",
    "Sam2Segmentation":          "ComfyUI-segment-anything-2",
}

ok, missing = [], []
for node, pkg in required.items():
    if node in nodes:
        ok.append(node)
        print(f"  ✓ {node}")
    else:
        missing.append(f"{node} (from {pkg})")
        print(f"  ✗ {node} (from {pkg}) — NOT LOADED")

if missing:
    print(f"\n  WARNING: {len(missing)} nodes missing. Inference will fail.")
    print("  Check Docker build logs for install errors.")
else:
    print(f"\n  ✓ All {len(required)} required nodes loaded")

print(f"  Total nodes in ComfyUI: {len(nodes)}")
PYCHECK

# ── Start RunPod handler ─────────────────────────────────────────

echo ""
echo "── Starting RunPod handler ────────────────────────────────────"
echo ""
exec python3 /app/handler.py
