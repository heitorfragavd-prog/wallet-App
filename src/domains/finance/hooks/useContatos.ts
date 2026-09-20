import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface Contato {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  tipo: "fornecedor" | "cliente";
  nome: string;
  cnpj_cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
  contato_nome?: string | null;
  prazo_pagamento_dias?: number | null;
  observacoes?: string | null;
  created_at?: string;
}

export const CONTATOS_QUERY_KEY = ["contatos"] as const;

async function fetchContatos(workspaceId: string | null): Promise<Contato[]> {
  if (!workspaceId) return [];

  const query = supabase
    .from("contatos")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("nome", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Contato[];
}

export const useContatos = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const currentWorkspaceId = activeWorkspace?.id || null;

  const { data: contatos = [], isLoading: loading } = useQuery({
    queryKey: [...CONTATOS_QUERY_KEY, { workspaceId: currentWorkspaceId }],
    queryFn: () => fetchContatos(currentWorkspaceId),
    enabled: !!currentWorkspaceId,
    staleTime: 1000 * 60 * 2,
  });

  const createContato = useMutation({
    mutationFn: async (c: Omit<Contato, "id" | "user_id" | "created_at">) => {
      if (!currentWorkspaceId) {
        throw new Error("Workspace não selecionado para criar contato.");
      }
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase
        .from("contatos")
        .insert([{ ...c, user_id: userId, workspace_id: currentWorkspaceId }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTATOS_QUERY_KEY });
      toast({ title: "Contato criado", description: "Contato criado com sucesso!" });
    },
    onError: (error) => {
      logger.error("useContatos", "Erro ao criar contato", { error: String(error) });
      toast({ title: "Erro ao criar contato", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const updateContato = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contato> & { id: string }) => {
      let q = supabase
        .from("contatos")
        .update(updates)
        .eq("id", id);
      if (currentWorkspaceId) {
        q = q.eq("workspace_id", currentWorkspaceId);
      }
      const { data, error } = await q
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTATOS_QUERY_KEY });
      toast({ title: "Contato atualizado", description: "Contato atualizado com sucesso!" });
    },
    onError: (error) => {
      logger.error("useContatos", "Erro ao atualizar contato", { error: String(error) });
      toast({ title: "Erro ao atualizar", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const deleteContato = useMutation({
    mutationFn: async (id: string) => {
      let q = supabase.from("contatos").delete().eq("id", id);
      if (currentWorkspaceId) {
        q = q.eq("workspace_id", currentWorkspaceId);
      }
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTATOS_QUERY_KEY });
      toast({ title: "Contato excluído", description: "Contato excluído com sucesso!" });
    },
    onError: (error) => {
      logger.error("useContatos", "Erro ao excluir contato", { error: String(error) });
      toast({ title: "Erro ao excluir", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  return {
    contatos,
    loading,
    createContato: createContato.mutateAsync,
    updateContato: updateContato.mutateAsync,
    deleteContato: deleteContato.mutateAsync,
  };
};
