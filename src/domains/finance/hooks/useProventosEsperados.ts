import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface ProventoEsperado {
  id: string;
  user_id: string;
  investimento_id: string;
  data_pagamento: string;
  valor_estimado: number;
  tipo: 'dividendo' | 'jcp' | 'rendimento_fii' | 'outro';
  status: 'previsto' | 'recebido' | 'cancelado';
  created_at?: string;
  investimentos?: {
    nome: string;
    codigo_b3?: string;
  };
}

export const PROVENTOS_QUERY_KEY = ["proventos_esperados"] as const;

export function useProventosEsperados() {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const workspaceId = activeWorkspace?.id;

  const { data: proventos = [], isLoading } = useQuery({
    queryKey: [...PROVENTOS_QUERY_KEY, workspaceId],
    queryFn: async (): Promise<ProventoEsperado[]> => {
      if (!workspaceId) return [];

      const { data, error } = await supabase
        .from("proventos_esperados")
        .select("*, investimentos!inner(nome, codigo_b3, workspace_id)")
        .eq("investimentos.workspace_id", workspaceId)
        .order("data_pagamento", { ascending: true });

      if (error) {
        logger.error("useProventosEsperados", "Erro ao buscar proventos", { error: error.message });
        throw error;
      }

      return (data ?? []) as any[];
    },
    enabled: !!workspaceId,
  });

  const createProvento = useMutation({
    mutationFn: async (payload: Omit<ProventoEsperado, "id" | "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("proventos_esperados")
        .insert({
          ...payload,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROVENTOS_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Provento cadastrado com sucesso!",
      });
    },
    onError: (err: any) => {
      logger.error("useProventosEsperados", "Erro ao criar provento", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao cadastrar provento: ${err.message}`,
      });
    },
  });

  const updateProvento = useMutation({
    mutationFn: async (payload: Partial<ProventoEsperado> & { id: string }) => {
      const { id, ...changes } = payload;
      const { data, error } = await supabase
        .from("proventos_esperados")
        .update(changes)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROVENTOS_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Provento atualizado com sucesso!",
      });
    },
    onError: (err: any) => {
      logger.error("useProventosEsperados", "Erro ao atualizar provento", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao atualizar provento: ${err.message}`,
      });
    },
  });

  const deleteProvento = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("proventos_esperados")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROVENTOS_QUERY_KEY });
      toast({
        title: "Sucesso",
        description: "Provento excluído com sucesso!",
      });
    },
    onError: (err: any) => {
      logger.error("useProventosEsperados", "Erro ao excluir provento", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: `Erro ao excluir provento: ${err.message}`,
      });
    },
  });

  const proximosProventos = (mes: number, ano: number): ProventoEsperado[] => {
    return proventos.filter((p) => {
      const date = new Date(p.data_pagamento + "T12:00:00");
      return date.getMonth() + 1 === mes && date.getFullYear() === ano;
    });
  };

  const totalProventosMes = (mes: number, ano: number): number => {
    return proximosProventos(mes, ano).reduce((sum, p) => sum + Number(p.valor_estimado || 0), 0);
  };

  return {
    proventos,
    isLoading,
    createProvento,
    updateProvento,
    deleteProvento,
    proximosProventos,
    totalProventosMes,
  };
}
