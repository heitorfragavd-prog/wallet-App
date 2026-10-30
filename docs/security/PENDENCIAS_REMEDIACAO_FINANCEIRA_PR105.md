# PENDÊNCIA DE SEGURANÇA & AUDITORIA FINANCEIRA (PR #105)

**Data de Registro:** 2026-10-30  
**Status:** PENDENTE DE AUTORIZAÇÃO / REVISÃO DE ESQUEMA  
**Ambiente:** Supabase Produção (`hdeguzxkdvebdrrutbnx`)  
**Diretiva:** NÃO executar mutações SQL (`UPDATE`/`DELETE`), NÃO modificar dívidas reais e NÃO realizar deploy em produção sem autorização explícita do usuário.

---

## 1. Contexto & Diagnóstico

Durante a auditoria pós-PR #104 e PR #105, foi identificada a necessidade de remediação dos seguintes registros em `public.dividas`:
1. **Caso SPAL:** Dívida `e77f4319-4b61-4a49-994a-cb663f29a21d` (atualmente com valor indevido de R$ 27.644,10 e vencimento 2039-05-10 gerados pela falha de OCR na v150).
2. **Caso Xodó Foods:** Dívida `d72d40c1-39fc-42d0-9f44-c190b925bb50` (com código de barras bruto de 48 caracteres em vez do código de barras canônico de 44 dígitos).

Entretanto, a revisão técnica dos scripts de remediação propostos identificou inconsistências críticas que impediriam a execução segura:

### Inconsistência 1: Esquema Real de `public.wallet_ai_audit_events`
Os scripts tentavam inserir nas colunas `event_type` e `payload`:
```sql
INSERT INTO public.wallet_ai_audit_events (workspace_id, event_type, payload) ...
```
No esquema real definido na migration `20260818010000_wallet_ai_phase1_security.sql`, a tabela possui a seguinte assinatura estrita:
```sql
CREATE TABLE public.wallet_ai_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  tool_name TEXT NOT NULL,
  execution_status TEXT NOT NULL CHECK (execution_status IN ('success', 'error')),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
**Impacto:** Tentativa de inserção com `event_type` e `payload` falharia com erro de coluna inexistente no PostgreSQL.

### Inconsistência 2: Integridade de Campos em `public.dividas` para o Caso SPAL
A correção da SPAL precisa contemplar de forma atômica e coordenada:
- `credor`: 'SPAL INDÚSTRIA BRASILEIRA DE BEBIDAS S/A' (ou razão social normalizada)
- `descricao`: 'Boleto SPAL INDÚSTRIA BRASILEIRA DE BEBIDAS'
- `linha_digitavel`: '34191.09115 54446.822931 83045.790009 1 16190000207644' (47 dígitos)
- `codigo_barras`: '34191161900002076441091154446822938304579000' (44 dígitos canônicos)
- `data_vencimento`: '2026-11-03'::date
- `valor_total`: 2076.44
- `saldo`: 2076.44 (o saldo deve refletir o novo valor nominal quando não houver pagamentos parciais)
- `observacao`: histórico de auditoria rastreável

---

## 2. Recomendações e Pré-requisitos para Execução Futura

1. Criar migration de auditoria ou utilizar tabela de auditoria operacional dedicada (ou mapear para as colunas existentes `tool_name = 'manual_remediation_pr105'`, `execution_status = 'success'`, `error_code = NULL`).
2. Validar se o workspace da dívida possui `user_id` de serviço ou administrador para a chave estrangeira obrigatória `user_id REFERENCES auth.users(id)`.
3. Executar exclusivamente em janela de manutenção autorizada pelo proprietário.
4. Manter o isolamento: nenhum script deve ser executado automaticamente pelo pipeline de CI/CD.
