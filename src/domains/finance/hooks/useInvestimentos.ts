import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface Investimento {
  id: string;
  user_id: string;
  workspace_id?: string;
  nome: string;
  tipo: 'renda_fixa' | 'renda_variavel' | 'fundo' | 'cripto' | 'poupanca' | 'outro';
  instituicao?: string;
  valor_investido: number;
  valor_atual: number;
  taxa_rendimento_anual: number;
  taxa_referencia?: string;
  data_inicio: string;
  data_vencimento?: string;
  ativo: boolean;
  meta_id?: string;
  codigo_b3?: string;
  cnpj_instituicao?: string;
  conta_id?: string;
  contas_usuario?: { nome: string; } | null;
  created_at?: string;
  updated_at?: string;
}

export const INVESTIMENTOS_QUERY_KEY = ["investimentos"] as const;

export function calcularPrecoMedio(depositos: Array<{ valor: number; quantidade: number }>): number {
  const totalInvestido = depositos.reduce((a, d) => a + Number(d.valor || 0), 0);
  const totalQuantidade = depositos.reduce((a, d) => a + Number(d.quantidade || 0), 0);
  return totalQuantidade > 0 ? totalInvestido / totalQuantidade : 0;
}

export function calcularIR(valorRendimento: number, dias: number): { liquido: number; ir: number; aliquota: number } {
  let aliquota = 0.225;
  if (dias > 720) aliquota = 0.15;
  else if (dias > 360) aliquota = 0.175;
  else if (dias > 180) aliquota = 0.20;
  const ir = valorRendimento * aliquota;
  return { liquido: valorRendimento - ir, ir, aliquota };
}

export function calcularRentabilidadeReal(valorNominal: number, meses: number, ipcaAnual: number): number {
  const ipcaMensal = Math.pow(1 + ipcaAnual / 100, 1 / 12) - 1;
  const inflacaoAcumulada = Math.pow(1 + ipcaMensal, meses) - 1;
  return valorNominal / (1 + inflacaoAcumulada);
}

export function useInvestimentos() {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const workspaceId = activeWorkspace?.id;

  const { data: investimentos = [], isLoading } = useQuery({
    queryKey: [...INVESTIMENTOS_QUERY_KEY, workspaceId],
    queryFn: async (): Promise<Investimento[]> => {
      if (!workspaceId) return [];

      const { data, error } = await supabase
        .from("investimentos")
        .select("*, contas_usuario:conta_id (nome)")
        .eq("workspace_id", workspaceId)
        .order("nome", { ascending: true });

      if (error) {
        logger.error("useInvestimentos", "Erro ao buscar investimentos", { error: error.message });
        throw error;
      }

      return (data ?? []) as Investimento[];
    },
    enabled: !!workspaceId,
  });

  const createInvestimento = useMutation({
    mutationFn: async (payload: Omit<Investimento, "id" | "user_id" | "workspace_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("investimentos")
        .insert({
          ...payload,
          user_id: user.id,
          workspace_id: workspaceId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVESTIMENTOS_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Investimento cadastrado com sucesso!",
      });
    },
    onError: (err: unknown) => {
      logger.error("useInvestimentos", "Erro ao criar investimento", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao cadastrar investimento: ${err.message}`,
      });
    },
  });

  const updateInvestimento = useMutation({
    mutationFn: async (payload: Partial<Investimento> & { id: string }) => {
      const { id, ...changes } = payload;
      const { data, error } = await supabase
        .from("investimentos")
        .update(changes)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVESTIMENTOS_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Investimento atualizado com sucesso!",
      });
    },
    onError: (err: unknown) => {
      logger.error("useInvestimentos", "Erro ao atualizar investimento", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao atualizar investimento: ${err.message}`,
      });
    },
  });

  const deleteInvestimento = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("investimentos")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVESTIMENTOS_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Investimento excluído com sucesso!",
      });
    },
    onError: (err: unknown) => {
      logger.error("useInvestimentos", "Erro ao excluir investimento", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao excluir investimento: ${err.message}`,
      });
    },
  });

  return {
    investimentos,
    isLoading,
    createInvestimento,
    updateInvestimento,
    deleteInvestimento,
  };
}
