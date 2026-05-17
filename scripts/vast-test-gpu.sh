#!/bin/bash
# ================================================================
# npm run vast:test-gpu
#
# Runs the full GPU test on a Vast.ai instance via SSH.
# ComfyUI runs directly on the instance (no Docker-in-Docker).
#
# Prerequisites:
#   1. npm run vast:setup  (first time only)
#   2. Models downloaded on instance
#   3. Instance running
#
# Usage:
#   npm run vast:test-gpu
#   TEST_QUALITY=fast npm run vast:test-gpu
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.local"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
fail() { echo -e "${RED}  ✗${NC} $*"; diagnose "$*"; exit 1; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
info() { echo -e "${BLUE}  →${NC} $*"; }
hr()   { echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; }

# Load .env.local
if [ -f "$ENV_FILE" ]; then
    while IFS='=' read -r k v; do
        [[ "$k" =~ ^[[:space:]]*# ]] && continue; [[ -z "$k" ]] && continue
        k="${k// /}"; v="${v// /}"
        [ -z "${!k+x}" ] && export "$k=$v" 2>/dev/null || true
    done < "$ENV_FILE"
fi

SSH_HOST="${VAST_SSH_HOST:-}"
SSH_PORT="${VAST_SSH_PORT:-}"
SSH_USER="${VAST_SSH_USER:-root}"
WORKDIR="${VAST_WORKDIR:-/workspace/motion-avatar}"
QUALITY="${TEST_QUALITY:-fast}"
OUTPUT_DIR="${OUTPUT_DIR:-/tmp/vast-gpu-test}"
mkdir -p "$OUTPUT_DIR"

TEST_VIDEO_URL="${TEST_VIDEO_URL:-https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4}"
TEST_IMAGE_URL="${TEST_IMAGE_URL:-https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&h=512&fit=crop&crop=face}"

[ -n "$SSH_HOST" ] || { echo -e "${RED}VAST_SSH_HOST not set${NC}"; exit 1; }
[ -n "$SSH_PORT" ] || { echo -e "${RED}VAST_SSH_PORT not set${NC}"; exit 1; }

ssh_run() {
    ssh -o StrictHostKeyChecking=no \
        -o ConnectTimeout=15 \
        -o ServerAliveInterval=60 \
        -o ServerAliveCountMax=10 \
        -p "$SSH_PORT" \
        "$SSH_USER@$SSH_HOST" \
        "$@"
}

diagnose() {
    local msg="${1:-}"
    echo ""
    echo "  Diagnosis:"
    if echo "$msg" | grep -qi "model.*not found\|No file matching"; then
        echo "    → Models missing. Run: npm run vast:setup"
    elif echo "$msg" | grep -qi "out of memory\|CUDA.*memory"; then
        echo "    → VRAM insufficient. Use TEST_QUALITY=fast"
    elif echo "$msg" | grep -qi "node.*not found\|ImportError"; then
        echo "    → Custom node install failed. Run: npm run vast:setup"
    elif echo "$msg" | grep -qi "ComfyUI.*died\|Connection refused.*8188"; then
        echo "    → ComfyUI crashed. SSH in and check: python3 /comfyui/main.py"
    elif echo "$msg" | grep -qi "SSH\|Connect"; then
        echo "    → SSH failed. Verify VAST_SSH_HOST and VAST_SSH_PORT in .env.local"
    else
        echo "    → Check SSH logs above for root cause."
    fi
}

LAST_LOG=""

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Vast.ai GPU Test — Wan2.2-Animate ComfyUI                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
info "Instance:  $SSH_USER@$SSH_HOST:$SSH_PORT"
info "Quality:   $QUALITY"
info "Video:     $TEST_VIDEO_URL"
info "Image:     $TEST_IMAGE_URL"
echo ""

# SSH check
hr; echo ""; echo "  Phase 1 — SSH"; echo ""
ssh_run "echo SSH_OK" | grep -q SSH_OK || fail "SSH not reachable: $SSH_HOST:$SSH_PORT"
ok "Connected to $SSH_HOST:$SSH_PORT"

# GPU check
hr; echo ""; echo "  Phase 2 — GPU"; echo ""
GPU=$(ssh_run "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -1")
[ -n "$GPU" ] && ok "GPU: $GPU" || fail "GPU not found on instance"

# Model check
hr; echo ""; echo "  Phase 3 — Models"; echo ""
ssh_run "
    MODEL_PATH=/comfyui/models
    ok=0; missing=0
    for sub in diffusion_models/WanVideo vae text_encoders clip_vision detection sam2; do
        count=\$(ls \$MODEL_PATH/\$sub/ 2>/dev/null | wc -l)
        if [ \"\$count\" -gt 0 ]; then
            echo \"  ok: \$sub (\$count files)\"
            ok=\$((ok+1))
        else
            echo \"  missing: \$sub\"
            missing=\$((missing+1))
        fi
    done
    echo \"MODELS_SUMMARY: ok=\$ok missing=\$missing\"
" | while IFS= read -r line; do echo "  $line"; done

MODEL_CHECK=$(ssh_run "
    find /comfyui/models/diffusion_models -name '*animate*' 2>/dev/null | head -1
" 2>/dev/null || echo "")
[ -n "$MODEL_CHECK" ] && ok "Wan2.2-Animate diffusion model found" || {
    warn "Diffusion model not found — starting download..."
    ssh_run "pip install -q huggingface_hub && bash $WORKDIR/worker/scripts/download-models.sh /comfyui/models"
}

# Node check — start ComfyUI briefly
hr; echo ""; echo "  Phase 4 — ComfyUI node verification"; echo ""
info "Starting ComfyUI on instance to verify nodes..."

NODE_CHECK=$(ssh_run << 'REMOTE'
set -e
COMFYUI_DIR=/comfyui

# Kill any existing ComfyUI
pkill -f "main.py.*8188" 2>/dev/null || true
sleep 2

# Start ComfyUI
python3 $COMFYUI_DIR/main.py \
    --listen 127.0.0.1 --port 8188 \
    --disable-auto-launch --preview-method none \
    --log-stdout > /tmp/comfyui_setup.log 2>&1 &
CPID=$!

# Wait for ready
for i in $(seq 1 40); do
    sleep 3
    if curl -sf http://127.0.0.1:8188/system_stats >/dev/null 2>&1; then
        echo "NODE_CHECK:comfyui_ready"
        break
    fi
    kill -0 $CPID 2>/dev/null || { echo "NODE_CHECK:comfyui_died"; cat /tmp/comfyui_setup.log | tail -20; break; }
done

# Check nodes
if curl -sf http://127.0.0.1:8188/object_info > /tmp/nodes.json 2>/dev/null; then
    python3 << 'PYCHECK'
import json
with open("/tmp/nodes.json") as f:
    nodes = json.load(f)
required = [
    "WanVideoModelLoader","WanVideoVAELoader","WanVideoTextEncodeCached",
    "WanVideoClipVisionEncode","WanVideoAnimateEmbeds","WanVideoSampler",
    "WanVideoDecode","OnnxDetectionModelLoader","OnnxPoseModelLoader",
    "PoseAndFaceDetection","VHS_LoadVideo","VHS_VideoCombine",
    "SAM2ModelLoader","Sam2Segmentation","CLIPVisionLoader",
]
ok, missing = [], []
for n in required:
    (ok if n in nodes else missing).append(n)
for n in ok:
    print(f"NODE_CHECK:ok:{n}")
for n in missing:
    print(f"NODE_CHECK:missing:{n}")
print(f"NODE_CHECK:total:{len(nodes)}")
PYCHECK
fi
# Leave ComfyUI running for inference
REMOTE
2>&1 || true)

LAST_LOG="$NODE_CHECK"

echo "$NODE_CHECK" | grep "NODE_CHECK" | while IFS=: read -r _ status node; do
    case "$status" in
        ok)          ok "$node" ;;
        missing)     warn "MISSING: $node" ;;
        comfyui_ready) ok "ComfyUI ready" ;;
        comfyui_died)  fail "ComfyUI crashed during startup" ;;
        total)       info "Total nodes loaded: $node" ;;
    esac
