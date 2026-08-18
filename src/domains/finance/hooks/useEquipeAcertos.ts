import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

export type AcertoStatus =
  | 'rascunho'
  | 'pendente'
  | 'processando'
  | 'pago'
  | 'falhou'
  | 'cancelado'
  | 'ajustado';

export type NaturezaAcerto = 'transporte' | 'meta' | 'diaria' | 'salario' | 'pro_labore' | 'ajuste';

export type AcertoItemInput = {
  natureza: NaturezaAcerto;
  descricao: string;
  valor: number;
  escala_id?: string | null;
  categoria_id?: string | null;
};

export type EquipeAcertoItem = AcertoItemInput & {
  id: string;
  acerto_id: string;
  workspace_id: string;
  created_at: string;
};

export type EquipePagamento = {
  id: string;
  acerto_id: string;
  workspace_id: string;
  status: 'pendente' | 'processando' | 'pago' | 'falhou' | 'cancelado';
  origem: 'wallet_divipay' | 'divipay_externo' | 'manual';
  valor: number;
  taxa: number;
  idempotency_key: string;
  divipay_external_id: string | null;
  comprovante_url: string | null;
  erro_codigo: string | null;
  created_at: string;
  paid_at: string | null;
};

export type EquipeAcerto = {
  id: string;
  workspace_id: string;
  colaborador_id: string;
  tipo: 'semanal_funcionario' | 'semanal_folguista' | 'salario' | 'pro_labore';
  periodo_inicio: string;
  periodo_fim: string;
  vencimento: string;
  status: AcertoStatus;
  valor_total: number;
  pix_chave_snapshot: string | null;
  despesa_id: string | null;
  created_at: string;
  updated_at: string;
  colaborador_acerto_itens: EquipeAcertoItem[];
  colaborador_pagamentos: EquipePagamento[];
};

export type GerarAcertoInput = {
  colaboradorId: string;
  periodoInicio: string;
  periodoFim: string;
  itens: AcertoItemInput[];
};

type ConfirmarPagamentoInput = {
  acertoId: string;
  divipayExternalId: string;
  pagamentoId: string | null;
  origem: EquipePagamento['origem'];
  valor: number;
  taxa: number;
  comprovanteUrl?: string | null;
};

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as T;
}

export function useEquipeAcertos(colaboradorId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['equipe-acertos', colaboradorId],
    queryFn: async () => {
      if (!colaboradorId) return [];
      const { data, error } = await supabase
        .from('colaborador_acertos' as never)
        .select('*, colaborador_acerto_itens(*), colaborador_pagamentos(*)')
        .eq('colaborador_id', colaboradorId)
        .order('periodo_inicio', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EquipeAcerto[];
    },
    enabled: Boolean(colaboradorId),
  });

  const invalidateEquipe = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['equipe-acertos'] }),
      queryClient.invalidateQueries({ queryKey: ['equipe-resumo'] }),
      queryClient.invalidateQueries({ queryKey: ['colaborador_escalas'] }),
      queryClient.invalidateQueries({ queryKey: ['despesas'] }),
      queryClient.invalidateQueries({ queryKey: ['relatorios'] }),
    ]);
  };

  const gerarAcerto = useMutation({
    mutationFn: (input: GerarAcertoInput) => callRpc<string>('gerar_acerto_semanal', {
      p_colaborador_id: input.colaboradorId,
      p_periodo_inicio: input.periodoInicio,
      p_periodo_fim: input.periodoFim,
      p_itens: input.itens,
    }),
    onSuccess: invalidateEquipe,
  });

  const iniciarPagamento = useMutation({
    mutationFn: (input: { acertoId: string; origem: 'wallet_divipay' | 'manual' }) =>
      callRpc<{ pagamento_id: string; idempotency_key: string; status: string }>(
        'iniciar_pagamento_acerto',
        { p_acerto_id: input.acertoId, p_origem: input.origem },
      ),
    onSuccess: invalidateEquipe,
  });

  const confirmarPagamento = useMutation({
    mutationFn: (input: ConfirmarPagamentoInput) => callRpc<string>('confirmar_pagamento_acerto', {
      p_acerto_id: input.acertoId,
      p_divipay_external_id: input.divipayExternalId,
      p_pagamento_id: input.pagamentoId,
      p_origem: input.origem,
      p_valor: input.valor,
      p_taxa: input.taxa,
      p_comprovante_url: input.comprovanteUrl ?? null,
    }),
    onSuccess: invalidateEquipe,
  });

  const registrarFalha = useMutation({
    mutationFn: (input: { pagamentoId: string; erroCodigo: string }) =>
      callRpc<string>('registrar_falha_pagamento', {
        p_pagamento_id: input.pagamentoId,
        p_erro_codigo: input.erroCodigo,
      }),
    onSuccess: invalidateEquipe,
  });

  const cancelarEscala = useMutation({
    mutationFn: (input: { escalaId: string; motivo: string }) =>
      callRpc<string | null>('cancelar_escala_e_recalcular_acerto', {
        p_escala_id: input.escalaId,
        p_motivo: input.motivo,
      }),
    onSuccess: invalidateEquipe,
  });

  return {
    ...query,
    gerarAcerto,
    iniciarPagamento,
    confirmarPagamento,
    registrarFalha,
    cancelarEscala,
  };
}

