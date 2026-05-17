#!/bin/bash
# ================================================================
# Download all models required for Wan2.2-Animate ComfyUI worker
# Usage:
#   bash worker/scripts/download-models.sh /path/to/comfyui/models
#
# Skips files that already exist.
# Run on the RunPod Pod or any machine with enough disk space.
# ================================================================

set -euo pipefail

BASE="${1:-/comfyui/models}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
skip() { echo -e "${YELLOW}[SKIP]${NC} $* (already exists)"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }
info() { echo "  $*"; }

require_cmd() {
    command -v "$1" &>/dev/null || fail "$1 not found. Install it first."
}

check_size() {
    local path="$1"
    local min_bytes="$2"
    local label="$3"
    local actual
    actual=$(stat -c%s "$path" 2>/dev/null || stat -f%z "$path" 2>/dev/null || echo 0)
    if [ "$actual" -lt "$min_bytes" ]; then
        fail "$label downloaded but too small (${actual} bytes, expected ≥${min_bytes}). File may be corrupt."
    fi
}

download_hf() {
    # download_hf REPO FILENAME LOCAL_DIR [SUBFOLDER_IN_REPO]
    local repo="$1"
    local filename="$2"
    local local_dir="$3"
    local subfolder="${4:-}"
    local dest="$local_dir/$filename"

    if [ -f "$dest" ]; then
        skip "$filename"
        return 0
    fi

    mkdir -p "$local_dir"
    local hf_path
    if [ -n "$subfolder" ]; then
        hf_path="$subfolder/$filename"
    else
        hf_path="$filename"
    fi

    info "Downloading $filename from $repo ..."
    huggingface-cli download "$repo" "$hf_path" --local-dir "$local_dir" \
        --local-dir-use-symlinks False 2>&1 | grep -v "^$" || fail "Failed to download $filename"

    # Move from nested subfolder if huggingface-cli placed it there
    if [ -n "$subfolder" ] && [ -f "$local_dir/$subfolder/$filename" ] && [ ! -f "$dest" ]; then
        mv "$local_dir/$subfolder/$filename" "$dest"
    fi

    [ -f "$dest" ] || fail "$filename not found at $dest after download"
    ok "$filename → $dest"
}

# ================================================================
echo ""
echo "================================================================"
echo " Wan2.2-Animate model downloader"
echo " Target: $BASE"
echo "================================================================"
echo ""

# Check tools
require_cmd huggingface-cli
require_cmd python3

# Create all required directories
echo "── Creating directories ──────────────────────────────────────"
DIRS=(
    "$BASE/diffusion_models/WanVideo"
    "$BASE/vae"
    "$BASE/text_encoders"
    "$BASE/clip_vision"
    "$BASE/detection"
    "$BASE/sam2"
    "$BASE/loras/WanVideo/Lightx2v"
)
for d in "${DIRS[@]}"; do
    mkdir -p "$d"
    echo "  $d"
done
echo ""

# ── 1. Diffusion model (fp8, ~14GB) ──────────────────────────────
echo "── 1/7  Diffusion model (Wan2.2-Animate fp8, ~14GB) ──────────"
DIFF_DIR="$BASE/diffusion_models/WanVideo"
DIFF_FILE="Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors"
DIFF_DEST="$DIFF_DIR/$DIFF_FILE"

if [ -f "$DIFF_DEST" ]; then
    skip "$DIFF_FILE"
else
    info "Source: Kijai/WanVideo_comfy_fp8_scaled (Wan22Animate/)"
    mkdir -p "$DIFF_DIR"
    huggingface-cli download Kijai/WanVideo_comfy_fp8_scaled \
        "Wan22Animate/$DIFF_FILE" \
        --local-dir "$DIFF_DIR" \
        --local-dir-use-symlinks False 2>&1 | grep -v "^$" || fail "Failed to download diffusion model"
    # Move from subfolder if needed
    [ -f "$DIFF_DIR/Wan22Animate/$DIFF_FILE" ] && mv "$DIFF_DIR/Wan22Animate/$DIFF_FILE" "$DIFF_DEST" || true
    [ -f "$DIFF_DEST" ] || fail "Diffusion model not found at $DIFF_DEST"
    check_size "$DIFF_DEST" 10000000000 "Diffusion model"
    ok "$DIFF_FILE"
fi

# ── 2. VAE (~1.5GB) ──────────────────────────────────────────────
echo ""
echo "── 2/7  VAE (Wan2.1 VAE bf16, ~1.5GB) ────────────────────────"
download_hf "Kijai/WanVideo_comfy" "Wan2_1_VAE_bf16.safetensors" "$BASE/vae"
check_size "$BASE/vae/Wan2_1_VAE_bf16.safetensors" 1000000000 "VAE"

