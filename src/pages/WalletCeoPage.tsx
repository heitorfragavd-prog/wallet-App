import React, { useState, useMemo } from 'react';
import { DashboardLayout } from '@/shared/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Badge } from '@/shared/components/ui/badge';
import {
  TrendingUp,
  Percent,
  AlertTriangle,
  FlaskConical,
  Sparkles,
  DollarSign,
  ShieldCheck,
  BarChart3,
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

export const WalletCeoPage: React.FC = () => {
  const { toast } = useToast();

  // Dados reais/demonstrativos da operação Rodo Point para inicialização do motor analítico
  const salesRecords: ProductSalesCMVRecord[] = useMemo(
    () => [
      {
        product_id: 'p-1',
        product_name: 'X-Tudo Especial Rodo Point',
        quantity_sold: 420,
        unit_price: 34.0,
        unit_cost: 11.2,
        category: 'Lanches',
      },
      {
        product_id: 'p-2',
        product_name: 'Prato Feito Bife a Cavalo',
        quantity_sold: 580,
        unit_price: 28.0,
        unit_cost: 9.8,
        category: 'Almoço Executivo',
      },
      {
        product_id: 'p-3',
        product_name: 'Refrigerante Lata 350ml',
        quantity_sold: 810,
        unit_price: 8.0,
        unit_cost: 2.8,
        category: 'Bebidas',
      },
      {
        product_id: 'p-4',
        product_name: 'Porção Batata Frita Rústica',
        quantity_sold: 310,
        unit_price: 22.0,
        unit_cost: 6.1,
        category: 'Porções',
      },
      {
        product_id: 'p-5',
        product_name: 'Suco Natural de Laranja 500ml',
        quantity_sold: 290,
        unit_price: 12.0,
        unit_cost: 3.2,
        category: 'Bebidas',
      },
    ],
    []
  );

  const lossEvents: OperationalLossEvent[] = useMemo(
    () => [
      {
        id: 'loss-1',
        category: 'vencimento',
        description: 'Vencimento de lote de laticínios (queijo prato fatiado)',
        cost_amount: 320.0,
        occurred_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        product_name: 'Queijo Prato Fatiado 2kg',
      },
      {
        id: 'loss-2',
        category: 'descarte',
        description: 'Sobra de óleo vegetal de fritura descartado no prazo de troca',
        cost_amount: 180.0,
        occurred_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      },
      {
        id: 'loss-3',
        category: 'ruptura',
        description: 'Ruptura de estoque de embalagens térmicas durante o almoço',
        cost_amount: 450.0,
        occurred_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      },
      {
        id: 'loss-4',
        category: 'divergencia_caixa',
        description: 'Divergência de conferência de troco no fechamento do caixa da tarde',
        cost_amount: 45.0,
        occurred_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    ],
    []
  );

  // Motor analítico do CEO
  const cmvMetrics = useMemo(() => calculateEffectiveWeightedCMV(salesRecords), [salesRecords]);

  const commercialOpportunities = useMemo(
    () => detectCommercialGrowthOpportunities(salesRecords),
    [salesRecords]
  );

  const lossOpportunities = useMemo(
    () => detectLossAndWasteOpportunities(lossEvents),
    [lossEvents]
  );

  const allOpportunities = useMemo(
    () => [...commercialOpportunities, ...lossOpportunities],
    [commercialOpportunities, lossOpportunities]
  );

  // Experimentos comerciais
  const [experiments, setExperiments] = useState<CommercialExperiment[]>([
    {
      id: 'exp-1',
      workspace_id: 'default',
      title: 'Combo Almoço Completo: PF + Bebida Gelada',
      hypothesis:
        'Oferecer o PF Bife a Cavalo + Coca por R$ 32,90 aumentará a taxa de conversão em 18% e o faturamento total em R$ 2.400/mês.',
      department: 'commercial_growth',
      target_kpi: 'Faturamento do Almoço',
      baseline_value: 'R$ 22.680',
      current_value: 'R$ 24.100',
      target_value: 'R$ 25.080',
      start_date: new Date(Date.now() - 10 * 86400000).toISOString(),
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'exp-2',
      workspace_id: 'default',
      title: 'Adequação de Markup de 25% no iFood',
      hypothesis:
        'Ajustar os preços do cardápio iFood com markup médio de 25% para compensar a taxa da plataforma preservará a margem do balcão sem queda no volume.',
      department: 'cmv_pricing',
      target_kpi: 'Margem Líquida Delivery',
      baseline_value: '19.4%',
      current_value: '29.8%',
      target_value: '33.0%',
      start_date: new Date(Date.now() - 5 * 86400000).toISOString(),
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const departmentSummaries = useMemo(
    () => buildCeoDepartmentSummaries(cmvMetrics, allOpportunities, experiments, lossEvents),
    [cmvMetrics, allOpportunities, experiments, lossEvents]
  );

  // Transformar oportunidade em experimento ativo
  const handleActivateExperiment = (opp: GrowthOpportunity) => {
    const newExp: CommercialExperiment = {
      id: `exp-${Date.now()}`,
      workspace_id: 'default',
      title: `Experimento: ${opp.title}`,
      hypothesis: `Implementação de ${opp.title} para capturar retorno estimado de R$ ${opp.potential_monthly_gain.toFixed(2)}/mês.`,
      department: opp.department,
      target_kpi: 'Margem & Faturamento Incremental',
      baseline_value: '0',
      current_value: 'Em medição',
      target_value: `+R$ ${opp.potential_monthly_gain.toFixed(0)}`,
      start_date: new Date().toISOString(),
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setExperiments((prev) => [newExp, ...prev]);
    toast({
      title: 'Experimento Comercial Criado!',
      description: `"${opp.title}" foi registrado no Laboratório de Crescimento.`,
    });
  };

  const handleUpdateExperimentStatus = (
    expId: string,
    status: CommercialExperiment['status']
  ) => {
    setExperiments((prev) =>
      prev.map((e) => (e.id === expId ? { ...e, status, updated_at: new Date().toISOString() } : e))
    );
    toast({
      title: 'Status do Experimento Atualizado',
      description: `O experimento foi alterado para ${status}.`,
    });
  };

  const totalMonthlyGain = allOpportunities.reduce((acc, o) => acc + o.potential_monthly_gain, 0);
  const totalLossAmount = lossEvents.reduce((acc, l) => acc + l.cost_amount, 0);

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
              {allOpportunities.length} Oportunidades Ativas
            </Badge>
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              <FlaskConical className="h-3.5 w-3.5 mr-1 text-emerald-600" />
              {experiments.filter((e) => e.status === 'active').length} Experimentos em Curso
            </Badge>
          </div>
        </div>

        {/* 4 Indicadores Estratégicos Chave (Top KPI Banners) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Faturamento Mensal Estimado */}
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-1">
              <span className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                Receita Operacional Base
                <DollarSign className="h-4 w-4 text-primary" />
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <span className="text-2xl font-black text-foreground">
                R$ {cmvMetrics.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                Volume de {cmvMetrics.items_analyzed} produtos monitorados
              </span>
            </CardContent>
          </Card>

          {/* CMV Médio Efetivo Ponderado (com indicador de saúde) */}
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-1">
              <span className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                CMV Efetivo Ponderado
                <Percent className="h-4 w-4 text-emerald-600" />
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {cmvMetrics.effective_weighted_cmv_percent.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground font-semibold">
                  (Meta: &le; 32%)
                </span>
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5">
                Margem bruta saudável preservada
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
                {lossEvents.length} ocorrências registradas
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
                Projetado pelo motor analítico do CEO
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allOpportunities.map((opp) => (
                <OpportunityCard
                  key={opp.id}
                  opportunity={opp}
                  onActivateExperiment={handleActivateExperiment}
                />
              ))}
            </div>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {experiments.map((exp) => (
                <GrowthExperimentCard
                  key={exp.id}
                  experiment={exp}
                  onUpdateStatus={handleUpdateExperimentStatus}
                />
              ))}
            </div>
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default WalletCeoPage;
