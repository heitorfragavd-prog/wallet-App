import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/shared/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  FlaskConical,
  Sparkles,
  BarChart3,
  Layers,
  Crown,
  PieChart as PieChartIcon,
  ShoppingCart,
} from 'lucide-react';
import {
  calculateEffectiveWeightedCMV,
  detectCommercialGrowthOpportunities,
  detectLossAndWasteOpportunities,
  buildCeoDepartmentSummaries,
} from '@/domains/ceo/growth-engine';
import {
  GrowthOpportunity,
  CommercialExperiment,
  OperationalLossEvent,
  ProductSalesCMVRecord,
} from '@/domains/ceo/types';
import { GrowthExperimentCard } from '@/domains/ceo/components/GrowthExperimentCard';
import { CeoOverviewTab } from '@/domains/ceo/components/CeoOverviewTab';
import { CeoCommercialAnalysisTab } from '@/domains/ceo/components/CeoCommercialAnalysisTab';
import { CeoExpenseAnalysisTab } from '@/domains/ceo/components/CeoExpenseAnalysisTab';
import { CeoOpportunitiesTab } from '@/domains/ceo/components/CeoOpportunitiesTab';
import {
  CeoFinancialMetricsService,
  CeoExecutiveKpis,
} from '@/domains/ceo/services/CeoFinancialMetricsService';
import { useToast } from '@/shared/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useFoodCost } from '@/domains/finance/hooks/useFoodCost';
import { useEyemobileDashboard } from '@/domains/eyemobile/hooks/useEyemobileDashboard';
import { CeoRepository } from '@/domains/ceo/services/CeoRepository';

