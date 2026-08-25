import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface Transferencia {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  conta_origem_id: string;
  conta_destino_id: string;
  valor: number;
  data: string;
  descricao?: string | null;
  observacoes?: string | null;
  created_at?: string;
  conta_origem?: { nome: string; tipo: string } | null;
  conta_destino?: { nome: string; tipo: string } | null;
}

export const TRANSFERENCIAS_QUERY_KEY = ["transferencias"] as const;
const CONTAS_QUERY_KEY = ["contas_usuario"] as const;

async function fetchTransferencias(workspaceId: string | null): Promise<Transferencia[]> {
  if (!workspaceId) return [];

  const query = supabase
    .from("transferencias")
    .select(`
      *,
      conta_origem:contas_usuario!conta_origem_id (nome, tipo),
      conta_destino:contas_usuario!conta_destino_id (nome, tipo)
    `)
    .eq("workspace_id", workspaceId)
    .order("data", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Transferencia[];
}

export const useTransferencias = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const currentWorkspaceId = activeWorkspace?.id || null;

  const { data: transferencias = [], isLoading: loading } = useQuery({
    queryKey: [...TRANSFERENCIAS_QUERY_KEY, { workspaceId: currentWorkspaceId }],
    queryFn: () => fetchTransferencias(currentWorkspaceId),
    enabled: !!currentWorkspaceId,
    staleTime: 1000 * 60 * 2,
  });

  const createTransferencia = useMutation({
    mutationFn: async (t: Omit<Transferencia, "id" | "user_id" | "created_at" | "conta_origem" | "conta_destino">) => {
      if (!currentWorkspaceId) {
        throw new Error("Workspace não selecionado para criar transferência.");
      }
      if (t.conta_origem_id === t.conta_destino_id) {
        throw new Error("A conta de origem não pode ser igual à conta de destino.");
      }
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");

      // 1. Registra a transferência
      const { data, error } = await supabase
        .from("transferencias")
        .insert([{ ...t, user_id: userId, workspace_id: currentWorkspaceId }])
        .select()
        .single();
      if (error) throw error;

      // 2. Atualiza saldos: origem diminui, destino aumenta
      const { data: origem } = await supabase
        .from("contas_usuario")
        .select("saldo_atual")
        .eq("id", t.conta_origem_id)
        .eq("workspace_id", currentWorkspaceId)
        .single();
      const { data: destino } = await supabase
        .from("contas_usuario")
        .select("saldo_atual")
        .eq("id", t.conta_destino_id)
        .eq("workspace_id", currentWorkspaceId)
        .single();

      if (origem) {
        await supabase
          .from("contas_usuario")
          .update({ saldo_atual: Number(origem.saldo_atual ?? 0) - Number(t.valor) })
          .eq("id", t.conta_origem_id)
          .eq("workspace_id", currentWorkspaceId);
      }
      if (destino) {
        await supabase
          .from("contas_usuario")
          .update({ saldo_atual: Number(destino.saldo_atual ?? 0) + Number(t.valor) })
          .eq("id", t.conta_destino_id)
          .eq("workspace_id", currentWorkspaceId);
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRANSFERENCIAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: CONTAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["transacoes"] });
      toast({ title: "Transferência criada", description: "Transferência realizada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useTransferencias", "Erro ao criar transferência", { error: String(error) });
      toast({ title: "Erro ao criar transferência", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const deleteTransferencia = useMutation({
    mutationFn: async (id: string) => {
      let q = supabase.from("transferencias").delete().eq("id", id);
      if (currentWorkspaceId) {
        q = q.eq("workspace_id", currentWorkspaceId);
      }
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRANSFERENCIAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: CONTAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["transacoes"] });
      toast({ title: "Transferência excluída", description: "Transferência excluída com sucesso!" });
    },
    onError: (error) => {
      logger.error("useTransferencias", "Erro ao excluir transferência", { error: String(error) });
      toast({ title: "Erro ao excluir", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  return {
    transferencias,
    loading,
    createTransferencia: createTransferencia.mutateAsync,
    deleteTransferencia: deleteTransferencia.mutateAsync,
  };
};
