-- ═══════════════════════════════════════════════════════════════
-- Migração: Faturas de Cartão de Crédito por Período de Fechamento
-- (03/Ago/2026)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS faturas_cartao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  cartao_id uuid REFERENCES contas_usuario(id) ON DELETE CASCADE NOT NULL,
  
  -- Identificação da fatura
  mes_fatura integer NOT NULL CHECK (mes_fatura BETWEEN 1 AND 12),
  ano_fatura integer NOT NULL,
  
  -- Período da fatura
  data_inicio date NOT NULL,      -- início do período (ex: 22/06)
  data_fechamento date NOT NULL,  -- dia do fechamento (ex: 22/07)
  data_vencimento date NOT NULL,  -- dia do vencimento (ex: 21/08)
  
  -- Valores
  valor_total numeric(10,2) NOT NULL DEFAULT 0,
  valor_pago numeric(10,2) NOT NULL DEFAULT 0,
  
  -- Status
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga', 'atrasada')),
  
  -- Link para a dívida criada (opcional)
  divida_id uuid REFERENCES dividas(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(cartao_id, mes_fatura, ano_fatura)
);

CREATE INDEX IF NOT EXISTS idx_faturas_cartao_user ON faturas_cartao(user_id);
CREATE INDEX IF NOT EXISTS idx_faturas_cartao_cartao ON faturas_cartao(cartao_id);
CREATE INDEX IF NOT EXISTS idx_faturas_cartao_status ON faturas_cartao(status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_faturas_cartao_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS trg_update_faturas_cartao_updated_at ON faturas_cartao;
CREATE TRIGGER trg_update_faturas_cartao_updated_at
BEFORE UPDATE ON faturas_cartao
FOR EACH ROW EXECUTE FUNCTION update_faturas_cartao_updated_at();

-- RLS
ALTER TABLE faturas_cartao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own faturas_cartao" ON faturas_cartao;
CREATE POLICY "Users can manage their own faturas_cartao"
  ON faturas_cartao FOR ALL USING (auth.uid() = user_id);

-- Adicionar campo fatura_id na tabela despesas para vincular compra à fatura
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS fatura_id uuid REFERENCES faturas_cartao(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_despesas_fatura ON despesas(fatura_id);
