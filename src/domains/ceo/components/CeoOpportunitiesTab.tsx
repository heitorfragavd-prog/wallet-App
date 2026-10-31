import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Sparkles, Calendar, FlaskConical } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { CeoRepository } from '@/domains/ceo/services/CeoRepository';
import { CommercialExperiment } from '@/domains/ceo/types';

interface CeoOpportunitiesTabProps {
  workspaceId: string;
  experiments: CommercialExperiment[];
  onExperimentCreated?: () => void;
}

export const CeoOpportunitiesTab: React.FC<CeoOpportunitiesTabProps> = ({
  workspaceId,
  experiments,
  onExperimentCreated,
}) => {
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'oportunidades' | 'plano' | 'experimentos'>('oportunidades');
  const [selectedOppDetails, setSelectedOppDetails] = useState<number | null>(null);

  const opportunitiesList = [
    {
      id: 1,
      priority: 'Alta Prioridade',
      priorityColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      numberColor: 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40',
      title: 'Aumentar vendas no horário de baixa (15h às 17h)',
      description: 'Neste horário, as vendas são 42% menores que a média. Uma campanha no iFood com desconto de 10% pode gerar +R$ 8.500/mês.',
      impact: '+R$ 8.500/mês',
      impactValue: 8500,
      department: 'commercial_growth',
      ctaType: 'create_experiment',
      ctaLabel: 'Criar Experimento',
    },
    {
      id: 2,
      priority: 'Média Prioridade',
      priorityColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      numberColor: 'bg-amber-600/30 text-amber-300 border border-amber-500/40',
      title: 'Rever preço de 2 produtos com baixa margem',
      description: 'X-Salada e X-Burger estão com margem abaixo de 20%.',
      impact: '+R$ 3.200/mês',
      impactValue: 3200,
      department: 'cmv_pricing',
      ctaType: 'view_details',
      ctaLabel: 'Ver Detalhes',
      details: 'O custo de insumos da carne e queijo aumentou 12,6% nos últimos 60 dias. O X-Salada está precificado em R$ 29,00 com custo de R$ 23,50 (18,9% margem). Sugestão: Ajustar para R$ 33,00 mantendo competitividade.',
    },
    {
      id: 3,
      priority: 'Média Prioridade',
      priorityColor: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
      numberColor: 'bg-sky-600/30 text-sky-300 border border-sky-500/40',
      title: 'Reduzir desperdício na cozinha',
      description: 'Perdas aumentaram 12% esta semana. Revisar processos de preparo pode economizar até R$ 1.500/mês.',
      impact: '+R$ 1.500/mês',
      impactValue: 1500,
      department: 'loss_waste',
      ctaType: 'view_details',
      ctaLabel: 'Ver Detalhes',
      details: 'Detecção de sobras de porções de batata frita e molhos especiais no turno da noite. Recomenda-se calibrar a concha dosadora e registrar o descarte diário no KDS.',
    },
    {
      id: 4,
      priority: 'Baixa Prioridade',
      priorityColor: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
      numberColor: 'bg-slate-700/50 text-slate-300 border border-slate-600',
      title: 'Aumentar ticket médio no salão',
      description: 'Oferecendo combos, é possível aumentar o ticket médio em 15%.',
      impact: '+R$ 4.000/mês',
      impactValue: 4000,
      department: 'commercial_growth',
      ctaType: 'create_experiment',
      ctaLabel: 'Criar Experimento',
    },
  ];

  const handleCreateExperiment = async (opp: typeof opportunitiesList[0]) => {
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
      hypothesis: opp.description,
      department: opp.department,
      target_kpi: 'Faturamento Incremental / Margem',
      baseline_value: '0',
      current_value: 'Em andamento',
      target_value: opp.impact,
      start_date: new Date().toISOString().slice(0, 10),
      status: 'active',
      responsible_person: 'Gestão Rodo Point',
    });

    if (res.success) {
      toast({
        title: 'Experimento Criado com Sucesso!',
        description: `O experimento "${opp.title}" foi registrado no Laboratório do CEO.`,
      });
      onExperimentCreated?.();
      setActiveSubTab('experimentos');
    } else {
      toast({
        title: 'Erro ao criar experimento',
        description: res.error || 'Falha ao persistir experimento.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="text-sm text-muted-foreground flex items-center gap-1.5 font-medium">
          <span className="text-amber-400">👑 Wallet CEO</span>
          <span>›</span>
          <span className="text-foreground font-semibold">Oportunidades</span>
        </div>

        {/* Subtabs */}
        <div className="flex items-center gap-2 bg-muted/40 p-1 rounded-lg border border-border/40">
          <button
            onClick={() => setActiveSubTab('oportunidades')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeSubTab === 'oportunidades'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Oportunidades
          </button>
          <button
            onClick={() => setActiveSubTab('plano')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeSubTab === 'plano'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Plano de Crescimento
          </button>
          <button
            onClick={() => setActiveSubTab('experimentos')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeSubTab === 'experimentos'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Experimentos
            {experiments.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">
                {experiments.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Subtab 1: Oportunidades (Exact reproduction of Panel 4) */}
      {activeSubTab === 'oportunidades' && (
        <div className="space-y-4">
          {opportunitiesList.map((opp) => (
            <Card
              key={opp.id}
              className="bg-card/70 border-border/50 hover:border-border transition-all"
            >
              <CardContent className="p-5">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  {/* Left: Number circle + Content */}
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 ${opp.numberColor}`}
                    >
                      {opp.id}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] py-0 px-2 font-semibold ${opp.priorityColor}`}>
                          {opp.priority}
                        </Badge>
                      </div>

                      <h3 className="text-base font-semibold text-foreground tracking-tight">
                        {opp.title}
                      </h3>

                      <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                        {opp.description}
                      </p>

                      {/* Modal/Accordion de Detalhes se clicado */}
                      {selectedOppDetails === opp.id && opp.details && (
                        <div className="mt-3 p-3 bg-muted/30 border border-border/50 rounded-lg text-xs text-muted-foreground animate-in fade-in">
                          <p className="font-semibold text-foreground mb-1">Diagnóstico do CEO:</p>
                          <p>{opp.details}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Impact + Action Button */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full md:w-auto gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-border/40">
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] text-muted-foreground uppercase font-medium">Impacto Estimado</div>
                      <div className="text-sm font-bold text-emerald-400">{opp.impact}</div>
                    </div>

                    {opp.ctaType === 'create_experiment' ? (
                      <Button
                        size="sm"
                        onClick={() => handleCreateExperiment(opp)}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs h-8 px-4 rounded-md shadow-sm"
                      >
                        {opp.ctaLabel}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSelectedOppDetails(selectedOppDetails === opp.id ? null : opp.id)
                        }
                        className="text-xs h-8 px-4 bg-card/60 hover:bg-muted/40 font-medium"
                      >
                        {selectedOppDetails === opp.id ? 'Fechar' : opp.ctaLabel}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Subtab 2: Plano de Crescimento Executivo de 90 Dias */}
      {activeSubTab === 'plano' && (
        <div className="space-y-6">
          <Card className="bg-card/70 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                Plano Estratégico de Crescimento — Rodo Point (90 Dias)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Fase 1 */}
              <div className="p-4 rounded-lg bg-muted/20 border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-blue-600/30 text-blue-400 border border-blue-500/40">Dias 1 a 30</Badge>
                  <span className="text-xs font-semibold text-emerald-400">Meta: +R$ 4.700/mês</span>
                </div>
                <h4 className="font-semibold text-sm text-foreground">Fase 1: Fundação, Fichas Técnicas & Eficiência</h4>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>Cadastro completo das fichas técnicas no Food Cost para alcançar 100% de cobertura de CMV.</li>
                  <li>Reajuste de preços de X-Salada e X-Burger para recompor margem bruta acima de 30%.</li>
                  <li>Controle de porcionamento na cozinha para conter perdas de batata frita e insumos.</li>
                </ul>
              </div>

              {/* Fase 2 */}
              <div className="p-4 rounded-lg bg-muted/20 border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-amber-600/30 text-amber-400 border border-amber-500/40">Dias 31 a 60</Badge>
                  <span className="text-xs font-semibold text-emerald-400">Meta: +R$ 12.500/mês</span>
                </div>
                <h4 className="font-semibold text-sm text-foreground">Fase 2: Alavancagem Comercial & KDS Ágil</h4>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>Ativação de campanhas de horário de baixa (15h às 17h) nos canais de delivery.</li>
                  <li>Padronização dos combos no salão para elevar o ticket médio de R$ 32,05 para R$ 37,00.</li>
                  <li>Operação 100% digital do KDS reduzindo tempo médio de preparo para 10 minutos.</li>
                </ul>
              </div>

              {/* Fase 3 */}
              <div className="p-4 rounded-lg bg-muted/20 border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-emerald-600/30 text-emerald-400 border border-emerald-500/40">Dias 61 a 90</Badge>
                  <span className="text-xs font-semibold text-emerald-400">Meta: +R$ 22.000/mês</span>
                </div>
                <h4 className="font-semibold text-sm text-foreground">Fase 3: Expansão de Canais & Fidelização Própria</h4>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>Migração de 20% do volume de pedidos de marketplace para o WhatsApp / Canal Próprio (taxa 0%).</li>
                  <li>Programa de fidelização com compras recorrentes semanais.</li>
                  <li>Margem operacional líquida consolidada acima de 22% sobre faturamento total.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Subtab 3: Experimentos Ativos */}
      {activeSubTab === 'experimentos' && (
        <div className="space-y-4">
          {experiments.length === 0 ? (
            <Card className="bg-card/70 border-border/50 text-center p-8">
              <FlaskConical className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-60" />
              <h3 className="font-semibold text-foreground text-sm">Nenhum experimento ativo no momento</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Vá até a aba "Oportunidades" e clique em "Criar Experimento" para iniciar um teste controlado no Laboratório do CEO.
              </p>
              <Button
                size="sm"
                onClick={() => setActiveSubTab('oportunidades')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-xs"
              >
                Ver Oportunidades
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {experiments.map((exp) => (
                <Card key={exp.id} className="bg-card/70 border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                        {exp.status === 'active' ? 'Em Andamento' : exp.status}
                      </Badge>
                      <span className="text-xs font-bold text-amber-400">{exp.target_value}</span>
                    </div>
                    <CardTitle className="text-sm font-semibold mt-1">{exp.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <p className="text-muted-foreground leading-relaxed">{exp.hypothesis}</p>
                    <div className="pt-2 border-t border-border/30 flex items-center justify-between text-muted-foreground">
                      <span>Iniciado em: {exp.start_date}</span>
                      <span>Resp: {exp.responsible_person || 'Gestão'}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
