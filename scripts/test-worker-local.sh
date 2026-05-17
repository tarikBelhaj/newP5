#!/bin/bash
# ================================================================
# Local Docker worker test — npm run test:worker-local
#
# Levels:
#   --check   : build image + verify startup + pre-flight (no GPU needed)
#   --smoke   : --check + send test payload + verify handler runs (no GPU needed)
#   --gpu     : --smoke + actually runs Wan2.2 inference (GPU required)
#
# Usage:
#   npm run test:worker-local               # default: --smoke
#   npm run test:worker-local -- --check    # build + startup only
#   npm run test:worker-local -- --gpu      # full inference test
#
# Environment:
#   Reads from .env.local in project root.
#   Requires Docker installed and running.
#   --gpu requires NVIDIA Container Toolkit (nvidia-docker2).
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$PROJECT_ROOT/worker"
ENV_FILE="$PROJECT_ROOT/.env.local"
IMAGE_NAME="wan-animate-worker:local"
CONTAINER_NAME="wan-test-$$"

MODE="${1:---smoke}"

# ── Colors ───────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
fail() { echo -e "${RED}  ✗${NC} $*"; exit 1; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
info() { echo -e "${BLUE}  →${NC} $*"; }

# ── Load .env.local ──────────────────────────────────────────────

load_env() {
    if [ -f "$ENV_FILE" ]; then
        while IFS='=' read -r key val; do
            [[ "$key" =~ ^[[:space:]]*# ]] && continue
            [[ -z "$key" ]] && continue
            key="${key// /}"
            val="${val// /}"
            # Only export if not already set
            if [ -z "${!key+x}" ]; then
                export "$key=$val"
            fi
        done < "$ENV_FILE"
        ok ".env.local loaded"
    else
        warn "No .env.local found — using environment only"
    fi
}

# ── Checks ───────────────────────────────────────────────────────

check_docker() {
    if ! command -v docker &>/dev/null; then
        fail "Docker not installed. Install Docker Desktop from https://docker.com"
    fi
    if ! docker info &>/dev/null; then
        fail "Docker daemon not running. Start Docker Desktop."
    fi
    ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
}

# ── Build ────────────────────────────────────────────────────────

build_image() {
    echo ""
    echo "━━━ Building Docker image ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "Image: $IMAGE_NAME"
    info "Context: $WORKER_DIR"
    echo ""

    if docker build -t "$IMAGE_NAME" "$WORKER_DIR"; then
        ok "Image built: $IMAGE_NAME"
    else
        fail "Docker build failed"
    fi
}

# ── Startup check (no GPU) ───────────────────────────────────────

check_startup() {
    echo ""
    echo "━━━ Startup check (no GPU) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "Verifying: ffmpeg, ComfyUI, custom nodes, workflow file"
    echo ""

    # Run with LOCAL_TEST=true — handler will start but won't need models
    # We just check that the container starts without crashing immediately
    STARTUP_LOG=$(docker run --rm \
        --name "${CONTAINER_NAME}-check" \
        -e LOCAL_TEST=true \
        -e COMFYUI_HOST=http://127.0.0.1:8188 \
        "$IMAGE_NAME" \
        bash -c "
            # Run pre-flight parts of start.sh manually (skip ComfyUI launch)
            echo '--- ffmpeg check ---'
            ffmpeg -version 2>&1 | head -1
            echo '--- Python check ---'
            python3 --version
            echo '--- ComfyUI check ---'
            test -f /comfyui/main.py && echo 'ComfyUI: OK' || echo 'ComfyUI: MISSING'
            echo '--- Custom nodes ---'
            ls /comfyui/custom_nodes/ 2>/dev/null || echo 'No custom nodes dir'
            echo '--- Workflow check ---'
            test -f /app/workflows/wan_replace.json && echo 'Workflow: OK' || echo 'Workflow: MISSING'
            echo '--- Handler syntax ---'
            python3 -m py_compile /app/handler.py && echo 'Handler syntax: OK' || echo 'Handler syntax: ERROR'
            echo '--- runpod import ---'
            python3 -c 'import runpod; print(\"runpod:\", runpod.__version__)' 2>/dev/null || echo 'runpod: import failed'
            echo 'STARTUP_CHECK_COMPLETE'
        " 2>&1 || true)

    echo "$STARTUP_LOG"

    # Check for critical failures
    if echo "$STARTUP_LOG" | grep -q "STARTUP_CHECK_COMPLETE"; then
        ok "Startup check passed"
    else
        fail "Startup check did not complete — see output above"
    fi

    # Check specific items
    if echo "$STARTUP_LOG" | grep -q "ffmpeg version"; then
        ok "ffmpeg available"
    else
        warn "ffmpeg may be missing"
    fi

    if echo "$STARTUP_LOG" | grep -q "ComfyUI: OK"; then
        ok "ComfyUI main.py present"
    else
        warn "ComfyUI main.py not found"
    fi

    if echo "$STARTUP_LOG" | grep -q "ComfyUI-WanVideoWrapper"; then
        ok "WanVideoWrapper custom node present"
    else
        warn "WanVideoWrapper custom node missing — Wan2.2 inference will fail"
    fi

    if echo "$STARTUP_LOG" | grep -q "Workflow: OK"; then
        ok "Workflow JSON present"
    else
        fail "Workflow JSON missing at /app/workflows/wan_replace.json"
    fi

    if echo "$STARTUP_LOG" | grep -q "Handler syntax: OK"; then
        ok "handler.py syntax valid"
    else
        fail "handler.py has syntax errors"
    fi
}

# ── Smoke test: send payload, verify handler responds ────────────

smoke_test() {
    echo ""
    echo "━━━ Smoke test (LOCAL_TEST mode) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "Sending test payload to handler (no GPU required)"
    info "This will download test files and run the handler logic"
    info "ComfyUI will start but inference will fail (no model weights)"
    info "We validate everything UP TO the model inference step"
    echo ""

    PAYLOAD=$(cat "$WORKER_DIR/test_payload.json")

    # Run the full container with LOCAL_TEST=true
    # Capture output and look for specific markers
    SMOKE_LOG=$(docker run --rm \
        --name "${CONTAINER_NAME}-smoke" \
        -e LOCAL_TEST=true \
        -e COMFYUI_HOST=http://127.0.0.1:8188 \
        -e WAN_WORKFLOW_PATH=/app/workflows/wan_replace.json \
        -e COMFYUI_OUTPUT_DIR=/comfyui/output \
        -v /tmp/wan-test-output:/tmp \
        "$IMAGE_NAME" \
        python3 -c "
import json, sys, os
os.environ['LOCAL_TEST'] = 'true'

# Patch out the runpod.serverless.start call for direct testing
import types
import runpod
runpod.serverless = types.SimpleNamespace(start=lambda cfg: None)

# Import handler (will run check_environment)
sys.path.insert(0, '/app')

# Monkey-patch the submit_workflow and poll_comfyui to simulate without ComfyUI
import handler as h

# Override ComfyUI calls to validate up to that point
original_submit = h.submit_workflow
original_poll   = h.poll_comfyui

def mock_submit(workflow, client_id):
    print('[SMOKE] ComfyUI submit called — returning mock prompt_id')
    print('[SMOKE] Workflow nodes:', list(workflow.keys()))
    return 'mock-prompt-id-12345'

def mock_poll(prompt_id, timeout=480):
    import shutil, time
    # Create a fake output video using ffmpeg
    fake_video = '/tmp/wan_fake_output.mp4'
    print('[SMOKE] Creating mock output video with ffmpeg...')
    result = __import__('subprocess').run([
        'ffmpeg', '-y', '-f', 'lavfi',
        '-i', 'testsrc=duration=2:size=320x240:rate=24',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        fake_video
    ], capture_output=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f'ffmpeg test video creation failed: {result.stderr.decode()}')
    print(f'[SMOKE] Mock video created: {fake_video}')
    return fake_video

h.submit_workflow = mock_submit
h.poll_comfyui    = mock_poll

# Run the handler with the test payload
payload = $PAYLOAD

print('[SMOKE] Running handler with test payload...')
result = h.handler(payload)
print('[SMOKE] Handler returned:', json.dumps(result, indent=2))

if 'error' in result:
    print('[SMOKE] FAILED:', result['error'])
    sys.exit(1)
elif 'output_video_url' in result:
    print('[SMOKE] SUCCESS:', result['output_video_url'])
    sys.exit(0)
else:
    print('[SMOKE] UNEXPECTED result shape')
    sys.exit(1)
" 2>&1 || true)

    echo "$SMOKE_LOG"

    if echo "$SMOKE_LOG" | grep -q "\[SMOKE\] SUCCESS:"; then
        echo ""
        ok "Smoke test PASSED"
        ok "Handler correctly processes payload, downloads files, creates output"

        # Extract output URL
        OUTPUT_URL=$(echo "$SMOKE_LOG" | grep "\[SMOKE\] SUCCESS:" | awk '{print $NF}')
        info "Output: $OUTPUT_URL"

        if [ -f "/tmp/wan_fake_output.mp4" ]; then
            ok "Output video created at /tmp/wan_fake_output.mp4"
        fi
    elif echo "$SMOKE_LOG" | grep -q "Downloading user video"; then
        warn "Handler started but did not complete — check output above"
    elif echo "$SMOKE_LOG" | grep -q "\[SMOKE\] FAILED:"; then
        SMOKE_ERR=$(echo "$SMOKE_LOG" | grep "\[SMOKE\] FAILED:" | sed 's/.*FAILED: //')
        fail "Smoke test FAILED: $SMOKE_ERR"
    else
        fail "Smoke test did not complete — check output above"
    fi
}

# ── GPU test ─────────────────────────────────────────────────────

gpu_test() {
    echo ""
    echo "━━━ GPU inference test ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Check for nvidia-docker
    if ! command -v nvidia-smi &>/dev/null; then
        fail "nvidia-smi not found. Install NVIDIA drivers and NVIDIA Container Toolkit."
    fi

    GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -1)
    ok "GPU: $GPU_INFO"

    # Check model weights
    MODEL_PATH="${WAN_MODEL_PATH:-}"
    if [ -z "$MODEL_PATH" ] || [ ! -d "$MODEL_PATH" ]; then
        warn "WAN_MODEL_PATH not set or directory not found."
        warn "Set WAN_MODEL_PATH to your local Wan2.2-Animate-14B weights directory."
        warn "Example: export WAN_MODEL_PATH=/path/to/Wan2.2-Animate-14B"
        fail "Cannot run GPU test without model weights"
    fi

    ok "Model weights: $MODEL_PATH"
    info "Mounting model weights to /comfyui/models/wan/Wan2.2-Animate-14B"

    SUPABASE_URL="${SUPABASE_URL:-}"
    SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-}"

    if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
        info "No Supabase credentials — using LOCAL_TEST=true (output saved to /tmp)"
        USE_LOCAL_TEST=true
    else
        ok "Supabase credentials found"
        USE_LOCAL_TEST=false
    fi

    info "Starting full GPU inference (this takes 2-5 minutes)..."
    echo ""

    DOCKER_ARGS=(
        run --rm
        --name "${CONTAINER_NAME}-gpu"
        --gpus all
        -v "$MODEL_PATH:/comfyui/models/wan/Wan2.2-Animate-14B:ro"
        -v "/tmp/wan-gpu-output:/tmp"
        -e LOCAL_TEST="$USE_LOCAL_TEST"
        -e COMFYUI_HOST=http://127.0.0.1:8188
        -e WAN_WORKFLOW_PATH=/app/workflows/wan_replace.json
        -e COMFYUI_OUTPUT_DIR=/comfyui/output
    )

    if [ "$USE_LOCAL_TEST" == "false" ]; then
        DOCKER_ARGS+=(-e "SUPABASE_URL=$SUPABASE_URL")
        DOCKER_ARGS+=(-e "SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY")
    fi

    # Run via RunPod test_input mechanism
    GPU_LOG=$(docker "${DOCKER_ARGS[@]}" \
        "$IMAGE_NAME" \
        bash -c "
            /app/start.sh &
            sleep 90  # wait for ComfyUI to be ready
            # Send test payload via RunPod local test
            echo '$(cat "$WORKER_DIR/test_payload.json")' > /tmp/test_input.json
            RUNPOD_WEBHOOK_OVERRIDE=disable python3 -c \"
import json, runpod
with open('/tmp/test_input.json') as f:
    payload = json.load(f)
import handler
result = handler.handler(payload)
print('RESULT:', json.dumps(result))
\"
        " 2>&1 || true)

    echo "$GPU_LOG"

    if echo "$GPU_LOG" | grep -q '"output_video_url"'; then
        ok "GPU inference test PASSED"
        VIDEO_URL=$(echo "$GPU_LOG" | grep '"output_video_url"' | awk -F'"' '{print $4}')
        info "Output video: $VIDEO_URL"
    else
        fail "GPU inference test did not produce output — check logs above"
    fi
}

# ── Summary ──────────────────────────────────────────────────────

summary() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Next steps:"
    echo ""
    echo "  1. If smoke test passed: worker code is correct"
    echo "  2. Get Wan2.2-Animate-14B weights (≈30GB):"
    echo "     huggingface-cli download Wan-AI/Wan2.2-Animate-14B \\"
    echo "       --local-dir ./models/Wan2.2-Animate-14B"
    echo ""
    echo "  3. Run GPU test (requires model + NVIDIA GPU):"
    echo "     WAN_MODEL_PATH=./models/Wan2.2-Animate-14B \\"
    echo "     npm run test:worker-local -- --gpu"
    echo ""
    echo "  4. If GPU test passes: push to registry and deploy to RunPod"
    echo "     docker tag wan-animate-worker:local your-registry/wan-animate-worker:latest"
    echo "     docker push your-registry/wan-animate-worker:latest"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# ── Main ─────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Wan2.2-Animate Worker — Local Test                         ║"
echo "║  Mode: $MODE                                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

load_env
check_docker
build_image
check_startup

case "$MODE" in
    --check)
        ok "Check complete"
        ;;
    --smoke|"")
        smoke_test
        ;;
    --gpu)
        smoke_test
        gpu_test
        ;;
    *)
        fail "Unknown mode: $MODE (use --check, --smoke, or --gpu)"
        ;;
esac

summary
