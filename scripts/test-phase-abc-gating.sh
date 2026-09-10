#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# scripts/test-phase-abc-gating.sh
# Teste de Gating da Fase C e Procedimento Oficial com psql CLI
# =============================================================================

DB_URL="${DATABASE_URL:-postgresql://postgres:postgrespassword@localhost:5432/postgres}"

echo "================================================================"
echo "1. PREPARANDO SCHEMA E APLICANDO FASE A"
echo "================================================================"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260908120000_security_phase_a_infrastructure.sql

echo "================================================================"
echo "2. TESTE NEGATIVO: EXECUTANDO MIGRATION REAL DA FASE C SEM A FLAG"
echo "================================================================"
set +e
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260908120001_security_phase_c_enforcement.sql 2> /tmp/phase_c_neg.log
CLI_EXIT=$?
set -e

echo "Codigo de saida psql observado: $CLI_EXIT"
if [ $CLI_EXIT -eq 0 ]; then
  echo "ERRO: A migration real C deveria ter abortado com erro!"
  exit 1
fi

cat /tmp/phase_c_neg.log
if ! grep -q "OPERACAO BLOQUEADA" /tmp/phase_c_neg.log; then
  echo "ERRO: Mensagem 'OPERACAO BLOQUEADA' nao encontrada na saida!"
  exit 1
fi
echo "✅ Teste negativo passou: migration real abortada com OPERACAO BLOQUEADA e exit code $CLI_EXIT"

echo "================================================================"
echo "3. TESTE DO PROCEDIMENTO OFICIAL ATOMICO E ISOLAMENTO DE FLAG"
echo "================================================================"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/test-phase-abc-gating.sql

echo "================================================================"
echo "✅ BATERIA DE GATING CONCLUIDA COM SUCESSO"
echo "================================================================"
