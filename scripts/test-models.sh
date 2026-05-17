#!/bin/bash
# ================================================================
# Verify all model weights required by wan22_animate_replace_api.json
# Usage: npm run test:models
# Reads MODEL_PATH from env or .env.local
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.local"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
fail() { echo -e "${RED}  ✗${NC} $*"; FAIL=1; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }

FAIL=0

# Load .env.local
if [ -f "$ENV_FILE" ]; then
    while IFS='=' read -r k v; do
        [[ "$k" =~ ^[[:space:]]*# ]] && continue; [[ -z "$k" ]] && continue
        k="${k// /}"; v="${v// /}"
        [ -z "${!k+x}" ] && export "$k=$v" 2>/dev/null || true
    done < "$ENV_FILE"
fi

BASE="${MODEL_PATH:-${WAN_MODEL_PATH:-}}"

echo ""
echo "================================================================"
echo " Model presence check — Wan2.2-Animate"
echo "================================================================"
echo ""

if [ -z "$BASE" ]; then
    echo -e "${RED}MODEL_PATH not set.${NC}"
    echo ""
    echo "  Set it in .env.local:"
    echo "    MODEL_PATH=/path/to/comfyui/models"
    echo ""
    echo "  Or export it before running:"
    echo "    MODEL_PATH=/path/to/models npm run test:models"
    exit 1
fi

if [ ! -d "$BASE" ]; then
    echo -e "${RED}MODEL_PATH does not exist: $BASE${NC}"
    exit 1
fi

ok "Model base: $BASE"
echo ""

# ── Helper: check file exists and has min size ────────────────────
check_model() {
    local subdir="$1"
    local pattern="$2"
    local min_mb="$3"
    local label="$4"

    local dir="$BASE/$subdir"
    if [ ! -d "$dir" ]; then
        fail "$label — directory missing: $dir"
        echo "       Run: bash worker/scripts/download-models.sh $BASE"
        return
    fi

    # Find file matching pattern (case-insensitive)
    local found
    found=$(find "$dir" -maxdepth 2 -type f \
        \( -iname "*${pattern}*" \) 2>/dev/null | head -1 || true)

    if [ -z "$found" ]; then
        fail "$label — no file matching '*${pattern}*' in $dir"
        echo "       Run: bash worker/scripts/download-models.sh $BASE"
        return
    fi

    local size_mb
    size_mb=$(du -sm "$found" 2>/dev/null | cut -f1 || echo 0)

    if [ "$size_mb" -lt "$min_mb" ]; then
        fail "$label — file too small (${size_mb}MB < ${min_mb}MB): $(basename "$found")"
        echo "       File may be corrupt. Re-download it."
        return
    fi

    ok "$label — $(basename "$found") (${size_mb}MB)"
}

echo "── Required models ───────────────────────────────────────────"
echo ""

check_model "diffusion_models/WanVideo" "animate"    10000  "Wan2.2-Animate diffusion model"
check_model "vae"                        "wan"        1000   "VAE (Wan2.1)"
check_model "text_encoders"              "umt5"       4000   "Text encoder (UMT5-XXL)"
check_model "clip_vision"                "clip"       400    "CLIP Vision H"
check_model "detection"                  "yolov10"    20     "YOLO detection (yolov10m.onnx)"
check_model "detection"                  "vitpose"    100    "ViTPose ONNX"
check_model "sam2"                       "sam2"       500    "SAM2 segmentation"

echo ""
echo "── Optional models ───────────────────────────────────────────"
echo ""
check_model "loras/WanVideo/Lightx2v" "lightx2v" 100 "Lightx2v LoRA (step acceleration)" || true

# ── Cross-check with workflow JSON ────────────────────────────────
echo ""
echo "── Workflow compatibility check ──────────────────────────────"
echo ""

WORKFLOW="$PROJECT_ROOT/worker/workflows/wan22_animate_replace_api.json"
if [ ! -f "$WORKFLOW" ]; then
    warn "Workflow not found: $WORKFLOW"
else
    python3 << PYEOF
import json, os, glob

BASE = os.environ.get("MODEL_PATH", os.environ.get("WAN_MODEL_PATH", ""))
with open("$WORKFLOW") as f:
    wf = json.load(f)

# Collect all PATCH: placeholders
patches = {}
def collect(obj, path=""):
    if isinstance(obj, str) and obj.startswith("PATCH:"):
        patches[obj] = path
    elif isinstance(obj, dict):
        for k, v in obj.items():
            collect(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            collect(v, f"{path}[{i}]")

collect(wf)

model_patches = {k: v for k, v in patches.items() if "model" in k.lower() or "encoder" in k.lower() or "clip" in k.lower() or "yolo" in k.lower() or "vitpose" in k.lower() or "sam2" in k.lower()}

print(f"  Workflow has {len(wf) - 1} nodes")
print(f"  PATCH placeholders: {len(patches)}")
print(f"  Model-related patches: {len(model_patches)}")
for p in sorted(model_patches.keys()):
    print(f"    {p}")
PYEOF
    ok "Workflow JSON parsed OK"
fi

# ── Disk space ────────────────────────────────────────────────────
echo ""
echo "── Disk usage ────────────────────────────────────────────────"
echo ""
du -sh "$BASE"/* 2>/dev/null | sort -rh | while read size path; do
    printf "  %-8s %s\n" "$size" "$(basename "$path")"
done
echo ""
printf "  %-8s %s\n" "$(du -sh "$BASE" 2>/dev/null | cut -f1)" "TOTAL"

# ── Result ────────────────────────────────────────────────────────
echo ""
echo "================================================================"
if [ $FAIL -eq 0 ]; then
    echo -e " ${GREEN}✅ All required models present${NC}"
    echo ""
    echo " Next step: npm run test:worker-gpu"
else
    echo -e " ${RED}❌ Some models are missing or corrupt${NC}"
    echo ""
    echo " Download missing models:"
    echo "   bash worker/scripts/download-models.sh $BASE"
    exit 1
fi
echo "================================================================"
echo ""
