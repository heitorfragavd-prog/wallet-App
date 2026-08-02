-- ═══════════════════════════════════════════════════════════════
-- Features v3.1 — 7 funcionalidades (02/ago/2026)
-- Subcategorias, Transferências, Recibos, Conciliação, Centros de
-- Custo, Fornecedores/Clientes, Agenda Financeira
-- ═══════════════════════════════════════════════════════════════

-- 1. SUBCATEGORIAS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subcategorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  categoria_id uuid REFERENCES categorias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text DEFAULT '#3B82F6',
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE subcategorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own subcategorias" ON subcategorias
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_subcategorias_workspace ON subcategorias(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subcategorias_categoria ON subcategorias(categoria_id);

ALTER TABLE despesas ADD COLUMN IF NOT EXISTS subcategoria_id uuid REFERENCES subcategorias(id);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS subcategoria_id uuid REFERENCES subcategorias(id);

-- 2. TRANSFERÊNCIAS ENTRE CONTAS ────────────────────────────────
CREATE TABLE IF NOT EXISTS transferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  conta_origem_id uuid REFERENCES contas_usuario(id) ON DELETE CASCADE NOT NULL,
  conta_destino_id uuid REFERENCES contas_usuario(id) ON DELETE CASCADE NOT NULL,
  valor numeric(10,2) NOT NULL,
  data date NOT NULL,
  descricao text,
  observacoes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE transferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own transferencias" ON transferencias
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_workspace ON transferencias(workspace_id);

-- 5. CENTROS DE CUSTO ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS centros_custo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  responsavel text,
  orcamento_mensal numeric(10,2),
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE centros_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own centros_custo" ON centros_custo
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_centros_custo_workspace ON centros_custo(workspace_id);

ALTER TABLE despesas ADD COLUMN IF NOT EXISTS centro_custo_id uuid REFERENCES centros_custo(id);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS centro_custo_id uuid REFERENCES centros_custo(id);

-- 6. FORNECEDORES / CLIENTES (CRM BÁSICO) ───────────────────────
CREATE TABLE IF NOT EXISTS contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('fornecedor', 'cliente')),
  nome text NOT NULL,
  cnpj_cpf text,
  telefone text,
  email text,
  endereco text,
  contato_nome text,
  prazo_pagamento_dias integer DEFAULT 30,
  observacoes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own contatos" ON contatos
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_contatos_tipo ON contatos(tipo);
CREATE INDEX IF NOT EXISTS idx_contatos_workspace ON contatos(workspace_id);

ALTER TABLE despesas ADD COLUMN IF NOT EXISTS contato_id uuid REFERENCES contatos(id);
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS contato_id uuid REFERENCES contatos(id);

-- 4. CONCILIAÇÃO BANCÁRIA — flag de conciliado nos lançamentos ──
ALTER TABLE receitas ADD COLUMN IF NOT EXISTS conciliado boolean DEFAULT false;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS conciliado boolean DEFAULT false;
ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS conciliado boolean DEFAULT false;

-- Recarrega o cache do PostgREST para enxergar as novas tabelas/colunas
NOTIFY pgrst, 'reload schema';
