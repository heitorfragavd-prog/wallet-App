import { useMemo, useState } from "react";
import { Plus, RefreshCw, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ColaboradorCard, colaboradorMonthlyCost } from "@/domains/finance/components/equipe/ColaboradorCard";
import { EquipeSummaryCards } from "@/domains/finance/components/equipe/EquipeSummaryCards";
import { useColaboradores } from "@/domains/finance/hooks/useColaboradores";
import { useEquipeObrigacoesMensais } from "@/domains/finance/hooks/useEquipeObrigacoesMensais";
import { useEquipeResumo } from "@/domains/finance/hooks/useEquipeResumo";
import { resolverEstadoContrato } from "@/domains/finance/services/equipeCalculations";
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
  const colaboradoresQuery = useColaboradores();
  const obligationsQuery = useEquipeObrigacoesMensais();
  const resumoQuery = useEquipeResumo();
  const colaboradores = useMemo(() => colaboradoresQuery.data ?? [], [colaboradoresQuery.data]);
  const resumo = resumoQuery.data;

  const regimeEncargos = activeWorkspace?.regime_encargos ?? "geral";

  const counts = useMemo(() => ({
    socio: colaboradores.filter((item) => item.tipo === "socio").length,
    funcionario: colaboradores.filter((item) => item.tipo === "funcionario").length,
    folguista: colaboradores.filter((item) => item.tipo === "folguista").length,
  }), [colaboradores]);
  const filtered = useMemo(() => colaboradores.filter((item) => filter === "todos" || item.tipo === filter), [colaboradores, filter]);
  const custoMensal = useMemo(() => colaboradores.reduce((total, item) => total + colaboradorMonthlyCost(item, regimeEncargos), 0), [colaboradores, regimeEncargos]);
  const experiencias = useMemo(() => colaboradores.filter((item) => {
    if (item.tipo !== "funcionario" || !item.data_admissao) return false;
    const est = resolverEstadoContrato({
      statusPersistido: item.status,
      dataAdmissao: item.data_admissao,
      diasExperiencia: item.dias_experiencia || 90,
    });
    return (est?.estado === "experiencia" && est.diasRestantes !== null && est.diasRestantes <= 15) || est?.estado === "decisao";
  }).length, [colaboradores]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <header className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-primary/5 p-5 sm:p-6">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary"><Users className="h-6 w-6" /></div>
                <div><h1 className="text-2xl font-bold tracking-tight text-foreground">Equipe</h1><p className="text-sm text-muted-foreground">Pessoas, escalas e pagamentos em um só lugar</p></div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{counts.socio} sócios · {counts.funcionario} funcionário · {counts.folguista} folguista</p>
            </div>
            <Button onClick={() => navigate("/equipe/novo")} className="shadow-sm"><Plus className="mr-2 h-4 w-4" />Novo integrante</Button>
          </div>
        </header>

        {obligationsQuery.isError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            Não foi possível atualizar as obrigações mensais agora.
            <Button size="sm" variant="outline" onClick={() => obligationsQuery.refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" />Tentar novamente</Button>
          </div>
        )}

        <EquipeSummaryCards custoMensal={custoMensal} totalPendente={resumo?.totalPendente ?? 0} pendentes={resumo?.pendentes ?? 0} proximoVencimento={resumo?.proximoVencimento ?? null} experiencias={experiencias} />

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-semibold text-foreground">Integrantes</h2><p className="text-sm text-muted-foreground">{filtered.length} resultado(s)</p></div>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtros da equipe">
              {filterLabels.map((item) => <Button key={item.value} size="sm" variant={filter === item.value ? "default" : "outline"} onClick={() => setFilter(item.value)}>{item.label}</Button>)}
            </div>
          </div>

          {colaboradoresQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div className="h-72 animate-pulse rounded-2xl bg-muted/30" key={item} />)}</div>
          ) : colaboradoresQuery.error ? (
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center text-destructive">Não foi possível carregar a equipe.</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center"><Users className="mx-auto h-10 w-10 text-muted-foreground/40" /><p className="mt-3 font-medium">Nenhum integrante neste filtro</p><p className="mt-1 text-sm text-muted-foreground">Cadastre uma pessoa ou escolha outro tipo.</p></div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((colaborador) => (
                <ColaboradorCard
                  key={colaborador.id}
                  colaborador={colaborador}
                  regimeEncargos={regimeEncargos}
                  onOpen={() => navigate(`/equipe/${colaborador.id}`)}
                  onEdit={() => navigate(`/equipe/${colaborador.id}/editar`)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
