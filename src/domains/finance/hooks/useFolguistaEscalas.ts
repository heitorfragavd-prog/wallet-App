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
      const valor_total = nova.valor_diaria + (nova.bateu_meta ? nova.valor_meta : 0);

      // 1. Inserir na tabela colaborador_escalas
      const { data: escala, error } = await supabase
        .from("colaborador_escalas")
        .insert({
          colaborador_id: nova.colaborador_id,
          workspace_id: activeWorkspace.id,
          data: nova.data,
          turno: nova.turno,
          valor_diaria: nova.valor_diaria,
          bateu_meta: nova.bateu_meta,
          valor_meta: nova.valor_meta,
          valor_total,
          observacao: nova.observacao || null,
        })
        .select("*")
        .single();

      if (error) throw error;

      // 2. Criar registro de custo em colaborador_custos para contabilizar financeiramente
      await supabase.from("colaborador_custos").insert({
        colaborador_id: nova.colaborador_id,
        tipo: "folguista",
        valor: valor_total,
        data: nova.data,
        descricao: `Diária Folguista (${nova.turno})${nova.bateu_meta ? " + Bônus Meta" : ""}`,
        lancado_na_despesa: true,
      });

      return escala;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colaborador_escalas"] });
      queryClient.invalidateQueries({ queryKey: ["colaborador_custos"] });
      queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    },
  });

  const deleteEscala = useMutation({
    mutationFn: async (escalaId: string) => {
      const { error } = await supabase.from("colaborador_escalas").delete().eq("id", escalaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colaborador_escalas"] });
      queryClient.invalidateQueries({ queryKey: ["colaborador_custos"] });
      queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    },
  });

  return { ...query, addEscala, deleteEscala };
}
