import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/shared/hooks/use-toast";
import type {
  ColaboradorFolguista,
  DisponibilidadeFolguista,
  EscalasConfig,
  EscalaSlot,
  ScheduleGenerationResult,
  TurnoId,
} from "../types";
import { generateWeekendSchedule } from "../services/escalaEngine";

// Helper para calcular datas do próximo fim de semana (Sábado e Domingo) no fuso de São Paulo
export function getNextWeekendDates(): { sabado: string; domingo: string } {
  const now = new Date();
  const day = now.getDay(); // 0 = Domingo, 6 = Sábado
  // Dias até o próximo sábado
  let diffToSat = (6 - day + 7) % 7;
  if (diffToSat === 0 && now.getHours() >= 20) {
    diffToSat = 7;
  }
  const satDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToSat);
  const sunDate = new Date(satDate.getFullYear(), satDate.getMonth(), satDate.getDate() + 1);

  const formatIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return {
    sabado: formatIso(satDate),
    domingo: formatIso(sunDate),
  };
}

export function useEscalasFolguistas() {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const workspaceId = activeWorkspace?.id;

  const nextWeekend = useMemo(() => getNextWeekendDates(), []);
  const [selectedWeekendDate, setSelectedWeekendDate] = useState<{ sabado: string; domingo: string }>(nextWeekend);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPreview, setGeneratedPreview] = useState<ScheduleGenerationResult | null>(null);

  // 1. Carrega Colaboradores
  const {
    data: colaboradores = [],
    isLoading: loadingColaboradores,
    refetch: refetchColaboradores,
  } = useQuery({
    queryKey: ["escalas-colaboradores", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<ColaboradorFolguista[]> => {
      const { data, error } = await supabase
        .from("colaboradores")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("nome", { ascending: true });

      if (error) throw error;
      return (data || []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        workspace_id: String(row.workspace_id),
        nome: String(row.nome),
        tipo: row.tipo as "funcionario" | "folguista" | "socio",
        cargo: row.cargo ? String(row.cargo) : null,
        telefone: row.telefone ? String(row.telefone) : null,
        pix_tipo: row.pix_tipo ? String(row.pix_tipo) : null,
        pix_chave: row.pix_chave ? String(row.pix_chave) : null,
        valor_diaria: Number(row.valor_diaria) || 100,
        status: (row.status === "inativo" ? "inativo" : "ativo") as "ativo" | "inativo",
        turnos_preferidos: (row.turnos_preferidos as TurnoId[]) || [],
        dias_disponiveis: (row.dias_disponiveis as string[]) || [],
        avaliacao_nota: Number(row.avaliacao_nota) || 5.0,
        restricoes_alimentares: row.restricoes_alimentares ? String(row.restricoes_alimentares) : null,
        observacoes_escala: row.observacoes_escala ? String(row.observacoes_escala) : null,
        foto_url: row.foto_url ? String(row.foto_url) : null,
      }));
    },
  });

  // 2. Carrega Configurações das Escalas
  const {
    data: config,
    isLoading: loadingConfig,
    refetch: refetchConfig,
  } = useQuery({
    queryKey: ["escalas-config", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<EscalasConfig> => {
      const { data, error } = await supabase
        .from("escalas_config" as never)
        .select("*")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();

      if (error && (error as { code?: string }).code !== "PGRST116") throw error;

      return (
        (data as EscalasConfig | null) || {
          workspace_id: workspaceId!,
          min_horas_descanso: 11,
          valor_diaria_padrao: 100,
          valor_meta_padrao: 20,
          horarios_turnos: {
            manha: { inicio: "05:00", fim: "13:30", descricao: "Manhã (Abertura)" },
            intermediario: { inicio: "12:00", fim: "20:30", descricao: "Intermediário" },
            noite: { inicio: "15:00", fim: "23:30", descricao: "Noite (Fechamento)" },
          },
          dias_semana_turnos: {
            sabado: ["manha", "intermediario", "noite"],
            domingo: ["manha", "intermediario", "noite"],
          },
          notificacao_segunda_horario: "09:00",
          notificacao_sexta_horario: "14:00",
          simulacao_modo: false,
        }
      );
    },
  });

  // 3. Carrega Disponibilidades
  const {
    data: disponibilidades = [],
    isLoading: loadingDisponibilidades,
    refetch: refetchDisponibilidades,
  } = useQuery({
    queryKey: ["escalas-disponibilidades", workspaceId, selectedWeekendDate],
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<DisponibilidadeFolguista[]> => {
      const { data, error } = await supabase
        .from("folguistas_disponibilidade" as never)
        .select("*")
        .eq("workspace_id", workspaceId!)
        .in("data_referencia", [selectedWeekendDate.sabado, selectedWeekendDate.domingo]);

      if (error) throw error;
      return (data || []).map((d: Record<string, unknown>) => ({
        id: String(d.id),
        workspace_id: String(d.workspace_id),
        colaborador_id: String(d.colaborador_id),
        data_referencia: String(d.data_referencia),
        turno: d.turno as TurnoId | "qualquer",
        disponivel: Boolean(d.disponivel),
        confirmado: Boolean(d.confirmado),
        origem: (d.origem || "manual") as "telegram" | "web" | "manual" | "ia",
        resposta_raw: d.resposta_raw ? String(d.resposta_raw) : null,
        created_at: d.created_at ? String(d.created_at) : undefined,
        updated_at: d.updated_at ? String(d.updated_at) : undefined,
      }));
    },
  });

  // 4. Carrega Escalas Realizadas / Programadas
  const {
    data: escalas = [],
    isLoading: loadingEscalas,
    refetch: refetchEscalas,
  } = useQuery({
    queryKey: ["escalas-agendadas", workspaceId, selectedWeekendDate],
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<EscalaSlot[]> => {
      const { data, error } = await supabase
        .from("colaborador_escalas")
        .select("*, colaboradores(nome, tipo)")
        .eq("workspace_id", workspaceId!)
        .in("data", [selectedWeekendDate.sabado, selectedWeekendDate.domingo]);

      if (error) throw error;
      return (data || []).map((row: Record<string, unknown>) => {
        const rowData = String(row.data);
        const diaSemana = rowData === selectedWeekendDate.sabado ? "sabado" : "domingo";
        const turno = row.turno as TurnoId;
        const colabInfo = row.colaboradores as { nome?: string; tipo?: "funcionario" | "folguista" | "socio" } | null;

        return {
          id: String(row.id),
          data: rowData,
          diaSemana,
          turno,
          horarioInicio: config?.horarios_turnos?.[turno]?.inicio || "08:00",
          horarioFim: config?.horarios_turnos?.[turno]?.fim || "16:00",
          colaboradorId: row.colaborador_id ? String(row.colaborador_id) : null,
          colaboradorNome: colabInfo?.nome || null,
          colaboradorTipo: colabInfo?.tipo || null,
          valorDiaria: Number(row.valor_diaria) || 100,
          valorMeta: Number(row.valor_meta) || 20,
          bateuMeta: Boolean(row.bateu_meta),
          status: (row.status || "programada") as "programada" | "confirmada" | "concluida" | "cancelada",
          observacao: row.observacao ? String(row.observacao) : null,
        };
      });
    },
  });

  // 5. Geração Automática
  const handleGenerateSchedule = useCallback(() => {
    if (!config) return;
    setIsGenerating(true);

    try {
      // Procura Sarah para checar se ela fecha na sexta
      const sarah = colaboradores.find(
        (c) => c.nome.toLowerCase().includes("sarah") || c.cargo?.toLowerCase().includes("noite"),
      );
      const suellen = colaboradores.find(
        (c) => c.nome.toLowerCase().includes("suellen") || c.nome.toLowerCase().includes("shuellen"),
      );

      const result = generateWeekendSchedule({
        targetWeekendDates: selectedWeekendDate,
        colaboradores,
        disponibilidades,
        config,
        fridayNightColaboradorId: sarah?.id || null,
        suellenId: suellen?.id || null,
      });

      setGeneratedPreview(result);
      toast({
        title: "Escala Gerada com Sucesso!",
        description: `${result.slots.length} turnos processados. Turnos descobertos: ${result.turnosDescobertosCount}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha no motor de escalas.";
      toast({
        title: "Erro ao gerar escala",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [colaboradores, config, disponibilidades, selectedWeekendDate, toast]);

  // 6. Salvar Escala no Banco
  const saveScheduleMutation = useMutation({
    mutationFn: async (slotsToSave: EscalaSlot[]) => {
      if (!workspaceId) throw new Error("Workspace não selecionado.");

      // Limpa os slots existentes das datas selecionadas antes de inserir
      await supabase
        .from("colaborador_escalas")
        .delete()
        .eq("workspace_id", workspaceId)
        .in("data", [selectedWeekendDate.sabado, selectedWeekendDate.domingo]);

      const recordsToInsert = slotsToSave
        .filter((s) => Boolean(s.colaboradorId))
        .map((s) => ({
          workspace_id: workspaceId,
          colaborador_id: s.colaboradorId!,
          data: s.data,
          turno: s.turno,
          valor_diaria: s.valorDiaria,
          valor_meta: s.valorMeta || 20,
          valor_total: s.valorDiaria,
          status: s.status,
          observacao: s.observacao || "Gerado pelo Motor de Escalas",
        }));

      if (recordsToInsert.length > 0) {
        const { error } = await supabase.from("colaborador_escalas").insert(recordsToInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalas-agendadas"] });
      setGeneratedPreview(null);
      toast({
        title: "Escala Confirmada e Salva!",
        description: "Os turnos foram gravados no banco de dados e sincronizados.",
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Falha ao gravar no banco.";
      toast({
        title: "Erro ao salvar escala",
        description: msg,
        variant: "destructive",
      });
    },
  });

  // 7. Atualizar Disponibilidade
  const updateDisponibilidadeMutation = useMutation({
    mutationFn: async (input: {
      colaboradorId: string;
      dataReferencia: string;
      turno: TurnoId | "qualquer";
      disponivel: boolean;
      confirmado?: boolean;
    }) => {
      if (!workspaceId) throw new Error("Workspace não selecionado.");

      const { error } = await supabase.from("folguistas_disponibilidade" as never).upsert(
        {
          workspace_id: workspaceId,
          colaborador_id: input.colaboradorId,
          data_referencia: input.dataReferencia,
          turno: input.turno,
          disponivel: input.disponivel,
          confirmado: input.confirmado ?? false,
          origem: "manual",
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "colaborador_id,data_referencia,turno" },
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalas-disponibilidades"] });
      toast({
        title: "Disponibilidade Atualizada",
        description: "Status de disponibilidade salvo com sucesso.",
      });
    },
  });

  // 8. Atualizar Configurações
  const saveConfigMutation = useMutation({
    mutationFn: async (newConfig: Partial<EscalasConfig>) => {
      if (!workspaceId) throw new Error("Workspace não selecionado.");

      const { error } = await supabase.from("escalas_config" as never).upsert(
        {
          workspace_id: workspaceId,
          ...newConfig,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "workspace_id" },
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalas-config"] });
      toast({
        title: "Configurações Salvas",
        description: "Parâmetros operacionais e horários de escala atualizados.",
      });
    },
  });

  // Indicadores
  const folguistasAtivos = useMemo(
    () => colaboradores.filter((c) => c.status === "ativo" && c.tipo === "folguista"),
    [colaboradores],
  );

  const funcionariosFixos = useMemo(
    () => colaboradores.filter((c) => c.status === "ativo" && c.tipo === "funcionario"),
    [colaboradores],
  );

  return {
    workspaceId,
    colaboradores,
    folguistasAtivos,
    funcionariosFixos,
    config,
    disponibilidades,
    escalas,
    selectedWeekendDate,
    setSelectedWeekendDate,
    isGenerating,
    generatedPreview,
    setGeneratedPreview,
    loading: loadingColaboradores || loadingConfig || loadingDisponibilidades || loadingEscalas,
    generateSchedule: handleGenerateSchedule,
    saveSchedule: saveScheduleMutation.mutateAsync,
    isSavingSchedule: saveScheduleMutation.isPending,
    updateDisponibilidade: updateDisponibilidadeMutation.mutateAsync,
    saveConfig: saveConfigMutation.mutateAsync,
    isSavingConfig: saveConfigMutation.isPending,
    refetchAll: () => {
      refetchColaboradores();
      refetchConfig();
      refetchDisponibilidades();
      refetchEscalas();
    },
  };
}
