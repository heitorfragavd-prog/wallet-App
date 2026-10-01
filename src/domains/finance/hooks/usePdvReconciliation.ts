import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/shared/hooks/use-toast";
import { CONTAS_QUERY_KEY } from "@/domains/finance/hooks/useContasUsuario";
import {
  PdvConciliacao,
  ReconcilePdvTransactionParams,
  ReconcilePdvTransactionResult,
} from "@/types/pdv-reconciliation";

export const PDV_CONCILIACOES_QUERY_KEY = ["pdv_conciliacoes"] as const;

export function usePdvReconciliation() {
  const { activeWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const currentWorkspaceId = activeWorkspace?.id || null;

  // Consulta lista de conciliações do PDV no workspace ativo
  const {
    data: conciliacoes = [],
    isLoading: loading,
    refetch,
  } = useQuery<PdvConciliacao[]>({
    queryKey: [...PDV_CONCILIACOES_QUERY_KEY, currentWorkspaceId],
    queryFn: async () => {
      if (!currentWorkspaceId) return [];

      const { data, error } = await supabase
        .from("pdv_conciliacoes" as any)
        .select("*")
        .eq("workspace_id", currentWorkspaceId)
        .order("occurred_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as PdvConciliacao[];
    },
    enabled: !!currentWorkspaceId,
  });

  // Mutação para conciliar transação via RPC reconcile_pdv_transaction
  const reconcileMutation = useMutation({
    mutationFn: async (params: ReconcilePdvTransactionParams): Promise<ReconcilePdvTransactionResult> => {
      if (!currentWorkspaceId) {
        throw new Error("Nenhum workspace ativo selecionado.");
      }

      const { data, error } = await supabase.rpc("reconcile_pdv_transaction" as any, {
        p_external_id: params.p_external_id,
        p_wallet_id: params.p_wallet_id,
        p_gross_amount_cents: params.p_gross_amount_cents,
        p_fee_cents: params.p_fee_cents,
        p_net_amount_cents: params.p_net_amount_cents,
        p_occurred_at: params.p_occurred_at,
        p_payment_method: params.p_payment_method,
        p_metadata: params.p_metadata || {},
      });

      if (error) {
        throw error;
      }

      return data as unknown as ReconcilePdvTransactionResult;
    },
    onSuccess: (result) => {
      // Invalidação atômica e coordenada de cache
      queryClient.invalidateQueries({ queryKey: PDV_CONCILIACOES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: CONTAS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["contas-cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["receitas"] });
      queryClient.invalidateQueries({ queryKey: ["eyemobile-dashboard"] });

      if (result.status === "already_reconciled") {
        toast({
          title: "Transação já conciliada",
          description: `A transação ${result.external_id} já havia sido conciliada anteriormente.`,
        });
      } else {
        toast({
          title: "Conciliação realizada com sucesso!",
          description: `Transação ${result.external_id} conciliada e creditada na carteira.`,
        });
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Erro ao conciliar transação",
        description: msg,
        variant: "destructive",
      });
    },
  });

  return {
    conciliacoes,
    loading,
    refetch,
    reconcileTransaction: reconcileMutation.mutateAsync,
    isReconciling: reconcileMutation.isPending,
  };
}
