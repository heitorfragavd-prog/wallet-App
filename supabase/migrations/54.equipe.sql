-- Tabela de colaboradores (funcionarios e socios)
CREATE TABLE IF NOT EXISTS public.colaboradores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    foto_url TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('funcionario', 'socio')),
    cargo TEXT,
    data_admissao DATE,
    data_demissao DATE,
    salario_bruto DECIMAL(12,2) DEFAULT 0,
    vale_transporte DECIMAL(12,2) DEFAULT 0,
    vale_refeicao DECIMAL(12,2) DEFAULT 0,
    outros_beneficios DECIMAL(12,2) DEFAULT 0,
    status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'ferias', 'afastado', 'experiencia', 'demitido')),
    dias_experiencia INTEGER DEFAULT 90,
    carga_horaria_semanal INTEGER DEFAULT 44,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de custos variaveis do colaborador
CREATE TABLE IF NOT EXISTS public.colaborador_custos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('salario', 'folguista', 'adiantamento', 'hora_extra', 'comissao', 'premio', 'vale', 'desconto', 'outro')),
    valor DECIMAL(12,2) NOT NULL,
    data DATE NOT NULL,
    descricao TEXT,
    lancado_na_despesa BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de presenca/ponto
CREATE TABLE IF NOT EXISTS public.colaborador_presencas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE NOT NULL,
    data DATE NOT NULL,
    presente BOOLEAN DEFAULT true,
    horas_trabalhadas DECIMAL(4,2),
    atraso_minutos INTEGER DEFAULT 0,
    justificativa TEXT,
    UNIQUE(colaborador_id, data)
);

-- RLS
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaborador_custos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaborador_presencas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios veem colaboradores do workspace" ON public.colaboradores;
CREATE POLICY "Usuarios veem colaboradores do workspace" ON public.colaboradores FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuarios gerenciam colaboradores do workspace" ON public.colaboradores;
CREATE POLICY "Usuarios gerenciam colaboradores do workspace" ON public.colaboradores FOR ALL
TO authenticated USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios veem custos do workspace" ON public.colaborador_custos;
CREATE POLICY "Usuarios veem custos do workspace" ON public.colaborador_custos FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuarios gerenciam custos do workspace" ON public.colaborador_custos;
CREATE POLICY "Usuarios gerenciam custos do workspace" ON public.colaborador_custos FOR ALL
TO authenticated USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios veem presencas do workspace" ON public.colaborador_presencas;
CREATE POLICY "Usuarios veem presencas do workspace" ON public.colaborador_presencas FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuarios gerenciam presencas do workspace" ON public.colaborador_presencas;
CREATE POLICY "Usuarios gerenciam presencas do workspace" ON public.colaborador_presencas FOR ALL
TO authenticated USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_colaboradores_workspace ON public.colaboradores(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_colaborador_custos_colaborador ON public.colaborador_custos(colaborador_id, data);
CREATE INDEX IF NOT EXISTS idx_colaborador_presencas_colaborador ON public.colaborador_presencas(colaborador_id, data);
