import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { INVESTIMENTOS_QUERY_KEY } from "./useInvestimentos";

export interface DepositoInvestimento {
  id: string;
  user_id: string;
  workspace_id?: string;
  investimento_id: string;
  valor: number;
  quantidade: number;
  preco_unitario?: number;
  data: string;
  comprovante_url?: string;
  observacoes?: string;
  created_at?: string;
}

export const DEPOSITOS_QUERY_KEY = ["depositos_investimentos"] as const;

export function useDepositosInvestimento(investimentoId?: string) {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const workspaceId = activeWorkspace?.id;

  const { data: depositos = [], isLoading } = useQuery({
    queryKey: [...DEPOSITOS_QUERY_KEY, investimentoId, workspaceId],
    queryFn: async (): Promise<DepositoInvestimento[]> => {
      if (!workspaceId) return [];

      let query = supabase
        .from("depositos_investimentos")
        .select("*")
        .eq("workspace_id", workspaceId);

      if (investimentoId) {
        query = query.eq("investimento_id", investimentoId);
      }

      const { data, error } = await query.order("data", { ascending: false });

      if (error) {
        logger.error("useDepositosInvestimento", "Erro ao buscar depósitos", { error: error.message });
        throw error;
      }

      return (data ?? []) as any[];
    },
    enabled: !!workspaceId,
  });

  const uploadComprovante = async (file: File): Promise<string> => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error("Usuário não autenticado");

    const userId = userData.user.id;
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("comprovantes-investimentos")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from("comprovantes-investimentos")
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  };

  const createDeposito = useMutation({
    mutationFn: async (payload: Omit<DepositoInvestimento, "id" | "user_id" | "workspace_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Inserir o depósito
      const { data: newDep, error: depError } = await supabase
        .from("depositos_investimentos")
        .insert({
          ...payload,
          user_id: user.id,
          workspace_id: workspaceId,
        })
        .select()
        .single();

      if (depError) throw depError;

      // 2. Buscar todos os depósitos deste investimento para recalcular o preço médio
      const { data: allDeps, error: fetchError } = await supabase
        .from("depositos_investimentos")
        .select("valor, quantidade")
        .eq("investimento_id", payload.investimento_id);

      if (fetchError) throw fetchError;

      const totalInvestido = allDeps.reduce((sum, d) => sum + Number(d.valor || 0), 0);
      const totalQuantidade = allDeps.reduce((sum, d) => sum + Number(d.quantidade || 1), 0);

      // 3. Atualizar o investimento correspondente
      // Buscamos o investimento atual para saber o tipo e valor atual
      const { data: inv, error: invFetchError } = await supabase
        .from("investimentos")
        .select("tipo, valor_atual")
        .eq("id", payload.investimento_id)
        .single();

      if (invFetchError) throw invFetchError;

      // Se for renda variável ou cripto, o valor atual pode ser atualizado com base no preço unitário do novo depósito
      // ou mantido caso a cotação venha de fora. Como padrão de segurança ao cadastrar aporte, atualizamos
      // proporcionalmente. Para renda fixa, o valor_atual cresce com o aporte.
      let novoValorAtual = Number(inv.valor_atual || 0) + Number(payload.valor);
      if (inv.tipo === "renda_fixa" || inv.tipo === "poupanca" || inv.tipo === "outro") {
        novoValorAtual = totalInvestido;
      }

      const { error: updateError } = await supabase
        .from("investimentos")
        .update({
          valor_investido: totalInvestido,
          valor_atual: novoValorAtual,
        })
        .eq("id", payload.investimento_id);

      if (updateError) throw updateError;

      return newDep;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEPOSITOS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: INVESTIMENTOS_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Depósito cadastrado com sucesso!",
      });
    },
    onError: (err: unknown) => {
      logger.error("useDepositosInvestimento", "Erro ao criar depósito", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao cadastrar depósito: ${err.message}`,
      });
    },
  });

  const deleteDeposito = useMutation({
    mutationFn: async (id: string) => {
      // 1. Buscar detalhes do depósito antes de deletar
      const { data: dep, error: fetchDepErr } = await supabase
        .from("depositos_investimentos")
        .select("investimento_id, valor")
        .eq("id", id)
        .single();

      if (fetchDepErr) throw fetchDepErr;

      // 2. Deletar
      const { error: delError } = await supabase
        .from("depositos_investimentos")
        .delete()
        .eq("id", id);

      if (delError) throw delError;

      // 3. Recalcular
      const { data: allDeps, error: fetchError } = await supabase
        .from("depositos_investimentos")
        .select("valor, quantidade")
        .eq("investimento_id", dep.investimento_id);

      if (fetchError) throw fetchError;

      const totalInvestido = allDeps.reduce((sum, d) => sum + Number(d.valor || 0), 0);

      const { data: inv, error: invFetchError } = await supabase
        .from("investimentos")
        .select("tipo, valor_atual")
        .eq("id", dep.investimento_id)
        .single();

      if (invFetchError) throw invFetchError;

      let novoValorAtual = Math.max(0, Number(inv.valor_atual || 0) - Number(dep.valor));
      if (inv.tipo === "renda_fixa" || inv.tipo === "poupanca" || inv.tipo === "outro") {
        novoValorAtual = totalInvestido;
      }

      const { error: updateError } = await supabase
        .from("investimentos")
        .update({
          valor_investido: totalInvestido,
          valor_atual: novoValorAtual,
        })
        .eq("id", dep.investimento_id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEPOSITOS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: INVESTIMENTOS_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Depósito excluído com sucesso!",
      });
    },
    onError: (err: unknown) => {
      logger.error("useDepositosInvestimento", "Erro ao excluir depósito", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao excluir depósito: ${err.message}`,
      });
    },
  });

  return {
    depositos,
    isLoading,
    createDeposito,
    deleteDeposito,
    uploadComprovante,
  };
}
