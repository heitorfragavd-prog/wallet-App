-- =========================================================================
-- Wallet App Investments Module Migration
-- =========================================================================

-- 1. public.investimentos (ativos/carteira)
CREATE TABLE IF NOT EXISTS public.investimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('renda_fixa','renda_variavel','fundo','cripto','poupanca','outro')),
  instituicao text,
  valor_investido numeric(15,2) NOT NULL DEFAULT 0,
  valor_atual numeric(15,2) NOT NULL DEFAULT 0,
  taxa_rendimento_anual numeric(8,4) NOT NULL DEFAULT 0,
  taxa_referencia text,
  data_inicio date NOT NULL,
  data_vencimento date,
  ativo boolean DEFAULT true,
  meta_id uuid,
  codigo_b3 text, -- ex: PETR4, MXRF11, BTC
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investimentos_user ON public.investimentos(user_id);
CREATE INDEX IF NOT EXISTS idx_investimentos_workspace ON public.investimentos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_investimentos_tipo ON public.investimentos(tipo);

-- 2. public.depositos_investimentos (aportes/compras)
CREATE TABLE IF NOT EXISTS public.depositos_investimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  investimento_id uuid REFERENCES public.investimentos(id) ON DELETE CASCADE NOT NULL,
  valor numeric(15,2) NOT NULL,
  quantidade numeric(15,6) DEFAULT 1,
  preco_unitario numeric(15,6),
  data date NOT NULL,
  comprovante_url text,
  observacoes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depositos_investimentos_user ON public.depositos_investimentos(user_id);
CREATE INDEX IF NOT EXISTS idx_depositos_investimentos_workspace ON public.depositos_investimentos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_depositos_investimentos_ativo ON public.depositos_investimentos(investimento_id);

-- 3. public.metas_investimento (objetivos)
CREATE TABLE IF NOT EXISTS public.metas_investimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  valor_meta numeric(15,2) NOT NULL,
  valor_atual numeric(15,2) NOT NULL DEFAULT 0,
  data_objetivo date,
  tipo text NOT NULL DEFAULT 'outro' CHECK (tipo IN ('reserva_emergencia','aposentadoria','compra','viagem','educacao','outro')),
  imagem_url text,
  alocacao_fixa numeric(5,2) DEFAULT 60,
  alocacao_variavel numeric(5,2) DEFAULT 40,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metas_investimento_user ON public.metas_investimento(user_id);
CREATE INDEX IF NOT EXISTS idx_metas_investimento_workspace ON public.metas_investimento(workspace_id);

-- 4. public.senha_investimentos (proteção)
CREATE TABLE IF NOT EXISTS public.senha_investimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  tentativas_falhas integer DEFAULT 0,
  bloqueado_ate timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. public.historico_rendimentos
CREATE TABLE IF NOT EXISTS public.historico_rendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  investimento_id uuid REFERENCES public.investimentos(id) ON DELETE CASCADE NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano integer NOT NULL,
  valor_inicial numeric(15,2) NOT NULL,
  valor_final numeric(15,2) NOT NULL,
  rendimento_mes numeric(15,2) NOT NULL,
  UNIQUE(investimento_id, mes, ano)
);

CREATE INDEX IF NOT EXISTS idx_historico_rendimentos_user ON public.historico_rendimentos(user_id);
CREATE INDEX IF NOT EXISTS idx_historico_rendimentos_ativo ON public.historico_rendimentos(investimento_id);