# ── 3. Text encoder UMT5-XXL (~5GB) ──────────────────────────────
echo ""
echo "── 3/7  Text encoder (UMT5-XXL bf16, ~5GB) ───────────────────"
download_hf "Kijai/WanVideo_comfy" "umt5-xxl-enc-bf16.safetensors" "$BASE/text_encoders"
check_size "$BASE/text_encoders/umt5-xxl-enc-bf16.safetensors" 4000000000 "Text encoder"

# ── 4. CLIP Vision (~600MB) ───────────────────────────────────────
echo ""
echo "── 4/7  CLIP Vision H (~600MB) ────────────────────────────────"
download_hf "Kijai/WanVideo_comfy" "clip_vision_h.safetensors" "$BASE/clip_vision"
check_size "$BASE/clip_vision/clip_vision_h.safetensors" 400000000 "CLIP Vision"

# ── 5. YOLO detection (~32MB) ────────────────────────────────────
echo ""
echo "── 5/7  YOLO detection (yolov10m, ~32MB) ──────────────────────"
YOLO_DEST="$BASE/detection/yolov10m.onnx"
if [ -f "$YOLO_DEST" ]; then
    skip "yolov10m.onnx"
else
    YOLO_TMP=$(mktemp -d)
    huggingface-cli download Wan-AI/Wan2.2-Animate-14B \
        "process_checkpoint/det/yolov10m.onnx" \
        --local-dir "$YOLO_TMP" \
        --local-dir-use-symlinks False 2>&1 | grep -v "^$" || fail "Failed to download YOLO"
    YOLO_SRC=$(find "$YOLO_TMP" -name "yolov10m.onnx" | head -1)
    [ -f "$YOLO_SRC" ] || fail "yolov10m.onnx not found in download"
    mv "$YOLO_SRC" "$YOLO_DEST"
    rm -rf "$YOLO_TMP"
    ok "yolov10m.onnx"
fi

# ── 6. ViTPose ONNX (~200MB) ─────────────────────────────────────
echo ""
echo "── 6/7  ViTPose-L wholebody ONNX (~200MB) ─────────────────────"
VP_DEST="$BASE/detection/vitpose-l-wholebody.onnx"
if [ -f "$VP_DEST" ]; then
    skip "vitpose-l-wholebody.onnx"
else
    VP_TMP=$(mktemp -d)
    huggingface-cli download JunkyByte/easy_ViTPose \
        "onnx/wholebody/vitpose-l-wholebody.onnx" \
        --local-dir "$VP_TMP" \
        --local-dir-use-symlinks False 2>&1 | grep -v "^$" || fail "Failed to download ViTPose"
    VP_SRC=$(find "$VP_TMP" -name "vitpose-l-wholebody.onnx" | head -1)
    [ -f "$VP_SRC" ] || fail "vitpose-l-wholebody.onnx not found in download"
    mv "$VP_SRC" "$VP_DEST"
    rm -rf "$VP_TMP"
    ok "vitpose-l-wholebody.onnx"
fi

# ── 7. SAM2 (~900MB) ─────────────────────────────────────────────
echo ""
echo "── 7/7  SAM2 hiera large (~900MB) ─────────────────────────────"
download_hf "Kijai/sam2-safetensors" "sam2_hiera_large.safetensors" "$BASE/sam2"
check_size "$BASE/sam2/sam2_hiera_large.safetensors" 500000000 "SAM2"

# ── Optional: Lightx2v LoRA (step acceleration) ──────────────────
echo ""
echo "── Optional: Lightx2v LoRA (4-step acceleration, ~400MB) ──────"
LORA_FILE="lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors"
LORA_DEST="$BASE/loras/WanVideo/Lightx2v/$LORA_FILE"
if [ -f "$LORA_DEST" ]; then
    skip "$LORA_FILE"
else
    echo "  Downloading (optional but recommended for fast inference)..."
    huggingface-cli download Kijai/WanVideo_comfy \
        "Lightx2v/$LORA_FILE" \
        --local-dir "$BASE/loras/WanVideo" \
        --local-dir-use-symlinks False 2>&1 | grep -v "^$" || {
        echo "  Warning: LoRA download failed (non-fatal — will use standard sampling)"
    }
    [ -f "$BASE/loras/WanVideo/Lightx2v/$LORA_FILE" ] && ok "$LORA_FILE" || \
    echo "  LoRA not downloaded — continuing without it"
fi

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo " Download complete"
echo "================================================================"
echo ""
echo " Model directory: $BASE"
echo " Disk usage:"
du -sh "$BASE"/* 2>/dev/null | sort -h | while read size path; do
    echo "   $size  $(basename "$path")"
done
echo ""
echo " Total:"
du -sh "$BASE" 2>/dev/null

# Quick integrity check
echo ""
echo " File count by directory:"
for d in diffusion_models/WanVideo vae text_encoders clip_vision detection sam2; do
    count=$(ls "$BASE/$d"/ 2>/dev/null | wc -l | tr -d ' ')
    echo "   $count  $BASE/$d"
done

echo ""
ok "All required models downloaded."
echo " Next step: npm run test:models"
