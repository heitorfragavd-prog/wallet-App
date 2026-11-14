-- Migration 99: Correção de Integridade Financeira e Segurança dos Fechamentos (Etapa 3D.1)
-- 1. Unicidade atômica para evitar duplicações em fechamentos_caixa
-- 2. Colunas de rastreabilidade para espelhamento e identidade pendente
-- 3. Hardening da RLS para estrito menor privilégio (bloqueia vazamento no grupo folguistas)

-- 1. Adicionar colunas de controle operacional e integridade
ALTER TABLE public.fechamentos_caixa
  ADD COLUMN IF NOT EXISTS identidade_pendente boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_espelhamento text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS erro_espelhamento text,
  ADD COLUMN IF NOT EXISTS tipo_conferencia text DEFAULT 'total';

-- 2. Garantir unicidade determinística da chave operacional por workspace
-- Impede duplicidades criadas por webhooks simultâneos ou fotos concorrentes
CREATE UNIQUE INDEX IF NOT EXISTS idx_fechamentos_caixa_chave_operacional_uniq 
  ON public.fechamentos_caixa (workspace_id, chave_operacional) 
  WHERE chave_operacional IS NOT NULL;

-- 3. RLS de Menor Privilégio em fechamentos_caixa
-- Remove brecha de visualização por membros comuns do grupo de origem (folguistas)
DROP POLICY IF EXISTS "fechamentos_caixa_select_authorized" ON public.fechamentos_caixa;
CREATE POLICY "fechamentos_caixa_select_authorized" ON public.fechamentos_caixa
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL AND (
      -- Apenas executivos/gestores do workspace
      is_workspace_executive(workspace_id, auth.uid()) OR
      -- Membros autorizados com acesso ao grupo oficial de fechamento
      EXISTS (
        SELECT 1 FROM public.telegram_grupos_config g
        WHERE g.workspace_id = fechamentos_caixa.workspace_id
          AND g.tipo_grupo = 'fechamento'
          AND g.ativo = true
          AND user_can_access_group(g.id, auth.uid())
      ) OR
      -- O próprio colaborador dono do fechamento (se possuir login no sistema)
      EXISTS (
        SELECT 1 FROM public.colaboradores c
        WHERE c.id = fechamentos_caixa.colaborador_id
          AND c.user_id = auth.uid()
      ) OR
      -- O criador do registro
      user_id = auth.uid()
    )
  );

COMMENT ON COLUMN public.fechamentos_caixa.identidade_pendente IS 'Indica que o fechamento foi recebido sem vínculo imutável de Telegram comprovado';
COMMENT ON COLUMN public.fechamentos_caixa.status_espelhamento IS 'Status do encaminhamento ao grupo oficial (pendente, sucesso, falha)';
COMMENT ON COLUMN public.fechamentos_caixa.tipo_conferencia IS 'Tipo de auditoria com o Eyemobile (total, parcial, sem_dados_eyemobile)';
