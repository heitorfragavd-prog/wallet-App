import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { fetchReceitas } from "./useReceitas";

export function useMediaMensalReceitas() {
  const { activeWorkspace } = useWorkspace();

  return useQuery({
    queryKey: ["media-mensal-receitas", activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) return 0;

      // Pegar a data exata de 6 meses atrás
      const hoje = new Date();
      const seisMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 6, hoje.getDate());
      const startDate = seisMesesAtras.toISOString().split('T')[0];
      const endDate = hoje.toISOString().split('T')[0];

      // Busca todas as receitas (PDV, manuais, Divipay) consolidando nos últimos 6 meses
      const data = await fetchReceitas({ startDate, endDate }, {}, activeWorkspace.id);
      
      if (!data || data.length === 0) return 0;

      const totalReceitasVal = data.reduce((acc, curr) => acc + Number(curr.valor), 0);

      // Soma todos os recebimentos e divide por 6 meses para obter a média mensal real
      return totalReceitasVal / 6;
    },
    enabled: !!activeWorkspace?.id,
  });
}
