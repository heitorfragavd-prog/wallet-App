#!/bin/bash

set -e

# Load environment variables from .env
export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)

echo "Building with environment variables..."
echo "VITE_SUPABASE_URL: ${VITE_SUPABASE_URL:0:30}..."
echo "VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY:0:30}..."

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg VITE_SUPABASE_URL="${VITE_SUPABASE_URL}" \
  --build-arg VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY}" \
  --build-arg VITE_APP_NAME="${VITE_APP_NAME}" \
  --build-arg VITE_APP_URL="https://wallet.cortexx.online" \
  --build-arg VITE_APP_ENVIRONMENT="production" \
  --build-arg VITE_ENABLE_ANALYTICS="false" \
  --build-arg VITE_ENABLE_DEBUG_LOGS="false" \
  --tag heitor84/wallet:1.0.1 \
  --tag heitor84/wallet:latest \
  --push \
  .

echo "âœ… Build e push concluÃ­dos!"

