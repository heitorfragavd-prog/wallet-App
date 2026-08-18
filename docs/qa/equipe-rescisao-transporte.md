# Relatório de QA: Equipe — Custos MEI, Simulador de Rescisão e Transporte

**Data:** 17 de agosto de 2026  
**Status:** APROVADO  
**Suíte de Testes:** 15 arquivos / 51 testes PASS  

---

## 1. Escopo das Entregas Validadas

1. **Configuração Trabalhista por Workspace**:
   - Campos `regime_encargos`, `piso_categoria`, `piso_vigencia_inicio`, `convencao_mte` e `convencao_fonte_url` na tabela `workspaces`.
   - Migration `20260817140000_equipe_configuracao_trabalhista.sql` e verificação no teste SQL `supabase/tests/equipe_centro_rh_financeiro.sql`.

2. **Cálculo de Custos MEI vs Geral & Estado Contratual**:
   - Alíquota patronal do INSS configurada em 3% para workspaces no regime MEI e 20% para o regime geral.
   - Resolução determinística do estado do contrato de experiência via `resolverEstadoContrato`: contratos expirados resolvem para `indeterminado` (Prazo indeterminado), sem exibir "faltam 0 dias".

3. **Motor Puro de Estimativas de Rescisão**:
   - `equipeRescisao.ts` cobrindo cenários: Sem justa causa (multa 40% FGTS, aviso indenizado), Acordo (multa 20% FGTS, metade do aviso) e Pedido de demissão (sem multa, desconto de aviso).
   - Contagem de avos com pelo menos 15 dias computáveis por mês civil.
   - Prazo legal de quitação em 10 dias corridos (art. 477 § 6º CLT).
   - Estimativas com base em extrato confirmado ou saldo histórico provisionado.

4. **Detalhamento do Transporte no Acerto Semanal**:
   - Interface semanal com visualização explícita de Uber real, Passagens, Diferença de Uber e Metas.
   - Resumo expandido com tons de alerta mantendo os lançamentos contábeis limpos e auditáveis.

5. **Aba Financeiro do Perfil do Colaborador**:
   - Card `EmployeeCostBreakdown` com composição detalhada de custos e alerta informativo para salários abaixo do piso da CCT.
   - Simulador `TerminationSimulator` somente leitura, sem efeitos colaterais e sem botões de mutação.

---

## 2. Evidências de Testes Automatizados

### Suíte Vitest (Módulo Equipe)
```
 ✓ src/domains/finance/components/equipe/AcertoSemanalFolguista.test.tsx (1 test)
 ✓ src/domains/finance/components/equipe/AcertoSemanalFuncionario.test.tsx (2 tests)
 ✓ src/domains/finance/components/equipe/AcertoPaymentDialog.test.tsx (3 tests)
 ✓ src/domains/finance/components/equipe/TerminationSimulator.test.tsx (1 test)
 ✓ src/pages/Equipe.test.tsx (2 tests)
 ✓ src/pages/EquipeDetalhe.test.tsx (2 tests)
 ✓ src/domains/finance/components/equipe/EmployeeCostBreakdown.test.tsx (1 test)
 ✓ src/domains/finance/components/equipe/EquipeForm.test.tsx (3 tests)
 ✓ src/domains/finance/hooks/useEquipeAcertos.test.tsx (3 tests)
 ✓ src/domains/finance/services/equipeCalculations.test.ts (10 tests)
 ✓ src/domains/finance/services/equipeRescisao.test.ts (6 tests)
 ✓ src/domains/finance/services/equipePrivacy.test.ts (4 tests)
 ✓ src/domains/finance/services/equipeObrigacoes.test.ts (4 tests)
 ✓ src/domains/finance/services/equipeConciliacao.test.ts (8 tests)
 ✓ src/domains/finance/components/equipe/EquipeReport.test.ts (1 test)

 Test Files  15 passed (15)
      Tests  51 passed (51)
```

### TypeScript e Build
- `npx tsc --noEmit`: 0 erros.
- `npm run build`: Concluído com sucesso (exit code 0).

### Auditoria de Efeitos Colaterais & Segurança
- `rg -n "supabase|mutate|Divipay|createWithdraw|insert\(|update\(" src/domains/finance/components/equipe/TerminationSimulator.tsx`: 0 ocorrências.
- `rg -n "console\.(log|error).*?(pix|cpf|rg|banco|conta|salario)"`: Nenhuma informação sensível exposta em logs.