-- 6. public.proventos_esperados (dividendos/FIIs)
CREATE TABLE IF NOT EXISTS public.proventos_esperados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  investimento_id uuid REFERENCES public.investimentos(id) ON DELETE CASCADE NOT NULL,
  data_pagamento date NOT NULL,
  valor_estimado numeric(15,2) NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('dividendo','jcp','rendimento_fii','outro')),
  status text DEFAULT 'previsto' CHECK (status IN ('previsto','recebido','cancelado')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proventos_esperados_user ON public.proventos_esperados(user_id);
CREATE INDEX IF NOT EXISTS idx_proventos_esperados_ativo ON public.proventos_esperados(investimento_id);

-- 7. public.configuracoes_investimentos
CREATE TABLE IF NOT EXISTS public.configuracoes_investimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  mostrar_liquido_ir boolean DEFAULT false,
  mostrar_real_ipca boolean DEFAULT false,
  taxa_ipca_anual numeric(6,2) DEFAULT 4.5,
  alerta_desbalanceamento numeric(5,2) DEFAULT 10.0,
  created_at timestamptz DEFAULT now()
);

-- 8. public.cotacoes_diarias (cache de cotacoes B3/Cripto)
CREATE TABLE IF NOT EXISTS public.cotacoes_diarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('acao','fii','cripto')),
  preco numeric(15,6) NOT NULL,
  data date NOT NULL,
  fonte text DEFAULT 'brapi',
  created_at timestamptz DEFAULT now(),
  UNIQUE(codigo, data)
);

CREATE INDEX IF NOT EXISTS idx_cotacoes_codigo_data ON public.cotacoes_diarias(codigo, data);

-- Enable Row Level Security
ALTER TABLE public.investimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depositos_investimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas_investimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.senha_investimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_rendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proventos_esperados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_investimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacoes_diarias ENABLE ROW LEVEL SECURITY;

-- Drop Policies if Exist
DROP POLICY IF EXISTS "Users manage own investimentos" ON public.investimentos;
DROP POLICY IF EXISTS "Users manage own depositos" ON public.depositos_investimentos;
DROP POLICY IF EXISTS "Users manage own metas_investimento" ON public.metas_investimento;
DROP POLICY IF EXISTS "Users manage own senha_investimentos" ON public.senha_investimentos;
DROP POLICY IF EXISTS "Users manage own historico" ON public.historico_rendimentos;
DROP POLICY IF EXISTS "Users manage own proventos" ON public.proventos_esperados;
DROP POLICY IF EXISTS "Users manage own configuracoes_investimentos" ON public.configuracoes_investimentos;
DROP POLICY IF EXISTS "Allow read to authenticated for cotacoes" ON public.cotacoes_diarias;
DROP POLICY IF EXISTS "Allow all to service role for cotacoes" ON public.cotacoes_diarias;

-- RLS Policies
CREATE POLICY "Users manage own investimentos" ON public.investimentos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own depositos" ON public.depositos_investimentos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own metas_investimento" ON public.metas_investimento FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own senha_investimentos" ON public.senha_investimentos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own historico" ON public.historico_rendimentos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own proventos" ON public.proventos_esperados FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own configuracoes_investimentos" ON public.configuracoes_investimentos FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Allow read to authenticated for cotacoes" ON public.cotacoes_diarias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow all to service role for cotacoes" ON public.cotacoes_diarias FOR ALL TO service_role USING (true);

-- Trigger updated_at logic for investimentos
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_investimentos_updated_at ON public.investimentos;
CREATE TRIGGER update_investimentos_updated_at
BEFORE UPDATE ON public.investimentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- Storage configuration for comprovantes-investimentos
-- =========================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprovantes-investimentos',
  'comprovantes-investimentos',
  false,
  5242880, -- 5MB in bytes
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can view own investment proofs" ON storage.objects;
CREATE POLICY "Users can view own investment proofs"
ON storage.objects FOR SELECT USING (
  bucket_id = 'comprovantes-investimentos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can upload own investment proofs" ON storage.objects;
CREATE POLICY "Users can upload own investment proofs"
ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'comprovantes-investimentos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete own investment proofs" ON storage.objects;
CREATE POLICY "Users can delete own investment proofs"
ON storage.objects FOR DELETE USING (
  bucket_id = 'comprovantes-investimentos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
