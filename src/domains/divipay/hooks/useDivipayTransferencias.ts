import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import type { CreateWithdrawParams, DivipayTransacao } from "@/domains/divipay/types";

export const DIVIPAY_TRANSFERENCIAS_QUERY_KEY = ["divipay-transferencias"] as const;

async function fetchTransferencias(): Promise<DivipayTransacao[]> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Usuário não autenticado");

  // Busca do banco local
  const { data: localData } = await supabase
    .from("divipay_transacoes")
    .select("*")
    .eq("user_id", userId)
    .eq("type", "CASH_OUT")
    .order("created_at", { ascending: false });

  // Busca movimentações de saída da API Divipay
  try {
    const today = new Date().toISOString().split("T")[0];
    const start = new Date();
    start.setDate(start.getDate() - 60);
    const startDate = start.toISOString().split("T")[0];

    const response = await divipayService.listMovements({
      initialDate: startDate,
      finalDate: today,
      type: "CASH_OUT",
      limit: 200,
    });

    if (response.items && response.items.length > 0) {
      const apiMovementsAsTransacoes: DivipayTransacao[] = response.items.map((m) => ({
        id: m.id,
        user_id: userId,
        external_id: m.id,
        type: "CASH_OUT",
        status: String(m.status).toUpperCase(),
        amount: Number(m.amount || 0),
        description: m.description || m.payerName || "Saque Divipay",
        recipient_key: m.payerName || null,
        created_at: m.date || new Date().toISOString(),
        updated_at: m.date || new Date().toISOString(),
        pix_copy_paste: null,
        pix_qr_code: null,
        metadata: { ...m },
      }));

      // Combina os resultados sem duplicatas
      const existingIds = new Set((localData ?? []).map((t) => t.external_id || t.id));
      const newFromApi = apiMovementsAsTransacoes.filter((t) => !existingIds.has(t.id));
      return [...(localData ?? []), ...newFromApi];
    }
  } catch (err) {
    logger.error("useDivipayTransferencias", "Erro ao buscar movimentações de saída da API Divipay", { error: String(err) });
  }

  return localData ?? [];
}


export function useDivipayTransferencias() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: transferencias = [], isLoading: loading } = useQuery({
    queryKey: DIVIPAY_TRANSFERENCIAS_QUERY_KEY,
    queryFn: fetchTransferencias,
    staleTime: 1000 * 60,
  });

  const validateKey = useMutation({
    mutationFn: async (key: string) => {
      logger.info("useDivipayTransferencias", "Validando chave Pix", { key });
      return divipayService.validatePixKey(key);
    },
    onError: (error: Error) => {
      logger.error("useDivipayTransferencias", "Erro ao validar chave Pix", { error: error.message });
    },
  });

  const createTransferencia = useMutation({
    mutationFn: async (params: CreateWithdrawParams & { keyPix: string }) => {
      const { transacao } = await divipayService.createWithdraw(params);
      return transacao;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DIVIPAY_TRANSFERENCIAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["divipay-dashboard"] });
      toast({ title: "Transferência criada", description: "Saque Pix criado com sucesso." });
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
    createTransferencia: (params: CreateWithdrawParams & { keyPix: string }) => createTransferencia.mutateAsync(params),
    isCreating: createTransferencia.isPending,
    resetValidation: () => validateKey.reset(),
    refetch: () => qc.invalidateQueries({ queryKey: DIVIPAY_TRANSFERENCIAS_QUERY_KEY }),
  };
}
