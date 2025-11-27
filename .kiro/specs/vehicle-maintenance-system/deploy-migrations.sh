#!/bin/bash

# Deploy Script - Vehicle Maintenance System Migrations
# Project: Wallet (xjrjenniszhshrgtdjcp)
# Region: sa-east-1

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project configuration
PROJECT_REF="xjrjenniszhshrgtdjcp"
MIGRATIONS_DIR="supabase/migrations"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Vehicle Maintenance System - Deploy${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✅ Supabase CLI found${NC}"
echo ""

# Check if logged in
echo "Checking Supabase authentication..."
if ! supabase projects list &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Supabase${NC}"
    echo "Run: supabase login"
    exit 1
fi

echo -e "${GREEN}✅ Authenticated${NC}"
echo ""

# Confirm before proceeding
echo -e "${YELLOW}⚠️  WARNING: This will deploy migrations to PRODUCTION${NC}"
echo -e "${YELLOW}Project: Wallet (${PROJECT_REF})${NC}"
echo ""
read -p "Have you created a backup? (yes/no): " backup_confirm

if [ "$backup_confirm" != "yes" ]; then
    echo -e "${RED}❌ Please create a backup first!${NC}"
    echo "Go to: https://supabase.com/dashboard/project/${PROJECT_REF}/database/backups"
    exit 1
fi

echo ""
read -p "Do you want to proceed with the deployment? (yes/no): " deploy_confirm

if [ "$deploy_confirm" != "yes" ]; then
    echo -e "${YELLOW}Deployment cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${GREEN}Starting deployment...${NC}"
echo ""

# Link to project
echo "Linking to project..."
supabase link --project-ref $PROJECT_REF

# List of migrations to deploy
migrations=(
    "23.planos_manutencao_veiculo.sql"
    "24.manutencoes_customizadas.sql"
    "25.lembretes_manutencao.sql"
    "26.webhooks_manutencao.sql"
    "27.logs_webhooks_manutencao.sql"
    "28.rls_verification_manutencao.sql"
    "29.additional_indexes_manutencao.sql"
    "30.cron_lembretes_manutencao.sql"
    "31.migrate_existing_manutencoes.sql"
)

# Deploy each migration
for migration in "${migrations[@]}"; do
    echo ""
    echo -e "${YELLOW}Deploying: ${migration}${NC}"
    
    if [ ! -f "${MIGRATIONS_DIR}/${migration}" ]; then
        echo -e "${RED}❌ Migration file not found: ${migration}${NC}"
        exit 1
    fi
    
    # Apply migration
    if supabase db push --include-all; then
        echo -e "${GREEN}✅ ${migration} deployed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to deploy ${migration}${NC}"
        echo "Check the error above and fix before continuing"
        exit 1
    fi
    
    # Wait a bit between migrations
    sleep 2
done

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ All migrations deployed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Verification queries
echo "Running verification queries..."
echo ""

echo "1. Checking tables..."
supabase db execute --project-ref $PROJECT_REF <<SQL
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name IN (
  'planos_manutencao_veiculo',
  'manutencoes_customizadas',
  'lembretes_manutencao',
  'webhooks_manutencao',
  'logs_webhooks_manutencao'
);
SQL

echo ""
echo "2. Checking RLS..."
supabase db execute --project-ref $PROJECT_REF <<SQL
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'planos_manutencao_veiculo',
  'manutencoes_customizadas',
  'lembretes_manutencao',
  'webhooks_manutencao',
  'logs_webhooks_manutencao'
);
SQL

echo ""
echo "3. Checking cron job..."
supabase db execute --project-ref $PROJECT_REF <<SQL
SELECT jobname, schedule, active 
FROM cron.job 
WHERE jobname = 'processar-lembretes-manutencao';
SQL

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Next Steps:${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "1. Deploy Edge Function:"
echo "   supabase functions deploy processar-lembretes-manutencao --project-ref $PROJECT_REF"
echo ""
echo "2. Deploy Frontend:"
echo "   npm run build && vercel --prod"
echo ""
echo "3. Configure webhook in admin panel:"
echo "   https://[your-domain]/admin/webhooks/manutencao"
echo ""
echo "4. Monitor logs for the next 24 hours"
echo ""
echo -e "${GREEN}Deployment complete! 🚀${NC}"
