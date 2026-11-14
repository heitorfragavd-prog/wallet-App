/**
 * useEscalasAutomacoes.ts
 *
 * Hook React para gerenciamento das automações semanais dos folguistas (Etapa 3C).
 * Conecta o painel administrativo aos motores de Segunda-feira, Sexta-feira,
 * Busca de Substitutos e histórico auditável de logs.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import type {
  ColaboradorFolguista,
  EscalasConfig,
  EscalaAutomacaoLog,
  EscalaSlot,
  FolguistaSubstitutionCandidate,
  SimulacaoRespostaFolguistaResult,
} from "../types";
import { EscalaAutomacaoEngine, type VagaAbertaInfo } from "../services/escalaAutomacaoEngine";
import { getNextWeekendDates } from "../services/escalaDateUtils";

interface UseEscalasAutomacoesProps {
  workspaceId: string;
  config?: EscalasConfig;
  escalas?: EscalaSlot[];
  folguistas?: ColaboradorFolguista[];
  onRefreshEscalas?: () => void;
}

export function useEscalasAutomacoes({
  workspaceId,
  config,
  escalas = [],
  folguistas = [],
  onRefreshEscalas,
}: UseEscalasAutomacoesProps) {
  const { toast } = useToast();
  const [logs, setLogs] = useState<EscalaAutomacaoLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [executingMonday, setExecutingMonday] = useState(false);
  const [executingFriday, setExecutingFriday] = useState(false);
  const [substitutesModalOpen, setSubstitutesModalOpen] = useState(false);
  const [selectedVagaForSub, setSelectedVagaForSub] = useState<VagaAbertaInfo | null>(null);
  const [substituteCandidates, setSubstituteCandidates] = useState<FolguistaSubstitutionCandidate[]>([]);
  const [simulacaoResultado, setSimulacaoResultado] = useState<SimulacaoRespostaFolguistaResult | null>(null);

  const weekend = getNextWeekendDates(new Date());

  // Carrega os logs de automação do workspace
  const loadAutomacoesLogs = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("escalas_automacoes_log")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("[useEscalasAutomacoes] Erro ao carregar logs:", error);
      } else {
        setLogs((data as unknown as EscalaAutomacaoLog[]) || []);
      }
    } catch (err) {
      console.error("[useEscalasAutomacoes] Erro fatal ao carregar logs:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadAutomacoesLogs();
  }, [loadAutomacoesLogs]);

  // Vagas em aberto para o próximo fim de semana
  const uncoveredWeekendSlots = EscalaAutomacaoEngine.identifyUncoveredWeekendSlots({
    sabadoDate: weekend.sabado,
    domingoDate: weekend.domingo,
    escalasExistentes: escalas,
    config,
  });

  // Status da automação de Segunda-feira para este fim de semana
  const mondayLog = logs.find(
    (l) =>
      l.tipo_rotina === "consulta_segunda" &&
      l.data_fim_semana_inicio === weekend.sabado
  );

  // Status da automação de Sexta-feira para este fim de semana
  const fridayLogs = logs.filter(
    (l) =>
      l.tipo_rotina === "confirmacao_sexta" &&
      l.data_fim_semana_inicio === weekend.sabado
  );

  // Executa ou Simula a Consulta de Segunda-Feira
  const handleTriggerMonday = async (forceSimulada?: boolean) => {
    if (!workspaceId) return;
    setExecutingMonday(true);
    try {
      const overrideConfig: Partial<EscalasConfig> = {
        ...config,
        simulacao_modo: forceSimulada !== undefined ? forceSimulada : (config?.simulacao_modo ?? true),
      };

      const res = await EscalaAutomacaoEngine.executeMondayConsultation({
        workspaceId,
        referenceDate: new Date(),
        forcarExecucao: true,
        escalasExistentes: escalas,
        folguistasAtivos: folguistas,
        config: overrideConfig,
      });

      if (res.sucesso) {
        toast({
          title: res.simulada ? "Simulação de Segunda Concluída" : "Consulta de Segunda Disparada",
          description: res.mensagem,
        });
        await loadAutomacoesLogs();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({
        title: "Falha na Automação de Segunda",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setExecutingMonday(false);
    }
  };

  // Executa ou Simula a Confirmação de Sexta-Feira
  const handleTriggerFriday = async (forceSimulada?: boolean) => {
    if (!workspaceId) return;
    setExecutingFriday(true);
    try {
      const overrideConfig: Partial<EscalasConfig> = {
        ...config,
        simulacao_modo: forceSimulada !== undefined ? forceSimulada : (config?.simulacao_modo ?? true),
      };

      const res = await EscalaAutomacaoEngine.executeFridayConfirmation({
        workspaceId,
        referenceDate: new Date(),
        escalasExistentes: escalas,
        colaboradores: folguistas,
        config: overrideConfig,
      });

      if (res.sucesso) {
        toast({
          title: res.simulada ? "Simulação de Sexta Concluída" : "Confirmações de Sexta Disparadas",
          description: res.mensagem,
        });
        await loadAutomacoesLogs();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({
        title: "Falha na Automação de Sexta",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setExecutingFriday(false);
    }
  };

  // Processa resposta simulada de folguista (Gate 3 - Isolamento Total: NUNCA altera o banco de dados)
  const handleSimulateFolguistaResponse = async (
    colaboradorId: string,
    rawText: string,
    isFridayContext = false
  ): Promise<SimulacaoRespostaFolguistaResult | null> => {
    if (!workspaceId || !colaboradorId || !rawText.trim()) return null;
    const colab = folguistas.find((f) => f.id === colaboradorId);
    const colabNome = colab?.nome || "Folguista";

    const resultado = EscalaAutomacaoEngine.simulateFolguistaResponse({
      colaboradorId,
      colaboradorNome: colabNome,
      rawText,
      isFridayContext,
      weekend,
    });

    setSimulacaoResultado(resultado);

    toast({
      title: "Simulação de Resposta Concluída",
      description: `Mensagem interpretada com sucesso. Modo de teste: NENHUM dado real foi alterado (${resultado.acoesPropostas.length} ações simuladas).`,
    });

    return resultado;
  };

  // Aplica explicitamente as alterações na escala oficial quando autorizado pelo administrador (Gate 3)
  const handleApplyRealFolguistaResponse = async (
    colaboradorId: string,
    rawText: string,
    isFridayContext = false
  ) => {
    if (!workspaceId || !colaboradorId || !rawText.trim()) return;
    const colab = folguistas.find((f) => f.id === colaboradorId);
    const colabNome = colab?.nome || "Folguista";

    try {
      const res = await EscalaAutomacaoEngine.applyRealFolguistaResponse({
        workspaceId,
        colaboradorId,
        colaboradorNome: colabNome,
        rawText,
        isFridayContext,
        weekend,
        origem: "manual",
      });

      toast({
        title: "Disponibilidade Real Registrada",
        description: res.mensagem,
      });

      setSimulacaoResultado(null);
      if (onRefreshEscalas) {
        onRefreshEscalas();
      }
      await loadAutomacoesLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({
        title: "Erro ao Gravar Disponibilidade Real",
        description: msg,
        variant: "destructive",
      });
    }
  };

  // Abre busca de substitutos para uma vaga específica
  const handleOpenSubstituteSearch = (vaga: VagaAbertaInfo, desistenteId?: string) => {
    setSelectedVagaForSub(vaga);
    const candidates = EscalaAutomacaoEngine.findSubstitutesForSlot({
      workspaceId,
      data: vaga.data,
      turno: vaga.turno,
      desistenteId,
      escalasExistentes: escalas,
      folguistas,
    });
    setSubstituteCandidates(candidates);
    setSubstitutesModalOpen(true);
  };

  return {
    logs,
    loading,
    executingMonday,
    executingFriday,
    weekend,
    uncoveredWeekendSlots,
    mondayLog,
    fridayLogs,
    substitutesModalOpen,
    setSubstitutesModalOpen,
    selectedVagaForSub,
    substituteCandidates,
    handleTriggerMonday,
    handleTriggerFriday,
    handleSimulateFolguistaResponse,
    handleApplyRealFolguistaResponse,
    simulacaoResultado,
    setSimulacaoResultado,
    handleOpenSubstituteSearch,
    loadAutomacoesLogs,
  };
}
