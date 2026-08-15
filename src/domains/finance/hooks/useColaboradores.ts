import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface Colaborador {
  id: string;
  nome: string;
  foto_url: string | null;
  foto_posicao?: string | null;
  tipo: "funcionario" | "socio" | "folguista";
  cargo: string | null;
  data_admissao: string | null;
  data_demissao: string | null;
  salario_bruto: number;
  vale_transporte: number;
  vale_transporte_diario?: number;
  vale_refeicao: number;
  outros_beneficios: number;
  status: string;
  dias_experiencia: number;
  carga_horaria_semanal: number;
  cpf?: string | null;
  rg?: string | null;
  data_nascimento?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
  contato_emergencia_1?: string | null;
  contato_emergencia_2?: string | null;
  pix_tipo?: string | null;
  pix_chave?: string | null;
  banco_nome?: string | null;
  banco_agencia?: string | null;
  banco_conta?: string | null;
  linha_onibus?: string | null;
  valor_passagem?: number | null;
  created_at: string;
}

export function useColaboradores() {
  const { activeWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["colaboradores", activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("colaboradores")
        .select("*")
        .eq("workspace_id", activeWorkspace.id)
        .order("tipo", { ascending: false })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Colaborador[];
    },
    enabled: !!activeWorkspace?.id,
  });
}
