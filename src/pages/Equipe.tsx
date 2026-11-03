import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  ColaboradorCard,
  colaboradorMonthlyCost,
  type ColaboradorMonthlySummary,
} from "@/domains/finance/components/equipe/ColaboradorCard";
import { EquipeSummaryCards } from "@/domains/finance/components/equipe/EquipeSummaryCards";
import { RegistrarPagamentoRealizadoModal } from "@/domains/finance/components/equipe/RegistrarPagamentoRealizadoModal";
import { useColaboradores } from "@/domains/finance/hooks/useColaboradores";
import { useEquipeObrigacoesMensais } from "@/domains/finance/hooks/useEquipeObrigacoesMensais";
import {
  formatMonthInSaoPaulo,
  getSaoPauloDateParts,
  useEquipeResumo,
} from "@/domains/finance/hooks/useEquipeResumo";
import { resolverEstadoContrato } from "@/domains/finance/services/equipeCalculations";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/shared/components/ui/button";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";

type Filter = "todos" | "socio" | "funcionario" | "folguista";

const filterLabels: Array<{ value: Filter; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "socio", label: "Sócios" },
  { value: "funcionario", label: "Funcionários" },
  { value: "folguista", label: "Folguistas" },
];

export default function EquipePage() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const [filter, setFilter] = useState<Filter>("todos");

  // Seletor de mês e ano com fuso America/Sao_Paulo
  const todaySp = useMemo(() => getSaoPauloDateParts(), []);
  const [selectedYear, setSelectedYear] = useState<number>(todaySp.year);
  const [selectedMonth, setSelectedMonth] = useState<number>(todaySp.month);

  const selectedYearMonth = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

  const monthLabel = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth - 1, 1);
    const text = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }, [selectedYear, selectedMonth]);

  const prevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const resetToCurrentMonth = () => {
    setSelectedYear(todaySp.year);
    setSelectedMonth(todaySp.month);
  };

  const [modalRegistroOpen, setModalRegistroOpen] = useState(false);

  const colaboradoresQuery = useColaboradores();
  const obligationsQuery = useEquipeObrigacoesMensais();
  const resumoQuery = useEquipeResumo({ ano: selectedYear, mes: selectedMonth });

  const colaboradores = useMemo(() => colaboradoresQuery.data ?? [], [colaboradoresQuery.data]);
  const resumo = resumoQuery.data;

  // Consulta de todos os acertos para apurar métricas por colaborador
  const { data: allAcertos = [], refetch: refetchAcertos } = useQuery({
    queryKey: ["equipe-all-acertos", activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("colaborador_acertos" as never)
        .select("id, colaborador_id, tipo, status, valor_total, vencimento, periodo_inicio, periodo_fim, created_at")
        .eq("workspace_id", activeWorkspace.id);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        colaborador_id: string;
        tipo: string;
        status: string;
        valor_total: number;
        vencimento: string;
        periodo_inicio: string;
        periodo_fim: string;
        created_at: string;
      }>;
    },
    enabled: Boolean(activeWorkspace?.id),
  });

  // Consulta de pagamentos quitados no workspace
  const { data: allPagamentos = [], refetch: refetchPagamentos } = useQuery({
    queryKey: ["equipe-all-pagamentos", activeWorkspace?.id],
    queryFn: async () => {
      if (!activeWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("colaborador_pagamentos" as never)
        .select("id, acerto_id, status, origem, valor, paid_at, created_at")
        .eq("workspace_id", activeWorkspace.id)
        .eq("status", "pago");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        acerto_id: string;
        status: string;
        origem: string;
        valor: number;
        paid_at: string | null;
        created_at: string;
      }>;
    },
    enabled: Boolean(activeWorkspace?.id),
  });

  // Apuração do resumo mensal por colaborador
  const summariesByColaborador = useMemo(() => {
    const acertoToColab = new Map<string, string>();
    allAcertos.forEach((a) => acertoToColab.set(a.id, a.colaborador_id));

    const map = new Map<string, ColaboradorMonthlySummary>();

    colaboradores.forEach((colab) => {
      const colabAcertos = allAcertos.filter((a) => a.colaborador_id === colab.id);
      const colabPagamentos = allPagamentos.filter(
        (p) => acertoToColab.get(p.acerto_id) === colab.id
      );

      // Pagamentos efetuados durante o mês selecionado
      const pagamentosDoMes = colabPagamentos.filter((p) => {
        const dateToUse = p.paid_at || p.created_at;
        return formatMonthInSaoPaulo(dateToUse) === selectedYearMonth;
      });

      const totalPagoNoMes = pagamentosDoMes.reduce(
        (acc, p) => acc + (Number(p.valor) || 0),
        0
      );

      // Pendências da competência selecionada
      const pendentesCompetencia = colabAcertos.filter(
        (a) => a.status === "pendente" && a.periodo_inicio.startsWith(selectedYearMonth)
      );
      const totalPendenteCompetencia = pendentesCompetencia.reduce(
        (acc, a) => acc + (Number(a.valor_total) || 0),
        0
      );

      // Último pagamento confirmado do colaborador
      const sortedPagamentos = [...colabPagamentos].sort((a, b) => {
        const da = a.paid_at || a.created_at;
        const db = b.paid_at || b.created_at;
        return db.localeCompare(da);
      });

      const ultimo = sortedPagamentos[0]
        ? {
            valor: Number(sortedPagamentos[0].valor) || 0,
            data: sortedPagamentos[0].paid_at || sortedPagamentos[0].created_at,
            origem: sortedPagamentos[0].origem,
          }
        : null;

      map.set(colab.id, {
        totalPagoNoMes,
        qtdPagosNoMes: pagamentosDoMes.length,
        totalPendenteCompetencia,
        qtdPendentesCompetencia: pendentesCompetencia.length,
        ultimoPagamento: ultimo,
      });
    });

    return map;
  }, [colaboradores, allAcertos, allPagamentos, selectedYearMonth]);

  const regimeEncargos = activeWorkspace?.regime_encargos ?? "geral";

  const counts = useMemo(
    () => ({
      socio: colaboradores.filter((item) => item.tipo === "socio").length,
      funcionario: colaboradores.filter((item) => item.tipo === "funcionario").length,
      folguista: colaboradores.filter((item) => item.tipo === "folguista").length,
    }),
    [colaboradores]
  );

  const filtered = useMemo(
    () => colaboradores.filter((item) => filter === "todos" || item.tipo === filter),
    [colaboradores, filter]
  );

  const custoMensal = useMemo(
    () =>
      colaboradores.reduce(
        (total, item) => total + colaboradorMonthlyCost(item, regimeEncargos),
        0
      ),
    [colaboradores, regimeEncargos]
  );

  const experiencias = useMemo(
    () =>
      colaboradores.filter((item) => {
        if (item.tipo !== "funcionario" || !item.data_admissao) return false;
        const est = resolverEstadoContrato({
          statusPersistido: item.status,
          dataAdmissao: item.data_admissao,
          diasExperiencia: item.dias_experiencia || 90,
        });
        return (
          (est?.estado === "experiencia" &&
            est.diasRestantes !== null &&
            est.diasRestantes <= 15) ||
          est?.estado === "decisao"
        );
      }).length,
    [colaboradores]
  );

  const handleModalSuccess = () => {
    colaboradoresQuery.refetch();
    resumoQuery.refetch();
    refetchAcertos();
    refetchPagamentos();
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        {/* Cabeçalho da Página */}
        <header className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-primary/5 p-5 sm:p-6">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">Equipe</h1>
                  <p className="text-sm text-muted-foreground">
                    Pessoas, escalas e pagamentos em um só lugar
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {counts.socio} sócios · {counts.funcionario} funcionário · {counts.folguista}{" "}
                folguistas
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                onClick={() => setModalRegistroOpen(true)}
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Registrar pagamento realizado
              </Button>
              <Button onClick={() => navigate("/equipe/novo")} className="shadow-sm">
                <Plus className="mr-2 h-4 w-4" />
                Novo integrante
              </Button>
            </div>
          </div>

          {/* Barra de Competência / Seletor de Mês */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Competência de visualização:
              </span>
              <div className="inline-flex items-center rounded-xl border border-border/60 bg-background/80 p-1 shadow-sm">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={prevMonth}
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-3 text-sm font-semibold text-foreground min-w-[140px] text-center">
                  {monthLabel}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={nextMonth}
                  aria-label="Próximo mês"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {selectedYearMonth !== todaySp.yearMonth && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetToCurrentMonth}
                  className="h-8 text-xs text-primary"
                >
                  <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                  Ir para mês atual
                </Button>
              )}
            </div>

            <span className="text-xs text-muted-foreground">
              Fuso: <strong className="text-foreground">America/Sao_Paulo</strong>
            </span>
          </div>
        </header>

        {obligationsQuery.isError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300"
          >
            Não foi possível atualizar as obrigações mensais agora.
            <Button size="sm" variant="outline" onClick={() => obligationsQuery.refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Indicadores Gerais */}
        <EquipeSummaryCards
          custoMensal={custoMensal}
          totalPagoNoMes={resumo?.totalPagoNoMes ?? 0}
          pagosNoMes={resumo?.pagosNoMes ?? 0}
          totalPendente={resumo?.totalPendente ?? 0}
          pendentes={resumo?.pendentes ?? 0}
          obrigacoesVencidas={resumo?.obrigacoesVencidas ?? 0}
          totalVencido={resumo?.totalVencido ?? 0}
          proximoVencimento={resumo?.proximoVencimento ?? null}
          experiencias={experiencias}
          explicacaoPendencias={resumo?.explicacaoPendencias ?? []}
          mesLabel={monthLabel}
        />

        {/* Listagem de Integrantes */}
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-foreground">Integrantes</h2>
              <p className="text-sm text-muted-foreground">{filtered.length} resultado(s)</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtros da equipe">
              {filterLabels.map((item) => (
                <Button
                  key={item.value}
                  size="sm"
                  variant={filter === item.value ? "default" : "outline"}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          {colaboradoresQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div className="h-72 animate-pulse rounded-2xl bg-muted/30" key={item} />
              ))}
            </div>
          ) : colaboradoresQuery.error ? (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center text-destructive"
            >
              Não foi possível carregar a equipe.
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 font-medium">Nenhum integrante neste filtro</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cadastre uma pessoa ou escolha outro tipo.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((colaborador) => (
                <ColaboradorCard
                  key={colaborador.id}
                  colaborador={colaborador}
                  regimeEncargos={regimeEncargos}
                  monthlySummary={summariesByColaborador.get(colaborador.id)}
                  onOpen={() => navigate(`/equipe/${colaborador.id}`)}
                  onEdit={() => navigate(`/equipe/${colaborador.id}/editar`)}
                  onViewHistory={() =>
                    navigate(`/equipe/${colaborador.id}?tab=settlements`)
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Modal de Pagamento Manual / Já Realizado */}
        <RegistrarPagamentoRealizadoModal
          open={modalRegistroOpen}
          onOpenChange={setModalRegistroOpen}
          colaboradores={colaboradores}
          onSuccess={handleModalSuccess}
        />
      </div>
    </DashboardLayout>
  );
}
