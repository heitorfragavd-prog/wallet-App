-- ═══════════════════════════════════════════════════════════════
-- Compromissos da Agenda (03/ago/2026)
-- Compromissos manuais com título, local, data, hora, repetição
-- e lembrete — exibidos no calendário da Agenda Financeira
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compromissos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  local text,
  data date NOT NULL,
  hora time,
  repetir text DEFAULT 'nunca', -- nunca | diario | semanal | mensal | anual
  lembrete boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE compromissos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own compromissos" ON compromissos
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_compromissos_workspace ON compromissos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_compromissos_data ON compromissos(data);
