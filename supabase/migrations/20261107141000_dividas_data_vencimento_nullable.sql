-- Migration: Tornar data_vencimento nullable na tabela dividas
-- Motivo: Orçamentos comerciais e pedidos de compra autorizados podem ser registrados
-- antes da definição de prazo final de vencimento, sem que a obrigação seja considerada vencida.

ALTER TABLE public.dividas ALTER COLUMN data_vencimento DROP NOT NULL;

COMMENT ON COLUMN public.dividas.data_vencimento IS 'Data de vencimento da dívida. Pode ser NULL para pedidos/orçamentos sem prazo de vencimento pré-definido.';

-- Ajuste na trigger de criação de lembrete para não falhar com data_vencimento nula
CREATE OR REPLACE FUNCTION public.criar_lembrete_divida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_valor_fmt TEXT;
BEGIN
  -- Se não houver data de vencimento definida, não cria lembrete de vencimento
  IF NEW.data_vencimento IS NULL THEN
    RETURN NEW;
  END IF;

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
$function$;

-- Ajuste defensivo na trigger update_valor_restante para suporte a data_vencimento IS NULL
CREATE OR REPLACE FUNCTION public.update_valor_restante()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.valor_restante = NEW.valor_total - NEW.valor_pago;
  IF NEW.valor_restante <= 0 THEN
    NEW.status = 'quitada';
  ELSIF NEW.data_vencimento IS NOT NULL AND NEW.data_vencimento < CURRENT_DATE AND NEW.valor_restante > 0 THEN
    NEW.status = 'vencida';
  ELSE
    NEW.status = 'pendente';
  END IF;
  RETURN NEW;
END;
$function$;

