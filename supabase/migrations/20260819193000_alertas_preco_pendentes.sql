CREATE TABLE IF NOT EXISTS public.alertas_preco_pendentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  produto_eyemobile_id TEXT NOT NULL,
  produto_codigo TEXT,
  produto_descricao TEXT,
  custo_anterior DECIMAL(12,4),
  custo_novo DECIMAL(12,4),
  preco_venda_atual DECIMAL(12,2),
  preco_sugerido DECIMAL(12,2),
  preco_definido_usuario DECIMAL(12,2),
  margem_real_percentual DECIMAL(5,2),
  variacao_custo_percentual DECIMAL(5,2),
  nf_id UUID REFERENCES notas_fiscais_compra(id),
  status TEXT DEFAULT 'pendente',
  data_criacao TIMESTAMPTZ DEFAULT now(),
  data_resolucao TIMESTAMPTZ,
  lembretes_enviados INTEGER DEFAULT 0,
  ultimo_lembrete TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alertas_preco_user_status ON public.alertas_preco_pendentes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_alertas_preco_produto ON public.alertas_preco_pendentes(produto_eyemobile_id);

ALTER TABLE public.alertas_preco_pendentes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'alertas_preco_pendentes' AND policyname = 'alertas_preco_user_isolation'
  ) THEN
    CREATE POLICY alertas_preco_user_isolation ON public.alertas_preco_pendentes
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
