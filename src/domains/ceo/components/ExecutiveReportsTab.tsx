/**
 * ExecutiveReportsTab.tsx
 *
 * Painel visual dos Relatórios Executivos Diários do Wallet CEO.
 * Apresenta os 6 blocos canônicos consolidados, síntese executiva e recomendações prioritárias.
 */

import React, { useState } from "react";
import { useExecutiveReports } from "../hooks/useExecutiveReports";
import { CeoExecutiveReport } from "../types/executive-report";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  FileText,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Lightbulb,
  ShoppingBag,
  Clock,
  RotateCw,
  Sparkles,
  Bot,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

interface ExecutiveReportsTabProps {
  workspaceId?: string;
}

export const ExecutiveReportsTab: React.FC<ExecutiveReportsTabProps> = ({ workspaceId }) => {
  const { reports, isLoading, generateReport, isGenerating } = useExecutiveReports(workspaceId);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Formatação de valores em BRL
  const fmtBrl = (v: number | null | undefined) =>
    Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const activeReport: CeoExecutiveReport | undefined =
    reports.find((r) => r.id === selectedReportId) || reports[0];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-3">
        <RotateCw className="w-6 h-6 animate-spin text-orange-500" />
        <span className="text-sm font-medium">Carregando relatórios executivos...</span>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <Card className="border-border/60 bg-card">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
          <div className="p-3 rounded-full bg-orange-500/10 text-orange-500">
            <FileText className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Nenhum relatório diário gerado ainda</h3>
            <p className="text-xs text-muted-foreground max-w-md">
              O Wallet CEO gera relatórios executivos automaticamente todos os dias às 10h da manhã.
              Você também pode disparar a primeira geração manual agora.
            </p>
          </div>
          <Button
            onClick={() => generateReport()}
            disabled={isGenerating}
            className="bg-orange-500 hover:bg-orange-600 text-white font-semibold gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {isGenerating ? "Gerando Relatório..." : "Gerar Primeiro Relatório"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { financial_indicators: ind, recommendations = [] } = activeReport;

  return (
    <div className="space-y-6">
      {/* ── Barra Superior de Seleção e Ações ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border border-border/40">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground">Data de Referência:</span>
          <select
            value={activeReport.id}
            onChange={(e) => setSelectedReportId(e.target.value)}
            className="bg-background border border-border/60 rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.reference_date} ({r.financial_indicators.faturamento.diaSemanaOntemNome || "Dia"}) — v{r.version}
              </option>
            ))}
          </select>

          <Badge
            variant="outline"
            className={
              activeReport.status === "completed"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]"
            }
          >
            {activeReport.status === "completed" ? (
              <span className="flex items-center gap-1">
                <Bot className="w-3 h-3" /> IA Executiva Ativa
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Motor Determinístico
              </span>
            )}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateReport(activeReport.reference_date)}
            disabled={isGenerating}
            className="text-xs font-semibold gap-1.5 h-8 border-border/60 hover:bg-muted/50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
            {isGenerating ? "Atualizando..." : "Atualizar Dados"}
          </Button>
        </div>
      </div>

      {/* ── Síntese Executiva do Wallet CEO (Destaque Principal) ── */}
      <Card className="border-orange-500/30 bg-gradient-to-br from-orange-500/5 via-transparent to-transparent shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 text-foreground font-bold">
              <Sparkles className="w-4 h-4 text-orange-400" />
              Síntese Executiva do Wallet CEO
            </CardTitle>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Gerado em {new Date(activeReport.generated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground/90 leading-relaxed font-medium">
            {activeReport.executive_summary}
          </p>
        </CardContent>
      </Card>

      {/* ── Grid dos Blocos Canônicos (Faturamento, Despesas, Resultado) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* BLOCO 1: Faturamento */}
        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Bloco 1: Faturamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-2xl font-bold text-foreground">
                {fmtBrl(ind.faturamento.faturamentoOntem)}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {ind.faturamento.pedidosOntem} pedidos • Ticket médio: {fmtBrl(ind.faturamento.ticketMedioOntem)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-border/40 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acumulado Mês:</span>
                <span className="font-semibold text-foreground">{fmtBrl(ind.faturamento.faturamentoMesAcumulado)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Média {ind.faturamento.diaSemanaOntemNome}s:</span>
                <span className="font-semibold text-foreground">{fmtBrl(ind.faturamento.mediaDiaSemanaOntem)}</span>
              </div>
              {ind.faturamento.variacaoOntemVsMediaPercent !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Variação vs Média:</span>
                  <span
                    className={`font-semibold ${
                      ind.faturamento.variacaoOntemVsMediaPercent >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {ind.faturamento.variacaoOntemVsMediaPercent >= 0 ? "+" : ""}
                    {ind.faturamento.variacaoOntemVsMediaPercent.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* BLOCO 2: Despesas */}
        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-rose-500" /> Bloco 2: Despesas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-2xl font-bold text-foreground">
                {fmtBrl(ind.despesas.despesasOntem)}
              </div>
              <span className="text-xs text-muted-foreground">Despesas lançadas ontem</span>
            </div>

            <div className="pt-2 border-t border-border/40 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acumulado Mês:</span>
                <span className="font-semibold text-foreground">{fmtBrl(ind.despesas.despesasMesAcumulado)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pagas vs Pendentes:</span>
                <span className="font-semibold text-foreground">
                  {fmtBrl(ind.despesas.despesasPagasMes)} / {fmtBrl(ind.despesas.despesasPendentesMes)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vencendo em 7 dias:</span>
                <span className="font-semibold text-amber-400">
                  {ind.despesas.contasVencer7DiasQuantidade} ({fmtBrl(ind.despesas.contasVencer7DiasValor)})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* BLOCO 3: Resultado Operacional */}
        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-amber-500" /> Bloco 3: Resultado Operacional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div
                className={`text-2xl font-bold ${
                  ind.resultado.resultadoOperacional >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {fmtBrl(ind.resultado.resultadoOperacional)}
              </div>
              <span className="text-xs text-muted-foreground">
                Margem: {ind.resultado.margemOperacionalPercent?.toFixed(1) || 0}%
              </span>
            </div>

            <div className="pt-2 border-t border-border/40 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confiabilidade do Lucro:</span>
                <Badge variant="outline" className="text-[10px] uppercase font-bold py-0">
                  {ind.resultado.statusConfiabilidadeLucro}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cobertura Fichas Técnicas:</span>
                <span className="font-semibold text-foreground">{ind.resultado.coberturaFichasPercent}%</span>
              </div>
              {ind.despesas.contasVencidasQuantidade > 0 && (
                <div className="flex justify-between text-rose-400 font-semibold">
                  <span>Contas Vencidas:</span>
                  <span>{ind.despesas.contasVencidasQuantidade} ({fmtBrl(ind.despesas.contasVencidasValor)})</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── BLOCO 4 & 5: Produtos e Operação ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BLOCO 4: Produtos & Rentabilidade */}
        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-orange-400" /> Bloco 4: Produtos de Maior Faturamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ind.produtos.top5Faturamento.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem dados de itens vendidos no período.</p>
            ) : (
              <div className="space-y-2">
                {ind.produtos.top5Faturamento.map((p, idx) => (
                  <div key={p.id} className="flex items-center justify-between text-xs py-1 border-b border-border/20 last:border-0">
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-4 h-4 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-foreground truncate">{p.nome}</span>
                      <span className="text-muted-foreground text-[11px]">({p.quantidade} un)</span>
                    </div>
                    <span className="font-semibold text-foreground shrink-0">{fmtBrl(p.faturamento)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* BLOCO 5: Operação & Alertas */}
        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Bloco 5: Indicadores Operacionais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
                <span className="text-muted-foreground block text-[11px]">Tarefas Pendentes</span>
                <span className="text-base font-bold text-foreground">{ind.operacao.tarefasPendentesQuantidade}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30">
                <span className="text-muted-foreground block text-[11px]">Atividades Atrasadas</span>
                <span className={`text-base font-bold ${ind.operacao.atividadesAtrasadasQuantidade > 0 ? "text-rose-400" : "text-foreground"}`}>
                  {ind.operacao.atividadesAtrasadasQuantidade}
                </span>
              </div>
            </div>

            {ind.operacao.alertasOperacionais.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-border/30">
                {ind.operacao.alertasOperacionais.map((alert, i) => (
                  <div key={i} className="text-xs text-amber-400/90 flex items-start gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    <span>{alert}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── BLOCO 6: Recomendações Estratégicas do Wallet CEO ── */}
      <Card className="border-border/60 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400" /> Bloco 6: Recomendações Estratégicas Prioritárias
          </CardTitle>
          <CardDescription className="text-xs">
            Ações práticas recomendadas pelo cérebro do Wallet CEO para maximizar lucratividade e eliminar gargalos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recommendations.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma recomendação extraordinária para esta data.</p>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => (
                <div
                  key={rec.numero}
                  className="p-4 rounded-xl border border-border/40 bg-muted/20 space-y-2 hover:border-orange-500/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold">
                        {rec.numero}
                      </span>
                      {rec.titulo}
                    </h4>
                    <Badge variant="outline" className="text-[10px] uppercase font-bold py-0.5">
                      Confiança {rec.grauConfianca}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground/90">Diagnóstico:</strong> {rec.problemaOuOportunidade}
                  </p>

                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span><strong>Evidência:</strong> {rec.evidencia}</span>
                  </div>

                  {rec.impactoEstimado && (
                    <div className="text-xs text-emerald-400 font-semibold">
                      Impacto estimado: {rec.impactoEstimado}
                    </div>
                  )}

                  <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs text-foreground font-medium">
                    <strong className="text-orange-400">Ação Recomendada:</strong> {rec.acaoRecomendada}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
