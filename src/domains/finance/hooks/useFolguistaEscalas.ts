import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface ColaboradorEscala {
  id: string;
  colaborador_id: string;
  workspace_id: string;
  data: string;
  turno: string;
  valor_diaria: number;
  bateu_meta: boolean;
  valor_meta: number;
  valor_total: number;
  observacao?: string | null;
  status?: "programada" | "realizada" | "cancelada";
  cancelado_em?: string | null;
  cancelamento_motivo?: string | null;
  created_at: string;
}

export function useFolguistaEscalas(colaboradorId: string | null, mesRef?: string) {
  const { activeWorkspace } = useWorkspace();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["colaborador_escalas", colaboradorId, mesRef, activeWorkspace?.id],
    queryFn: async () => {
      if (!colaboradorId || !activeWorkspace?.id) return [];
      let req = supabase
        .from("colaborador_escalas")
        .select("*")
        .eq("colaborador_id", colaboradorId)
        .eq("workspace_id", activeWorkspace.id)
        .order("data", { ascending: false });

      if (mesRef) {
        const [ano, mes] = mesRef.split("-");
        const inicio = `${ano}-${mes}-01`;
        const fim = `${ano}-${mes}-31`;
        req = req.gte("data", inicio).lte("data", fim);
      }

      const { data, error } = await req;
      if (error) throw error;
      return (data ?? []) as ColaboradorEscala[];
    },
    enabled: !!colaboradorId && !!activeWorkspace?.id,
  });

  const addEscala = useMutation({
    mutationFn: async (nova: {
      colaborador_id: string;
      data: string;
      turno: string;
      valor_diaria: number;
      bateu_meta: boolean;
      valor_meta: number;
      observacao?: string;
    }) => {
      if (!activeWorkspace?.id) throw new Error("Workspace não encontrado");
      const { data, error } = await supabase.rpc("registrar_escala_folguista" as never, {
        p_colaborador_id: nova.colaborador_id,
        p_data: nova.data,
        p_turno: nova.turno,
        p_valor_diaria: nova.valor_diaria,
        p_bateu_meta: nova.bateu_meta,
        p_valor_meta: nova.valor_meta,
        p_observacao: nova.observacao || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colaborador_escalas"] });
      queryClient.invalidateQueries({ queryKey: ["equipe-acertos"] });
      queryClient.invalidateQueries({ queryKey: ["equipe-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    },
  });

  const deleteEscala = useMutation({
    mutationFn: async (escalaId: string) => {
      const { error } = await supabase.rpc("cancelar_escala_e_recalcular_acerto" as never, {
        p_escala_id: escalaId,
        p_motivo: "Escala cancelada pelo usuario",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colaborador_escalas"] });
      queryClient.invalidateQueries({ queryKey: ["equipe-acertos"] });
      queryClient.invalidateQueries({ queryKey: ["equipe-resumo"] });
      queryClient.invalidateQueries({ queryKey: ["despesas"] });
      queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    },
  });

  return { ...query, addEscala, deleteEscala };
}
