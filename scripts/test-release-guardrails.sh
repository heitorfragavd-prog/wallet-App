#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# scripts/test-release-guardrails.sh
#
# Automated test harness for Phase B release guardrails.
# Covers all 20 required positive and negative test cases deterministically.
# Cleans up any test artifacts via trap to ensure zero working tree drift.
# ==============================================================================

WORKTREE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WORKTREE_DIR"

echo "=== TESTING RELEASE GUARDRAILS ==="
HEAD_SHA=$(git rev-parse HEAD)
SHORT_SHA=$(echo "$HEAD_SHA" | cut -c1-7)

TOTAL=0
PASSED=0

TMP_DIRTY_FILE=".release-guardrail-dirty-test.tmp"

cleanup() {
  rm -f "$TMP_DIRTY_FILE"
}
trap cleanup EXIT INT TERM

assert_fail() {
  TOTAL=$((TOTAL + 1))
  local desc="$1"
  shift
  set +e
  "$@" >/dev/null 2>&1
  local exit_code=$?
  set -e
  if [ $exit_code -ne 0 ]; then
    echo "[PASS] Case $TOTAL - Expected failure: $desc"
    PASSED=$((PASSED + 1))
  else
    echo "[FAIL] Case $TOTAL - Expected failure, but succeeded: $desc" >&2
    exit 1
  fi
}

assert_pass() {
  TOTAL=$((TOTAL + 1))
  local desc="$1"
  shift
  set +e
  "$@" >/dev/null 2>&1
  local exit_code=$?
  set -e
  if [ $exit_code -eq 0 ]; then
    echo "[PASS] Case $TOTAL - Expected success: $desc"
    PASSED=$((PASSED + 1))
  else
    echo "[FAIL] Case $TOTAL - Expected success, but failed (code $exit_code): $desc" >&2
    exit 1
  fi
}

# --- PREFLIGHT IMAGE TAG TESTS (Cases 1-8) ---

# 1. WALLET_IMAGE vazia => FAIL
assert_fail "WALLET_IMAGE empty rejected" env -u WALLET_IMAGE bash scripts/phase-b-frontend-preflight.sh

# 2. latest => FAIL
assert_fail "WALLET_IMAGE=latest rejected" env WALLET_IMAGE="heitor84/wallet:latest" bash scripts/phase-b-frontend-preflight.sh

# 3. develop => FAIL
assert_fail "WALLET_IMAGE=develop rejected" env WALLET_IMAGE="heitor84/wallet:develop" bash scripts/phase-b-frontend-preflight.sh

# 4. 1.0.2 => FAIL
assert_fail "WALLET_IMAGE=1.0.2 rejected" env WALLET_IMAGE="heitor84/wallet:1.0.2" bash scripts/phase-b-frontend-preflight.sh

# 5. 1.0.49 => FAIL
assert_fail "WALLET_IMAGE=1.0.49 (semver) rejected" env WALLET_IMAGE="heitor84/wallet:1.0.49" bash scripts/phase-b-frontend-preflight.sh

# 6. production => FAIL
assert_fail "WALLET_IMAGE=production rejected" env WALLET_IMAGE="heitor84/wallet:production" bash scripts/phase-b-frontend-preflight.sh

# 7. pr80-SHA invalido (non-hex chars or wrong prefix) => FAIL
assert_fail "WALLET_IMAGE with non-hex SHA rejected" env WALLET_IMAGE="heitor84/wallet:pr80-xyz123" bash scripts/phase-b-frontend-preflight.sh

# 8. pr80-SHA valido => PASS
assert_pass "WALLET_IMAGE with valid short SHA passes" env WALLET_IMAGE="heitor84/wallet:pr80-${SHORT_SHA}" bash scripts/phase-b-frontend-preflight.sh
assert_pass "WALLET_IMAGE with valid full SHA passes" env WALLET_IMAGE="heitor84/wallet:pr80-${HEAD_SHA}" bash scripts/phase-b-frontend-preflight.sh

# --- BUILD SCRIPT EXPECTED SHA & WORKING TREE TESTS (Cases 9-11) ---

# 9. expected SHA errado => FAIL
assert_fail "Incorrect expected-sha rejected" bash scripts/build-release-image.sh --expected-sha "0000000000000000000000000000000000000000" --dry-run

# 10. dirty tree criado pelo proprio teste => FAIL (deterministic untracked file)
touch "$TMP_DIRTY_FILE"
assert_fail "Dirty tree causes build-release-image to fail" env VITE_SUPABASE_ANON_KEY="dummy-anon-key" bash scripts/build-release-image.sh --expected-sha "$HEAD_SHA" --dry-run
cleanup

# 11. tree limpo + SHA correto => PASS (SEM --skip-dirty-check)
assert_pass "Clean working tree + valid expected SHA passes dry-run" env VITE_SUPABASE_ANON_KEY="dummy-anon-key" bash scripts/build-release-image.sh --expected-sha "$HEAD_SHA" --dry-run

# --- SECRETS PROIBIDOS GUARDS (Cases 12-14) ---

