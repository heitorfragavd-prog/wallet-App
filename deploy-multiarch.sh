#!/bin/bash

# Script de Deploy Multi-arquitetura para Docker Hub
# Suporta: linux/amd64, linux/arm64

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ConfiguraÃ§Ãµes
IMAGE_NAME="heitor84/wallet"
VERSION="1.0.21"
PLATFORMS="linux/amd64,linux/arm64"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Wallet - Deploy Multi-arch${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Imagem:${NC} $IMAGE_NAME"
echo -e "${YELLOW}VersÃ£o:${NC} $VERSION"
echo -e "${YELLOW}Plataformas:${NC} $PLATFORMS"
echo ""

# Verificar se Docker estÃ¡ rodando
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}âŒ Docker nÃ£o estÃ¡ rodando!${NC}"
    exit 1
fi

# Verificar se estÃ¡ logado no Docker Hub
if ! docker info | grep -q "Username"; then
    echo -e "${YELLOW}âš ï¸  VocÃª nÃ£o estÃ¡ logado no Docker Hub${NC}"
    echo -e "${YELLOW}Fazendo login...${NC}"
    docker login
fi

# Criar builder se nÃ£o existir
echo -e "${YELLOW}ðŸ”§ Configurando builder multi-arquitetura...${NC}"
if ! docker buildx ls | grep -q "multiarch-builder"; then
    docker buildx create --name multiarch-builder --use
else
    docker buildx use multiarch-builder
fi

# Inicializar builder
docker buildx inspect --bootstrap

# Build da aplicaÃ§Ã£o
echo -e "${YELLOW}ðŸ“¦ Fazendo build da aplicaÃ§Ã£o...${NC}"
npm run build

# Build e push da imagem multi-arquitetura
echo -e "${YELLOW}ðŸ³ Fazendo build e push da imagem Docker...${NC}"

# Carregar variÃ¡veis do .env se existir
if [ -f .env ]; then
  echo -e "${YELLOW}ðŸ“ Carregando variÃ¡veis do .env...${NC}"
  set -a
  source .env
  set +a
fi

# Verificar se as variÃ¡veis obrigatÃ³rias estÃ£o definidas
if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
  echo -e "${RED}âŒ Erro: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY sÃ£o obrigatÃ³rias!${NC}"
  echo -e "${YELLOW}Por favor, configure o arquivo .env${NC}"
  exit 1
fi

echo -e "${GREEN}âœ“ VariÃ¡veis de ambiente carregadas${NC}"

docker buildx build \
  --platform $PLATFORMS \
  --build-arg VITE_SUPABASE_URL="${VITE_SUPABASE_URL}" \
  --build-arg VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY}" \
  --build-arg VITE_APP_NAME="${VITE_APP_NAME:-Wallet}" \
  --build-arg VITE_APP_URL="${VITE_APP_URL:-https://wallet.cortexx.online}" \
  --build-arg VITE_APP_ENVIRONMENT="${VITE_APP_ENVIRONMENT:-production}" \
  --build-arg VITE_ENABLE_ANALYTICS="${VITE_ENABLE_ANALYTICS:-false}" \
  --build-arg VITE_ENABLE_DEBUG_LOGS="${VITE_ENABLE_DEBUG_LOGS:-false}" \
  --tag $IMAGE_NAME:$VERSION \
  --tag $IMAGE_NAME:latest \
  --push \
  .

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}âœ… Deploy concluÃ­do com sucesso!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Imagens publicadas:${NC}"
echo -e "  â€¢ $IMAGE_NAME:$VERSION"
echo -e "  â€¢ $IMAGE_NAME:latest"
echo ""
echo -e "${YELLOW}Para atualizar no servidor:${NC}"
echo -e "  docker service update --image $IMAGE_NAME:$VERSION wallet-app"
echo ""

