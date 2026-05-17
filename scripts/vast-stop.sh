#!/bin/bash
# ================================================================
# npm run vast:stop
#
# Stops a Vast.ai instance (data preserved, billing pauses).
# Use vast:destroy to permanently delete and stop billing entirely.
#
# Usage:
#   npm run vast:stop              # stop (data kept)
#   npm run vast:stop -- --destroy # destroy (data deleted, billing stops)
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$(cd "$SCRIPT_DIR/.." && pwd)/.env.local"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
fail() { echo -e "${RED}  ✗${NC} $*"; exit 1; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }

if [ -f "$ENV_FILE" ]; then
    while IFS='=' read -r k v; do
        [[ "$k" =~ ^[[:space:]]*# ]] && continue; [[ -z "$k" ]] && continue
        k="${k// /}"; v="${v// /}"
        [ -z "${!k+x}" ] && export "$k=$v" 2>/dev/null || true
    done < "$ENV_FILE"
fi

VAST_API_KEY="${VAST_API_KEY:-}"
INSTANCE_ID="${VAST_INSTANCE_ID:-}"
MODE="${1:---stop}"

[ -n "$VAST_API_KEY" ]  || fail "VAST_API_KEY not set in .env.local"
[ -n "$INSTANCE_ID" ]   || fail "VAST_INSTANCE_ID not set in .env.local"

echo ""
echo "  Instance ID: $INSTANCE_ID"
echo ""

if [ "$MODE" = "--destroy" ]; then
    warn "DESTROY will permanently delete the instance and all data."
    read -p "  Type 'destroy' to confirm: " confirm
    [ "$confirm" = "destroy" ] || { echo "  Cancelled."; exit 0; }

    echo "  Destroying instance $INSTANCE_ID..."
    RESPONSE=$(curl -sf -X DELETE \
        "https://console.vast.ai/api/v0/instances/$INSTANCE_ID/" \
        -H "Authorization: Bearer $VAST_API_KEY" 2>&1 || echo '{"success":false}')
    echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok' if d.get('success') else 'failed')" \
        | grep -q ok && ok "Instance $INSTANCE_ID destroyed — billing stopped" \
        || { warn "API response: $RESPONSE"; fail "Destroy may have failed — check Vast.ai console"; }

else
    echo "  Stopping instance $INSTANCE_ID (data preserved)..."
    RESPONSE=$(curl -sf -X PUT \
        "https://console.vast.ai/api/v0/instances/$INSTANCE_ID/" \
        -H "Authorization: Bearer $VAST_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"state":"stopped"}' 2>&1 || echo '{"success":false}')
    echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok' if d.get('success') else 'failed')" \
        | grep -q ok && ok "Instance $INSTANCE_ID stopped" \
        || { warn "API response: $RESPONSE"; fail "Stop may have failed — check Vast.ai console"; }

    echo ""
    warn "Stopped instances: data is kept but storage still costs ~\$0.002/GB/hr"
    warn "To permanently stop billing: npm run vast:stop -- --destroy"
fi
echo ""