# 12. OPENAI_API_KEY presente => FAIL
assert_fail "Forbidden OPENAI_API_KEY rejected by preflight" env WALLET_IMAGE="heitor84/wallet:pr80-${SHORT_SHA}" OPENAI_API_KEY="sk-fake-secret" bash scripts/phase-b-frontend-preflight.sh
assert_fail "Forbidden OPENAI_API_KEY rejected by build script" env VITE_SUPABASE_ANON_KEY="dummy-anon-key" OPENAI_API_KEY="sk-fake-secret" bash scripts/build-release-image.sh --expected-sha "$HEAD_SHA" --dry-run

# 13. SUPABASE_SERVICE_ROLE_KEY presente => FAIL
assert_fail "Forbidden SUPABASE_SERVICE_ROLE_KEY rejected by preflight" env WALLET_IMAGE="heitor84/wallet:pr80-${SHORT_SHA}" SUPABASE_SERVICE_ROLE_KEY="fake-service-key" bash scripts/phase-b-frontend-preflight.sh
assert_fail "Forbidden SUPABASE_SERVICE_ROLE_KEY rejected by build script" env VITE_SUPABASE_ANON_KEY="dummy-anon-key" SUPABASE_SERVICE_ROLE_KEY="fake-service-key" bash scripts/build-release-image.sh --expected-sha "$HEAD_SHA" --dry-run

# 14. JWT_SECRET presente => FAIL
assert_fail "Forbidden JWT_SECRET rejected by preflight" env WALLET_IMAGE="heitor84/wallet:pr80-${SHORT_SHA}" JWT_SECRET="fake-jwt-secret" bash scripts/phase-b-frontend-preflight.sh
assert_fail "Forbidden JWT_SECRET rejected by build script" env VITE_SUPABASE_ANON_KEY="dummy-anon-key" JWT_SECRET="fake-jwt-secret" bash scripts/build-release-image.sh --expected-sha "$HEAD_SHA" --dry-run

# --- DRY-RUN EXECUTION CHECKS (Cases 15-16) ---

# 15. dry-run => nenhum build
DRY_RUN_OUTPUT=$(env VITE_SUPABASE_ANON_KEY="dummy-anon-key" bash scripts/build-release-image.sh --expected-sha "$HEAD_SHA" --dry-run)
TOTAL=$((TOTAL + 1))
if echo "$DRY_RUN_OUTPUT" | grep -q "DRY-RUN MODE COMPLETE: All checks passed. Zero images built or pushed."; then
  echo "[PASS] Case $TOTAL - Dry-run confirms zero images built"
  PASSED=$((PASSED + 1))
else
  echo "[FAIL] Case $TOTAL - Dry-run output missing zero-build confirmation" >&2
  exit 1
fi

# 16. dry-run => nenhum push
TOTAL=$((TOTAL + 1))
if ! echo "$DRY_RUN_OUTPUT" | grep -q "Executing multi-arch build and push"; then
  echo "[PASS] Case $TOTAL - Dry-run confirms zero push operations executed"
  PASSED=$((PASSED + 1))
else
  echo "[FAIL] Case $TOTAL - Dry-run executed build/push unexpectedly" >&2
  exit 1
fi

# --- MANIFEST PARSE & COMPOSE RESOLUTION CHECKS (Cases 17-20) ---

# 17. docker compose config => PASS
assert_pass "docker compose config validates docker-stack.yml successfully" env WALLET_IMAGE="heitor84/wallet:pr80-${SHORT_SHA}" docker compose -f docker-stack.yml config

# 18. imagem renderizada == WALLET_IMAGE exata => PASS
COMPOSE_CONFIG=$(env WALLET_IMAGE="heitor84/wallet:pr80-${SHORT_SHA}" docker compose -f docker-stack.yml config 2>/dev/null)
RESOLVED_IMAGE=$(echo "$COMPOSE_CONFIG" | grep -E '^\s*image:\s+' | head -n1 | awk '{print $2}' | tr -d '"' | tr -d "'")

TOTAL=$((TOTAL + 1))
if [ "$RESOLVED_IMAGE" = "heitor84/wallet:pr80-${SHORT_SHA}" ]; then
  echo "[PASS] Case $TOTAL - Rendered image matches WALLET_IMAGE exactly: $RESOLVED_IMAGE"
  PASSED=$((PASSED + 1))
else
  echo "[FAIL] Case $TOTAL - Rendered image mismatch: got '$RESOLVED_IMAGE', expected 'heitor84/wallet:pr80-${SHORT_SHA}'" >&2
  exit 1
fi

# 19. network_public.external == true => PASS
TOTAL=$((TOTAL + 1))
if echo "$COMPOSE_CONFIG" | grep -A 3 'network_public:' | grep -q 'external:\s*true'; then
  echo "[PASS] Case $TOTAL - network_public has external: true confirmed"
  PASSED=$((PASSED + 1))
else
  echo "[FAIL] Case $TOTAL - network_public external: true not found in rendered compose config" >&2
  exit 1
fi

# 20. Phase C nao referenciada no stack => PASS
TOTAL=$((TOTAL + 1))
if ! grep -qi "phase_c" docker-stack.yml; then
  echo "[PASS] Case $TOTAL - Phase C is completely isolated and not referenced in docker-stack.yml"
  PASSED=$((PASSED + 1))
else
  echo "[FAIL] Case $TOTAL - Phase C unexpectedly referenced in docker-stack.yml" >&2
  exit 1
fi

echo "=================================================================="
echo "ALL $PASSED OF $TOTAL GUARDRAIL TESTS PASSED!"
echo "=================================================================="
