#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# scripts/phase-b-frontend-preflight.sh
#
# Read-only validation preflight for Phase B frontend release.
# Does NOT execute docker stack deploy, docker swarm init, network creation,
# DNS changes, or firewall adjustments.
# ==============================================================================

STACK_FILE="${STACK_FILE:-docker-stack.yml}"
EXPECTED_DOMAIN="wallet.cortexx.online"

FORBIDDEN_VARS=(
  "SUPABASE_SERVICE_ROLE_KEY"
  "DATABASE_URL"
  "SUPABASE_DB_URL"
  "OPENAI_API_KEY"
  "GEMINI_API_KEY"
  "GEMINI_API_KEY_BACKUP"
  "TELEGRAM_BOT_TOKEN"
  "TELEGRAM_WEBHOOK_SECRET"
  "CRON_SECRET"
  "DIVIPAY_WEBHOOK_SECRET"
)

echo "=================================================================="
echo " PHASE B FRONTEND RELEASE PREFLIGHT"
echo "=================================================================="

FAILED=0

fail_check() {
  echo "[-] FAIL: $1" >&2
  FAILED=1
}

pass_check() {
  echo "[+] PASS: $1"
}

# 1. Check WALLET_IMAGE definition
if [[ -z "${WALLET_IMAGE:-}" ]]; then
  fail_check "WALLET_IMAGE environment variable is not defined or is empty."
else
  pass_check "WALLET_IMAGE is defined: $WALLET_IMAGE"
fi

# 2. Check tag disallowances
if [[ -n "${WALLET_IMAGE:-}" ]]; then
  IMAGE_TAG="${WALLET_IMAGE##*:}"
  
  if [[ "$WALLET_IMAGE" != *":"* ]]; then
    fail_check "WALLET_IMAGE does not specify an explicit tag: $WALLET_IMAGE"
  elif [[ "$IMAGE_TAG" == "latest" ]]; then
    fail_check "WALLET_IMAGE tag cannot be 'latest'. Must be an immutable SHA-bound tag."
  elif [[ "$IMAGE_TAG" == "develop" ]]; then
    fail_check "WALLET_IMAGE tag cannot be 'develop'. Must be an immutable SHA-bound tag."
  elif [[ "$IMAGE_TAG" == "1.0.2" ]]; then
    fail_check "WALLET_IMAGE tag cannot be obsolete version '1.0.2'."
  elif [[ ! "$IMAGE_TAG" =~ ^pr80-[a-f0-9]{7,40}$ ]] && [[ ! "$IMAGE_TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-f0-9]+)?$ ]]; then
    fail_check "WALLET_IMAGE tag '$IMAGE_TAG' does not match immutable format (e.g. pr80-<short_sha> or semver)."
  else
    pass_check "WALLET_IMAGE tag format is immutable and valid: $IMAGE_TAG"
  fi
fi

# 3. Check Docker tooling availability
if ! command -v docker >/dev/null 2>&1; then
  fail_check "Docker CLI is not installed or not in PATH."
else
  pass_check "Docker CLI is available."
fi

# 4. Check docker-stack.yml file presence and parseability
if [[ ! -f "$STACK_FILE" ]]; then
  fail_check "Manifest file '$STACK_FILE' not found."
else
  pass_check "Manifest file '$STACK_FILE' exists."
  
  # Check image parameterization in manifest
  if grep -q 'image: \${WALLET_IMAGE}' "$STACK_FILE" || grep -q 'image: "${WALLET_IMAGE}"' "$STACK_FILE"; then
    pass_check "Manifest requires explicit \${WALLET_IMAGE} parameterization."
  else
    fail_check "Manifest does not use '\${WALLET_IMAGE}' parameterization."
  fi
  
  # Check domain
  if grep -q "Host(\`$EXPECTED_DOMAIN\`)" "$STACK_FILE"; then
    pass_check "Expected domain '$EXPECTED_DOMAIN' is configured in Traefik labels."
  else
    fail_check "Domain '$EXPECTED_DOMAIN' not found in Traefik router rules."
  fi
  
  # Check network_public external declaration
  if grep -A 3 '^networks:' "$STACK_FILE" | grep -q 'network_public:'; then
    pass_check "network_public is declared in stack networks."
  else
    fail_check "network_public is not declared in stack networks."
  fi
fi

# 5. Check absence of Phase C references
if grep -qi "phase_c" "$STACK_FILE" 2>/dev/null; then
  fail_check "Phase C must NOT be referenced in frontend release manifest."
else
  pass_check "Phase C is completely isolated and not referenced."
fi

# 6. Check absence of backend secrets in environment
SECRETS_FOUND=0
for var_name in "${FORBIDDEN_VARS[@]}"; do
  if [[ -n "${!var_name:-}" ]]; then
    echo "[-] FAIL: Forbidden backend secret '$var_name' is exposed in environment!" >&2
    SECRETS_FOUND=1
  fi
done

if [[ $SECRETS_FOUND -eq 0 ]]; then
  pass_check "No backend secrets exposed in frontend release environment."
else
  FAILED=1
fi

echo "=================================================================="
if [[ $FAILED -eq 0 ]]; then
  echo "FRONTEND RELEASE PREFLIGHT: PASS"
  exit 0
else
  echo "FRONTEND RELEASE PREFLIGHT: FAIL"
  exit 1
fi