done

MISSING=$(echo "$NODE_CHECK" | grep "NODE_CHECK:missing:" | sed 's/NODE_CHECK:missing://' | tr '\n' ' ')
[ -z "$MISSING" ] || fail "Missing nodes: $MISSING — Run: npm run vast:setup"

# Real inference
hr; echo ""; echo "  Phase 5 — Real GPU inference"; echo ""
info "ComfyUI is running. Submitting Wan2.2-Animate job..."
info "Expected time: 3-8 minutes (quality=fast on RTX 4090)"
echo ""

JOB_ID="vast-test-$(date +%s)"
PAYLOAD="{\"id\":\"$JOB_ID\",\"input\":{\"user_video_url\":\"$TEST_VIDEO_URL\",\"character_image_url\":\"$TEST_IMAGE_URL\",\"quality\":\"$QUALITY\",\"mode\":\"replacement\",\"keep_original_audio\":true}}"

INFERENCE_LOG=$(ssh_run << REMOTE
set -e
export LOCAL_TEST=true
export COMFYUI_HOST=http://127.0.0.1:8188
export WAN_WORKFLOW_PATH=$WORKDIR/worker/workflows/wan22_animate_replace_api.json
export COMFYUI_OUTPUT_DIR=/comfyui/output
export COMFYUI_MODELS=/comfyui/models

# Ensure ComfyUI is still running
curl -sf http://127.0.0.1:8188/system_stats >/dev/null || {
    echo "[vast-test] ComfyUI not running — starting..."
    python3 /comfyui/main.py \
        --listen 127.0.0.1 --port 8188 \
        --disable-auto-launch --preview-method none &
    sleep 30
}

