import { useQuery } from "@tanstack/react-query";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";

function currentCompetence(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function useEquipeObrigacoesMensais() {
  const { activeWorkspace } = useWorkspace();
  const competencia = currentCompetence();

  return useQuery({
    queryKey: ["equipe-obrigacoes-mensais", activeWorkspace?.id, competencia],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("gerar_obrigacoes_mensais_equipe" as never, {
        p_competencia: competencia,
      } as never);
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: Boolean(activeWorkspace?.id),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
}
