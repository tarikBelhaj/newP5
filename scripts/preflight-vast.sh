#!/bin/bash
# ================================================================
# npm run preflight:vast
#
# Verifies everything is in place BEFORE renting a Vast.ai instance.
# No GPU, no SSH, no API calls. Pure local checks.
# ================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC} $1"; }
fail() { echo -e "${RED}  ✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "${YELLOW}  ⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
hdr()  { echo ""; echo "  $1"; echo "  $(echo "$1" | tr '[:print:]' '─')"; }

ERRORS=0
WARNINGS=0

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  preflight:vast — local readiness check                     ║"
echo "║  No GPU, no SSH, no API calls.                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ── Scripts ──────────────────────────────────────────────────────
hdr "Scripts"
REQUIRED_SCRIPTS=(
    "scripts/vast-setup.sh"
    "scripts/vast-test-gpu.sh"
    "scripts/vast-stop.sh"
    "scripts/test-models.sh"
    "scripts/test-worker-local.sh"
    "scripts/test-worker-gpu.sh"
    "worker/scripts/download-models.sh"
)
for f in "${REQUIRED_SCRIPTS[@]}"; do
    full="$ROOT/$f"
    if [ ! -f "$full" ]; then
        fail "$f — not found"
    elif [ ! -x "$full" ]; then
        fail "$f — not executable (run: chmod +x $f)"
    else
        ok "$f"
    fi
done

# ── Worker files ─────────────────────────────────────────────────
hdr "Worker files"
REQUIRED_FILES=(
    "worker/handler.py"
    "worker/start.sh"
    "worker/Dockerfile"
    "worker/requirements.txt"
    "worker/test_payload.json"
    "worker/workflows/wan22_animate_replace_api.json"
    "worker/MODELS.md"
    "worker/VAST_SETUP.md"
    "worker/RUNPOD_POD_SETUP.md"
)
for f in "${REQUIRED_FILES[@]}"; do
    [ -f "$ROOT/$f" ] && ok "$f" || fail "$f — not found"
done

# ── Workflow JSON integrity ───────────────────────────────────────
hdr "Workflow JSON"
WORKFLOW="$ROOT/worker/workflows/wan22_animate_replace_api.json"
if [ -f "$WORKFLOW" ]; then
    # Valid JSON?
    python3 -c "import json; json.load(open('$WORKFLOW'))" 2>/dev/null \
        && ok "wan22_animate_replace_api.json — valid JSON" \
        || fail "wan22_animate_replace_api.json — invalid JSON"

    # Count nodes (excluding _info)
    NODE_COUNT=$(python3 -c "
import json
d = json.load(open('$WORKFLOW'))
print(len([k for k in d if k != '_info']))
" 2>/dev/null || echo "0")
    [ "$NODE_COUNT" -ge 10 ] \
        && ok "Workflow has $NODE_COUNT nodes" \
        || fail "Workflow has only $NODE_COUNT nodes — expected ≥ 10"

    # Check all PATCH: placeholders are present
    PATCH_COUNT=$(python3 -c "
import json
def count_patches(obj):
    if isinstance(obj, str) and obj.startswith('PATCH:'):
        return 1
    if isinstance(obj, dict):
        return sum(count_patches(v) for v in obj.values())
    if isinstance(obj, list):
        return sum(count_patches(v) for v in obj)
    return 0
d = json.load(open('$WORKFLOW'))
print(count_patches(d))
" 2>/dev/null || echo "0")
    [ "$PATCH_COUNT" -ge 8 ] \
        && ok "Workflow has $PATCH_COUNT PATCH: placeholders" \
        || warn "Workflow has only $PATCH_COUNT PATCH: placeholders — expected ≥ 8"

    # Check key required node class_types
    python3 << PYEOF
import json, sys
with open("$WORKFLOW") as f:
    wf = json.load(f)
required_nodes = [
    "VHS_LoadVideo", "LoadImage", "WanVideoModelLoader",
    "WanVideoVAELoader", "WanVideoTextEncodeCached",
    "WanVideoClipVisionEncode", "WanVideoAnimateEmbeds",
    "WanVideoSampler", "WanVideoDecode", "VHS_VideoCombine",
    "OnnxDetectionModelLoader", "OnnxPoseModelLoader",
    "PoseAndFaceDetection", "SAM2ModelLoader", "Sam2Segmentation",
]
found = [n.get("class_type") for n in wf.values() if isinstance(n, dict)]
missing = [n for n in required_nodes if n not in found]
if missing:
    print(f"  MISSING_NODES: {', '.join(missing)}")
    sys.exit(1)
else:
    print(f"  ALL_NODES_OK: {len(required_nodes)} required node types present")
PYEOF
    if [ $? -eq 0 ]; then
        ok "All 15 required node class_types referenced in workflow"
    else
        fail "Some required node types missing from workflow JSON"
    fi
fi

# ── package.json scripts ──────────────────────────────────────────
hdr "package.json"
REQUIRED_CMDS=(
    "vast:setup"
    "vast:test-gpu"
    "vast:stop"
    "preflight:vast"
    "test:models"
    "test:worker-local"
    "test:worker-gpu"
)
SCRIPTS_JSON=$(python3 -c "import json; d=json.load(open('$ROOT/package.json')); print(' '.join(d.get('scripts',{}).keys()))" 2>/dev/null || echo "")
for cmd in "${REQUIRED_CMDS[@]}"; do
    echo "$SCRIPTS_JSON" | grep -qw "$cmd" \
        && ok "npm run $cmd" \
        || fail "npm run $cmd — not in package.json"
done

# ── .env.local ───────────────────────────────────────────────────
hdr ".env.local"
if [ ! -f "$ENV_FILE" ]; then
    warn ".env.local not found"
    echo "       Create it: cp .env.local.example .env.local"
else
    ok ".env.local exists"

    # Source it safely
    while IFS='=' read -r k v; do
        [[ "$k" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$k" ]] && continue
        k="${k// /}"; v="${v// /}"
        [ -z "${!k+x}" ] && export "$k=$v" 2>/dev/null || true
    done < "$ENV_FILE"

    # Check Vast vars (warn, don't fail — they're filled later)
    [ -n "${VAST_API_KEY:-}" ]     && ok "VAST_API_KEY set"       || warn "VAST_API_KEY not set — fill after renting"
    [ -n "${VAST_INSTANCE_ID:-}" ] && ok "VAST_INSTANCE_ID set"   || warn "VAST_INSTANCE_ID not set — fill after renting"
    [ -n "${VAST_SSH_HOST:-}" ]    && ok "VAST_SSH_HOST set"      || warn "VAST_SSH_HOST not set — fill after renting"
    [ -n "${VAST_SSH_PORT:-}" ]    && ok "VAST_SSH_PORT set"      || warn "VAST_SSH_PORT not set — fill after renting"

    # AI_PROVIDER
    AI_PROVIDER="${AI_PROVIDER:-}"
    [ -n "$AI_PROVIDER" ] \
        && ok "AI_PROVIDER=$AI_PROVIDER" \
        || warn "AI_PROVIDER not set (expected: wan-vast)"

    # TEST_QUALITY
    QUAL="${TEST_QUALITY:-}"
    if [ "$QUAL" = "fast" ] || [ "$QUAL" = "standard" ]; then
        ok "TEST_QUALITY=$QUAL"
    else
        warn "TEST_QUALITY not set or invalid — will default to 'fast'"
    fi
fi

# ── Local tools ───────────────────────────────────────────────────
hdr "Local tools"
command -v python3 &>/dev/null  && ok "python3: $(python3 --version 2>&1)" || warn "python3 not found"
command -v git &>/dev/null      && ok "git: $(git --version)"              || warn "git not found"
command -v rsync &>/dev/null    && ok "rsync available"                    || warn "rsync not found (needed by vast:setup)"
command -v ssh &>/dev/null      && ok "ssh available"                      || warn "ssh not found — required for vast:setup and vast:test-gpu"
command -v scp &>/dev/null      && ok "scp available"                      || warn "scp not found (needed for output download)"
command -v ffprobe &>/dev/null  && ok "ffprobe available (output validation)" \
                                 || warn "ffprobe not found — install ffmpeg for local output validation"

# ── Git status ────────────────────────────────────────────────────
hdr "Git status"
if git -C "$ROOT" rev-parse --git-dir &>/dev/null; then
    BRANCH=$(git -C "$ROOT" branch --show-current 2>/dev/null || echo "unknown")
    DIRTY=$(git -C "$ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    ok "Git repo on branch: $BRANCH"
    [ "$DIRTY" -eq 0 ] \
        && ok "Working tree clean" \
        || warn "$DIRTY uncommitted changes — consider committing before vast:setup"
    REMOTE=$(git -C "$ROOT" remote get-url origin 2>/dev/null || echo "")
    [ -n "$REMOTE" ] \
        && ok "Remote: $REMOTE" \
        || warn "No git remote — vast:setup will use rsync instead (that's fine)"
else
    warn "Not a git repo — vast:setup will use rsync to copy files"
fi

# ── App build check ───────────────────────────────────────────────
hdr "App build"
if command -v npx &>/dev/null; then
    echo "  Running: npx tsc --noEmit"
    cd "$ROOT"
    if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
        fail "TypeScript errors found — fix before deploying"
    else
        ok "TypeScript: no errors"
    fi
else
    warn "npx not found — skipping TypeScript check"
fi

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
    echo -e "${GREEN}  ✅ ALL CHECKS PASSED${NC}"
    echo ""
    echo "  The project is ready. Checklist before renting:"
    echo "    1. git push (or confirm rsync will be used)"
    echo "    2. Rent Vast.ai RTX 4090 instance (150GB disk)"
    echo "    3. Fill .env.local: VAST_API_KEY, VAST_INSTANCE_ID, VAST_SSH_HOST, VAST_SSH_PORT"
    echo "    4. npm run vast:setup"
    echo "    5. npm run vast:test-gpu"
    echo "    6. npm run vast:stop -- --destroy"

elif [ "$ERRORS" -eq 0 ]; then
    echo -e "${YELLOW}  ⚠ READY WITH WARNINGS ($WARNINGS)${NC}"
    echo ""
    echo "  Warnings are expected if Vast.ai credentials are not yet set."
    echo "  Fix any unexpected warnings before renting."
    echo ""
    echo "  Checklist:"
    echo "    1. Address warnings above"
    echo "    2. Rent Vast.ai instance"
    echo "    3. Fill .env.local with SSH credentials"
    echo "    4. npm run vast:setup && npm run vast:test-gpu"

else
    echo -e "${RED}  ❌ $ERRORS ERROR(S) — fix before renting${NC}"
    echo ""
    echo "  Fix the errors above, then re-run: npm run preflight:vast"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

[ "$ERRORS" -eq 0 ] || exit 1
