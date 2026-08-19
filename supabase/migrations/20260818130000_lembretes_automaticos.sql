-- Migration: Lembretes automáticos para dívidas e boletos
CREATE TABLE IF NOT EXISTS public.lembretes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  data DATE NOT NULL,
  hora TEXT NOT NULL DEFAULT '09:00',
  tipo TEXT NOT NULL DEFAULT 'vencimento_divida',
  origem_id UUID,
  origem_tabela TEXT DEFAULT 'dividas',
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'notificado', 'cancelado'
  notificar_navegador BOOLEAN NOT NULL DEFAULT true,
  notificar_telegram BOOLEAN NOT NULL DEFAULT true,
  notificar_whatsapp BOOLEAN NOT NULL DEFAULT true,
  notificado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_lembretes_user_id ON public.lembretes(user_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_data_status ON public.lembretes(data, status);
CREATE INDEX IF NOT EXISTS idx_lembretes_origem ON public.lembretes(origem_tabela, origem_id);

-- RLS
ALTER TABLE public.lembretes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lembretes' AND policyname = 'Usuários podem visualizar seus próprios lembretes') THEN
    CREATE POLICY "Usuários podem visualizar seus próprios lembretes"
      ON public.lembretes FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lembretes' AND policyname = 'Usuários podem inserir seus próprios lembretes') THEN
    CREATE POLICY "Usuários podem inserir seus próprios lembretes"
      ON public.lembretes FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lembretes' AND policyname = 'Usuários podem atualizar seus próprios lembretes') THEN
    CREATE POLICY "Usuários podem atualizar seus próprios lembretes"
      ON public.lembretes FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lembretes' AND policyname = 'Usuários podem deletar seus próprios lembretes') THEN
    CREATE POLICY "Usuários podem deletar seus próprios lembretes"
      ON public.lembretes FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lembretes' AND policyname = 'Service Role acesso total a lembretes') THEN
    CREATE POLICY "Service Role acesso total a lembretes"
      ON public.lembretes FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Função e Trigger para criar lembrete automático ao inserir dívida
CREATE OR REPLACE FUNCTION public.criar_lembrete_divida()
RETURNS TRIGGER AS $$
DECLARE
  v_valor_fmt TEXT;
BEGIN
  v_valor_fmt := TO_CHAR(COALESCE(NEW.valor_total, 0), 'FM999G999G990D00');

  INSERT INTO public.lembretes (
    user_id,
    titulo,
    descricao,
    data,
    hora,
    tipo,
    origem_id,
    origem_tabela,
    status,
    notificar_navegador,
    notificar_telegram,
    notificar_whatsapp,
    created_at
  ) VALUES (
    NEW.user_id,
    '🔔 Vencimento: ' || NEW.descricao,
    'O boleto/dívida de ' || COALESCE(NEW.credor, 'Credor') || ' no valor de R$ ' || v_valor_fmt || ' vence hoje.',
    NEW.data_vencimento,
    '09:00',
    'vencimento_divida',
    NEW.id,
    'dividas',
    'pendente',
    true,
    true,
    true,
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_lembrete_divida ON public.dividas;

CREATE TRIGGER trigger_lembrete_divida
AFTER INSERT ON public.dividas
FOR EACH ROW
EXECUTE FUNCTION public.criar_lembrete_divida();
