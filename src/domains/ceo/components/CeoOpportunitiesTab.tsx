import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Rocket,
  Tag,
  Users,
  AlertCircle,
  ChevronRight,
  X,
} from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { CeoRepository } from '@/domains/ceo/services/CeoRepository';
import { CommercialExperiment, GrowthOpportunity } from '@/domains/ceo/types';
import { CeoExecutiveKpis, CeoFinancialMetricsService } from '@/domains/ceo/services/CeoFinancialMetricsService';
import { CeoIntelligenceEngine } from '@/domains/ceo/services/CeoIntelligenceEngine';

interface CeoOpportunitiesTabProps {
  workspaceId: string;
  experiments: CommercialExperiment[];
  kpis?: CeoExecutiveKpis;
  onExperimentCreated?: () => void;
}

export const CeoOpportunitiesTab: React.FC<CeoOpportunitiesTabProps> = ({
  workspaceId,
  experiments,
  kpis,
  onExperimentCreated,
}) => {
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'oportunidades' | 'experimentos' | 'em_execucao' | 'concluidas'>('oportunidades');
  const [opportunities, setOpportunities] = useState<GrowthOpportunity[]>([]);
  const [selectedOpp, setSelectedOpp] = useState<GrowthOpportunity | null>(null);

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
      title: opp.title,
      hypothesis: opp.hypothesis || opp.description,
      department: opp.department,
      target_kpi: 'Faturamento Incremental / Margem',
      baseline_value: '0',
      current_value: 'Em andamento',
      target_value: opp.estimated_financial_impact ? `+R$ ${opp.estimated_financial_impact.toFixed(2)}/mês` : 'Meta a definir',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status: 'active',
      actions: [opp.recommended_action || 'Executar plano de ação recomendado pelo CEO'],
    });

    if (res) {
      toast({
        title: 'Experimento Comercial Criado!',
        description: `O experimento "${opp.title}" foi registrado no Laboratório de Crescimento.`,
      });
      if (onExperimentCreated) {
        onExperimentCreated();
      }
      setSelectedOpp(null);
      setActiveSubTab('em_execucao');
    } else {
      toast({
        title: 'Erro ao criar experimento',
        description: 'Não foi possível persistir o experimento no banco de dados.',
        variant: 'destructive',
      });
    }
  };

  const activeExperiments = experiments.filter((e) => e.status === 'active');

  // Ícones dinâmicos para cards de oportunidade
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
            Insights de crescimento com impacto estimado e plano de execução.
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
              className={`h-10 sm:h-8 px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center text-center ${
                activeSubTab === 'experimentos'
                  ? 'bg-orange-500 text-white font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-slate-800/60'
              }`}
            >
              Experimentos
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
              className={`h-10 sm:h-8 px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center text-center ${
                activeSubTab === 'concluidas'
                  ? 'bg-orange-500 text-white font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-slate-800/60'
              }`}
            >
              Concluídas
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo da Sub-Aba: Oportunidades */}
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
                            opp.priority === 'high'
                              ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/20'
                              : 'border-amber-500/40 text-amber-400 bg-amber-950/20'
                          }`}
                        >
                          {opp.priority === 'high' ? 'Alta Prioridade' : 'Média Prioridade'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground max-w-xl">
                        {opp.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0">
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">Impacto estimado</div>
                      <div className="text-sm font-bold text-emerald-400">
                        {opp.estimated_financial_impact
                          ? `+R$ ${opp.estimated_financial_impact.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês`
                          : 'A estimar'}
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

      {/* Conteúdo da Sub-Aba: Em Execução */}
      {activeSubTab === 'em_execucao' && (
        <div className="space-y-4">
          {activeExperiments.length > 0 ? (
            activeExperiments.map((exp) => (
              <Card key={exp.id} className="bg-card/70 border-border/50">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{exp.title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{exp.hypothesis}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                      <span>Meta: {exp.target_value}</span>
                      <span>Início: {exp.start_date}</span>
                    </div>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Ativo
                  </Badge>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Nenhum experimento ativo no momento. Clique em &quot;Ver Plano&quot; em uma oportunidade para iniciar.
            </div>
          )}
        </div>
      )}

      {/* Modal / Dialog de Detalhes do Plano */}
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
                <p className="text-slate-400 mt-1">{selectedOpp.hypothesis || selectedOpp.description}</p>
              </div>

              <div>
                <span className="font-semibold text-slate-300">Ação Recomendada pelo CEO:</span>
                <p className="text-slate-400 mt-1">{selectedOpp.recommended_action || 'Revisar preços e lançar promoção no PDV/Delivery.'}</p>
              </div>

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
                  Iniciar Experimento
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
