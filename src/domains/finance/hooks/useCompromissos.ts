import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface CompromissoManual {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  titulo: string;
  local?: string | null;
  data: string; // YYYY-MM-DD
  hora?: string | null; // HH:MM
  repetir?: "nunca" | "diario" | "semanal" | "mensal" | "anual";
  lembrete?: boolean;
  created_at?: string;
}

export const COMPROMISSOS_QUERY_KEY = ["compromissos"] as const;

export const useCompromissos = (mesRef?: string) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  const { data: compromissos = [], isLoading: loading } = useQuery({
    queryKey: [...COMPROMISSOS_QUERY_KEY, { mesRef, workspaceId }],
    queryFn: async (): Promise<CompromissoManual[]> => {
      let query = supabase.from("compromissos").select("*").order("data").order("hora");
      if (workspaceId) query = query.eq("workspace_id", workspaceId);
      if (mesRef) {
        const [ano, m] = mesRef.split("-").map(Number);
        const endDate = new Date(ano, m, 0).toISOString().split("T")[0];
        query = query.gte("data", `${mesRef}-01`).lte("data", endDate);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CompromissoManual[];
    },
    staleTime: 1000 * 60 * 2,
  });

  const createCompromisso = useMutation({
    mutationFn: async (compromisso: Omit<CompromissoManual, "id" | "user_id" | "created_at">) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase
        .from("compromissos")
        .insert([{ ...compromisso, user_id: userId, workspace_id: workspaceId }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COMPROMISSOS_QUERY_KEY });
      toast({ title: "Compromisso salvo", description: "Compromisso adicionado à agenda!" });
    },
    onError: (error) => {
      logger.error("useCompromissos", "Erro ao criar compromisso", { error: String(error) });
      toast({ title: "Erro ao salvar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const deleteCompromisso = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("compromissos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COMPROMISSOS_QUERY_KEY });
      toast({ title: "Compromisso removido", description: "Compromisso excluído da agenda." });
    },
    onError: (error) => {
      logger.error("useCompromissos", "Erro ao remover compromisso", { error: String(error) });
      toast({ title: "Erro ao remover", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  return {
    compromissos,
    loading,
    createCompromisso: (c: Omit<CompromissoManual, "id" | "user_id" | "created_at">) =>
      createCompromisso.mutateAsync(c),
    deleteCompromisso: (id: string) => deleteCompromisso.mutateAsync(id),
  };
};