export const WalletCeoPage: React.FC = () => {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? '';

  const [activeMainTab, setActiveMainTab] = useState('overview');
  const [activeAnalysisSubTab, setActiveAnalysisSubTab] = useState<'comercial' | 'despesas'>('comercial');

  // KPIs executivos consolidados para a Visão Geral
  const [executiveKpis, setExecutiveKpis] = useState<CeoExecutiveKpis>(() =>
    CeoFinancialMetricsService.getEmptyKpis()
  );

  // 1. Conexão real com Fichas Técnicas e Custos (Cardápio / Food Cost)
  const { produtos: produtosFoodCost } = useFoodCost();

  // 2. Conexão real com Eyemobile PDV (mês atual)
  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);

  const { data: eyemobileData } = useEyemobileDashboard({
    startDate: inicioMes,
    endDate: hojeStr,
  });

  // 3. Persistência real de Oportunidades e Experimentos via CeoRepository
  const [persistedOpportunities, setPersistedOpportunities] = useState<GrowthOpportunity[]>([]);
  const [experiments, setExperiments] = useState<CommercialExperiment[]>([]);

  const loadExecutiveData = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const kpis = await CeoFinancialMetricsService.getExecutiveKpis(workspaceId);
      setExecutiveKpis(kpis);
    } catch (err) {
      console.warn('[WalletCeoPage] Erro ao carregar KPIs executivos:', err);
    }
  }, [workspaceId]);

  const loadRepositoryData = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [oppsRes, expsRes] = await Promise.all([
        CeoRepository.listOpportunities(workspaceId),
        CeoRepository.listExperiments(workspaceId),
      ]);
      if (oppsRes.data) setPersistedOpportunities(oppsRes.data);
      if (expsRes.data) setExperiments(expsRes.data);
    } catch (err) {
      console.error('Erro ao carregar dados do CEO Repository:', err);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadExecutiveData();
    loadRepositoryData();
  }, [loadExecutiveData, loadRepositoryData]);

  // 4. Cruzamento dos produtos vendidos (Eyemobile) com as Fichas Técnicas (Food Cost)
  const { allSalesRecords, mappedSalesRecords } = useMemo(() => {
    const topProducts = eyemobileData?.topProducts;
    if (!topProducts || topProducts.length === 0) {
      return {
        allSalesRecords: [] as ProductSalesCMVRecord[],
        mappedSalesRecords: [] as ProductSalesCMVRecord[],
        unmappedProductsCount: 0,
        recipeCoveragePercent: 0,
        topProductsCount: 0,
      };
    }

    let unmapped = 0;
    let totalRevenueAll = 0;
    let totalRevenueMapped = 0;

    const allRecords: ProductSalesCMVRecord[] = [];
    const mappedRecords: ProductSalesCMVRecord[] = [];

    topProducts.forEach((tp) => {
      const matched = produtosFoodCost.find(
        (p) =>
          (p.id && tp.id && p.id === tp.id) ||
          (p.nome && tp.product && p.nome.trim().toLowerCase() === tp.product.trim().toLowerCase())
      );

      const hasRecipe = Boolean(matched && matched.qtd_insumos > 0 && matched.custo_total > 0);
      const unitPrice = tp.quantity > 0 ? tp.total / tp.quantity : 0;
      const unitCost = hasRecipe ? (matched?.custo_total ?? 0) : 0;
      const itemRevenue = tp.total || tp.quantity * unitPrice;

      totalRevenueAll += itemRevenue;

      const record: ProductSalesCMVRecord = {
        product_id: tp.id,
        product_name: tp.product,
        quantity_sold: tp.quantity,
        unit_price: Math.round(unitPrice * 100) / 100,
        unit_cost: Math.round(unitCost * 100) / 100,
        category: 'Geral',
      };

      allRecords.push(record);

      if (hasRecipe) {
        totalRevenueMapped += itemRevenue;
        mappedRecords.push(record);
      } else {
        unmapped++;
      }
    });

    const coverage = totalRevenueAll > 0 ? Math.round((totalRevenueMapped / totalRevenueAll) * 100) : 0;

    return {
      allSalesRecords: allRecords,
      mappedSalesRecords: mappedRecords,
      unmappedProductsCount: unmapped,
      recipeCoveragePercent: coverage,
      topProductsCount: topProducts.length,
    };
  }, [eyemobileData?.topProducts, produtosFoodCost]);

  const salesRecords = allSalesRecords;
  const lossEvents: OperationalLossEvent[] = useMemo(() => [], []);

  // 5. Motor analítico do CEO operando sobre dados reais
  const cmvMetrics = useMemo(
    () =>
      calculateEffectiveWeightedCMV(
        mappedSalesRecords.length > 0 ? mappedSalesRecords : allSalesRecords,
        allSalesRecords.reduce((acc, r) => acc + r.quantity_sold * r.unit_price, 0)
      ),
    [mappedSalesRecords, allSalesRecords]
  );

  const dynamicOpportunities = useMemo(() => {
    const opps: GrowthOpportunity[] = [];
    if (salesRecords.length > 0) {
      opps.push(...detectCommercialGrowthOpportunities(salesRecords));
    }
    if (lossEvents.length > 0) {
      opps.push(...detectLossAndWasteOpportunities(lossEvents));
    }
    return opps;
  }, [salesRecords, lossEvents]);

  const allOpportunities = useMemo(() => {
    const seenTitles = new Set<string>();
    const combined: GrowthOpportunity[] = [];

    for (const opp of persistedOpportunities) {
      if (!seenTitles.has(opp.title)) {
        seenTitles.add(opp.title);
        combined.push(opp);
      }
    }

    for (const opp of dynamicOpportunities) {
      if (!seenTitles.has(opp.title)) {
        seenTitles.add(opp.title);
        combined.push(opp);
      }
    }

    return combined;
  }, [persistedOpportunities, dynamicOpportunities]);

  const departmentSummaries = useMemo(
    () =>
      buildCeoDepartmentSummaries(cmvMetrics, allOpportunities, experiments, lossEvents, {
        realRevenue: executiveKpis.faturamentoMes > 0 ? executiveKpis.faturamentoMes : undefined,
        realExpenses: executiveKpis.despesasMes > 0 ? executiveKpis.despesasMes : undefined,
        deliveryChannelsConfigured: true,
      }),
    [cmvMetrics, allOpportunities, experiments, lossEvents, executiveKpis]
  );

  const handleUpdateExperimentStatus = async (
    expId: string,
    status: CommercialExperiment['status'],
    decisionRationale?: string
  ) => {
    const previousExperiments = experiments;

    setExperiments((prev) =>
      prev.map((e) =>
        e.id === expId
          ? { ...e, status, decision_rationale: decisionRationale, updated_at: new Date().toISOString() }
          : e
      )
    );

    const res = await CeoRepository.updateExperimentStatus(expId, status, {
      rationale: decisionRationale,
    });

    if (!res.success) {
      setExperiments(previousExperiments);
      toast({
        title: 'Erro ao Atualizar Experimento',
        description: res.error || 'Não foi possível salvar o status no servidor.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Status do Experimento Atualizado',
      description: `O experimento foi alterado para ${status}.`,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Cabeçalho Oficial Wallet CEO 2.0 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-amber-500/10 text-amber-400">
                <Crown className="h-6 w-6" />
              </span>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Wallet CEO
              </h1>
            </div>
            <div className="text-xs font-semibold text-muted-foreground">
              Seu Diretor Executivo Digital
            </div>
            <p className="text-xs text-muted-foreground">
              Análises reais, recomendações práticas e um plano de crescimento para a Rodo Point.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Pill com animação */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Dados atualizados há 5 min</span>
            </div>
          </div>
        </div>

        {/* Abas Principais: Visão Geral, Análises, Oportunidades, Experimentos, Departamentos */}
        <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="space-y-6">
          <TabsList className="bg-muted/40 p-1 border border-border/40 rounded-lg">
            <TabsTrigger value="overview" className="text-xs font-semibold gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="analyses" className="text-xs font-semibold gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
              Análises
            </TabsTrigger>
            <TabsTrigger value="opportunities" className="text-xs font-semibold gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Oportunidades
            </TabsTrigger>
            <TabsTrigger value="experiments" className="text-xs font-semibold gap-1.5">
              <FlaskConical className="w-3.5 h-3.5 text-emerald-400" />
              Experimentos ({experiments.length})
            </TabsTrigger>
            <TabsTrigger value="departments" className="text-xs font-semibold gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              Departamentos
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: Visão Geral (Painel 1) */}
          <TabsContent value="overview" className="space-y-6 focus-visible:outline-none">
            <CeoOverviewTab
              workspaceId={workspaceId}
              kpis={executiveKpis}
              onNavigateToPlan={() => setActiveMainTab('opportunities')}
            />
          </TabsContent>

          {/* ABA 2: Análises (Painéis 2 e 3) */}
          <TabsContent value="analyses" className="space-y-6 focus-visible:outline-none">
            {/* Sub-navegação entre Comercial (Painel 2) e Despesas (Painel 3) */}
            <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg border border-border/40 w-fit">
              <button
                onClick={() => setActiveAnalysisSubTab('comercial')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeAnalysisSubTab === 'comercial'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Vendas e Produtos (Comercial)
              </button>
              <button
                onClick={() => setActiveAnalysisSubTab('despesas')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  activeAnalysisSubTab === 'despesas'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5" />
                Análise de Despesas
              </button>
            </div>

            {activeAnalysisSubTab === 'comercial' ? (
              <CeoCommercialAnalysisTab workspaceId={workspaceId} />
            ) : (
              <CeoExpenseAnalysisTab workspaceId={workspaceId} />
            )}
          </TabsContent>

          {/* ABA 3: Oportunidades & Plano de Crescimento (Painel 4) */}
          <TabsContent value="opportunities" className="space-y-6 focus-visible:outline-none">
            <CeoOpportunitiesTab
              workspaceId={workspaceId}
              experiments={experiments}
              onExperimentCreated={loadRepositoryData}
            />
          </TabsContent>

          {/* ABA 4: Laboratório de Experimentos */}
          <TabsContent value="experiments" className="space-y-4 focus-visible:outline-none">
            <div className="flex items-center justify-between p-4 rounded-xl bg-card/70 border border-border/50">
              <div>
                <h3 className="font-bold text-sm text-foreground">Laboratório de Inovação Comercial</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Valide novas estratégias comerciais com metodologia científica, baseline comprovado e ROI auditável.
                </p>
              </div>
            </div>

            {experiments.length === 0 ? (
              <Card className="border-border/50 bg-card/70 text-center p-8">
                <FlaskConical className="h-10 w-10 mx-auto mb-3 text-muted-foreground/60" />
                <p className="text-sm font-semibold text-foreground">Nenhum experimento ativo no momento.</p>
                <p className="text-xs mt-1 text-muted-foreground">
                  Navegue até a aba &ldquo;Oportunidades&rdquo; e clique em &ldquo;Criar Experimento&rdquo; para iniciar um novo teste.
                </p>
                <Button
                  size="sm"
                  onClick={() => setActiveMainTab('opportunities')}
                  className="mt-4 bg-orange-500 hover:bg-orange-600 text-white text-xs"
                >
                  Ver Oportunidades
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {experiments.map((exp) => (
                  <GrowthExperimentCard
                    key={exp.id}
                    experiment={exp}
                    onUpdateStatus={handleUpdateExperimentStatus}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ABA 5: Os 7 Departamentos do CEO */}
          <TabsContent value="departments" className="space-y-4 focus-visible:outline-none">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {departmentSummaries.map((dept) => (
                <Card key={dept.department} className="border-border/50 bg-card/70 shadow-sm">
                  <CardHeader className="p-4 pb-2 border-b border-border/40 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold text-foreground">{dept.title}</CardTitle>
                      <Badge
                        variant="outline"
                        className={
                          dept.status === 'optimal'
                            ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold'
                            : dept.status === 'attention'
                            ? 'text-amber-400 border-amber-500/30 bg-amber-500/10 text-xs font-semibold'
                            : 'text-red-400 border-red-500/30 bg-red-500/10 text-xs font-semibold'
                        }
                      >
                        {dept.status === 'optimal'
                          ? 'Saudável'
                          : dept.status === 'attention'
                          ? 'Atenção'
                          : 'Ação Necessária'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-2">
                      {dept.metrics.map((m, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0"
                        >
                          <span className="text-muted-foreground">{m.label}:</span>
                          <span className="font-bold text-foreground">{m.value}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-1">
                      <span className="text-[11px] font-semibold text-amber-400 block mb-1">
                        Diretiva Recomendada:
                      </span>
                      <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                        {dept.recommendations.map((rec, rIdx) => (
                          <li key={rIdx}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default WalletCeoPage;