python3 -c "
import json, os, sys, types, runpod
runpod.serverless = types.SimpleNamespace(start=lambda cfg: None)
sys.path.insert(0, '$WORKDIR')
import worker.handler as handler

payload = json.loads('''$PAYLOAD''')
print('[vast-test] Job:', payload['id'])
result = handler.handler(payload)
print('GPU_TEST_RESULT:' + json.dumps(result))
"
REMOTE
2>&1 || true)

LAST_LOG="$INFERENCE_LOG"
echo "$INFERENCE_LOG" | grep -E "vast-test|handler|GPU_TEST|error|ERROR" | \
    while IFS= read -r line; do echo "  $line"; done

RESULT_JSON=$(echo "$INFERENCE_LOG" | grep "^GPU_TEST_RESULT:" | sed 's/^GPU_TEST_RESULT://' | tail -1)
[ -n "$RESULT_JSON" ] || fail "No GPU_TEST_RESULT — check SSH logs above"

WORKER_ERROR=$(echo "$RESULT_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null || echo "")
[ -z "$WORKER_ERROR" ] || fail "Worker error: $WORKER_ERROR"

VIDEO_URL=$(echo "$RESULT_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('output_video_url',''))" 2>/dev/null || echo "")
[ -n "$VIDEO_URL" ] || fail "No output_video_url in result"

EXEC_MS=$(echo "$RESULT_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('execution_time_ms',0))" 2>/dev/null || echo "0")
ok "Generation complete in $((EXEC_MS / 1000))s"
ok "Output: $VIDEO_URL"

# Download output file from instance
hr; echo ""; echo "  Phase 6 — Download and validate"; echo ""
OUTPUT_FILE="$OUTPUT_DIR/vast_output_$(date +%s).mp4"

if [[ "$VIDEO_URL" == file://* ]]; then
    REMOTE_PATH="${VIDEO_URL#file://}"
    info "Downloading from instance: $REMOTE_PATH"
    scp -o StrictHostKeyChecking=no -P "$SSH_PORT" \
        "$SSH_USER@$SSH_HOST:$REMOTE_PATH" \
        "$OUTPUT_FILE" && ok "Downloaded: $OUTPUT_FILE"
fi

# Validate
if [ -f "$OUTPUT_FILE" ]; then
    SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE" 2>/dev/null || echo 0)
    [ "$SIZE" -gt 10000 ] || fail "File too small ($SIZE bytes)"
    ok "File size: $SIZE bytes"

    if command -v ffprobe &>/dev/null; then
        PROBE=$(ffprobe -v quiet -print_format json -show_streams -show_format "$OUTPUT_FILE" 2>&1)
        DURATION=$(echo "$PROBE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('format',{}).get('duration','0'))" 2>/dev/null || echo "0")
        CODEC=$(echo "$PROBE" | python3 -c "import json,sys; d=json.load(sys.stdin); v=[s for s in d.get('streams',[]) if s.get('codec_type')=='video']; print(v[0].get('codec_name','?') if v else '?')" 2>/dev/null || echo "?")
        WIDTH=$(echo "$PROBE" | python3 -c "import json,sys; d=json.load(sys.stdin); v=[s for s in d.get('streams',[]) if s.get('codec_type')=='video']; print(v[0].get('width','?') if v else '?')" 2>/dev/null || echo "?")
        HEIGHT=$(echo "$PROBE" | python3 -c "import json,sys; d=json.load(sys.stdin); v=[s for s in d.get('streams',[]) if s.get('codec_type')=='video']; print(v[0].get('height','?') if v else '?')" 2>/dev/null || echo "?")

        echo ""
        echo "  ┌─────────────────────────────────────────────────"
        printf "  │  %-12s %s\n" "Duration:"  "${DURATION}s"
        printf "  │  %-12s %s\n" "Resolution:" "${WIDTH}x${HEIGHT}"
        printf "  │  %-12s %s\n" "Codec:"     "${CODEC}"
        echo "  └─────────────────────────────────────────────────"
        echo ""

        python3 -c "import sys; sys.exit(0 if float('${DURATION:-0}') > 0 else 1)" \
            && ok "Duration > 0" \
            || fail "Duration is 0 — inference ran but output is empty"
        ok "Codec: $CODEC | Resolution: ${WIDTH}x${HEIGHT}"
    fi
fi

# Success
hr
echo ""
echo -e "${GREEN}  ✅ VAST.AI GPU TEST PASSED${NC}"
echo ""
echo "  Output:       $OUTPUT_FILE"
echo "  Generation:   $((EXEC_MS / 1000))s"
echo ""
echo "  Run npm run vast:stop when done to avoid charges."
hr
echo ""
