import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ColaboradorPresenca {
  id: string;
  colaborador_id: string;
  data: string;
  presente: boolean;
  horas_trabalhadas: number | null;
  atraso_minutos: number;
  justificativa: string | null;
}

export function useColaboradorPresencas(colaboradorId: string | null, mesRef: string) {
  return useQuery({
    queryKey: ["colaborador_presencas", colaboradorId, mesRef],
    queryFn: async () => {
      if (!colaboradorId) return [];
      const inicio = `${mesRef}-01`;
      const fim = new Date(Number(mesRef.split("-")[0]), Number(mesRef.split("-")[1]), 0).toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("colaborador_presencas")
        .select("*")
        .eq("colaborador_id", colaboradorId)
        .gte("data", inicio)
        .lte("data", fim)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ColaboradorPresenca[];
    },
    enabled: !!colaboradorId,
  });
}
