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
}

export function useDivipayConciliacoes(status = "pendente") {
  return useQuery({
    queryKey: [...DIVIPAY_CONCILIACOES_QUERY_KEY, status],
    queryFn: () => conciliacaoDivipayService.listar(status),
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
            resumo.conciliadasAuto > 0 ? `${resumo.conciliadasAuto} dívida(s) baixada(s)` : null,
            resumo.avulsas > 0 ? `${resumo.avulsas} despesa(s) avulsa(s)` : null,
            resumo.pendentes > 0 ? `${resumo.pendentes} aguardando confirmação` : null,
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
    importarAvulsa: (c: DivipayConciliacao) => importarAvulsa.mutateAsync(c),
    ignorar: (id: string) => ignorar.mutateAsync(id),
  };
}

/**
 * Roda o motor de conciliação automaticamente ao abrir o app
 * (uma vez por dia por sessão), para as despesas da carteira Divipay
 * aparecerem sem precisar abrir a tela de Saques.
 * Montar uma única vez no layout autenticado.
 */
export function useDivipayConciliacaoAuto() {
  const { transferencias, loading } = useDivipayTransferencias();
  const { conciliar } = useDivipayConciliacao();
  const { activeWorkspace } = useWorkspace();
  const disparou = useRef(false);

  useEffect(() => {
    if (disparou.current || loading || transferencias.length === 0) return;
    const chave = `divipay-conciliacao-auto:${new Date().toISOString().slice(0, 10)}`;
    if (sessionStorage.getItem(chave)) return;
    disparou.current = true;
    sessionStorage.setItem(chave, "1");
    conciliar(transferencias).catch(() => {
      // falha: libera para tentar de novo na próxima navegação
      sessionStorage.removeItem(chave);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferencias, loading, activeWorkspace?.id]);
}
