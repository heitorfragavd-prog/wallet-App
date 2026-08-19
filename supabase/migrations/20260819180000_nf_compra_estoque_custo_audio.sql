-- Migration: Nota Fiscal de Compra + Estoque + Custo + Alerta de Aumento + Audio (2026-08-19)

-- 01. Tabela de Notas Fiscais de Compra
CREATE TABLE IF NOT EXISTS public.notas_fiscais_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  chat_id BIGINT,
  numero_nf TEXT,
  serie_nf TEXT,
  fornecedor TEXT,
  cnpj_fornecedor TEXT,
  data_emissao DATE,
  data_entrada DATE DEFAULT CURRENT_DATE,
  valor_total DECIMAL(12,2),
  valor_icms DECIMAL(12,2),
  valor_ipi DECIMAL(12,2),
  valor_frete DECIMAL(12,2),
  valor_produtos DECIMAL(12,2),
  chave_acesso TEXT,
  status TEXT DEFAULT 'pendente',
  imagem_base64 TEXT,
  origem TEXT DEFAULT 'foto',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 02. Tabela de Itens da NF
CREATE TABLE IF NOT EXISTS public.nf_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_id UUID REFERENCES notas_fiscais_compra(id) ON DELETE CASCADE,
  codigo_produto TEXT,
  descricao TEXT,
  ncm TEXT,
  cfop TEXT,
  unidade TEXT,
  quantidade DECIMAL(10,3),
  valor_unitario DECIMAL(12,4),
  valor_total DECIMAL(12,2),
  icms_aliquota DECIMAL(5,2),
  ipi_aliquota DECIMAL(5,2),
  pis_aliquota DECIMAL(5,2),
  cofins_aliquota DECIMAL(5,2),
  custo_unitario_liquido DECIMAL(12,4),
  produto_eyemobile_id TEXT,
  status_estoque TEXT DEFAULT 'pendente',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 03. Tabela de Historico de Custo
CREATE TABLE IF NOT EXISTS public.historico_custo_produto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  produto_codigo TEXT,
  produto_descricao TEXT,
  fornecedor TEXT,
  custo_unitario DECIMAL(12,4),
  quantidade DECIMAL(10,3),
  nf_id UUID REFERENCES notas_fiscais_compra(id) ON DELETE SET NULL,
  data_compra DATE,
  variacao_percentual DECIMAL(5,2),
  alerta_enviado BOOLEAN DEFAULT false,
  sugestao_preco_venda DECIMAL(12,2),
  markup_aplicado DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 04. Tabela de Produtos do Eyemobile (espelho local)
CREATE TABLE IF NOT EXISTS public.produtos_eyemobile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  eyemobile_id TEXT,
  codigo TEXT,
  descricao TEXT,
  categoria TEXT,
  preco_venda DECIMAL(12,2),
  custo_atual DECIMAL(12,4),
  estoque_atual DECIMAL(10,3),
  markup_padrao DECIMAL(5,2) DEFAULT 30.00,
  ultima_atualizacao_custo TIMESTAMPTZ,
  alerta_aumento_10pct BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unq_produtos_eyemobile_user_cod UNIQUE(user_id, codigo)
);

-- 05. Tabela de Transcricoes de Audio
CREATE TABLE IF NOT EXISTS public.audio_transcricoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id BIGINT,
  file_id TEXT,
  duracao_segundos INTEGER,
  transcricao TEXT,
  comando_detectado TEXT,
  sucesso BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 06. Indices
CREATE INDEX IF NOT EXISTS idx_nf_itens_nf ON public.nf_itens(nf_id);
CREATE INDEX IF NOT EXISTS idx_historico_custo_produto ON public.historico_custo_produto(user_id, workspace_id, produto_codigo, data_compra DESC);
CREATE INDEX IF NOT EXISTS idx_produtos_eyemobile_codigo ON public.produtos_eyemobile(user_id, workspace_id, codigo);
CREATE INDEX IF NOT EXISTS idx_nf_compra_user ON public.notas_fiscais_compra(user_id, status);
CREATE INDEX IF NOT EXISTS idx_nf_compra_chat ON public.notas_fiscais_compra(chat_id);
CREATE INDEX IF NOT EXISTS idx_audio_transcricoes_user ON public.audio_transcricoes(user_id, chat_id);

-- 07. RLS Policies
ALTER TABLE public.notas_fiscais_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nf_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_custo_produto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_eyemobile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_transcricoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nf_compra_all ON public.notas_fiscais_compra;
CREATE POLICY nf_compra_all ON public.notas_fiscais_compra FOR ALL USING (true);

DROP POLICY IF EXISTS nf_itens_all ON public.nf_itens;
CREATE POLICY nf_itens_all ON public.nf_itens FOR ALL USING (true);

DROP POLICY IF EXISTS historico_custo_all ON public.historico_custo_produto;
CREATE POLICY historico_custo_all ON public.historico_custo_produto FOR ALL USING (true);

DROP POLICY IF EXISTS produtos_eyemobile_all ON public.produtos_eyemobile;
CREATE POLICY produtos_eyemobile_all ON public.produtos_eyemobile FOR ALL USING (true);

DROP POLICY IF EXISTS audio_transcricoes_all ON public.audio_transcricoes;
CREATE POLICY audio_transcricoes_all ON public.audio_transcricoes FOR ALL USING (true);
