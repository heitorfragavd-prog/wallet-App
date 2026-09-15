#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# scripts/test-release-guardrails.sh
#
# Automated test harness for Phase B release guardrails.
# Tests negative failure cases and positive pass cases without publishing any image.
# ==============================================================================

WORKTREE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WORKTREE_DIR"

echo "=== TESTING RELEASE GUARDRAILS ==="
HEAD_SHA=$(git rev-parse HEAD)
SHORT_SHA=$(echo "$HEAD_SHA" | cut -c1-7)

TOTAL=0
PASSED=0

assert_fail() {
  TOTAL=$((TOTAL + 1))
  local desc="$1"
  shift
  set +e
  "$@" >/dev/null 2>&1
  local exit_code=$?
  set -e
  if [ $exit_code -ne 0 ]; then
    echo "[PASS] Expected failure: $desc"
    PASSED=$((PASSED + 1))
  else
    echo "[FAIL] Expected failure, but succeeded: $desc" >&2
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
    echo "[PASS] Expected success: $desc"
    PASSED=$((PASSED + 1))
  else
    echo "[FAIL] Expected success, but failed (code $exit_code): $desc" >&2
    exit 1
  fi
}

# --- TESTS FOR phase-b-frontend-preflight.sh ---

# Case 1: WALLET_IMAGE empty => FAIL
assert_fail "WALLET_IMAGE empty" env -u WALLET_IMAGE bash scripts/phase-b-frontend-preflight.sh

# Case 2: WALLET_IMAGE=latest => FAIL
assert_fail "WALLET_IMAGE=latest" env WALLET_IMAGE="heitor84/wallet:latest" bash scripts/phase-b-frontend-preflight.sh

# Case 3: WALLET_IMAGE=develop => FAIL
assert_fail "WALLET_IMAGE=develop" env WALLET_IMAGE="heitor84/wallet:develop" bash scripts/phase-b-frontend-preflight.sh

# Case 4: WALLET_IMAGE=1.0.2 => FAIL
assert_fail "WALLET_IMAGE=1.0.2" env WALLET_IMAGE="heitor84/wallet:1.0.2" bash scripts/phase-b-frontend-preflight.sh

# Case 5: Valid immutable tag => PASS
assert_pass "WALLET_IMAGE immutable tag" env WALLET_IMAGE="heitor84/wallet:pr80-${SHORT_SHA}" bash scripts/phase-b-frontend-preflight.sh

# Case 6: Backend secret exposed => FAIL
assert_fail "Forbidden backend secret exposed" env WALLET_IMAGE="heitor84/wallet:pr80-${SHORT_SHA}" SUPABASE_SERVICE_ROLE_KEY="secret-xyz" bash scripts/phase-b-frontend-preflight.sh

# --- TESTS FOR build-release-image.sh ---

# Case 7: Incorrect expected-sha => FAIL
assert_fail "Incorrect expected-sha" bash scripts/build-release-image.sh --expected-sha "0000000000000000000000000000000000000000" --dry-run

# Case 8: Working tree dirty => FAIL (tested against real working tree)
assert_fail "Working tree dirty check fails cleanly" env VITE_SUPABASE_ANON_KEY="dummy-anon-key" bash scripts/build-release-image.sh --expected-sha "$HEAD_SHA" --dry-run

# Case 9: Backend secret exposed to build script => FAIL
assert_fail "Backend secret exposed to build script" env VITE_SUPABASE_ANON_KEY="dummy-anon-key" OPENAI_API_KEY="sk-dummy" bash scripts/build-release-image.sh --expected-sha "$HEAD_SHA" --skip-dirty-check --dry-run

# Case 10: Missing anon key => FAIL
assert_fail "Missing anon key" env -u VITE_SUPABASE_ANON_KEY bash scripts/build-release-image.sh --expected-sha "$HEAD_SHA" --skip-dirty-check --dry-run

# Case 11: Valid dry-run passes without build or push => PASS
assert_pass "Valid dry-run passes without build or push" env VITE_SUPABASE_ANON_KEY="dummy-anon-key" bash scripts/build-release-image.sh --expected-sha "$HEAD_SHA" --skip-dirty-check --dry-run

# --- TESTS FOR docker-stack.yml INTERPOLATION (Section 10) ---

# Case 12: docker-stack.yml interpolation check with docker compose config
if command -v docker >/dev/null 2>&1; then
  assert_pass "docker compose config resolves WALLET_IMAGE correctly" env WALLET_IMAGE="heitor84/wallet:pr80-${SHORT_SHA}" docker compose -f docker-stack.yml config
  
  # Verify that image in config matches exactly
  RESOLVED_IMAGE=$(env WALLET_IMAGE="heitor84/wallet:pr80-${SHORT_SHA}" docker compose -f docker-stack.yml config 2>/dev/null | grep -E 'image:\s+' | awk '{print $2}' | tr -d '"' | tr -d "'")
  if [ "$RESOLVED_IMAGE" = "heitor84/wallet:pr80-${SHORT_SHA}" ]; then
    echo "[PASS] Manifest interpolates exactly: $RESOLVED_IMAGE"
    PASSED=$((PASSED + 1))
    TOTAL=$((TOTAL + 1))
  else
    echo "[FAIL] Manifest interpolation mismatch: got '$RESOLVED_IMAGE', expected 'heitor84/wallet:pr80-${SHORT_SHA}'" >&2
    exit 1
  fi
fi

echo "=================================================================="
echo "ALL $PASSED OF $TOTAL GUARDRAIL TESTS PASSED!"
echo "=================================================================="
