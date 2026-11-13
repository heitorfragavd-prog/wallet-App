/**
 * CeoGoalsTab.tsx
 *
 * Interface executiva de Metas e Desempenho do Wallet CEO (Etapa 09 - Gate 4).
 * Apresenta metas semanais e mensais em destaque com cálculo de ritmo (pacing),
 * projeções inteligentes, comparativo com períodos anteriores, filtros,
 * modais de criação/edição com sugestões automáticas e auditoria executiva.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Target,
  TrendingUp,
  Calendar,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Plus,
  Pause,
  Play,
  Trash2,
  History,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
} from 'lucide-react';
import {
  BusinessGoal,
  BusinessGoalCalculationResult,
  BusinessGoalIndicator,
  BusinessGoalPeriodType,
  BusinessGoalUnit,
} from '../types';
import { CeoGoalsRepository } from '../services/CeoGoalsRepository';
import {
  calculateGoalPacing,
  calculateDayOfWeekWeights,
} from '../services/CeoGoalsEngine';
import {
  CeoExecutiveKpis,
  getSaoPauloDateString,
  getSaoPauloParts,
} from '../services/CeoFinancialMetricsService';
import { useAuth } from '@/domains/auth/hooks/useAuth';
import { useProfile } from '@/domains/auth/hooks/useProfile';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/shared/hooks/use-toast';

interface CeoGoalsTabProps {
  workspaceId: string;
  kpis: CeoExecutiveKpis;
}

export const CeoGoalsTab: React.FC<CeoGoalsTabProps> = ({ workspaceId, kpis }) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { activeWorkspace, activeWorkspaceRole } = useWorkspace();
  const { toast } = useToast();

  const isOwnerOrAdmin = useMemo(() => {
    return (
      profile?.role === 'owner' ||
      profile?.role === 'admin' ||
      activeWorkspaceRole === 'owner' ||
      activeWorkspaceRole === 'admin' ||
      Boolean(user?.id && activeWorkspace?.owner_id && user.id === activeWorkspace.owner_id)
    );
  }, [profile?.role, activeWorkspaceRole, user?.id, activeWorkspace?.owner_id]);

  const [goals, setGoals] = useState<BusinessGoal[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filterPeriod, setFilterPeriod] = useState<string>('todas');
  const [filterIndicator, setFilterIndicator] = useState<string>('todos');
  const [filterStatus, setFilterStatus] = useState<string>('todas');

  // Modal de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<BusinessGoal | null>(null);

  // Form State
  const [formTitulo, setFormTitulo] = useState('');
  const [formIndicador, setFormIndicador] = useState<BusinessGoalIndicator>('faturamento');
  const [formPeriodoTipo, setFormPeriodoTipo] = useState<BusinessGoalPeriodType>('semanal');
  const [formDataInicio, setFormDataInicio] = useState('');
  const [formDataFim, setFormDataFim] = useState('');
  const [formValorAlvo, setFormValorAlvo] = useState('');
  const [formUnidade, setFormUnidade] = useState<BusinessGoalUnit>('monetario');
  const [formCategoria, setFormCategoria] = useState('');
  const [formObservacoes, setFormObservacoes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Modal de Auditoria e Histórico
  const [auditGoal, setAuditGoal] = useState<BusinessGoal | null>(null);

  // Pesos dos dias da semana baseados nos últimos 30 dias de vendas
  const dayOfWeekWeights = useMemo(() => {
    if (!kpis.dailySales30Days || kpis.dailySales30Days.length === 0) return null;
    return calculateDayOfWeekWeights(kpis.dailySales30Days);
  }, [kpis.dailySales30Days]);

  const loadGoals = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = await CeoGoalsRepository.listGoals(workspaceId);
      setGoals(data);
    } catch {
      toast({
        title: 'Erro ao carregar metas',
        description: 'Não foi possível carregar as metas empresariais.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  // Performance calculada para cada meta
  const calculatedGoals = useMemo(() => {
    const today = new Date();
    return goals.map((goal) => {
      const pacing = calculateGoalPacing({
        goal,
        referenceDate: today,
        dayOfWeekWeights,
      });
      return { goal, pacing };
    });
  }, [goals, dayOfWeekWeights]);

  // Metas em Destaque (Principal Semanal e Principal Mensal)
  const highlightedWeekly = useMemo(() => {
    return (
      calculatedGoals.find(
        (g) => g.goal.periodo_tipo === 'semanal' && g.goal.status === 'ativa'
      ) || null
    );
  }, [calculatedGoals]);

  const highlightedMonthly = useMemo(() => {
    return (
      calculatedGoals.find(
        (g) => g.goal.periodo_tipo === 'mensal' && g.goal.status === 'ativa'
      ) || null
    );
  }, [calculatedGoals]);

  // Metas filtradas para a lista/tabela
  const filteredGoals = useMemo(() => {
    return calculatedGoals.filter(({ goal }) => {
      if (filterPeriod !== 'todas' && goal.periodo_tipo !== filterPeriod) return false;
      if (filterIndicator !== 'todos' && goal.indicador !== filterIndicator) return false;
      if (filterStatus !== 'todas' && goal.status !== filterStatus) return false;
      return true;
    });
  }, [calculatedGoals, filterPeriod, filterIndicator, filterStatus]);

  // Pré-preenchimento padrão de datas para nova meta
  const setupDefaultDates = useCallback((periodType: BusinessGoalPeriodType) => {
    const parts = getSaoPauloParts(new Date());
    const noon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));

    if (periodType === 'semanal') {
      // Começa na segunda-feira da semana atual (0 = Domingo, 1 = Segunda)
      const dayOfWeek = noon.getUTCDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(noon.getTime() + diffToMonday * 86400000);
      const sunday = new Date(monday.getTime() + 6 * 86400000);
      setFormDataInicio(getSaoPauloDateString(monday));
      setFormDataFim(getSaoPauloDateString(sunday));
    } else {
      // Mês atual completo
      const mesPad = String(parts.month).padStart(2, '0');
      const diasNoMes = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
      setFormDataInicio(`${parts.year}-${mesPad}-01`);
      setFormDataFim(`${parts.year}-${mesPad}-${String(diasNoMes).padStart(2, '0')}`);
    }
  }, []);

  const handleOpenCreateModal = (periodType: BusinessGoalPeriodType = 'semanal') => {
    if (!isOwnerOrAdmin) {
      toast({
        title: 'Acesso Restrito',
        description: 'Apenas proprietários e administradores podem criar metas.',
        variant: 'destructive',
      });
      return;
    }
    setEditingGoal(null);
    setFormTitulo(periodType === 'semanal' ? 'Meta Semanal de Vendas' : 'Meta Mensal de Faturamento');
    setFormIndicador('faturamento');
    setFormPeriodoTipo(periodType);
    setFormUnidade('monetario');
    setFormValorAlvo('');
    setFormCategoria('');
    setFormObservacoes('');
    setupDefaultDates(periodType);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (goal: BusinessGoal) => {
    if (!isOwnerOrAdmin) {
      toast({
        title: 'Acesso Restrito',
        description: 'Apenas proprietários e administradores podem editar metas.',
        variant: 'destructive',
      });
      return;
    }
    setEditingGoal(goal);
    setFormTitulo(goal.titulo);
    setFormIndicador(goal.indicador);
    setFormPeriodoTipo(goal.periodo_tipo);
    setFormDataInicio(goal.data_inicio);
    setFormDataFim(goal.data_fim);
    setFormValorAlvo(String(goal.valor_alvo));
    setFormUnidade(goal.unidade);
    setFormCategoria(goal.categoria_ou_produto || '');
    setFormObservacoes(goal.observacoes || '');
    setIsModalOpen(true);
  };

  // Sugestão Inteligente baseada no histórico recente do CEO
  const suggestedTargets = useMemo(() => {
    let baseWeekly = 0;
    if (kpis.dailySales30Days && kpis.dailySales30Days.length > 0) {
      const sum = kpis.dailySales30Days.reduce((acc, d) => acc + (d.valor || 0), 0);
      baseWeekly = (sum / kpis.dailySales30Days.length) * 7;
    } else if (kpis.faturamentoOntem > 0) {
      baseWeekly = kpis.faturamentoOntem * 7;
    } else {
      baseWeekly = 25000;
    }

    const baseMonthly = kpis.faturamentoMesAnterior > 0 ? kpis.faturamentoMesAnterior : baseWeekly * 4.3;

    if (formPeriodoTipo === 'semanal') {
      return {
        base: Math.round(baseWeekly),
        conservadora: Math.round(baseWeekly * 1.05),
        arrojada: Math.round(baseWeekly * 1.10),
      };
    } else {
      return {
        base: Math.round(baseMonthly),
        conservadora: Math.round(baseMonthly * 1.05),
        arrojada: Math.round(baseMonthly * 1.10),
      };
    }
  }, [formPeriodoTipo, kpis]);

  const handleSaveGoal = async () => {
    if (!isOwnerOrAdmin) return;
    const alvoNum = parseFloat(formValorAlvo);
    if (isNaN(alvoNum) || alvoNum <= 0) {
      toast({
        title: 'Alvo Inválido',
        description: 'Informe um valor alvo numérico maior que zero.',
        variant: 'destructive',
      });
      return;
    }

    if (!formDataInicio || !formDataFim || formDataInicio > formDataFim) {
      toast({
        title: 'Datas Inválidas',
        description: 'A data final deve ser posterior ou igual à data inicial.',
        variant: 'destructive',
      });
      return;
    }

    // Proteção contra retroatividade arbitrária para novas metas
    const hojeStr = getSaoPauloDateString(new Date());
    if (!editingGoal && formDataFim < hojeStr) {
      toast({
        title: 'Período no Passado',
        description: 'Não é permitido criar metas retroativas para períodos já encerrados.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const [anoStr, mesStr] = formDataInicio.split('-');
      const ano = parseInt(anoStr, 10);
      const mes = parseInt(mesStr, 10);

      if (editingGoal) {
        await CeoGoalsRepository.updateGoal(
          editingGoal.id,
          {
            titulo: formTitulo,
            valor_alvo: alvoNum,
            unidade: formUnidade,
            categoria_ou_produto: formCategoria || null,
            observacoes: formObservacoes || null,
          },
          user?.id || 'admin'
        );
        toast({ title: 'Meta Atualizada', description: 'Meta empresarial atualizada com sucesso.' });
      } else {
        await CeoGoalsRepository.createGoal({
          workspace_id: workspaceId,
          created_by: user?.id || 'admin',
          titulo: formTitulo || 'Nova Meta Empresarial',
          indicador: formIndicador,
          periodo_tipo: formPeriodoTipo,
          data_inicio: formDataInicio,
          data_fim: formDataFim,
          ano,
          mes: formPeriodoTipo === 'mensal' ? mes : undefined,
          valor_alvo: alvoNum,
          valor_realizado: 0,
          unidade: formUnidade,
          categoria_ou_produto: formCategoria || undefined,
          observacoes: formObservacoes || undefined,
        });
        toast({ title: 'Meta Criada', description: 'Meta empresarial cadastrada com governança ativa.' });
      }

      setIsModalOpen(false);
      await loadGoals();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar meta.';
      toast({ title: 'Erro ao Salvar', description: msg, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePause = async (goal: BusinessGoal) => {
    if (!isOwnerOrAdmin) return;
    try {
      if (goal.status === 'pausada') {
        await CeoGoalsRepository.resumeGoal(goal.id, user?.id || 'admin');
        toast({ title: 'Meta Reativada', description: `A meta "${goal.titulo}" foi reativada.` });
      } else {
        await CeoGoalsRepository.pauseGoal(goal.id, user?.id || 'admin');
        toast({ title: 'Meta Pausada', description: `A meta "${goal.titulo}" foi colocada em pausa.` });
      }
      await loadGoals();
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível alterar o status da meta.', variant: 'destructive' });
    }
  };

  const handleDeleteGoal = async (goal: BusinessGoal) => {
    if (!isOwnerOrAdmin) return;
    if (!window.confirm(`Tem certeza que deseja excluir a meta "${goal.titulo}"?`)) return;
    try {
      await CeoGoalsRepository.deleteGoal(goal.id, user?.id || 'admin');
      toast({ title: 'Meta Excluída', description: 'A meta foi removida com sucesso.' });
      await loadGoals();
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível excluir a meta.', variant: 'destructive' });
    }
  };

  const renderPacingBadge = (status: BusinessGoalCalculationResult['status_ritmo']) => {
    switch (status) {
      case 'adiantado':
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 gap-1 font-semibold text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" /> Adiantado
          </Badge>
        );
      case 'no_ritmo':
        return (
          <Badge className="bg-sky-500/20 text-sky-400 border border-sky-500/30 gap-1 font-semibold text-xs">
            <TrendingUp className="w-3.5 h-3.5" /> No ritmo
          </Badge>
        );
      case 'em_atraso':
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 gap-1 font-semibold text-xs">
            <AlertTriangle className="w-3.5 h-3.5" /> Em atraso
          </Badge>
        );
      case 'critico':
        return (
          <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 gap-1 font-semibold text-xs">
            <AlertCircle className="w-3.5 h-3.5" /> Crítico
          </Badge>
        );
    }
  };

  const formatGoalValue = (val: number, unidade: BusinessGoalUnit) => {
    if (unidade === 'monetario') {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    }
    if (unidade === 'percentual') {
      return `${val.toFixed(1)}%`;
    }
    return new Intl.NumberFormat('pt-BR').format(val);
  };

  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card/70 border border-border/50 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <Target className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Metas & Desempenho Empresarial</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Gestão estratégica de metas semanais e mensais com projeções probabilísticas, ritmo (pacing) e governança por workspace.
          </p>
        </div>

        {isOwnerOrAdmin ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleOpenCreateModal('semanal')}
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs gap-1.5 shadow-sm font-semibold"
            >
              <Plus className="w-4 h-4" /> Nova Meta
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg border border-border/40">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Modo visualização (ações restritas a administradores)</span>
          </div>
        )}
      </div>

      {/* METAS EM DESTAQUE (CARD SEMANAL + CARD MENSAL) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* DESTAQUE 1: META SEMANAL */}
        <Card className="border-border/50 bg-card/80 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-500" />
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-orange-400" />
                <CardTitle className="text-sm font-bold text-foreground">Meta Semanal em Destaque</CardTitle>
              </div>
              {highlightedWeekly && renderPacingBadge(highlightedWeekly.pacing.status_ritmo)}
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            {highlightedWeekly ? (
              <>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium block">
                      {highlightedWeekly.goal.titulo} ({highlightedWeekly.goal.indicador.replace('_', ' ')})
                    </span>
                    <span className="text-2xl font-black text-foreground">
                      {formatGoalValue(highlightedWeekly.pacing.valor_realizado, highlightedWeekly.goal.unidade)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground font-medium block">Alvo Semanal</span>
                    <span className="text-sm font-bold text-muted-foreground">
                      {formatGoalValue(highlightedWeekly.pacing.valor_alvo, highlightedWeekly.goal.unidade)}
                    </span>
                  </div>
                </div>

                {/* BARRA DE PROGRESSO COM COR CONDICIONAL */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">
                      {highlightedWeekly.pacing.percentual_atingido.toFixed(1)}% atingido
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      Restam {highlightedWeekly.pacing.dias_restantes} {highlightedWeekly.pacing.dias_restantes === 1 ? 'dia' : 'dias'}
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-muted/60 overflow-hidden p-0.5 border border-border/40">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        highlightedWeekly.pacing.status_ritmo === 'adiantado'
                          ? 'bg-emerald-500'
                          : highlightedWeekly.pacing.status_ritmo === 'no_ritmo'
                          ? 'bg-sky-500'
                          : highlightedWeekly.pacing.status_ritmo === 'em_atraso'
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, highlightedWeekly.pacing.percentual_atingido))}%` }}
                    />
                  </div>
                </div>

                {/* MÉTRICAS SECUNDÁRIAS */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-muted/30 border border-border/30">
                    <span className="text-muted-foreground text-[11px] block">Média Diária Atual</span>
                    <span className="font-bold text-foreground">
                      {formatGoalValue(highlightedWeekly.pacing.media_diaria_atual, highlightedWeekly.goal.unidade)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/30 border border-border/30">
                    <span className="text-muted-foreground text-[11px] block">Necessária / Dia</span>
                    <span className="font-bold text-foreground">
                      {formatGoalValue(highlightedWeekly.pacing.media_diaria_necessaria, highlightedWeekly.goal.unidade)}
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-muted/30 border border-border/30">
                    <span className="text-muted-foreground text-[11px] block">Projeção Ajustada</span>
                    <span className="font-bold text-foreground">
                      {formatGoalValue(
                        highlightedWeekly.pacing.projecao_ajustada_dias_semana || highlightedWeekly.pacing.projecao_linear,
                        highlightedWeekly.goal.unidade
                      )}
                    </span>
                  </div>
                </div>

                {/* COMPARATIVO COM A SEMANA ANTERIOR */}
                {highlightedWeekly.pacing.comparativo_periodo_anterior && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/20 border border-border/30 text-xs">
                    <span className="text-muted-foreground">Vs. Semana Anterior:</span>
                    <span
                      className={`font-bold flex items-center gap-0.5 ${
                        (highlightedWeekly.pacing.comparativo_periodo_anterior.delta_percent ?? 0) >= 0
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      {(highlightedWeekly.pacing.comparativo_periodo_anterior.delta_percent ?? 0) >= 0 ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      {highlightedWeekly.pacing.comparativo_periodo_anterior.delta_percent !== null
                        ? `${highlightedWeekly.pacing.comparativo_periodo_anterior.delta_percent.toFixed(1)}%`
                        : 'N/A'}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 space-y-3">
                <Target className="w-8 h-8 mx-auto text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">Nenhuma meta semanal ativa para a semana corrente.</p>
                {isOwnerOrAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenCreateModal('semanal')}
                    className="text-xs gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Definir Meta Semanal
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* DESTAQUE 2: META MENSAL */}
        <Card className="border-border/50 bg-card/80 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                <CardTitle className="text-sm font-bold text-foreground">Meta Mensal em Destaque</CardTitle>
              </div>
              {highlightedMonthly && renderPacingBadge(highlightedMonthly.pacing.status_ritmo)}
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            {highlightedMonthly ? (
              <>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium block">
                      {highlightedMonthly.goal.titulo} ({highlightedMonthly.goal.indicador.replace('_', ' ')})
                    </span>
                    <span className="text-2xl font-black text-foreground">
                      {formatGoalValue(highlightedMonthly.pacing.valor_realizado, highlightedMonthly.goal.unidade)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground font-medium block">Alvo Mensal</span>
                    <span className="text-sm font-bold text-muted-foreground">
                      {formatGoalValue(highlightedMonthly.pacing.valor_alvo, highlightedMonthly.goal.unidade)}
                    </span>
                  </div>
                </div>

                {/* BARRA DE PROGRESSO */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">
                      {highlightedMonthly.pacing.percentual_atingido.toFixed(1)}% atingido
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      Restam {highlightedMonthly.pacing.dias_restantes} {highlightedMonthly.pacing.dias_restantes === 1 ? 'dia' : 'dias'}
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-muted/60 overflow-hidden p-0.5 border border-border/40">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        highlightedMonthly.pacing.status_ritmo === 'adiantado'
                          ? 'bg-emerald-500'
                          : highlightedMonthly.pacing.status_ritmo === 'no_ritmo'
                          ? 'bg-sky-500'
                          : highlightedMonthly.pacing.status_ritmo === 'em_atraso'
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, highlightedMonthly.pacing.percentual_atingido))}%` }}
                    />
                  </div>
                </div>

                {/* MÉTRICAS SECUNDÁRIAS */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-muted/30 border border-border/30">
                    <span className="text-muted-foreground text-[11px] block">Média Diária Atual</span>
                    <span className="font-bold text-foreground">
                      {formatGoalValue(highlightedMonthly.pacing.media_diaria_atual, highlightedMonthly.goal.unidade)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/30 border border-border/30">
                    <span className="text-muted-foreground text-[11px] block">Necessária / Dia</span>
                    <span className="font-bold text-foreground">
                      {formatGoalValue(highlightedMonthly.pacing.media_diaria_necessaria, highlightedMonthly.goal.unidade)}
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-muted/30 border border-border/30">
                    <span className="text-muted-foreground text-[11px] block">Projeção Linear</span>
                    <span className="font-bold text-foreground">
                      {formatGoalValue(highlightedMonthly.pacing.projecao_linear, highlightedMonthly.goal.unidade)}
                    </span>
                  </div>
                </div>

                {/* COMPARATIVO COM O MÊS ANTERIOR */}
                {highlightedMonthly.pacing.comparativo_periodo_anterior && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/20 border border-border/30 text-xs">
                    <span className="text-muted-foreground">Vs. Mês Anterior:</span>
                    <span
                      className={`font-bold flex items-center gap-0.5 ${
                        (highlightedMonthly.pacing.comparativo_periodo_anterior.delta_percent ?? 0) >= 0
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      {(highlightedMonthly.pacing.comparativo_periodo_anterior.delta_percent ?? 0) >= 0 ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      {highlightedMonthly.pacing.comparativo_periodo_anterior.delta_percent !== null
                        ? `${highlightedMonthly.pacing.comparativo_periodo_anterior.delta_percent.toFixed(1)}%`
                        : 'N/A'}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 space-y-3">
                <Target className="w-8 h-8 mx-auto text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">Nenhuma meta mensal ativa para este mês.</p>
                {isOwnerOrAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenCreateModal('mensal')}
                    className="text-xs gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Definir Meta Mensal
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-card/60 border border-border/40">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Periodicidade */}
          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="w-[140px] h-8 text-xs bg-background/50">
              <SelectValue placeholder="Periodicidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Freq.</SelectItem>
              <SelectItem value="semanal">Semanais</SelectItem>
              <SelectItem value="mensal">Mensais</SelectItem>
            </SelectContent>
          </Select>

          {/* Indicador */}
          <Select value={filterIndicator} onValueChange={setFilterIndicator}>
            <SelectTrigger className="w-[160px] h-8 text-xs bg-background/50">
              <SelectValue placeholder="Indicador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Indicadores</SelectItem>
              <SelectItem value="faturamento">Faturamento</SelectItem>
              <SelectItem value="pedidos">Pedidos</SelectItem>
              <SelectItem value="ticket_medio">Ticket Médio</SelectItem>
              <SelectItem value="despesas">Despesas</SelectItem>
              <SelectItem value="resultado_operacional">Resultado Operac.</SelectItem>
              <SelectItem value="margem">Margem (%)</SelectItem>
              <SelectItem value="produto_categoria">Produto / Categoria</SelectItem>
              <SelectItem value="combos">Combos</SelectItem>
            </SelectContent>
          </Select>

          {/* Status */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-background/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos os Status</SelectItem>
              <SelectItem value="ativa">Ativas</SelectItem>
              <SelectItem value="pausada">Pausadas</SelectItem>
              <SelectItem value="concluida">Concluídas</SelectItem>
              <SelectItem value="cancelada">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <span className="text-xs text-muted-foreground font-medium">
          {filteredGoals.length} {filteredGoals.length === 1 ? 'meta encontrada' : 'metas encontradas'}
        </span>
      </div>

      {/* LISTA / GRID DE TODAS AS METAS */}
      {loading ? (
        <div className="p-12 text-center text-xs text-muted-foreground">Carregando metas...</div>
      ) : filteredGoals.length === 0 ? (
        <Card className="p-8 text-center border-border/40 bg-card/40">
          <Target className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm font-semibold text-foreground">Nenhuma meta encontrada.</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ajuste os filtros acima ou defina uma nova meta empresarial.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGoals.map(({ goal, pacing }) => (
            <Card key={goal.id} className="border-border/50 bg-card/70 shadow-sm flex flex-col justify-between">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-orange-400 tracking-wider block">
                      {goal.periodo_tipo} • {goal.indicador.replace('_', ' ')}
                    </span>
                    <CardTitle className="text-sm font-bold text-foreground mt-0.5">{goal.titulo}</CardTitle>
                  </div>
                  {renderPacingBadge(pacing.status_ritmo)}
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-2 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-baseline justify-between text-xs py-1">
                    <span className="text-muted-foreground">Realizado:</span>
                    <span className="font-bold text-foreground">{formatGoalValue(pacing.valor_realizado, goal.unidade)}</span>
                  </div>
                  <div className="flex items-baseline justify-between text-xs py-1">
                    <span className="text-muted-foreground">Alvo:</span>
                    <span className="font-semibold text-muted-foreground">{formatGoalValue(pacing.valor_alvo, goal.unidade)}</span>
                  </div>

                  {/* Barra de progresso reduzida */}
                  <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden my-2 border border-border/30">
                    <div
                      className={`h-full rounded-full ${
                        pacing.status_ritmo === 'adiantado'
                          ? 'bg-emerald-500'
                          : pacing.status_ritmo === 'no_ritmo'
                          ? 'bg-sky-500'
                          : pacing.status_ritmo === 'em_atraso'
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, pacing.percentual_atingido))}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="bg-muted/20 p-1.5 rounded-lg border border-border/20">
                      <span className="text-muted-foreground block">Progresso</span>
                      <span className="font-bold text-foreground">{pacing.percentual_atingido.toFixed(1)}%</span>
                    </div>
                    <div className="bg-muted/20 p-1.5 rounded-lg border border-border/20">
                      <span className="text-muted-foreground block">Dias Restantes</span>
                      <span className="font-bold text-foreground">{pacing.dias_restantes} d</span>
                    </div>
                  </div>
                </div>

                {/* BOTÕES DE AÇÃO */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAuditGoal(goal)}
                    className="h-8 text-[11px] gap-1 text-muted-foreground hover:text-foreground px-2"
                  >
                    <History className="w-3.5 h-3.5" /> Auditoria
                  </Button>

                  {isOwnerOrAdmin && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTogglePause(goal)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        title={goal.status === 'pausada' ? 'Reativar' : 'Pausar'}
                      >
                        {goal.status === 'pausada' ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5" />}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditModal(goal)}
                        className="h-8 text-[11px] text-muted-foreground hover:text-foreground px-2"
                      >
                        Editar
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteGoal(goal)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Target className="w-5 h-5 text-orange-400" />
              {editingGoal ? 'Editar Meta Empresarial' : 'Nova Meta Empresarial'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* SUGESTÃO INTELIGENTE BASEADA NO HISTÓRICO RECENTE */}
            {!editingGoal && formIndicador === 'faturamento' && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-transparent border border-orange-500/20 space-y-2">
                <div className="flex items-center gap-1.5 text-orange-400 font-bold">
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>Sugestão Inteligente (Base Histórica Real)</span>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Sua média {formPeriodoTipo === 'semanal' ? 'semanal' : 'mensal'} é de cerca de{' '}
                  <span className="font-bold text-foreground">
                    {formatGoalValue(suggestedTargets.base, 'monetario')}
                  </span>
                  . Escolha uma sugestão calculada:
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setFormValorAlvo(String(suggestedTargets.conservadora))}
                    className="h-7 text-[11px] gap-1 bg-background/50 border-orange-500/30 text-orange-300 hover:bg-orange-500/20"
                  >
                    Conservadora (+5%): {formatGoalValue(suggestedTargets.conservadora, 'monetario')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setFormValorAlvo(String(suggestedTargets.arrojada))}
                    className="h-7 text-[11px] gap-1 bg-background/50 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
                  >
                    Arrojada (+10%): {formatGoalValue(suggestedTargets.arrojada, 'monetario')}
                  </Button>
                </div>
              </div>
            )}

            {/* Título */}
            <div className="space-y-1">
              <Label className="text-xs">Título da Meta</Label>
              <Input
                value={formTitulo}
                onChange={(e) => setFormTitulo(e.target.value)}
                placeholder="Ex: Meta Semanal de Vendas PDV"
                className="h-9 text-xs"
              />
            </div>

            {/* Indicador e Periodicidade */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Indicador</Label>
                <Select
                  value={formIndicador}
                  onValueChange={(val) => {
                    const ind = val as BusinessGoalIndicator;
                    setFormIndicador(ind);
                    if (ind === 'pedidos' || ind === 'combos') setFormUnidade('quantidade');
                    else if (ind === 'margem') setFormUnidade('percentual');
                    else setFormUnidade('monetario');
                  }}
                  disabled={Boolean(editingGoal)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="faturamento">Faturamento (R$)</SelectItem>
                    <SelectItem value="pedidos">Pedidos (Qtd)</SelectItem>
                    <SelectItem value="ticket_medio">Ticket Médio (R$)</SelectItem>
                    <SelectItem value="despesas">Despesas (R$)</SelectItem>
                    <SelectItem value="resultado_operacional">Resultado Operac. (R$)</SelectItem>
                    <SelectItem value="margem">Margem (%)</SelectItem>
                    <SelectItem value="produto_categoria">Produto / Categoria</SelectItem>
                    <SelectItem value="combos">Combos (Qtd)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Periodicidade</Label>
                <Select
                  value={formPeriodoTipo}
                  onValueChange={(val) => {
                    const pt = val as BusinessGoalPeriodType;
                    setFormPeriodoTipo(pt);
                    setupDefaultDates(pt);
                  }}
                  disabled={Boolean(editingGoal)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Data de Início</Label>
                <Input
                  type="date"
                  value={formDataInicio}
                  onChange={(e) => setFormDataInicio(e.target.value)}
                  disabled={Boolean(editingGoal)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data de Término</Label>
                <Input
                  type="date"
                  value={formDataFim}
                  onChange={(e) => setFormDataFim(e.target.value)}
                  disabled={Boolean(editingGoal)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Valor Alvo e Unidade */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Valor Alvo</Label>
                <Input
                  type="number"
                  step="any"
                  value={formValorAlvo}
                  onChange={(e) => setFormValorAlvo(e.target.value)}
                  placeholder="Ex: 50000"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Unidade</Label>
                <Select
                  value={formUnidade}
                  onValueChange={(val) => setFormUnidade(val as BusinessGoalUnit)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monetario">Monetário (R$)</SelectItem>
                    <SelectItem value="quantidade">Quantidade (un)</SelectItem>
                    <SelectItem value="percentual">Percentual (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Categoria / Produto (se aplicável) */}
            {formIndicador === 'produto_categoria' && (
              <div className="space-y-1">
                <Label className="text-xs">Nome da Categoria ou Produto</Label>
                <Input
                  value={formCategoria}
                  onChange={(e) => setFormCategoria(e.target.value)}
                  placeholder="Ex: Bebidas ou Combo Família"
                  className="h-9 text-xs"
                />
              </div>
            )}

            {/* Observações */}
            <div className="space-y-1">
              <Label className="text-xs">Observações / Diretivas Estratégicas</Label>
              <Input
                value={formObservacoes}
                onChange={(e) => setFormObservacoes(e.target.value)}
                placeholder="Ex: Ação focada em promoções no fim de semana."
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveGoal}
              disabled={isSaving}
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold"
            >
              {isSaving ? 'Salvando...' : editingGoal ? 'Salvar Alterações' : 'Criar Meta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE HISTÓRICO E AUDITORIA */}
      <Dialog open={Boolean(auditGoal)} onOpenChange={(open) => !open && setAuditGoal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <History className="w-5 h-5 text-orange-400" />
              Auditoria da Meta: {auditGoal?.titulo}
            </DialogTitle>
          </DialogHeader>

          {auditGoal && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 rounded-xl bg-muted/30 border border-border/40 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID do Registro:</span>
                  <span className="font-mono text-[11px] text-foreground">{auditGoal.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Criado por:</span>
                  <span className="font-mono text-[11px] text-foreground">{auditGoal.created_by}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Criado em:</span>
                  <span className="font-medium text-foreground">
                    {new Date(auditGoal.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Última atualização:</span>
                  <span className="font-medium text-foreground">
                    {new Date(auditGoal.updated_at).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-foreground mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  Trilha de Auditoria ({auditGoal.history.length} eventos)
                </h4>

                {auditGoal.history.length === 0 ? (
                  <p className="text-muted-foreground text-xs italic">Nenhum evento adicional registrado.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {auditGoal.history.map((entry, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-muted/20 border border-border/30 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold uppercase text-orange-400">{entry.action}</span>
                          <span className="text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          Responsável: <span className="font-mono text-foreground">{entry.user_id}</span>
                        </div>
                        {entry.details && Object.keys(entry.details).length > 0 && (
                          <pre className="text-[10px] bg-background/50 p-1.5 rounded font-mono text-muted-foreground overflow-x-auto">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAuditGoal(null)}
              className="text-xs"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
