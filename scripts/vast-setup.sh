#!/bin/bash
# ================================================================
# npm run vast:setup
#
# Prepares a running Vast.ai instance for ComfyUI / Wan2.2-Animate.
# Run this ONCE after renting the instance, before vast:test-gpu.
#
# Usage:
#   npm run vast:setup
#
# Reads from .env.local:
#   VAST_SSH_HOST, VAST_SSH_PORT, VAST_SSH_USER
#   VAST_WORKDIR, VAST_API_KEY, VAST_INSTANCE_ID
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.local"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
fail() { echo -e "${RED}  ✗${NC} $*"; exit 1; }
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
VAST_API_KEY="${VAST_API_KEY:-}"
INSTANCE_ID="${VAST_INSTANCE_ID:-}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Vast.ai instance setup — Wan2.2-Animate worker             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Validate config
[ -n "$SSH_HOST" ]   || fail "VAST_SSH_HOST not set in .env.local"
[ -n "$SSH_PORT" ]   || fail "VAST_SSH_PORT not set in .env.local"
ok "Instance: $SSH_USER@$SSH_HOST:$SSH_PORT"
ok "Workdir:  $WORKDIR"
echo ""

# SSH helper — no host key checking for automated setup
ssh_run() {
    ssh -o StrictHostKeyChecking=no \
        -o ConnectTimeout=15 \
        -o ServerAliveInterval=30 \
        -p "$SSH_PORT" \
        "$SSH_USER@$SSH_HOST" \
        "$@"
}

ssh_run_tty() {
    ssh -o StrictHostKeyChecking=no \
        -o ConnectTimeout=15 \
        -p "$SSH_PORT" \
        "$SSH_USER@$SSH_HOST" \
        bash -s
}

# Check SSH reachable
hr; echo ""; echo "  Phase 1 — SSH connectivity"; echo ""
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
    -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "echo SSH_OK" 2>/dev/null | grep -q SSH_OK \
    || fail "Cannot SSH into $SSH_HOST:$SSH_PORT — check VAST_SSH_HOST and VAST_SSH_PORT"
ok "SSH connected"

# Verify GPU
hr; echo ""; echo "  Phase 2 — GPU check"; echo ""
GPU_INFO=$(ssh_run "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -1" || echo "")
[ -n "$GPU_INFO" ] && ok "GPU: $GPU_INFO" || fail "nvidia-smi not found — instance may not have GPU drivers"

VRAM=$(echo "$GPU_INFO" | grep -oE '[0-9]+' | tail -1 || echo "0")
[ "$VRAM" -ge 14000 ] && ok "VRAM: ${VRAM}MB (≥16GB)" || warn "VRAM: ${VRAM}MB — may be insufficient for Wan2.2-Animate-14B"

# Clone / update repo
hr; echo ""; echo "  Phase 3 — Project setup"; echo ""
ssh_run "
    if [ -d $WORKDIR ]; then
        echo 'Updating existing repo...'
        cd $WORKDIR && git pull --quiet
    else
        echo 'Cloning repo...'
        git clone --quiet \$(git -C /tmp remote get-url origin 2>/dev/null || echo 'YOUR_REPO_URL') $WORKDIR \
            || { mkdir -p $WORKDIR; echo 'No repo URL — directory created, push your code manually'; }
    fi
    echo 'Repo: OK'
"
# Rsync local worker files to instance (works without git remote)
info "Syncing worker files to instance..."
rsync -az --quiet \
    -e "ssh -o StrictHostKeyChecking=no -p $SSH_PORT" \
    "$PROJECT_ROOT/worker/" \
    "$SSH_USER@$SSH_HOST:$WORKDIR/worker/" \
    && ok "Worker files synced"

rsync -az --quiet \
    -e "ssh -o StrictHostKeyChecking=no -p $SSH_PORT" \
    "$PROJECT_ROOT/scripts/" \
    "$SSH_USER@$SSH_HOST:$WORKDIR/scripts/" \
    && ok "Scripts synced"

rsync -az --quiet \
    -e "ssh -o StrictHostKeyChecking=no -p $SSH_PORT" \
    "$PROJECT_ROOT/package.json" \
    "$SSH_USER@$SSH_HOST:$WORKDIR/package.json" \
    && ok "package.json synced"

# Install ComfyUI + deps on instance (Vast.ai = direct install, no Docker)
hr; echo ""; echo "  Phase 4 — ComfyUI installation"; echo ""
ssh_run << 'REMOTE'
set -e
COMFYUI_DIR=/comfyui

# Install system deps
apt-get update -qq && apt-get install -y -qq ffmpeg git curl > /dev/null 2>&1
echo "ffmpeg: $(ffmpeg -version 2>&1 | head -1)"

# ComfyUI
if [ ! -d "$COMFYUI_DIR" ]; then
    echo "Installing ComfyUI..."
    git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git $COMFYUI_DIR
    cd $COMFYUI_DIR && pip install -q -r requirements.txt
    echo "ComfyUI: installed"
