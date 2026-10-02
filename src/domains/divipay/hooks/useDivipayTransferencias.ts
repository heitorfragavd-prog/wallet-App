import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { CreateWithdrawParams, DivipayTransacao } from "@/domains/divipay/types";

export const DIVIPAY_TRANSFERENCIAS_QUERY_KEY = ["divipay-transferencias"] as const;

async function fetchTransferencias(workspaceId?: string | null): Promise<DivipayTransacao[]> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Usuário não autenticado");
  if (!workspaceId) return [];

  // Busca do banco local (saques criados pelo próprio Wallet filtrados por workspace)
  const { data: localData } = await supabase
    .from("divipay_transacoes")
    .select("*")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("type", "CASH_OUT")
    .order("created_at", { ascending: false });

  // Busca saques/pagamentos da API Divipay com workspace_id
  try {
    const allWithdraws: import("@/domains/divipay/types").DivipaySaque[] = [];
    const PAGE = 100;
    const MAX_PAGES = 50;
    const seenIds = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const { items } = await divipayService.listWithdraws({ limit: PAGE, offset: page * PAGE }, workspaceId);
      const fresh = items.filter((w) => w.id && !seenIds.has(w.id));
      fresh.forEach((w) => seenIds.add(w.id));
      allWithdraws.push(...fresh);
      if (items.length < PAGE) break;
      if (fresh.length === 0) break;
    }

    if (allWithdraws.length > 0) {
      const apiAsTransacoes: DivipayTransacao[] = allWithdraws.map((w) => ({
        id: `api-${w.id}`,
        user_id: userId,
        workspace_id: workspaceId,
        external_id: w.id,
        type: "CASH_OUT",
        status: String(w.status || "").toUpperCase(),
        amount: Number(w.amount || 0),
        fee: Number(w.tax || 0),
        description: w.description || (w.type === "BILLET" ? "Pagamento de boleto" : "Saque Pix"),
        recipient_key: w.document || null,
        created_at: w.createdAt || new Date().toISOString(),
        updated_at: w.createdAt || new Date().toISOString(),
        pix_copy_paste: null,
        pix_qr_code: null,
        metadata: {
          payerName: w.name,
          document: w.document,
          tax: w.tax,
          lote: w.lote,
          paymentType: w.type,
        },
      }));

      // Combina os resultados sem duplicatas
      const existingIds = new Set((localData ?? []).map((t) => t.external_id || t.id));
      const newFromApi = apiAsTransacoes.filter((t) => !existingIds.has(t.external_id ?? t.id));
      return [...(localData ?? []), ...newFromApi].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
  } catch (err) {
    logger.error("useDivipayTransferencias", "Erro ao buscar saques da API Divipay", { error: String(err) });
  }

  return localData ?? [];
}

export function useDivipayTransferencias() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  const { data: transferencias = [], isLoading: loading } = useQuery({
    queryKey: [...DIVIPAY_TRANSFERENCIAS_QUERY_KEY, workspaceId],
    queryFn: () => fetchTransferencias(workspaceId),
    enabled: !!workspaceId,
    staleTime: 1000 * 60,
  });

  const validateKey = useMutation({
    mutationFn: async (key: string) => {
      logger.info("useDivipayTransferencias", "Validando chave Pix", { workspaceId });
      return divipayService.validatePixKey(key, workspaceId);
    },
    onError: (error: Error) => {
      logger.error("useDivipayTransferencias", "Erro ao validar chave Pix", { error: error.message });
    },
  });

  const createTransferencia = useMutation({
    mutationFn: async (params: CreateWithdrawParams) => {
      const { transacao } = await divipayService.createWithdraw(params, workspaceId);
      return transacao;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: DIVIPAY_TRANSFERENCIAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["divipay-dashboard"] });
      const msg = variables.type === "BILLET" ? "Pagamento de boleto agendado/criado." : "Saque Pix criado com sucesso.";
      toast({ title: "Transferência criada", description: msg });
    },
    onError: (error: Error) => {
      logger.error("useDivipayTransferencias", "Erro ao criar transferência", { error: error.message });
      toast({
        title: "Erro ao criar transferência",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    transferencias,
    loading,
    validateKey: (key: string) => validateKey.mutateAsync(key),
    validatedKey: validateKey.data ?? null,
    isValidatingKey: validateKey.isPending,
    createTransferencia: (params: CreateWithdrawParams) => createTransferencia.mutateAsync(params),
    isCreating: createTransferencia.isPending,
    resetValidation: () => validateKey.reset(),
    refetch: () => qc.invalidateQueries({ queryKey: DIVIPAY_TRANSFERENCIAS_QUERY_KEY }),
  };
}
