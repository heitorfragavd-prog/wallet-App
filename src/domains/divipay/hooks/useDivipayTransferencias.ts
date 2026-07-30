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

  const { data, error } = await supabase
    .from("divipay_transacoes")
    .select("*")
    .eq("user_id", userId)
    .eq("type", "CASH_OUT")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
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