else
    echo "ComfyUI: already installed"
fi
mkdir -p $COMFYUI_DIR/{input,output,temp,models/{diffusion_models/WanVideo,vae,text_encoders,clip_vision,detection,sam2,loras/WanVideo/Lightx2v}}

# Custom node 1: ComfyUI-WanVideoWrapper
if [ ! -d "$COMFYUI_DIR/custom_nodes/ComfyUI-WanVideoWrapper" ]; then
    echo "Installing ComfyUI-WanVideoWrapper..."
    cd $COMFYUI_DIR/custom_nodes
    git clone --depth 1 https://github.com/kijai/ComfyUI-WanVideoWrapper.git
    cd ComfyUI-WanVideoWrapper && pip install -q -r requirements.txt
    echo "WanVideoWrapper: installed"
else
    echo "WanVideoWrapper: already installed"
fi

# Custom node 2: ComfyUI-WanAnimatePreprocess
if [ ! -d "$COMFYUI_DIR/custom_nodes/ComfyUI-WanAnimatePreprocess" ]; then
    echo "Installing ComfyUI-WanAnimatePreprocess..."
    cd $COMFYUI_DIR/custom_nodes
    git clone --depth 1 https://github.com/kijai/ComfyUI-WanAnimatePreprocess.git
    cd ComfyUI-WanAnimatePreprocess && pip install -q -r requirements.txt
    echo "WanAnimatePreprocess: installed"
else
    echo "WanAnimatePreprocess: already installed"
fi

# Custom node 3: ComfyUI-VideoHelperSuite
if [ ! -d "$COMFYUI_DIR/custom_nodes/ComfyUI-VideoHelperSuite" ]; then
    echo "Installing ComfyUI-VideoHelperSuite..."
    cd $COMFYUI_DIR/custom_nodes
    git clone --depth 1 https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git
    cd ComfyUI-VideoHelperSuite && pip install -q -r requirements.txt 2>/dev/null || true
    echo "VideoHelperSuite: installed"
else
    echo "VideoHelperSuite: already installed"
fi

# Custom node 4: ComfyUI-segment-anything-2
if [ ! -d "$COMFYUI_DIR/custom_nodes/ComfyUI-segment-anything-2" ]; then
    echo "Installing ComfyUI-segment-anything-2..."
    cd $COMFYUI_DIR/custom_nodes
    git clone --depth 1 https://github.com/kijai/ComfyUI-segment-anything-2.git
    cd ComfyUI-segment-anything-2 && pip install -q -r requirements.txt 2>/dev/null || true
    echo "segment-anything-2: installed"
else
    echo "segment-anything-2: already installed"
fi

# RunPod package (for handler.py compatibility)
pip install -q runpod

echo "COMFYUI_SETUP_OK"
REMOTE

ssh_run "cat /comfyui/main.py" > /dev/null 2>&1 && ok "ComfyUI installed at /comfyui"

# Model download
hr; echo ""; echo "  Phase 5 — Model weights"; echo ""
info "Checking models on instance..."
MODEL_STATUS=$(ssh_run "
    find /comfyui/models/diffusion_models -name '*animate*' 2>/dev/null | head -1
    find /comfyui/models/vae -name 'Wan*' 2>/dev/null | head -1
    find /comfyui/models/text_encoders -name 'umt5*' 2>/dev/null | head -1
" 2>/dev/null || echo "")

if [ -n "$MODEL_STATUS" ]; then
    ok "Some models already present"
else
    warn "No Wan models found. Downloading now (~22GB, ~30min)..."
    info "Running download-models.sh on instance..."
    ssh_run "pip install -q huggingface_hub && bash $WORKDIR/worker/scripts/download-models.sh /comfyui/models"
fi

# Final check
hr; echo ""; echo "  Phase 6 — Verification"; echo ""
VERIFY=$(ssh_run "
    [ -f /comfyui/main.py ] && echo 'comfyui:ok' || echo 'comfyui:missing'
    [ -d /comfyui/custom_nodes/ComfyUI-WanVideoWrapper ] && echo 'wanwrapper:ok' || echo 'wanwrapper:missing'
    [ -d /comfyui/custom_nodes/ComfyUI-WanAnimatePreprocess ] && echo 'wanpreprocess:ok' || echo 'wanpreprocess:missing'
    command -v ffmpeg &>/dev/null && echo 'ffmpeg:ok' || echo 'ffmpeg:missing'
    find /comfyui/models/diffusion_models -name '*animate*' 2>/dev/null | head -1 | grep -q . && echo 'model:ok' || echo 'model:missing'
")
echo "$VERIFY" | while IFS=: read label status; do
    [ "$status" = "ok" ] && ok "$label" || warn "$label — check setup"
done

echo ""
hr
echo ""
echo -e "${GREEN}  ✅ Instance ready${NC}"
echo ""
echo "  Next step:"
echo "    npm run vast:test-gpu"
echo ""
hr
