#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# scripts/build-release-image.sh
# 
# Strict, auditable script to build the frontend release candidate Docker image.
# Does NOT push unless explicit --push flag is provided.
# Validates exact git commit SHA, working tree cleanliness, and frontend build args.
# ==============================================================================

EXPECTED_SHA=""
MODE="dry-run"
DOCKER_USER="${DOCKER_USER:-heitor84}"
REPO_NAME="wallet"
SKIP_DIRTY_CHECK=0

# Disallowed backend secret variables
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

usage() {
  cat <<EOF
Usage: $0 --expected-sha <FULL_40_CHAR_SHA> [--dry-run | --push]

Options:
  --expected-sha <SHA>    Mandatory 40-character commit SHA that must match HEAD
  --dry-run               Validate prerequisites, git state, and build-args without building/pushing (Default)
  --push                  Perform multi-arch build and push to Docker Hub
  --skip-dirty-check      (Internal/Test only) Skip working tree cleanliness check
  -h, --help              Show this help message
EOF
  exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --expected-sha)
      if [[ -z "${2:-}" ]]; then
        echo "ERROR: --expected-sha requires a full 40-character SHA value." >&2
        exit 1
      fi
      EXPECTED_SHA="$2"
      shift 2
      ;;
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    --push)
      MODE="push"
      shift
      ;;
    --skip-dirty-check)
      SKIP_DIRTY_CHECK=1
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      usage
      ;;
  esac
done

if [[ -z "$EXPECTED_SHA" ]]; then
  echo "ERROR: Missing required argument --expected-sha." >&2
  usage
fi

if [[ ${#EXPECTED_SHA} -ne 40 ]]; then
  echo "ERROR: Expected SHA must be a 40-character hexadecimal git hash." >&2
  exit 1
fi

# 1. Validate Git HEAD matches Expected SHA
CURRENT_HEAD=$(git rev-parse HEAD 2>/dev/null || true)
if [[ -z "$CURRENT_HEAD" ]]; then
  echo "ERROR: Not inside a valid git repository." >&2
  exit 1
fi

if [[ "$CURRENT_HEAD" != "$EXPECTED_SHA" ]]; then
  echo "ERROR: Git HEAD ($CURRENT_HEAD) does not match expected SHA ($EXPECTED_SHA)." >&2
  exit 1
fi

# 2. Validate clean working tree
if [[ $SKIP_DIRTY_CHECK -eq 0 ]]; then
  DIRTY_FILES=$(git status --porcelain 2>/dev/null || true)
  if [[ -n "$DIRTY_FILES" ]]; then
    echo "ERROR: Working tree is not clean. Commit or stash all changes before building." >&2
    git status --short >&2
    exit 1
  fi
fi

# 3. Reject forbidden backend secrets in environment
for var_name in "${FORBIDDEN_VARS[@]}"; do
  if [[ -n "${!var_name:-}" ]]; then
    echo "ERROR: Forbidden backend secret '$var_name' is set in environment! Refusing to build." >&2
    exit 1
  fi
done

# 4. Compute Short SHA and Target Image Tag
SHORT_SHA=$(echo "$EXPECTED_SHA" | cut -c1-7)
TAG="${DOCKER_USER}/${REPO_NAME}:pr80-${SHORT_SHA}"

# 5. Sanitize frontend build args (names only, values checked for existence)
VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-https://hdeguzxkdvebdrrutbnx.supabase.co}"
VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}"
VITE_APP_NAME="${VITE_APP_NAME:-Wallet}"
VITE_APP_URL="${VITE_APP_URL:-https://wallet.cortexx.online}"
VITE_APP_ENVIRONMENT="${VITE_APP_ENVIRONMENT:-production}"
VITE_ENABLE_ANALYTICS="${VITE_ENABLE_ANALYTICS:-false}"
VITE_ENABLE_DEBUG_LOGS="${VITE_ENABLE_DEBUG_LOGS:-false}"
VITE_VAPID_PUBLIC_KEY="${VITE_VAPID_PUBLIC_KEY:-}"

if [[ -z "$VITE_SUPABASE_ANON_KEY" ]]; then
  echo "ERROR: VITE_SUPABASE_ANON_KEY must be provided in environment." >&2
  exit 1
fi

echo "=================================================================="
echo " RELEASE IMAGE BUILD PLAN"
echo "=================================================================="
echo "Mode:             $MODE"
echo "Target Image Tag: $TAG"
echo "Verified HEAD:    $CURRENT_HEAD"
echo "Short SHA:        $SHORT_SHA"
echo "Platforms:        linux/amd64,linux/arm64"
echo "Build Args Configured:"
echo "  - VITE_SUPABASE_URL:         $VITE_SUPABASE_URL"
echo "  - VITE_SUPABASE_ANON_KEY:    [CONFIGURED: ${#VITE_SUPABASE_ANON_KEY} chars]"
echo "  - VITE_APP_NAME:             $VITE_APP_NAME"
echo "  - VITE_APP_URL:              $VITE_APP_URL"
echo "  - VITE_APP_ENVIRONMENT:      $VITE_APP_ENVIRONMENT"
echo "  - VITE_ENABLE_ANALYTICS:     $VITE_ENABLE_ANALYTICS"
echo "  - VITE_ENABLE_DEBUG_LOGS:    $VITE_ENABLE_DEBUG_LOGS"
echo "  - VITE_VAPID_PUBLIC_KEY:     [CONFIGURED: ${#VITE_VAPID_PUBLIC_KEY} chars]"
echo "Backend Secrets Check:         PASSED (0 forbidden secrets found)"
echo "Working Tree Check:            PASSED ($(if [[ $SKIP_DIRTY_CHECK -eq 1 ]]; then echo 'Bypassed for test harness'; else echo 'Clean'; fi))"
echo "=================================================================="

if [[ "$MODE" == "dry-run" ]]; then
  echo "DRY-RUN MODE COMPLETE: All checks passed. Zero images built or pushed."
  exit 0
fi

# 6. Push mode: Multi-arch build and push via Docker Buildx
echo "Executing multi-arch build and push for $TAG..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag "$TAG" \
  --build-arg "VITE_SUPABASE_URL=$VITE_SUPABASE_URL" \
  --build-arg "VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY" \
  --build-arg "VITE_APP_NAME=$VITE_APP_NAME" \
  --build-arg "VITE_APP_URL=$VITE_APP_URL" \
  --build-arg "VITE_APP_ENVIRONMENT=$VITE_APP_ENVIRONMENT" \
  --build-arg "VITE_ENABLE_ANALYTICS=$VITE_ENABLE_ANALYTICS" \
  --build-arg "VITE_ENABLE_DEBUG_LOGS=$VITE_ENABLE_DEBUG_LOGS" \
  --build-arg "VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY" \
  --push \
  .

# 7. Capture Image Digest after push
echo "Querying pushed image digest..."
DIGEST=$(docker buildx imagetools inspect "$TAG" 2>/dev/null | grep -E '^Digest:' | head -n1 | awk '{print $2}' || true)
if [[ -n "$DIGEST" ]]; then
  echo "SUCCESS: Image published successfully."
  echo "IMAGE_TAG:    $TAG"
  echo "IMAGE_DIGEST: $DIGEST"
else
  echo "SUCCESS: Image pushed to $TAG."
fi
