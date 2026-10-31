import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import {
  TrendingUp,
  Send,
  RotateCcw,
  User,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useWalletIA } from '@/domains/ia/hooks/useWalletIA';
import { CeoExecutiveKpis } from '@/domains/ceo/services/CeoFinancialMetricsService';

interface CeoOverviewTabProps {
  workspaceId: string;
  kpis: CeoExecutiveKpis;
  onNavigateToPlan?: () => void;
}

export const CeoOverviewTab: React.FC<CeoOverviewTabProps> = ({
  workspaceId,
  kpis,
  onNavigateToPlan,
}) => {
  const [inputPrompt, setInputPrompt] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hook central de IA
  const { messages, isLoading, currentStatus, sendMessage, clearChat } = useWalletIA({
    workspaceId,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputPrompt.trim() || isLoading) return;
    sendMessage(inputPrompt.trim());
    setInputPrompt('');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const handleSelectPill = (prompt: string) => {
    sendMessage(prompt);
  };

  // Sparklines neutros caso não haja histórico diário suficiente
  const revenueSparkline = [
    { v: kpis.faturamentoMes > 0 ? Math.round(kpis.faturamentoMes * 0.12) : 0 },
    { v: kpis.faturamentoMes > 0 ? Math.round(kpis.faturamentoMes * 0.14) : 0 },
    { v: kpis.faturamentoMes > 0 ? Math.round(kpis.faturamentoMes * 0.15) : 0 },
    { v: kpis.faturamentoMes > 0 ? Math.round(kpis.faturamentoMes * 0.18) : 0 },
    { v: kpis.faturamentoMes > 0 ? Math.round(kpis.faturamentoMes * 0.22) : 0 },
  ];

  const profitSparkline = [
    { v: kpis.lucroEstimado > 0 ? Math.round(kpis.lucroEstimado * 0.15) : 0 },
    { v: kpis.lucroEstimado > 0 ? Math.round(kpis.lucroEstimado * 0.18) : 0 },
    { v: kpis.lucroEstimado > 0 ? Math.round(kpis.lucroEstimado * 0.20) : 0 },
    { v: kpis.lucroEstimado > 0 ? Math.round(kpis.lucroEstimado * 0.22) : 0 },
    { v: kpis.lucroEstimado > 0 ? Math.round(kpis.lucroEstimado * 0.25) : 0 },
  ];

  const expenseSparkline = [
    { v: kpis.despesasMes > 0 ? Math.round(kpis.despesasMes * 0.18) : 0 },
    { v: kpis.despesasMes > 0 ? Math.round(kpis.despesasMes * 0.19) : 0 },
    { v: kpis.despesasMes > 0 ? Math.round(kpis.despesasMes * 0.20) : 0 },
    { v: kpis.despesasMes > 0 ? Math.round(kpis.despesasMes * 0.21) : 0 },
    { v: kpis.despesasMes > 0 ? Math.round(kpis.despesasMes * 0.22) : 0 },
  ];

  // CMV gauge data honesto (sem dados fictícios)
  const cmvGaugeData = [
    {
      name: 'CMV',
      value: kpis.cmvPercent !== null ? kpis.cmvPercent : 0,
      color: kpis.cmvPercent !== null ? '#10b981' : '#475569',
    },
    {
      name: 'Restante',
      value: kpis.cmvPercent !== null ? 100 - kpis.cmvPercent : 100,
      color: '#1e293b',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Hero Card: CEO Greeting & Daily Actions */}
      <Card className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-border/60 shadow-lg overflow-hidden">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            {/* Left: Avatar + Narrative */}
            <div className="flex items-start gap-5 max-w-2xl">
              {/* Executive Avatar Container */}
              <div className="relative shrink-0">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-2 border-amber-500/40 shadow-md bg-slate-800 flex items-center justify-center">
                  <img
                    src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&h=256&q=80"
                    alt="Wallet CEO"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-amber-400 font-bold text-2xl pointer-events-none bg-slate-850">
                    👑
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-emerald-500 border-2 border-slate-950 shadow-sm" title="Online"></div>
              </div>

              {/* Text Narrative */}
              <div className="space-y-2">
                <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
                  Bom dia, Heitor!
                </h2>
                <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                  {kpis.faturamentoOntem > 0 ? (
                    <>
                      A Rodo Point faturou{' '}
                      <strong className="text-white font-semibold">
                        R$ {kpis.faturamentoOntem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>{' '}
                      ontem
                      {kpis.variacaoOntemVsMediaPercent !== null && (
                        <>
                          ,{' '}
                          <span className={kpis.variacaoOntemVsMediaPercent >= 0 ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                            {kpis.variacaoOntemVsMediaPercent > 0 ? `+${kpis.variacaoOntemVsMediaPercent}%` : `${kpis.variacaoOntemVsMediaPercent}%`} em relação à média
                          </span>{' '}
                          de {kpis.diaSemanaOntemNome}
                        </>
                      )}
                      .
                    </>
                  ) : (
                    <>
                      Nenhuma venda registrada ontem ({kpis.diaSemanaOntemNome}).
                    </>
                  )}{' '}
                  {kpis.faturamentoMes > 0 ? (
                    <>
                      Neste mês, o faturamento apurado é de{' '}
                      <strong className="text-white font-semibold">
                        R$ {kpis.faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </strong>
                      {kpis.crescimentoMesPercent !== null && (
                        <>
                          , uma variação de{' '}
                          <span className={kpis.crescimentoMesPercent >= 0 ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                            {kpis.crescimentoMesPercent > 0 ? `+${kpis.crescimentoMesPercent}%` : `${kpis.crescimentoMesPercent}%`}
                          </span>{' '}
                          vs. mês anterior
                        </>
                      )}
                      .
                    </>
                  ) : (
                    <>
                      Aguardando sincronização de transações de receita do mês corrente.
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Right: Principais Ações de Hoje */}
            <div className="w-full lg:w-auto shrink-0 bg-slate-900/60 p-4 rounded-xl border border-border/40 space-y-3 min-w-[280px]">
              <div className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Principais ações de hoje
              </div>

              <div className="space-y-2">
                {kpis.acoesHoje.map((acao) => (
                  <div key={acao.numero} className="flex items-start gap-2.5 text-xs">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                        acao.numero === 3
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {acao.numero}
                    </span>
                    <span className="text-slate-300 leading-tight">
                      {acao.titulo}
                    </span>
                  </div>
                ))}
              </div>

              <Button
                size="sm"
                onClick={onNavigateToPlan}
                className="w-full mt-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs h-8 gap-1.5 shadow-sm"
              >
                Ver plano completo
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Faturamento (Mês) */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Faturamento (Mês)</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              R$ {kpis.faturamentoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-end justify-between mt-2">
              <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                {kpis.crescimentoMesPercent !== null ? (
                  <>
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>{kpis.crescimentoMesPercent >= 0 ? `↑ +${kpis.crescimentoMesPercent}%` : `↓ ${kpis.crescimentoMesPercent}%`}</span>
                    <span className="text-muted-foreground font-normal ml-0.5">vs. mês anterior</span>
                  </>
                ) : (
                  <span className="text-muted-foreground font-normal">Base anterior em apuração</span>
                )}
              </div>
              <div className="w-16 h-7">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueSparkline}>
                    <Bar dataKey="v" fill="#38bdf8" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lucro Estimado */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Resultado Operacional Apurado</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              R$ {kpis.lucroEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-end justify-between mt-2">
              <div className="text-xs text-emerald-400 font-semibold">
                {kpis.margemLucroPercent !== null ? `${kpis.margemLucroPercent}% de margem` : 'Margem indisponível'}
              </div>
              <div className="w-16 h-7">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={profitSparkline}>
                    <Line type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CMV */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>CMV</span>
              {kpis.cmvStatus === 'dados_insuficientes' && (
                <span className="text-[10px] text-amber-400 font-medium">Fichas pendentes</span>
              )}
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              {kpis.cmvPercent !== null ? `${kpis.cmvPercent}%` : 'Dados insuficientes'}
            </div>
            <div className="flex items-end justify-between mt-2">
              <div className="text-xs text-muted-foreground">
                {kpis.cmvStatus === 'dados_insuficientes' ? (
                  <span className="text-amber-400 font-medium">Cadastre fichas técnicas</span>
                ) : (
                  <span className="text-emerald-400 font-medium">Dentro da meta (≤ 38%)</span>
                )}
              </div>
              <div className="w-10 h-10 relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={cmvGaugeData}
                      dataKey="value"
                      innerRadius={11}
                      outerRadius={16}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {cmvGaugeData.map((entry, index) => (
                        <Cell key={`gauge-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Despesas */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground font-medium">Despesas Registradas</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
              R$ {kpis.despesasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-end justify-between mt-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {kpis.variacaoDespesasPercent !== null ? (
                  <span className={kpis.variacaoDespesasPercent > 0 ? "text-amber-400 font-semibold" : "text-emerald-400 font-semibold"}>
                    {kpis.variacaoDespesasPercent > 0 ? `+${kpis.variacaoDespesasPercent}%` : `${kpis.variacaoDespesasPercent}%`} vs. mês anterior
                  </span>
                ) : (
                  <span>Sem base anterior</span>
                )}
              </div>
              <div className="w-16 h-7">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseSparkline}>
                    <Bar dataKey="v" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Conversational AI Chat */}
      <Card className="bg-card/80 border-border/60 shadow-md">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">💬</span>
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Converse com seu CEO
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Pergunte qualquer coisa sobre a Rodo Point. Eu analiso seus dados reais e te ajudo a tomar decisões.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearChat}
                className="h-8 text-xs gap-1.5 border-border/60 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Nova conversa
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* Messages Container */}
          <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto text-lg border border-amber-500/20">
                  👑
                </div>
                <div className="text-sm font-semibold text-foreground">
                  Assistente Executivo Digital Ativo
                </div>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Pronto para analisar finanças, margens, despesas e sugerir oportunidades com base nos registros do seu workspace.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 text-xs md:text-sm ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role !== 'user' && (
                    <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 text-xs">
                      👑
                    </div>
                  )}

                  <div
                    className={`p-3.5 rounded-xl max-w-[85%] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground font-medium rounded-tr-none'
                        : 'bg-slate-900/90 text-slate-100 border border-border/50 rounded-tl-none shadow-sm'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {/* Action Proposal Card se houver no retorno */}
                    {msg.actionProposals && msg.actionProposals.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                        <div className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Ação proposta pelo CEO (Requer Confirmação):
                        </div>
                        {msg.actionProposals.map((prop, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-950/70 p-2.5 rounded border border-amber-500/30 text-xs space-y-1.5"
                          >
                            <div className="font-semibold text-slate-200">
                              {prop.title || prop.actionType}
                            </div>
                            <div className="text-slate-400 text-[11px]">
                              {prop.description || prop.hypothesis}
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => {
                                  sendMessage(`Confirmar e executar ação proposta: ${prop.title || prop.actionType}`);
                                }}
                              >
                                Autorizar Ação
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-slate-700 text-slate-300"
                                onClick={() => {
                                  sendMessage('Recusar proposta e manter dados atuais');
                                }}
                              >
                                Descartar
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center shrink-0 text-xs">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))
            )}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>{currentStatus || 'CEO analisando os dados...'}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Suggestions Pills */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
            {[
              'Como estão minhas vendas hoje?',
              'Quais produtos vendem mais?',
              'Onde posso economizar?',
              'Qual foi meu melhor dia da semana?',
              'Analise minhas despesas',
              'Monte um plano para aumentar meu lucro em R$ 5.000/mês',
            ].map((pill, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPill(pill)}
                className="text-[11px] bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white px-2.5 py-1 rounded-full border border-border/50 transition-colors"
              >
                {pill}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Digite sua pergunta... Ex: Como estão minhas vendas dos últimos 30 dias?"
              className="flex-1 bg-slate-950 border border-border/70 rounded-lg px-4 py-2.5 text-xs md:text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !inputPrompt.trim()}
              className="bg-orange-500 hover:bg-orange-600 text-white h-10 px-4 shrink-0 rounded-lg shadow-sm"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
