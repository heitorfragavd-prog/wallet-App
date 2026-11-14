/**
 * AutomacoesSemanaisTab.tsx
 *
 * Painel Administrativo de Automações Semanais Inteligentes dos Folguistas (Etapa 3C).
 * Gerencia a consulta de segunda-feira, a reconfirmação de sexta-feira,
 * o simulador de respostas em linguagem natural e a auditoria de logs.
 */

import React, { useState } from "react";
import {
  Calendar,
  Clock,
  Sparkles,
  Bot,
  CheckCircle2,
  AlertTriangle,
  Send,
  RotateCcw,
  UserCheck,
  UserX,
  History,
  ShieldCheck,
  Info,
  ChevronRight,
  MessageSquare,
  Search,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import type {
  ColaboradorFolguista,
  EscalasConfig,
  EscalaSlot,
} from "../../types";
import { useEscalasAutomacoes } from "../../hooks/useEscalasAutomacoes";
import { formatDateBR } from "../../services/escalaDateUtils";

interface AutomacoesSemanaisTabProps {
  workspaceId: string;
  config: EscalasConfig | undefined;
  escalas: EscalaSlot[];
  folguistas: ColaboradorFolguista[];
  onRefreshEscalas?: () => void;
  onAssignFolguistaToSlot?: (slotId: string, colaboradorId: string) => void;
}

export const AutomacoesSemanaisTab: React.FC<AutomacoesSemanaisTabProps> = ({
  workspaceId,
  config,
  escalas,
  folguistas,
  onRefreshEscalas,
  onAssignFolguistaToSlot,
}) => {
  const {
    logs,
    loading,
    executingMonday,
    executingFriday,
    weekend,
    uncoveredWeekendSlots,
    mondayLog,
    fridayLogs,
    substitutesModalOpen,
    setSubstitutesModalOpen,
    selectedVagaForSub,
    substituteCandidates,
    handleTriggerMonday,
    handleTriggerFriday,
    handleSimulateFolguistaResponse,
    handleOpenSubstituteSearch,
    loadAutomacoesLogs,
  } = useEscalasAutomacoes({
    workspaceId,
    config,
    escalas,
    folguistas,
    onRefreshEscalas,
  });

  const [simColaboradorId, setSimColaboradorId] = useState<string>(folguistas[0]?.id || "");
  const [simTexto, setSimTexto] = useState<string>("Posso sábado de manhã e domingo à noite.");
  const [simIsFriday, setSimIsFriday] = useState<boolean>(false);
  const [simProcessing, setSimProcessing] = useState<boolean>(false);

  const isSimulacao = config?.simulacao_modo ?? true;

  const onExecuteSimResponse = async () => {
    if (!simColaboradorId || !simTexto.trim()) return;
    setSimProcessing(true);
    try {
      await handleSimulateFolguistaResponse(simColaboradorId, simTexto.trim(), simIsFriday);
    } finally {
      setSimProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Alerta de Governança e Modo de Simulação */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border bg-card/60 backdrop-blur-sm shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold">Automações Semanais Inteligentes</h2>
            <Badge
              variant="outline"
              className={
                isSimulacao
                  ? "bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
              }
            >
              {isSimulacao ? "Modo de Simulação Ativo (Seguro)" : "Disparos Ativos (Telegram)"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {isSimulacao
              ? "As rotinas executam cálculos e salvam logs de auditoria sem envio real ao Telegram dos colaboradores."
              : "As rotinas enviarão mensagens diretamente ao grupo de folguistas e aos funcionários escalados."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadAutomacoesLogs}
            disabled={loading}
            className="text-xs h-8 gap-1.5"
          >
            <RotateCcw className="w-3 h-3" />
            Atualizar Status
          </Button>
        </div>
      </div>

      {/* 2. Próximo Fim de Semana & Vagas Descobertas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card: Vagas em Aberto */}
        <Card className="border-border/60 md:col-span-1 flex flex-col justify-between">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Próximo Fim de Semana
            </CardTitle>
            <CardDescription className="text-xs">
              {formatDateBR(weekend.sabado)} & {formatDateBR(weekend.domingo)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/40">
              <div className="text-xs font-medium">Turnos sem cobertura:</div>
              <Badge
                variant={uncoveredWeekendSlots.length > 0 ? "destructive" : "outline"}
                className={uncoveredWeekendSlots.length === 0 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : ""}
              >
                {uncoveredWeekendSlots.length === 0 ? "100% Coberta" : `${uncoveredWeekendSlots.length} vagas`}
              </Badge>
            </div>

            {uncoveredWeekendSlots.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground">Vagas identificadas:</span>
                {uncoveredWeekendSlots.map((v, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold capitalize text-foreground">
                        {v.diaSemana}: {v.turno === "manha" ? "Manhã" : "Noite"}
                      </span>
                      <div className="text-[10px] text-muted-foreground">
                        {v.horarioInicio} às {v.horarioFim}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenSubstituteSearch(v)}
                      className="h-7 text-[10px] gap-1 border-amber-500/40 hover:bg-amber-500/10 text-amber-300"
                    >
                      <Search className="w-3 h-3" />
                      Buscar Folguista
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card: Automação de Segunda-feira */}
        <Card className="border-border/60 md:col-span-1 flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-400" />
                Segunda-feira: Consulta
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {config?.notificacao_segunda_horario || "09:00"}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Pergunta aos folguistas quem pode trabalhar nos turnos em aberto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/40 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status desta semana:</span>
                {mondayLog ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Executada ({mondayLog.status})
                  </span>
                ) : (
                  <span className="text-amber-400 font-medium">Aguardando disparo</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Regra: Só consulta turnos realmente descobertos. Evita mensagens desnecessárias.
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={() => handleTriggerMonday(true)}
              disabled={executingMonday}
              className="w-full text-xs h-8 gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-medium"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {executingMonday ? "Processando..." : "Simular Consulta de Segunda Agora"}
            </Button>
          </CardContent>
        </Card>

        {/* Card: Automação de Sexta-feira */}
        <Card className="border-border/60 md:col-span-1 flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                Sexta-feira: Reconfirmação
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {config?.notificacao_sexta_horario || "14:00"}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Confirma a presença dos colaboradores escalados para sábado e domingo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/40 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Solicitações enviadas:</span>
                <span className="font-semibold text-foreground">{fridayLogs.length}</span>
              </div>
              <div className="text-[11px] text-amber-300/90 font-medium flex items-center gap-1">
                <Info className="w-3 h-3 shrink-0" />
                Regra rígida: Silêncio NUNCA significa confirmação!
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={() => handleTriggerFriday(true)}
              disabled={executingFriday}
              className="w-full text-xs h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              <UserCheck className="w-3.5 h-3.5" />
              {executingFriday ? "Processando..." : "Simular Confirmação de Sexta Agora"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 3. Simulador de Linguagem Natural dos Folguistas (Interpretação da IA) */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-amber-400" />
            Simulador de Interpretação da IA (NLP Folguistas)
          </CardTitle>
          <CardDescription className="text-xs">
            Teste como a Wallet IA compreende respostas cotidianas de folguistas e atualiza a matriz de disponibilidade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Folguista Remetente</Label>
              <select
                value={simColaboradorId}
                onChange={(e) => setSimColaboradorId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {folguistas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} ({f.tipo})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Contexto da Mensagem</Label>
              <div className="flex items-center gap-4 pt-1.5">
                <label className="text-xs flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="contexto"
                    checked={!simIsFriday}
                    onChange={() => setSimIsFriday(false)}
                    className="accent-amber-500"
                  />
                  <span>Consulta de Segunda (Disponibilidade)</span>
                </label>
                <label className="text-xs flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="contexto"
                    checked={simIsFriday}
                    onChange={() => setSimIsFriday(true)}
                    className="accent-emerald-500"
                  />
                  <span>Confirmação de Sexta (Presença / Desistência)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Mensagem digitada pelo colaborador:</Label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setSimTexto("Posso sábado.")}
                  className="text-[10px] text-sky-400 hover:underline"
                >
                  "Posso sábado" (ambígua)
                </button>
                <span className="text-muted-foreground text-[10px]">•</span>
                <button
                  type="button"
                  onClick={() => setSimTexto("Domingo eu posso de manhã.")}
                  className="text-[10px] text-sky-400 hover:underline"
                >
                  "Domingo de manhã"
                </button>
                <span className="text-muted-foreground text-[10px]">•</span>
                <button
                  type="button"
                  onClick={() => setSimTexto("Esse fim de semana não consigo.")}
                  className="text-[10px] text-sky-400 hover:underline"
                >
                  "Não consigo"
                </button>
                <span className="text-muted-foreground text-[10px]">•</span>
                <button
                  type="button"
                  onClick={() => {
                    setSimTexto("Confirmado, pode contar comigo!");
                    setSimIsFriday(true);
                  }}
                  className="text-[10px] text-emerald-400 hover:underline"
                >
                  "Confirmado"
                </button>
                <span className="text-muted-foreground text-[10px]">•</span>
                <button
                  type="button"
                  onClick={() => {
                    setSimTexto("Tive um imprevisto, não vou conseguir ir.");
                    setSimIsFriday(true);
                  }}
                  className="text-[10px] text-rose-400 hover:underline"
                >
                  "Desistência"
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                value={simTexto}
                onChange={(e) => setSimTexto(e.target.value)}
                placeholder="Ex: Domingo eu posso de manhã"
                className="text-xs h-9"
              />
              <Button
                type="button"
                size="sm"
                onClick={onExecuteSimResponse}
                disabled={simProcessing || !simTexto.trim()}
                className="h-9 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                {simProcessing ? "Interpretando..." : "Interpretar Mensagem"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Tabela de Logs de Auditoria e Idempotência */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Histórico Auditável de Automações
            </CardTitle>
            <span className="text-xs text-muted-foreground">{logs.length} registros</span>
          </div>
          <CardDescription className="text-xs">
            Registro de todas as consultas, confirmações, mensagens e chaves de idempotência geradas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Nenhuma rotina de automação executada ainda. Use os botões acima para simular os fluxos.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground text-left">
                    <th className="py-2.5 px-3">Data / Hora</th>
                    <th className="py-2.5 px-3">Rotina</th>
                    <th className="py-2.5 px-3">Destinatário</th>
                    <th className="py-2.5 px-3">Mensagem</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Idempotência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/20">
                      <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-foreground whitespace-nowrap">
                        {log.tipo_rotina === "consulta_segunda"
                          ? "Consulta Segunda"
                          : log.tipo_rotina === "confirmacao_sexta"
                          ? "Confirmação Sexta"
                          : log.tipo_rotina}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {log.destinatario_nome || log.destinatario_tipo}
                      </td>
                      <td className="py-2.5 px-3 max-w-xs truncate text-muted-foreground" title={log.mensagem_texto}>
                        {log.mensagem_texto}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            log.status === "executada"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]"
                              : log.status === "simulada"
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]"
                              : "text-[10px]"
                          }
                        >
                          {log.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-muted-foreground max-w-[120px] truncate" title={log.idempotency_key}>
                        {log.idempotency_key}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Modal de Recomendação de Substitutos (Gate 4 & 6) */}
      <Dialog open={substitutesModalOpen} onOpenChange={setSubstitutesModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Recomendação Inteligente de Folguistas (Gate 4 & 6)
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedVagaForSub && (
                <>
                  Vaga para:{" "}
                  <strong>
                    {selectedVagaForSub.diaSemana === "sabado" ? "Sábado" : "Domingo"} (
                    {formatDateBR(selectedVagaForSub.data)}) — {selectedVagaForSub.descricaoTurno}
                  </strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {substituteCandidates.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Nenhum folguista elegível encontrado para este turno com os critérios atuais.
              </div>
            ) : (
              substituteCandidates.map((cand, idx) => (
                <div
                  key={cand.colaborador.id}
                  className={`p-3 rounded-lg border text-xs space-y-2 ${
                    cand.recomendado
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : "bg-muted/30 border-border/40 opacity-80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">
                        #{idx + 1} {cand.colaborador.nome}
                      </span>
                      {cand.recomendado && (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                          Recomendado
                        </Badge>
                      )}
                    </div>
                    <div className="font-mono font-bold text-primary">
                      Pontuação: {cand.pontuacao} pts
                    </div>
                  </div>

                  {/* Motivos da Pontuação */}
                  <div className="space-y-1">
                    {cand.motivoPontuacao.map((m, mi) => (
                      <div key={mi} className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>{m}</span>
                      </div>
                    ))}
                  </div>

                  {/* Restrições / Alertas CLT */}
                  {cand.restricoes.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/30">
                      {cand.restricoes.map((r, ri) => (
                        <div key={ri} className="text-[11px] text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ação de Atribuir */}
                  {onAssignFolguistaToSlot && selectedVagaForSub && (
                    <div className="pt-2 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!cand.atendeDescansoClt}
                        onClick={() => {
                          // Procura se já existe slot criado ou notifica
                          setSubstitutesModalOpen(false);
                        }}
                        className="h-7 text-xs bg-primary text-primary-foreground font-semibold"
                      >
                        Atribuir este Folguista
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
