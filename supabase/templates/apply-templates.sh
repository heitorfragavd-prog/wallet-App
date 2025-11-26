#!/bin/bash

# Script para aplicar templates de email no Supabase via Management API
# Uso: ./apply-templates.sh

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Aplicando Templates de Email no Supabase ===${NC}\n"

# Verificar se as variáveis de ambiente estão configuradas
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo -e "${RED}Erro: SUPABASE_ACCESS_TOKEN não está configurado${NC}"
    echo "Obtenha seu token em: https://supabase.com/dashboard/account/tokens"
    echo "Execute: export SUPABASE_ACCESS_TOKEN=\"seu-token\""
    exit 1
fi

PROJECT_REF="xjrjenniszhshrgtdjcp"
API_URL="https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth"

echo -e "${YELLOW}Projeto:${NC} $PROJECT_REF"
echo -e "${YELLOW}Lendo templates...${NC}\n"

# Ler os templates
CONFIRMATION_CONTENT=$(cat confirmation.html | jq -Rs .)
MAGIC_LINK_CONTENT=$(cat magic_link.html | jq -Rs .)
RECOVERY_CONTENT=$(cat recovery.html | jq -Rs .)
INVITE_CONTENT=$(cat invite.html | jq -Rs .)
EMAIL_CHANGE_CONTENT=$(cat email_change.html | jq -Rs .)
REAUTHENTICATION_CONTENT=$(cat reauthentication.html | jq -Rs .)

# Criar JSON payload
PAYLOAD=$(cat <<EOF
{
  "mailer_subjects_confirmation": "Confirme seu cadastro - Wallet",
  "mailer_templates_confirmation_content": $CONFIRMATION_CONTENT,
  "mailer_subjects_magic_link": "Seu link de acesso - Wallet",
  "mailer_templates_magic_link_content": $MAGIC_LINK_CONTENT,
  "mailer_subjects_recovery": "Recuperação de senha - Wallet",
  "mailer_templates_recovery_content": $RECOVERY_CONTENT,
  "mailer_subjects_invite": "Você foi convidado - Wallet",
  "mailer_templates_invite_content": $INVITE_CONTENT,
  "mailer_subjects_email_change": "Confirme a alteração de email - Wallet",
  "mailer_templates_email_change_content": $EMAIL_CHANGE_CONTENT,
  "mailer_subjects_reauthentication": "Código de verificação - Wallet",
  "mailer_templates_reauthentication_content": $REAUTHENTICATION_CONTENT
}
EOF
)

echo -e "${YELLOW}Enviando templates para o Supabase...${NC}\n"

# Fazer a requisição
RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH "$API_URL" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Separar body e status code
HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_STATUS=$(echo "$RESPONSE" | tail -n 1)

if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 201 ]; then
    echo -e "${GREEN}✓ Templates aplicados com sucesso!${NC}\n"
    echo -e "${GREEN}Os seguintes templates foram atualizados:${NC}"
    echo "  • Confirmação de cadastro"
    echo "  • Magic Link"
    echo "  • Recuperação de senha"
    echo "  • Convite"
    echo "  • Alteração de email"
    echo "  • Reautenticação (OTP)"
    echo ""
    echo -e "${YELLOW}Verifique os templates em:${NC}"
    echo "https://supabase.com/dashboard/project/$PROJECT_REF/auth/templates"
else
    echo -e "${RED}✗ Erro ao aplicar templates${NC}"
    echo -e "${RED}Status HTTP: $HTTP_STATUS${NC}"
    echo -e "${RED}Resposta:${NC}"
    echo "$HTTP_BODY" | jq . 2>/dev/null || echo "$HTTP_BODY"
    exit 1
fi
