DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transacoes' AND column_name = 'mes_referencia') THEN
    ALTER TABLE public.transacoes ADD COLUMN mes_referencia TEXT;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contas_usuario' AND column_name = 'data_fechamento') THEN
    ALTER TABLE public.contas_usuario ADD COLUMN data_fechamento DATE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contas_usuario' AND column_name = 'data_vencimento') THEN
    ALTER TABLE public.contas_usuario ADD COLUMN data_vencimento DATE;
  END IF;
END $$;
