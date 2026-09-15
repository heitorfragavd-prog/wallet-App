#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# scripts/phase-b-frontend-preflight.sh
#
# Read-only validation preflight for Phase B frontend release.
# Validates strict PR80 SHA-bound image policy, full manifest parse via docker compose config,
# and absence of backend secrets.
#
# NOTE: Pre-infrastructure preflight does NOT validate public TLS/DNS connectivity
# because frontend is NOT DEPLOYED and DNS is not yet pointed. TLS validation
# is strictly deferred to the post-deploy smoke verification stage.
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
  "JWT_SECRET"
  "SUPABASE_JWT_SECRET"
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

# 1. Check WALLET_IMAGE definition and strict PR80 SHA-bound format
if [[ -z "${WALLET_IMAGE:-}" ]]; then
  fail_check "WALLET_IMAGE environment variable is not defined or is empty."
elif [[ "$WALLET_IMAGE" == *"latest"* ]] || [[ "$WALLET_IMAGE" == *"develop"* ]] || [[ "$WALLET_IMAGE" == *"1.0.2"* ]] || [[ "$WALLET_IMAGE" == *"1.0.49"* ]] || [[ "$WALLET_IMAGE" == *"production"* ]]; then
  fail_check "WALLET_IMAGE cannot use mutable/obsolete/semver tag ('latest', 'develop', '1.0.2', '1.0.49', 'production')."
elif [[ ! "$WALLET_IMAGE" =~ ^heitor84/wallet:pr80-[0-9a-f]{7,40}$ ]]; then
  fail_check "WALLET_IMAGE '$WALLET_IMAGE' does not match strict PR80 SHA-bound policy: 'heitor84/wallet:pr80-<SHA>' (7 to 40 lowercase hex characters)."
else
  pass_check "WALLET_IMAGE adheres to strict PR80 SHA-bound policy: $WALLET_IMAGE"
fi

# 2. Check Docker tooling availability
DOCKER_AVAILABLE=0
if ! command -v docker >/dev/null 2>&1; then
  fail_check "Docker CLI is not installed or not in PATH."
else
  pass_check "Docker CLI is available."
  DOCKER_AVAILABLE=1
fi

# 3. Check docker-stack.yml file presence and validate manifest via docker compose config
if [[ ! -f "$STACK_FILE" ]]; then
  fail_check "Manifest file '$STACK_FILE' not found."
else
  pass_check "Manifest file '$STACK_FILE' exists."

  if [[ $DOCKER_AVAILABLE -eq 0 ]] || ! docker compose version >/dev/null 2>&1; then
    echo "[-] FAIL: MANIFEST PARSE: BLOCKED — DOCKER COMPOSE REQUIRED" >&2
    fail_check "Docker Compose is required to validate manifest."
  else
    # Validate with WALLET_IMAGE if valid, otherwise fallback to test tag to test compose parsing
    TEST_IMAGE="${WALLET_IMAGE:-heitor84/wallet:pr80-0000000}"
    set +e
    COMPOSE_CONFIG_OUTPUT=$(WALLET_IMAGE="$TEST_IMAGE" docker compose -f "$STACK_FILE" config 2>&1)
    COMPOSE_STATUS=$?
    set -e

    if [[ $COMPOSE_STATUS -ne 0 ]]; then
      fail_check "docker compose -f '$STACK_FILE' config failed to parse manifest: $COMPOSE_CONFIG_OUTPUT"
    else
      pass_check "docker compose -f '$STACK_FILE' config parsed successfully."

      # Validate resolved image when WALLET_IMAGE is defined
      if [[ -n "${WALLET_IMAGE:-}" ]]; then
        RESOLVED_IMAGE=$(echo "$COMPOSE_CONFIG_OUTPUT" | grep -E '^\s*image:\s+' | head -n1 | awk '{print $2}' | tr -d '"' | tr -d "'")
        if [[ "$RESOLVED_IMAGE" == "$WALLET_IMAGE" ]]; then
          pass_check "Rendered image matches WALLET_IMAGE exactly: $RESOLVED_IMAGE"
        else
          fail_check "Rendered image mismatch: expected '$WALLET_IMAGE', got '$RESOLVED_IMAGE'"
        fi
      fi

      # Validate network_public.external == true
      if echo "$COMPOSE_CONFIG_OUTPUT" | grep -A 3 'network_public:' | grep -q 'external:\s*true'; then
        pass_check "Rendered manifest has network_public configured with external: true"
      else
        fail_check "Rendered manifest missing network_public with external: true"
      fi

      # Validate expected domain in router rules
      if echo "$COMPOSE_CONFIG_OUTPUT" | grep -q "Host(\`$EXPECTED_DOMAIN\`)"; then
        pass_check "Rendered manifest router rules contain expected domain: $EXPECTED_DOMAIN"
      else
        fail_check "Rendered manifest missing router rule for domain: $EXPECTED_DOMAIN"
      fi

      # Validate Traefik certresolver leresolver
      if echo "$COMPOSE_CONFIG_OUTPUT" | grep -q 'certresolver:.*leresolver'; then
        pass_check "Rendered manifest has Traefik certresolver 'leresolver' configured."
      else
        fail_check "Rendered manifest missing Traefik certresolver 'leresolver'."
      fi
    fi
  fi
fi

# 4. Check absence of Phase C references
if grep -qi "phase_c" "$STACK_FILE" 2>/dev/null; then
  fail_check "Phase C must NOT be referenced in frontend release manifest."
else
  pass_check "Phase C is completely isolated and not referenced in stack manifest."
fi

# 5. Check absence of backend secrets in environment (names only, values never printed)
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
