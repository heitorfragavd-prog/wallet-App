import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ColaboradorCusto {
  id: string;
  colaborador_id: string;
  tipo: string;
  valor: number;
  data: string;
  descricao: string | null;
  lancado_na_despesa: boolean;
}

export function useColaboradorCustos(colaboradorId: string | null, mesRef: string) {
  return useQuery({
    queryKey: ["colaborador_custos", colaboradorId, mesRef],
    queryFn: async () => {
      if (!colaboradorId) return [];
      const inicio = `${mesRef}-01`;
      const fim = new Date(Number(mesRef.split("-")[0]), Number(mesRef.split("-")[1]), 0).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("colaborador_custos")
        .select("*")
        .eq("colaborador_id", colaboradorId)
        .gte("data", inicio)
        .lte("data", fim)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ColaboradorCusto[];
    },
    enabled: !!colaboradorId,
  });
}
