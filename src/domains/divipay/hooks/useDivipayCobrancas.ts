import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import type { CreatePixChargeParams, DivipayTransacao } from "@/domains/divipay/types";

export const DIVIPAY_COBRANCAS_QUERY_KEY = ["divipay-cobrancas"] as const;

async function fetchCobrancas(): Promise<DivipayTransacao[]> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("divipay_transacoes")
    .select("*")
    .eq("user_id", userId)
    .eq("type", "CASH_IN")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export function useDivipayCobrancas() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: cobrancas = [], isLoading: loading } = useQuery({
    queryKey: DIVIPAY_COBRANCAS_QUERY_KEY,
    queryFn: fetchCobrancas,
    staleTime: 1000 * 60,
  });

  const createCobranca = useMutation({
    mutationFn: async (params: CreatePixChargeParams) => {
      const { transacao } = await divipayService.createPixCharge(params);
      return transacao;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DIVIPAY_COBRANCAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["divipay-dashboard"] });
      toast({ title: "Cobrança criada", description: "Cobrança Pix criada com sucesso." });
    },
    onError: (error: Error) => {
      logger.error("useDivipayCobrancas", "Erro ao criar cobrança", { error: error.message });
      toast({
        title: "Erro ao criar cobrança",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelCobranca = useMutation({
    mutationFn: async (charge: DivipayTransacao) => {
      if (!charge.external_id) throw new Error("Cobrança sem identificador externo");
      await divipayService.cancelPixCharge(charge.external_id);

      const { data, error } = await supabase
        .from("divipay_transacoes")
        .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
        .eq("id", charge.id)
        .select()
        .single();

      if (error) throw error;
      return data as DivipayTransacao;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DIVIPAY_COBRANCAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["divipay-dashboard"] });
      toast({ title: "Cobrança cancelada", description: "A cobrança foi cancelada com sucesso." });
    },
    onError: (error: Error) => {
      logger.error("useDivipayCobrancas", "Erro ao cancelar cobrança", { error: error.message });
      toast({
        title: "Erro ao cancelar cobrança",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    cobrancas,
    loading,
    createCobranca: (params: CreatePixChargeParams) => createCobranca.mutateAsync(params),
    cancelCobranca: (charge: DivipayTransacao) => cancelCobranca.mutateAsync(charge),
    isCreating: createCobranca.isPending,
    isCancelling: cancelCobranca.isPending,
    refetch: () => qc.invalidateQueries({ queryKey: DIVIPAY_COBRANCAS_QUERY_KEY }),
  };
}
