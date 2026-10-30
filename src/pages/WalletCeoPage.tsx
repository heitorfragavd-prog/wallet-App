import React, { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/shared/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Badge } from '@/shared/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import {
  TrendingUp,
  Percent,
  AlertTriangle,
  FlaskConical,
  Sparkles,
  DollarSign,
  ShieldCheck,
  BarChart3,
  Info,
  Layers,
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
import { OpportunityCard } from '@/domains/ceo/components/OpportunityCard';
import { GrowthExperimentCard } from '@/domains/ceo/components/GrowthExperimentCard';
import { useToast } from '@/shared/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useFoodCost } from '@/domains/finance/hooks/useFoodCost';
import { useEyemobileDashboard } from '@/domains/eyemobile/hooks/useEyemobileDashboard';
import { CeoRepository } from '@/domains/ceo/services/CeoRepository';

export const WalletCeoPage: React.FC = () => {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? '';

  // 1. Conexão real com Fichas Técnicas e Custos (Cardápio / Food Cost)
  const { produtos: produtosFoodCost, summary: _foodCostSummary, loading: foodCostLoading } = useFoodCost();

  // 2. Conexão real com Eyemobile PDV (mês atual)
  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);

  const { data: eyemobileData, isLoading: eyemobileLoading } = useEyemobileDashboard({
    startDate: inicioMes,
    endDate: hojeStr,
  });

  // 3. Persistência real de Oportunidades e Experimentos via CeoRepository
  const [persistedOpportunities, setPersistedOpportunities] = useState<GrowthOpportunity[]>([]);
  const [experiments, setExperiments] = useState<CommercialExperiment[]>([]);
  const [isLoadingPersisted, setIsLoadingPersisted] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    let isMounted = true;
    setIsLoadingPersisted(true);

    Promise.all([
      CeoRepository.listOpportunities(workspaceId),
      CeoRepository.listExperiments(workspaceId),
    ])
      .then(([oppsRes, expsRes]) => {
        if (!isMounted) return;
        if (oppsRes.data) {
          setPersistedOpportunities(oppsRes.data);
        }
        if (expsRes.data) {
          setExperiments(expsRes.data);
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar dados do CEO Repository:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingPersisted(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  // 4. Cruzamento dos produtos vendidos (Eyemobile) com as Fichas Técnicas (Food Cost)
  // Gate G: Vinculação por ID canônico prioritário e cálculo de cobertura auditável de CMV
  const {
    allSalesRecords,
    mappedSalesRecords,
    unmappedProductsCount,
    recipeCoveragePercent,
    topProductsCount,
  } = useMemo(() => {
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
      // 1. Prioridade absoluta para ID canônico; 2. Nome exato padronizado
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

  // 5. Perdas e descartes materiais documentados
  const lossEvents: OperationalLossEvent[] = useMemo(() => {
    return [];
  }, []);

  // 6. Motor analítico do CEO operando sobre dados reais (Gate G: CMV Ponderado com Cobertura)
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

    // Prioriza persistidas
    for (const opp of persistedOpportunities) {
      if (!seenTitles.has(opp.title)) {
        seenTitles.add(opp.title);
        combined.push(opp);
      }
    }

    // Incorpora dinâmicas auditáveis
    for (const opp of dynamicOpportunities) {
      if (!seenTitles.has(opp.title)) {
        seenTitles.add(opp.title);
        combined.push(opp);
      }
    }

    return combined;
  }, [persistedOpportunities, dynamicOpportunities]);

  const departmentSummaries = useMemo(
    () => buildCeoDepartmentSummaries(cmvMetrics, allOpportunities, experiments, lossEvents),
    [cmvMetrics, allOpportunities, experiments, lossEvents]
  );

  // Gate F: Transformar oportunidade em experimento ativo com persistência no banco em primeiro lugar
  const handleActivateExperiment = async (opp: GrowthOpportunity) => {
    if (!workspaceId) {
      toast({
        title: 'Workspace não identificado',
        description: 'Selecione um workspace ativo para criar experimentos.',
        variant: 'destructive',
      });
      return;
    }

    // Chamada prévia ao repositório garantindo integridade e geração do UUID canônico
    const res = await CeoRepository.saveExperiment({
      workspace_id: workspaceId,
      opportunity_id: opp.id.startsWith('opp-') ? undefined : opp.id,
      title: `Experimento: ${opp.title}`,
      hypothesis: `Implementação de ${opp.title} para capturar retorno estimado de R$ ${opp.potential_monthly_gain.toFixed(2)}/mês.`,
      department: opp.department,
      target_kpi: 'Margem & Faturamento Incremental',
      baseline_value: '0',
      current_value: 'Em medição',
      target_value: `+R$ ${opp.potential_monthly_gain.toFixed(0)}`,
      start_date: new Date().toISOString().slice(0, 10),
      status: 'active',
      responsible_person: 'Gestão Rodo Point',
    });

    if (!res.success || !res.data) {
      toast({
        title: 'Erro ao Criar Experimento',
        description: res.error || 'Não foi possível gravar o experimento no banco de dados.',
        variant: 'destructive',
      });
      return;
    }

    // Atualiza estado do React exclusivamente com os dados persistidos e ID real do banco
    setExperiments((prev) => [res.data!, ...prev]);

    toast({
      title: 'Experimento Comercial Criado!',
      description: `"${opp.title}" foi registrado no Laboratório de Crescimento.`,
    });
  };

  const handleUpdateExperimentStatus = async (
    expId: string,
    status: CommercialExperiment['status'],
    decisionRationale?: string
  ) => {
    const previousExperiments = experiments;

    setExperiments((prev) =>
      prev.map((e) => (e.id === expId ? { ...e, status, decision_rationale: decisionRationale, updated_at: new Date().toISOString() } : e))
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

  const totalMonthlyGain = allOpportunities.reduce((acc, o) => acc + o.potential_monthly_gain, 0);
  const totalLossAmount = lossEvents.reduce((acc, l) => acc + l.cost_amount, 0);

  const hasSalesData = salesRecords.length > 0;
  const isDataLoading = eyemobileLoading || foodCostLoading || isLoadingPersisted;

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Cabeçalho da Diretoria Executiva Digital */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-md bg-primary/10 text-primary">
                <TrendingUp className="h-6 w-6" />
              </span>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Wallet CEO — Diretoria Digital Rodo Point
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Painel executivo inteligente para crescimento de vendas, gestão de CMV ponderado, combate a perdas e laboratório de inovação comercial.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 bg-primary/5 text-primary border-primary/20">
              <Sparkles className="h-3.5 w-3.5 mr-1 text-primary" />
              {allOpportunities.length} Oportunidades
            </Badge>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              <FlaskConical className="h-3.5 w-3.5 mr-1 text-emerald-600" />
              {experiments.filter((e) => e.status === 'active').length} Experimentos em Curso
            </Badge>
          </div>
        </div>

        {/* Alertas de Dados e Integridade */}
        {!hasSalesData && !isDataLoading && (
          <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-xs font-bold">Dados Operacionais Insuficientes no Período</AlertTitle>
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
              Não foram localizadas vendas sincronizadas no Eyemobile PDV para o mês atual. O motor analítico do CEO requer transações reais para ponderar o CMV por volume e projetar oportunidades com confiabilidade.
            </AlertDescription>
          </Alert>
        )}

        {hasSalesData && unmappedProductsCount > 0 && (
          <Alert className="border-blue-500/30 bg-blue-500/10 text-blue-950 dark:text-blue-200">
            <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-xs font-bold">
              Fichas Técnicas Pendentes ({unmappedProductsCount} de {topProductsCount} produtos)
            </AlertTitle>
            <AlertDescription className="text-xs text-blue-900 dark:text-blue-300">
              {recipeCoveragePercent}% da receita dos Top {topProductsCount} produtos analisados possui ficha de insumos calculada. Os itens sem ficha cadastrada foram excluídos da ponderação de custos para evitar diluição artificial do CMV real.
            </AlertDescription>
          </Alert>
        )}

        {/* 4 Indicadores Estratégicos Chave (Top KPI Banners) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Faturamento Mensal Efetivo */}
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-1">
              <span className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                Receita Analisada (Top {topProductsCount} Produtos)
                <DollarSign className="h-4 w-4 text-primary" />
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <span className="text-2xl font-black text-foreground">
                R$ {cmvMetrics.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                {hasSalesData ? `${cmvMetrics.items_analyzed} produtos com custo ponderado` : 'Aguardando dados de PDV'}
              </span>
            </CardContent>
          </Card>

          {/* CMV Médio Efetivo Ponderado (com indicador de saúde e cobertura) */}
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-1">
              <span className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                {cmvMetrics.is_partial_coverage
                  ? `CMV Ponderado Parcial (${cmvMetrics.coverage_percent}% Cobertura)`
                  : 'CMV Efetivo Ponderado'}
                <Percent className="h-4 w-4 text-emerald-600" />
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {cmvMetrics.effective_weighted_cmv_percent.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground font-semibold">
                  (Meta: &le; 38%)
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                {cmvMetrics.notes}
              </span>
            </CardContent>
          </Card>

          {/* Perdas e Desperdícios */}
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-1">
              <span className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                Perdas & Descartes (Mês)
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                R$ {totalLossAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                {lossEvents.length === 0 ? 'Nenhum descarte/perda registrado' : `${lossEvents.length} ocorrências registradas`}
              </span>
            </CardContent>
          </Card>

          {/* Ganho Potencial do Laboratório */}
          <Card className="border shadow-sm bg-primary/5 border-primary/20">
            <CardHeader className="p-4 pb-1">
              <span className="text-xs font-semibold text-primary flex items-center justify-between">
                Potencial de Crescimento
                <TrendingUp className="h-4 w-4 text-primary" />
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <span className="text-2xl font-black text-primary">
                + R$ {totalMonthlyGain.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                <span className="text-xs font-normal">/mês</span>
              </span>
              <span className="text-[11px] text-primary/80 font-medium block mt-0.5">
                {allOpportunities.length} alavancas identificadas
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Abas Estruturais da Diretoria Digital */}
        <Tabs defaultValue="departments" className="space-y-4">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="departments" className="text-xs font-bold">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Os 7 Departamentos do CEO
            </TabsTrigger>
            <TabsTrigger value="opportunities" className="text-xs font-bold">
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-primary" />
              Oportunidades ({allOpportunities.length})
            </TabsTrigger>
            <TabsTrigger value="experiments" className="text-xs font-bold">
              <FlaskConical className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
              Laboratório de Experimentos ({experiments.length})
            </TabsTrigger>
            <TabsTrigger value="losses" className="text-xs font-bold">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
              Controle Ético de Perdas
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: Os 7 Departamentos */}
          <TabsContent value="departments" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {departmentSummaries.map((dept) => (
                <Card key={dept.department} className="border shadow-sm">
                  <CardHeader className="p-4 pb-2 border-b bg-muted/20">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold">{dept.title}</CardTitle>
                      <Badge
                        variant="outline"
                        className={
                          dept.status === 'optimal'
                            ? 'text-emerald-600 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'
                            : dept.status === 'attention'
                            ? 'text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                            : 'text-red-600 border-red-400 bg-red-50 dark:bg-red-950/20'
                        }
                      >
                        {dept.status === 'optimal' ? 'Saudável' : dept.status === 'attention' ? 'Atenção' : 'Ação Necessária'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-2">
                      {dept.metrics.map((m, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                          <span className="text-muted-foreground">{m.label}:</span>
                          <span className="font-bold text-foreground">{m.value}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-1">
                      <span className="text-[11px] font-semibold text-primary block mb-1">
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

          {/* ABA 2: Oportunidades Detectadas */}
          <TabsContent value="opportunities" className="space-y-4">
            {allOpportunities.length === 0 ? (
              <div className="p-8 text-center border rounded-lg bg-card text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                <p className="text-sm font-semibold">Nenhuma oportunidade detectada no momento.</p>
                <p className="text-xs mt-1">Conecte o Eyemobile e cadastre fichas técnicas para gerar recomendações comerciais automáticas.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allOpportunities.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opportunity={opp}
                    onActivateExperiment={handleActivateExperiment}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ABA 3: Laboratório de Experimentos */}
          <TabsContent value="experiments" className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-card border">
              <div>
                <h3 className="font-bold text-sm">Laboratório de Crescimento Rodo Point</h3>
                <p className="text-xs text-muted-foreground">
                  Valide ideias com método científico: hipótese clara, baseline medido e acompanhamento semanal do ROI.
                </p>
              </div>
            </div>

            {experiments.length === 0 ? (
              <div className="p-8 text-center border rounded-lg bg-card text-muted-foreground">
                <FlaskConical className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                <p className="text-sm font-semibold">Nenhum experimento ativo no laboratório.</p>
                <p className="text-xs mt-1">Navegue até a aba Oportunidades e clique em &ldquo;Ativar Experimento&rdquo; para iniciar um teste científico.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          {/* ABA 4: Controle de Perdas & Rupturas */}
          <TabsContent value="losses" className="space-y-4">
            <Card className="border shadow-sm">
              <CardHeader className="p-4 pb-2 border-b">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">Diretriz Ética de Gestão de Perdas</CardTitle>
                    <CardDescription className="text-xs">
                      Classificação objetiva de quebras, descarte e vencimento baseada em evidências físicas, sem imputações prévias à equipe.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {lossEvents.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-emerald-600/70" />
                    <p className="text-sm font-semibold text-foreground">Nenhuma perda física ou quebra registrada no período.</p>
                    <p className="text-xs mt-1 max-w-md mx-auto text-muted-foreground">
                      O Wallet CEO segue o princípio inegociável de transparência: despesas operacionais só são classificadas como perda diante de fatos materiais comprovados (descarte de perecíveis vencidos, quebra de estoque ou sobra operacional).
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {lossEvents.map((evt) => (
                      <div key={evt.id} className="py-3 flex items-start justify-between gap-4 first:pt-0 last:pb-0">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs uppercase font-bold">
                              {evt.category.replace('_', ' ')}
                            </Badge>
                            {evt.product_name && (
                              <span className="font-semibold text-sm">{evt.product_name}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{evt.description}</p>
                          <span className="text-[11px] text-muted-foreground block">
                            Data do registro: {new Date(evt.occurred_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-extrabold text-red-600 dark:text-red-400">
                            - R$ {evt.cost_amount.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default WalletCeoPage;
