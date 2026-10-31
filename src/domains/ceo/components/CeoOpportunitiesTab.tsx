import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Calendar, FlaskConical, AlertCircle } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { CeoRepository } from '@/domains/ceo/services/CeoRepository';
import { CommercialExperiment, GrowthOpportunity } from '@/domains/ceo/types';

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
  const [opportunities, setOpportunities] = useState<GrowthOpportunity[]>([]);
  const [selectedOppDetails, setSelectedOppDetails] = useState<string | null>(null);

  const loadOpportunities = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const opps = await CeoRepository.listOpportunities(workspaceId);
      setOpportunities(opps);
    } catch (err) {
      console.warn('[CeoOpportunitiesTab] Erro ao carregar oportunidades:', err);
    }
  }, [workspaceId]);

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
      setActiveSubTab('experimentos');
    } else {
      toast({
        title: 'Erro ao criar experimento',
        description: 'Não foi possível persistir o experimento no banco de dados.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Navigation Sub-Tabs */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="text-sm text-muted-foreground flex items-center gap-1.5 font-medium">
          <span className="text-amber-400">👑 Wallet CEO</span>
          <span>›</span>
          <span className="text-foreground font-semibold">Oportunidades</span>
        </div>

        {/* Sub-tabs buttons */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-border/50 text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab('oportunidades')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeSubTab === 'oportunidades'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Oportunidades {opportunities.length > 0 && `(${opportunities.length})`}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('plano')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeSubTab === 'plano'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Plano de Crescimento
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('experimentos')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeSubTab === 'experimentos'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Experimentos ({experiments.length})
          </button>
        </div>
      </div>

      {/* SubTab 1: Oportunidades Baseadas em Dados Reais */}
      {activeSubTab === 'oportunidades' && (
        <div className="space-y-4">
          {opportunities.length > 0 ? (
            opportunities.map((opp, idx) => (
              <Card key={opp.id} className="bg-card/70 border-border/50 hover:border-border transition-colors">
                <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
                  <div className="flex items-start gap-4">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 bg-emerald-600/30 text-emerald-300 border border-emerald-500/40">
                      {idx + 1}
                    </span>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          {opp.impact_level === 'high' ? 'Alta Prioridade' : 'Média Prioridade'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {opp.department === 'cmv_pricing' ? 'Precificação & CMV' : 'Crescimento Comercial'}
                        </span>
                      </div>
                      <h3 className="text-sm md:text-base font-semibold text-foreground">
                        {opp.title}
                      </h3>
                      <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                        {opp.problem_description || opp.description}
                      </p>
                      {selectedOppDetails === opp.id && opp.recommended_action && (
                        <div className="mt-2 p-2.5 rounded bg-slate-950/80 border border-border/40 text-xs text-slate-300">
                          <strong className="text-white">Ação Recomendada:</strong> {opp.recommended_action}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-start md:items-end gap-2 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-border/40">
                    <div className="text-xs text-muted-foreground">Impacto Estimado</div>
                    <div className="text-base md:text-lg font-bold text-emerald-400">
                      {opp.estimated_financial_impact ? `+R$ ${opp.estimated_financial_impact.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês` : 'Em apuração'}
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <Button
                        size="sm"
                        onClick={() => handleCreateExperiment(opp)}
                        className="h-8 text-xs bg-orange-500 hover:bg-orange-600 text-white font-medium"
                      >
                        Criar Experimento
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedOppDetails(selectedOppDetails === opp.id ? null : opp.id)}
                        className="h-8 text-xs border-border/60"
                      >
                        {selectedOppDetails === opp.id ? 'Ocultar' : 'Ver Detalhes'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="bg-card/70 border-border/50">
              <CardContent className="p-8 space-y-6">
                <div className="text-center space-y-2">
                  <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                  <h3 className="text-base font-bold text-foreground">
                    Informações insuficientes para gerar oportunidades de margem automáticas
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-xl mx-auto leading-relaxed">
                    O Wallet CEO calcula oportunidades com base em evidências verificáveis. Para habilitar cálculos preditivos de reajuste de preços, combate a desperdício e promoções cirúrgicas, conclua os cadastros abaixo:
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="bg-slate-900/60 p-4 rounded-xl border border-border/40 space-y-2">
                    <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">
                      1
                    </div>
                    <h4 className="text-xs font-semibold text-foreground">
                      Cadastrar Fichas Técnicas
                    </h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Cadastre os insumos e custos de cada item vendido no PDV. Isso permite calcular o CMV unitário real e identificar produtos que operam com margem insuficiente.
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-4 rounded-xl border border-border/40 space-y-2">
                    <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-xs">
                      2
                    </div>
                    <h4 className="text-xs font-semibold text-foreground">
                      Registrar Descartes na Cozinha
                    </h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Utilize o painel KDS ou o módulo de estoque para registrar sobras de turno e descartes de estufa. O CEO quantificará perdas financeiras reais.
                    </p>
                  </div>

                  <div className="bg-slate-900/60 p-4 rounded-xl border border-border/40 space-y-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                      3
                    </div>
                    <h4 className="text-xs font-semibold text-foreground">
                      Ativar Canais de Delivery no KDS
                    </h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Conecte as credenciais do iFood e 99Food para permitir a comparação automatizada entre canais de venda e cálculo da margem líquida de entrega.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* SubTab 2: Plano de Crescimento Trimestral */}
      {activeSubTab === 'plano' && (
        <div className="space-y-4">
          <Card className="bg-card/70 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <CardTitle className="text-sm font-semibold text-foreground">
                  Plano Estruturante de 90 Dias — Rodo Point
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                {/* Milestone 1 */}
                <div className="relative space-y-1.5">
                  <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] text-slate-950 font-bold">
                    1
                  </span>
                  <div className="text-xs font-semibold text-emerald-400">
                    Dias 1 a 30: Fundação de Dados e Conciliações
                  </div>
                  <h4 className="text-sm font-medium text-foreground">
                    Saneamento de Fichas Técnicas e Controle de CMV
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Cadastrar insumos para os 20 produtos de maior volume no Eyemobile PDV. Eliminar distorções de margem e habilitar monitoramento de CMV em tempo real.
                  </p>
                </div>

                {/* Milestone 2 */}
                <div className="relative space-y-1.5">
                  <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-sky-500 flex items-center justify-center text-[10px] text-slate-950 font-bold">
                    2
                  </span>
                  <div className="text-xs font-semibold text-sky-400">
                    Dias 31 a 60: Eficiência de Operações e KDS
                  </div>
                  <h4 className="text-sm font-medium text-foreground">
                    Conferência Operacional e Redução de Desperdício
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Padronizar o checklist do KDS da cozinha para reduzir tempos de preparo e registrar quebras de estufa no encerramento de cada turno.
                  </p>
                </div>

                {/* Milestone 3 */}
                <div className="relative space-y-1.5">
                  <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center text-[10px] text-slate-950 font-bold">
                    3
                  </span>
                  <div className="text-xs font-semibold text-amber-400">
                    Dias 61 a 90: Expansão de Canais e Rentabilidade
                  </div>
                  <h4 className="text-sm font-medium text-foreground">
                    Alavancagem de Delivery e Simulador de Margens
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Ajustar tabelas de preços específicas por marketplace cobrindo comissões de delivery e impulsionar combos promocionais nos horários de menor movimento.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* SubTab 3: Laboratório de Experimentos Reais */}
      {activeSubTab === 'experimentos' && (
        <div className="space-y-4">
          {experiments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {experiments.map((exp) => (
                <Card key={exp.id} className="bg-card/70 border-border/50">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] bg-primary/20 text-primary border-primary/30">
                        {exp.status === 'active' ? 'Em Andamento' : 'Concluído'}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {exp.start_date} a {exp.end_date || 'em aberto'}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{exp.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {exp.hypothesis}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Meta:</span>
                      <span className="font-semibold text-foreground">{exp.target_value}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-card/70 border-border/50">
              <CardContent className="p-8 text-center text-xs text-muted-foreground space-y-2">
                <FlaskConical className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="font-medium text-slate-300">Nenhum experimento ativo no momento</p>
                <p className="text-[11px] max-w-sm mx-auto">
                  Crie novos experimentos comerciais na aba de Oportunidades ou solicite ao Diretor Executivo via chat.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
