import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
  Rocket,
  Tag,
  Users,
  AlertCircle,
  ChevronRight,
  X,
  Play,
  CheckCircle2,
  Clock,
  TrendingUp,
  FileCheck,
} from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { useAuth } from '@/domains/auth/hooks/useAuth';
import { useProfile } from '@/domains/auth/hooks/useProfile';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { CeoRepository } from '@/domains/ceo/services/CeoRepository';
import { CommercialExperiment, GrowthOpportunity, ExperimentDecision } from '@/domains/ceo/types';
import { CeoExecutiveKpis, CeoFinancialMetricsService } from '@/domains/ceo/services/CeoFinancialMetricsService';
import { CeoIntelligenceEngine } from '@/domains/ceo/services/CeoIntelligenceEngine';

interface CeoOpportunitiesTabProps {
  workspaceId: string;
  experiments: CommercialExperiment[];
  kpis?: CeoExecutiveKpis;
  onExperimentCreated?: () => void;
  onExperimentUpdated?: () => void;
}

export const CeoOpportunitiesTab: React.FC<CeoOpportunitiesTabProps> = ({
  workspaceId,
  experiments,
  kpis,
  onExperimentCreated,
  onExperimentUpdated,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { activeWorkspaceRole, activeWorkspace } = useWorkspace();

  // Prerrogativa executiva: proprietário/admin do workspace ou perfil owner
  const isOwnerOrExecutive =
    profile?.role === 'owner' ||
    profile?.role === 'admin' ||
    activeWorkspaceRole === 'owner' ||
    activeWorkspaceRole === 'admin' ||
    Boolean(user?.id && activeWorkspace?.owner_id && user.id === activeWorkspace.owner_id);

  const [activeSubTab, setActiveSubTab] = useState<'oportunidades' | 'experimentos' | 'em_execucao' | 'concluidas'>('oportunidades');
  const [opportunities, setOpportunities] = useState<GrowthOpportunity[]>([]);
  const [selectedOpp, setSelectedOpp] = useState<GrowthOpportunity | null>(null);

  // Estados para modais de transição de ciclo de vida
  const [startModalExp, setStartModalExp] = useState<CommercialExperiment | null>(null);
  const [startBaselineInput, setStartBaselineInput] = useState<string>('');

  const [concludeModalExp, setConcludeModalExp] = useState<CommercialExperiment | null>(null);
  const [concludeDecision, setConcludeDecision] = useState<ExperimentDecision>('manter');
  const [concludeFinalValue, setConcludeFinalValue] = useState<string>('');
  const [concludeImpact, setConcludeImpact] = useState<string>('');
  const [concludeRationale, setConcludeRationale] = useState<string>('');

  const loadOpportunities = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const effectiveKpis = kpis || CeoFinancialMetricsService.getEmptyKpis();
      const res = await CeoRepository.listOpportunities(workspaceId);
      const opps = res?.data;
      if (opps && Array.isArray(opps) && opps.length > 0) {
        setOpportunities(opps);
      } else {
        const topProds =
          kpis?.topProducts && kpis.topProducts.length > 0
            ? kpis.topProducts
            : await CeoFinancialMetricsService.getTopProducts(workspaceId).catch(() => []);
        const groundedOpps = CeoIntelligenceEngine.detectRodoPointOpportunities(workspaceId, {
          kpis: effectiveKpis,
          topProducts: topProds,
        });
        setOpportunities(groundedOpps);
      }
    } catch (err) {
      console.warn('[CeoOpportunitiesTab] Erro ao carregar oportunidades do banco, usando motor canônico:', err);
      const effectiveKpis = kpis || CeoFinancialMetricsService.getEmptyKpis();
      const topProds =
        kpis?.topProducts && kpis.topProducts.length > 0
          ? kpis.topProducts
          : await CeoFinancialMetricsService.getTopProducts(workspaceId).catch(() => []);
      const groundedOpps = CeoIntelligenceEngine.detectRodoPointOpportunities(workspaceId, {
        kpis: effectiveKpis,
        topProducts: topProds,
      });
      setOpportunities(groundedOpps);
    }
  }, [workspaceId, kpis]);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);

  // Transição 1: Criar experimento a partir da oportunidade (Status inicial: 'planejado', sem baseline hardcoded)
  const handleCreateExperiment = async (opp: GrowthOpportunity) => {
    if (!workspaceId) {
      toast({
        title: 'Selecione um workspace',
        description: 'É necessário um workspace ativo para criar experimentos.',
        variant: 'destructive',
      });
      return;
    }

    const res = await CeoRepository.saveExperiment({
      workspace_id: workspaceId,
      opportunity_id: opp.id,
      title: opp.title,
      hypothesis: opp.hypothesis || opp.description || opp.problem_description,
      department: opp.department,
      target_kpi: 'Faturamento Incremental / Margem',
      baseline_value: undefined, // Não inventa '0'; baseline será aferido no início
      current_value: 'Aguardando início',
      target_value: opp.estimated_financial_impact
        ? `+R$ ${opp.estimated_financial_impact.toFixed(2)}/mês`
        : 'Meta a definir',
      start_date: new Date().toISOString().slice(0, 10),
      status: 'planejado',
      decision: 'pendente',
    });

    if (res?.success) {
      toast({
        title: 'Experimento Planejado!',
        description: `O experimento "${opp.title}" foi registrado como Planejado no Laboratório de Crescimento.`,
      });
      if (onExperimentCreated) {
        onExperimentCreated();
      }
      setSelectedOpp(null);
      setActiveSubTab('experimentos');
    } else {
      toast({
        title: 'Erro ao criar experimento',
        description: res?.error || 'Não foi possível persistir o experimento no banco de dados.',
        variant: 'destructive',
      });
    }
  };

  // Transição 2: Aprovar experimento planejado (Status: 'planejado' -> 'aprovado')
  const handleApproveExperiment = async (exp: CommercialExperiment) => {
    if (!isOwnerOrExecutive) {
      toast({
        title: 'Ação Restrita',
        description: 'A aprovação formal de experimentos comerciais é prerrogativa exclusiva do proprietário/administrador.',
        variant: 'destructive',
      });
      return;
    }

    const res = await CeoRepository.updateExperimentStatus(exp.id, 'aprovado', {
      decision: 'aprovado',
      rationale: 'Experimento comercial aprovado formalmente pela gestão executiva.',
      currentStatus: exp.status,
    });

    if (res.success) {
      toast({
        title: 'Experimento Aprovado!',
        description: `O experimento "${exp.title || exp.name}" foi aprovado pelo proprietário e está pronto para execução.`,
      });
      if (onExperimentUpdated) onExperimentUpdated();
      else if (onExperimentCreated) onExperimentCreated();
    } else {
      toast({
        title: 'Erro ao aprovar experimento',
        description: res.error || 'Falha na atualização do status.',
        variant: 'destructive',
      });
    }
  };

  // Transição 3: Iniciar execução (Status estrito: 'aprovado' -> 'em_andamento')
  const handleConfirmStart = async () => {
    if (!startModalExp) return;

    if (!isOwnerOrExecutive) {
      toast({
        title: 'Ação Restrita',
        description: 'Apenas proprietários e administradores podem iniciar a execução de experimentos.',
        variant: 'destructive',
      });
      return;
    }

    const isApproved = startModalExp.status === 'aprovado' || startModalExp.status === 'approved';
    if (!isApproved) {
      toast({
        title: 'Aprovação Prévia Obrigatória',
        description: 'O experimento precisa ser formalmente aprovado antes de ser colocado em execução.',
        variant: 'destructive',
      });
      return;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const baseline = startBaselineInput.trim() ? startBaselineInput.trim() : null;

    const res = await CeoRepository.updateExperiment(startModalExp.id, {
      status: 'em_andamento',
      start_date: todayIso,
      baseline_value: baseline,
      current_value: 'Em medição inicial',
      currentStatus: startModalExp.status,
    });

    if (res.success) {
      toast({
        title: 'Experimento Iniciado!',
        description: `O experimento "${startModalExp.title || startModalExp.name}" agora está Em Execução.`,
      });
      setStartModalExp(null);
      setStartBaselineInput('');
      if (onExperimentUpdated) onExperimentUpdated();
      else if (onExperimentCreated) onExperimentCreated();
      setActiveSubTab('em_execucao');
    } else {
      toast({
        title: 'Erro ao iniciar experimento',
        description: res.error || 'Falha ao registrar início da execução.',
        variant: 'destructive',
      });
    }
  };

  // Transição 4: Concluir experimento (Status: 'em_andamento' -> 'concluido')
  const handleConfirmConclude = async () => {
    if (!concludeModalExp) return;

    if (!isOwnerOrExecutive) {
      toast({
        title: 'Ação Restrita',
        description: 'Apenas o proprietário ou administrador executivo pode concluir experimentos.',
        variant: 'destructive',
      });
      return;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const parsedImpact = concludeImpact.trim() ? parseFloat(concludeImpact.replace(',', '.')) : undefined;

    const res = await CeoRepository.updateExperiment(concludeModalExp.id, {
      status: 'concluido',
      end_date: todayIso,
      decision: concludeDecision,
      decision_rationale: concludeRationale.trim() || 'Conclusão registrada pela gestão executiva.',
      current_value: concludeFinalValue.trim() || undefined,
      measured_financial_impact: Number.isFinite(parsedImpact) ? parsedImpact : 0,
      currentStatus: concludeModalExp.status,
    });

    if (res.success) {
      toast({
        title: 'Experimento Concluído!',
        description: `O experimento "${concludeModalExp.title || concludeModalExp.name}" foi finalizado com decisão: ${concludeDecision}.`,
      });
      setConcludeModalExp(null);
      setConcludeFinalValue('');
      setConcludeImpact('');
      setConcludeRationale('');
      if (onExperimentUpdated) onExperimentUpdated();
      else if (onExperimentCreated) onExperimentCreated();
      setActiveSubTab('concluidas');
    } else {
      toast({
        title: 'Erro ao concluir experimento',
        description: res.error || 'Falha ao finalizar o experimento.',
        variant: 'destructive',
      });
    }
  };

  // Transição 5: Cancelar experimento
  const handleCancelExperiment = async (exp: CommercialExperiment) => {
    if (!isOwnerOrExecutive) {
      toast({
        title: 'Ação Restrita',
        description: 'Apenas o proprietário ou administrador pode cancelar experimentos.',
        variant: 'destructive',
      });
      return;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const res = await CeoRepository.updateExperiment(exp.id, {
      status: 'cancelado',
      end_date: todayIso,
      decision: 'interromper',
      decision_rationale: 'Experimento interrompido preventivamente pela gestão.',
      currentStatus: exp.status,
    });

    if (res.success) {
      toast({
        title: 'Experimento Cancelado',
        description: `O experimento "${exp.title || exp.name}" foi cancelado.`,
      });
      if (onExperimentUpdated) onExperimentUpdated();
      else if (onExperimentCreated) onExperimentCreated();
    } else {
      toast({
        title: 'Erro ao cancelar experimento',
        description: res.error || 'Falha na alteração de status.',
        variant: 'destructive',
      });
    }
  };

  // Categorização das 4 Sub-Abas Conforme Ciclo de Vida Canônico
  const plannedExperiments = experiments.filter(
    (e) => e.status === 'planejado' || e.status === 'planned' || e.status === 'aprovado' || e.status === 'approved'
  );
  const activeExperiments = experiments.filter((e) => e.status === 'em_andamento' || e.status === 'active');
  const finishedExperiments = experiments.filter(
    (e) => e.status === 'concluido' || e.status === 'completed' || e.status === 'cancelado' || e.status === 'cancelled'
  );

  const getOppIcon = (index: number) => {
    if (index === 0) return <Rocket className="w-5 h-5 text-amber-400" />;
    if (index === 1) return <Tag className="w-5 h-5 text-amber-400" />;
    return <Users className="w-5 h-5 text-amber-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Tabs Conforme Painel 4 */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
              CEO — Oportunidades & Plano de Ação
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-400 mt-0.5">
            Laboratório de crescimento: oportunidades fundamentadas e ciclo de vida de experimentos.
          </p>
        </div>

        {/* Sub-tabs buttons - grid 2 colunas no celular, linha flex no desktop */}
        <div className="w-full sm:w-auto">
          <div className="grid grid-cols-2 sm:flex sm:flex-row w-full sm:w-auto gap-1.5 bg-slate-900/80 p-1.5 rounded-xl border border-border/50 text-xs">
            <button
              type="button"
              onClick={() => setActiveSubTab('oportunidades')}
              className={`h-10 sm:h-8 px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center text-center gap-1.5 ${
                activeSubTab === 'oportunidades'
                  ? 'bg-orange-500 text-white font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-slate-800/60'
              }`}
            >
              <span>Oportunidades</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-bold leading-none">
                {opportunities.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('experimentos')}
              className={`h-10 sm:h-8 px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center text-center gap-1.5 ${
                activeSubTab === 'experimentos'
                  ? 'bg-orange-500 text-white font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-slate-800/60'
              }`}
            >
              <span>Experimentos</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-bold leading-none">
                {plannedExperiments.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('em_execucao')}
              className={`h-10 sm:h-8 px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center text-center gap-1.5 ${
                activeSubTab === 'em_execucao'
                  ? 'bg-orange-500 text-white font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-slate-800/60'
              }`}
            >
              <span>Em Execução</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-bold leading-none">
                {activeExperiments.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('concluidas')}
              className={`h-10 sm:h-8 px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center text-center gap-1.5 ${
                activeSubTab === 'concluidas'
                  ? 'bg-orange-500 text-white font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-slate-800/60'
              }`}
            >
              <span>Concluídas</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 font-bold leading-none">
                {finishedExperiments.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Aba 1: Oportunidades Identificadas */}
      {activeSubTab === 'oportunidades' && (
        <div className="space-y-4">
          {opportunities.length > 0 ? (
            opportunities.map((opp, idx) => (
              <Card
                key={opp.id}
                className="bg-card/70 border-border/50 hover:border-amber-500/40 transition-colors"
              >
                <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      {getOppIcon(idx)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {opp.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            opp.priority === 'high' || opp.impact_level === 'high'
                              ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/20'
                              : 'border-amber-500/40 text-amber-400 bg-amber-950/20'
                          }`}
                        >
                          {opp.priority === 'high' || opp.impact_level === 'high' ? 'Alta Prioridade' : 'Média Prioridade'}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] text-slate-400">
                          {opp.nature === 'fato_observado' ? 'Fato Observado' : 'Hipótese Comercial'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground max-w-xl">
                        {opp.description || opp.problem_description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0">
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">Impacto estimado</div>
                      <div className="text-sm font-bold text-emerald-400">
                        {opp.estimated_financial_impact
                          ? `+R$ ${opp.estimated_financial_impact.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês`
                          : 'A calcular'}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => setSelectedOpp(opp)}
                      className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold gap-1"
                    >
                      Ver Plano
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="bg-card/70 border-border/50">
              <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400" />
                <h3 className="text-sm font-semibold text-foreground">
                  Informações Insuficientes para Novas Oportunidades
                </h3>
                <p className="text-xs text-muted-foreground max-w-md">
                  Para que o motor do CEO identifique oportunidades comerciais precisas, cadastre as fichas técnicas dos produtos e mantenha as transações diárias sincronizadas com o Eyemobile PDV.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Sub-Aba 2: Experimentos Planejados / Aprovados */}
      {activeSubTab === 'experimentos' && (
        <div className="space-y-4">
          {plannedExperiments.length > 0 ? (
            plannedExperiments.map((exp) => {
              const isApproved = exp.status === 'aprovado' || exp.status === 'approved';
              return (
                <Card key={exp.id} className="bg-card/70 border-border/50 hover:border-amber-500/30 transition-colors">
                  <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {exp.title || exp.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            isApproved
                              ? 'border-blue-500/40 text-blue-400 bg-blue-950/20'
                              : 'border-amber-500/40 text-amber-400 bg-amber-950/20'
                          }`}
                        >
                          {isApproved ? 'Aprovado' : 'Planejado'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground max-w-2xl">{exp.hypothesis}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-1">
                        <span><strong className="text-slate-300">KPI Alvo:</strong> {exp.target_kpi || 'Faturamento Incremental'}</span>
                        <span><strong className="text-slate-300">Baseline:</strong> {exp.baseline_value || 'Pendente de medição inicial'}</span>
                        <span><strong className="text-slate-300">Meta:</strong> {exp.target_value || 'A definir'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 w-full sm:w-auto justify-end">
                      {!isApproved ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApproveExperiment(exp)}
                          disabled={!isOwnerOrExecutive}
                          title={!isOwnerOrExecutive ? 'Apenas o proprietário ou administrador pode aprovar experimentos' : 'Aprovar experimento formalmente'}
                          className="h-8 text-xs border-blue-500/40 text-blue-400 hover:bg-blue-950/30 font-semibold gap-1 disabled:opacity-50"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                          Aprovar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            setStartModalExp(exp);
                            setStartBaselineInput(String(exp.baseline_value || ''));
                          }}
                          disabled={!isOwnerOrExecutive}
                          title={!isOwnerOrExecutive ? 'Apenas o proprietário ou administrador pode iniciar a execução' : 'Iniciar execução'}
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Iniciar Execução
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCancelExperiment(exp)}
                        disabled={!isOwnerOrExecutive}
                        title={!isOwnerOrExecutive ? 'Apenas o proprietário ou administrador pode cancelar experimentos' : 'Cancelar experimento'}
                        className="h-8 text-xs text-red-400 hover:bg-red-950/20 disabled:opacity-50"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border/50 rounded-xl">
              Nenhum experimento planejado ou aguardando aprovação. Converta uma oportunidade identificada na aba &quot;Oportunidades&quot;.
            </div>
          )}
        </div>
      )}

      {/* Sub-Aba 3: Experimentos Em Execução */}
      {activeSubTab === 'em_execucao' && (
        <div className="space-y-4">
          {activeExperiments.length > 0 ? (
            activeExperiments.map((exp) => (
              <Card key={exp.id} className="bg-card/70 border-border/50 hover:border-emerald-500/30 transition-colors">
                <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">{exp.title || exp.name}</span>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                        Em Andamento
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground max-w-2xl">{exp.hypothesis}</p>
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-1">
                      <span><strong className="text-slate-300">Baseline inicial:</strong> {exp.baseline_value || 'Não informado'}</span>
                      <span><strong className="text-slate-300">Valor atual:</strong> <span className="text-emerald-400 font-medium">{exp.current_value || 'Em medição'}</span></span>
                      <span><strong className="text-slate-300">Meta:</strong> {exp.target_value || 'A definir'}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-500" /> Início: {exp.start_date}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 w-full sm:w-auto justify-end">
                    <Button
                      size="sm"
                      onClick={() => {
                        setConcludeModalExp(exp);
                        setConcludeFinalValue(String(exp.current_value || ''));
                        setConcludeImpact(exp.measured_financial_impact ? String(exp.measured_financial_impact) : '');
                        setConcludeDecision('manter');
                      }}
                      disabled={!isOwnerOrExecutive}
                      title={!isOwnerOrExecutive ? 'Apenas o proprietário ou administrador pode concluir experimentos' : 'Concluir e avaliar experimento'}
                      className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold gap-1 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Concluir / Avaliar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCancelExperiment(exp)}
                      disabled={!isOwnerOrExecutive}
                      title={!isOwnerOrExecutive ? 'Apenas o proprietário ou administrador pode interromper experimentos' : 'Interromper experimento'}
                      className="h-8 text-xs text-red-400 hover:bg-red-950/20 disabled:opacity-50"
                    >
                      Interromper
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border/50 rounded-xl">
              Nenhum experimento em execução no momento. Inicie um experimento aprovado na aba &quot;Experimentos&quot;.
            </div>
          )}
        </div>
      )}

      {/* Sub-Aba 4: Experimentos Concluídos / Encerrados */}
      {activeSubTab === 'concluidas' && (
        <div className="space-y-4">
          {finishedExperiments.length > 0 ? (
            finishedExperiments.map((exp) => {
              const isCancelled = exp.status === 'cancelado' || exp.status === 'cancelled';
              const badgeVariant =
                exp.decision === 'ampliar' || exp.decision === 'manter'
                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/20'
                  : exp.decision === 'ajustar'
                  ? 'border-amber-500/40 text-amber-400 bg-amber-950/20'
                  : 'border-red-500/40 text-red-400 bg-red-950/20';

              return (
                <Card key={exp.id} className="bg-card/70 border-border/50">
                  <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">{exp.title || exp.name}</span>
                        <Badge variant="outline" className={`text-[10px] capitalize ${badgeVariant}`}>
                          {isCancelled ? 'Cancelado' : `Decisão: ${exp.decision || 'Concluído'}`}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground max-w-2xl">{exp.hypothesis}</p>
                      {exp.decision_rationale && (
                        <p className="text-xs text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800">
                          <strong>Justificativa da decisão:</strong> {exp.decision_rationale}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-1">
                        <span><strong className="text-slate-300">Baseline inicial:</strong> {exp.baseline_value || 'N/A'}</span>
                        <span><strong className="text-slate-300">Resultado final:</strong> {exp.current_value || 'Concluído'}</span>
                        <span><strong className="text-slate-300">Período:</strong> {exp.start_date} até {exp.end_date || 'N/D'}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0">
                      <div className="text-[10px] text-muted-foreground">Impacto financeiro apurado</div>
                      <div className="text-sm font-bold text-emerald-400 flex items-center justify-end gap-1">
                        <TrendingUp className="w-3.5 h-3.5" />
                        R$ {Number(exp.measured_financial_impact || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border/50 rounded-xl">
              Nenhum experimento concluído registrado até o momento.
            </div>
          )}
        </div>
      )}

      {/* Modal 1: Detalhes do Plano da Oportunidade -> Planejar Experimento */}
      {selectedOpp && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <Card className="w-full max-w-lg bg-slate-900 border-border shadow-xl animate-in fade-in-50 max-h-[90vh] flex flex-col overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 shrink-0">
              <CardTitle className="text-xs sm:text-sm font-bold text-foreground truncate pr-2">
                Plano de Ação: {selectedOpp.title}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedOpp(null)}
                className="h-7 w-7 p-0 shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div>
                <span className="font-semibold text-slate-300">Hipótese Comercial:</span>
                <p className="text-slate-400 mt-1">{selectedOpp.hypothesis || selectedOpp.description || selectedOpp.problem_description}</p>
              </div>

              <div>
                <span className="font-semibold text-slate-300">Ação Recomendada pelo CEO:</span>
                <p className="text-slate-400 mt-1">{selectedOpp.recommended_action || 'Revisar preços e lançar promoção no PDV/Delivery.'}</p>
              </div>

              {selectedOpp.calculation_limitations && (
                <div className="bg-amber-950/20 border border-amber-500/30 p-2.5 rounded-lg text-amber-300 text-[11px]">
                  <strong>Limitações de cálculo:</strong> {selectedOpp.calculation_limitations}
                </div>
              )}

              <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                <div className="text-[10px] text-muted-foreground uppercase">Impacto Financeiro Estimado</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">
                  {selectedOpp.estimated_financial_impact
                    ? `+R$ ${selectedOpp.estimated_financial_impact.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês`
                    : 'A calcular'}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedOpp(null)}
                >
                  Fechar
                </Button>
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                  onClick={() => handleCreateExperiment(selectedOpp)}
                >
                  Planejar Experimento
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal 2: Iniciar Execução com Baseline Real */}
      {startModalExp && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <Card className="w-full max-w-md bg-slate-900 border-border shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-bold text-foreground">
                Iniciar Execução do Experimento
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStartModalExp(null)}
                className="h-7 w-7 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-xs">
              <div>
                <span className="font-semibold text-slate-300">Experimento:</span>
                <p className="text-slate-400 mt-0.5">{startModalExp.title || startModalExp.name}</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">
                  Baseline Inicial (Métrica atual antes do experimento):
                </label>
                <Input
                  value={startBaselineInput}
                  onChange={(e) => setStartBaselineInput(e.target.value)}
                  placeholder="Ex: R$ 25,50 ticket médio / 12 un/dia"
                  className="h-9 text-xs bg-slate-950 border-slate-800"
                />
                <span className="text-[10px] text-muted-foreground">
                  O valor de partida permite medir com precisão o impacto líquido posterior.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
                <Button variant="outline" size="sm" onClick={() => setStartModalExp(null)}>
                  Voltar
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  onClick={handleConfirmStart}
                >
                  Confirmar Início
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal 3: Concluir Experimento com Avaliação Executiva */}
      {concludeModalExp && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <Card className="w-full max-w-md bg-slate-900 border-border shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-bold text-foreground">
                Concluir e Avaliar Experimento
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConcludeModalExp(null)}
                className="h-7 w-7 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-xs">
              <div>
                <span className="font-semibold text-slate-300">Experimento:</span>
                <p className="text-slate-400 mt-0.5">{concludeModalExp.title || concludeModalExp.name}</p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Decisão Executiva:</label>
                <select
                  value={concludeDecision}
                  onChange={(e) => setConcludeDecision(e.target.value as ExperimentDecision)}
                  className="w-full h-9 rounded-md bg-slate-950 border border-slate-800 text-xs px-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="manter">Manter (Aprovado na rotina operacional)</option>
                  <option value="ampliar">Ampliar (Escalar para outros horários/lojas)</option>
                  <option value="ajustar">Ajustar (Requer recalibração de preços/combos)</option>
                  <option value="interromper">Interromper (Não atingiu resultado esperado)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Resultado Final Observado:</label>
                <Input
                  value={concludeFinalValue}
                  onChange={(e) => setConcludeFinalValue(e.target.value)}
                  placeholder="Ex: R$ 31,20 ticket médio (+22%)"
                  className="h-9 text-xs bg-slate-950 border-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Impacto Financeiro Medido (R$):</label>
                <Input
                  value={concludeImpact}
                  onChange={(e) => setConcludeImpact(e.target.value)}
                  placeholder="Ex: 1450.00"
                  type="number"
                  step="0.01"
                  className="h-9 text-xs bg-slate-950 border-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Justificativa da Decisão:</label>
                <Input
                  value={concludeRationale}
                  onChange={(e) => setConcludeRationale(e.target.value)}
                  placeholder="Ex: Oferta casada aumentou vendas do salgado matinal sem canibalização."
                  className="h-9 text-xs bg-slate-950 border-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
                <Button variant="outline" size="sm" onClick={() => setConcludeModalExp(null)}>
                  Voltar
                </Button>
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                  onClick={handleConfirmConclude}
                >
                  Salvar Conclusão
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
