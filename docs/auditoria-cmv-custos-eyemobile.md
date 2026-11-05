# Auditoria de Custos Reais de Atacado e Procedimento de Rollback — Eyemobile PDV

## 1. Contexto e Objetivo
Este documento registra a conciliação determinística de custos de atacado (SPAL Indústria Brasileira de Bebidas S/A e Brasnorte Distribuidora de Bebidas Ltda) para o catálogo do Eyemobile PDV da Rodo Point, estabelecendo a apuração de CMV Real e Rentabilidade Comercial.

## 2. Produtos Auditados com Custos Comprovados por Nota Fiscal

| Código | Descrição Eyemobile | Fornecedor Atacado | Data NF / Compra | Fator Embalagem | Custo Unitário (R$) | Preço Venda PDV (R$) | Margem Bruta (%) |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **2032231** | Skol 473 ML | Brasnorte Distribuidora | 2026-08-20 | Fardo c/ 12 | R$ 3,97 | R$ 10,00 | 60,3% |
| **2032242** | Coca ks | SPAL Bebidas (Coca-Cola) | 2026-08-21 | Caixa c/ 24 | R$ 1,70 | R$ 7,00 | 75,7% |
| **2032243** | CORONA | Brasnorte Distribuidora | 2026-08-20 | Caixa c/ 24 | R$ 6,77 | R$ 12,00 | 43,6% |
| **2032254** | ENERG.RED BULL 250ML | Brasnorte Distribuidora | 2026-08-20 | Pack c/ 6 | R$ 8,13 | R$ 14,90 | 45,5% |
| **2032350** | KAPO | SPAL Bebidas (Coca-Cola) | 2026-08-20 | Caixa c/ 12 | R$ 1,64 | R$ 4,50 | 63,6% |
| **2032362** | Monster Energy LT 473ml | SPAL Bebidas (Coca-Cola) | 2026-08-20 | Pack c/ 6 | R$ 7,21 | R$ 14,90 | 51,6% |
| **2032394** | REFRIGERANTE 350ML | SPAL Bebidas (Coca-Cola) | 2026-07-02 | Fardo c/ 12 | R$ 1,83 | R$ 7,00 | 73,9% |
| **2032410** | Suco Dell vale | SPAL Bebidas (Coca-Cola) | 2026-08-20 | Pack c/ 6 | R$ 2,86 | R$ 6,00 | 52,3% |
| **2032601** | Refrigerante 200ml | SPAL Bebidas (Coca-Cola) | 2026-08-21 | Fardo c/ 12 | R$ 1,34 | R$ 4,00 | 66,5% |
| **2033266** | Suco Dell vale laranja | SPAL Bebidas (Coca-Cola) | 2026-08-20 | Pack c/ 6 | R$ 2,86 | R$ 6,00 | 52,3% |
| **2044232** | Brahma | Brasnorte Distribuidora | 2026-08-20 | Fardo c/ 12 | R$ 4,31 | R$ 10,00 | 56,9% |

## 3. Segurança e Isolamento da Tabela de Backup

Para garantir rollback seguro e isolamento estrito:
1. A tabela `public.produtos_eyemobile_backup_costs_20261105` preserva o estado completo pré-gravação de todos os 178 produtos do workspace `2af415b6-76aa-4134-8133-a9b405671c1c`.
2. Todos os privilégios de `anon` e `authenticated` foram revogados (`REVOKE ALL`).
3. Row Level Security foi ativado e forçado (`FORCE ROW LEVEL SECURITY`).
4. Somente chamadas autenticadas internas com `service_role` ou superusuário de banco têm acesso.

## 4. Procedimento de Rollback Documentado

Caso seja necessário restaurar os custos de `produtos_eyemobile` ao estado anterior:

```sql
-- Rollback Seguro: Restaura custos originais da tabela de backup
UPDATE public.produtos_eyemobile p
SET 
  custo_atual = b.custo_atual,
  margem_real_percentual = b.margem_real_percentual,
  ultima_atualizacao_custo = b.ultima_atualizacao_custo
FROM public.produtos_eyemobile_backup_costs_20261105 b
WHERE p.id = b.id
  AND p.workspace_id = '2af415b6-76aa-4134-8133-a9b405671c1c';

-- Remoção opcional dos lançamentos de histórico gerados na data da auditoria
DELETE FROM public.historico_custo_produto
WHERE workspace_id = '2af415b6-76aa-4134-8133-a9b405671c1c'
  AND created_at >= '2026-11-05 04:00:00+00';
```

## 5. Padrão de Idempotência e Transacionalidade para Novas Gravações

Toda atualização futura de custos em lote deve seguir o padrão transacional:
1. `BEGIN;`
2. Verificação de existência em `public.historico_custo_produto` pelo quarteto `(workspace_id, produto_codigo, data_compra, fornecedor)`.
3. Atualização atômica em `produtos_eyemobile` e inserção em `historico_custo_produto`.
4. Validação do número de linhas afetadas; falha explícita (`ROLLBACK`) se qualquer divergência for detectada.
5. `COMMIT;`
