import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDivipayTransferencias } from "@/domains/divipay/hooks/useDivipayTransferencias";
import {
  conciliacaoDivipayService,
  type DivipayConciliacao,
} from "@/domains/divipay/services/ConciliacaoDivipayService";
import type { DivipayTransacao } from "@/domains/divipay/types";

export const DIVIPAY_CONCILIACOES_QUERY_KEY = ["divipay-conciliacoes"] as const;

function invalidarTudo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: DIVIPAY_CONCILIACOES_QUERY_KEY });
  qc.invalidateQueries({ queryKey: ["dividas"] });
  qc.invalidateQueries({ queryKey: ["despesas"] });
  qc.invalidateQueries({ queryKey: ["divipay-transferencias"] });
  qc.invalidateQueries({ queryKey: ["fornecedor-financeiro"] });
  qc.invalidateQueries({ queryKey: ["equipe-resumo"] });
  qc.invalidateQueries({ queryKey: ["colaboradores"] });
}

export function useDivipayConciliacoes(status = "pendente") {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  return useQuery({
    queryKey: [...DIVIPAY_CONCILIACOES_QUERY_KEY, status, workspaceId],
    queryFn: () => conciliacaoDivipayService.listar(status, workspaceId),
    enabled: !!workspaceId,
    staleTime: 1000 * 30,
  });
}

export function useDivipayConciliacao() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  const conciliar = useMutation({
    mutationFn: (transacoes: DivipayTransacao[]) =>
      conciliacaoDivipayService.conciliar(transacoes, workspaceId),
    onSuccess: (resumo) => {
      if (resumo.conciliadasAuto > 0 || resumo.avulsas > 0 || resumo.pendentes > 0) {
        invalidarTudo(qc);
        toast({
          title: "Conciliação Divipay concluída",
          description: [
            resumo.conciliadasAuto > 0 ? `${resumo.conciliadasAuto} pagamento(s) identificado(s)` : null,
            resumo.avulsas > 0 ? `${resumo.avulsas} despesa(s) avulsa(s)` : null,
            resumo.pendentes > 0 ? `${resumo.pendentes} aguardando revisão` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        });
      }
    },
    onError: (error: Error) => {
      logger.error("useDivipayConciliacao", "Erro na conciliação", { error: error.message });
    },
  });

  const confirmar = useMutation({
    mutationFn: ({ conciliacao, dividaId }: { conciliacao: DivipayConciliacao; dividaId: string }) =>
      conciliacaoDivipayService.confirmar(conciliacao, dividaId, workspaceId),
    onSuccess: (ok) => {
      if (ok) {
        invalidarTudo(qc);
        toast({ title: "Dívida baixada", description: "Pagamento conciliado com a dívida com sucesso." });
      } else {
        toast({ title: "Falha na conciliação", description: "Não foi possível dar baixa na dívida.", variant: "destructive" });
      }
    },
  });

  const vincularFornecedor = useMutation({
    mutationFn: ({
      conciliacao,
      contatoId,
      categoriaId,
    }: {
      conciliacao: DivipayConciliacao;
      contatoId: string;
      categoriaId?: string | null;
    }) => conciliacaoDivipayService.vincularFornecedor(conciliacao, contatoId, categoriaId, workspaceId),
    onSuccess: (ok) => {
      if (ok) {
        invalidarTudo(qc);
        toast({ title: "Fornecedor vinculado", description: "Pagamento associado à ficha do fornecedor com sucesso." });
      } else {
        toast({ title: "Falha ao vincular", description: "Não foi possível vincular o fornecedor.", variant: "destructive" });
      }
    },
  });

  const vincularColaborador = useMutation({
    mutationFn: ({
      conciliacao,
      colaboradorId,
      acertoId,
    }: {
      conciliacao: DivipayConciliacao;
      colaboradorId: string;
      acertoId?: string | null;
    }) => conciliacaoDivipayService.vincularColaborador(conciliacao, colaboradorId, acertoId, workspaceId),
    onSuccess: (ok) => {
      if (ok) {
        invalidarTudo(qc);
        toast({ title: "Colaborador vinculado", description: "Pagamento associado à ficha do colaborador com sucesso." });
      } else {
        toast({ title: "Falha ao vincular", description: "Não foi possível vincular o colaborador.", variant: "destructive" });
      }
    },
  });

  const importarAvulsa = useMutation({
    mutationFn: (conciliacao: DivipayConciliacao) =>
      conciliacaoDivipayService.importarAvulsa(conciliacao, workspaceId),
    onSuccess: () => {
      invalidarTudo(qc);
      toast({ title: "Despesa criada", description: "Saque importado como despesa avulsa." });
    },
  });

  const ignorar = useMutation({
    mutationFn: (conciliacaoId: string) => conciliacaoDivipayService.ignorar(conciliacaoId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DIVIPAY_CONCILIACOES_QUERY_KEY });
      toast({ title: "Saque ignorado", description: "Ele não será importado como despesa." });
    },
  });

  return {
    conciliar: (t: DivipayTransacao[]) => conciliar.mutateAsync(t),
    isConciliando: conciliar.isPending,
    confirmar: (conciliacao: DivipayConciliacao, dividaId: string) =>
      confirmar.mutateAsync({ conciliacao, dividaId }),
    isConfirmando: confirmar.isPending,
    vincularFornecedor: (params: { conciliacao: DivipayConciliacao; contatoId: string; categoriaId?: string | null }) =>
      vincularFornecedor.mutateAsync(params),
    isVinculandoFornecedor: vincularFornecedor.isPending,
    vincularColaborador: (params: { conciliacao: DivipayConciliacao; colaboradorId: string; acertoId?: string | null }) =>
      vincularColaborador.mutateAsync(params),
    isVinculandoColaborador: vincularColaborador.isPending,
    importarAvulsa: (c: DivipayConciliacao) => importarAvulsa.mutateAsync(c),
    ignorar: (id: string) => ignorar.mutateAsync(id),
  };
}

export function useDivipayConciliacaoAuto(enabled = true) {
  const { transferencias, loading } = useDivipayTransferencias({ enabled });
  const { conciliar } = useDivipayConciliacao();
  const { activeWorkspace } = useWorkspace();
  const disparou = useRef(false);

  useEffect(() => {
    if (!enabled || disparou.current || loading || transferencias.length === 0 || !activeWorkspace?.id) return;
    const chave = `divipay-conciliacao-auto:${activeWorkspace.id}:${new Date().toISOString().slice(0, 10)}`;
    if (sessionStorage.getItem(chave)) return;
    disparou.current = true;
    sessionStorage.setItem(chave, "1");
    conciliar(transferencias).catch((err) => {
      logger.error("useDivipayConciliacaoAuto", "Erro ao rodar conciliação automática", { error: String(err) });
    });
  }, [enabled, loading, transferencias, conciliar, activeWorkspace?.id]);
}
