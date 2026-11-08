import React, { useState, useMemo, useRef, useEffect } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/shared/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useWalletAgentChat } from "../hooks/useWalletAgentChat";
import { WalletAiOrchestratorClient } from "../services/WalletAiOrchestratorClient";
import { AgentVisualizationRenderer } from "./AgentVisualizationRenderer";
import { AgentActionProposalCard } from "./AgentActionProposalCard";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import {
  Send,
  Sparkles,
  Bot,
  User,
  RefreshCw,
  Loader2,
  Brain,
  Zap,
  CheckCircle2,
  Crown,
} from "lucide-react";

export interface AgentV2TabProps {
  agentType?: "ceo" | "operational";
}

const CEO_QUICK_PROMPTS = [
  "Qual o diagnóstico do faturamento e resultado operacional deste mês?",
  "Como está o CMV e a margem bruta de contribuição dos produtos?",
  "Analise as despesas por departamento e aponte oportunidades de corte",
  "Propor um experimento comercial para alavancar o faturamento",
];

const OPERATIONAL_QUICK_PROMPTS = [
  "Quais contas e boletos vencem hoje ou nesta semana?",
  "Conferir fechamento de vendas e entradas do dia",
  "Identificar despesas ou receitas pendentes de conciliação",
  "Verificar se há cobranças ou notas fiscais duplicadas",
];

export const AgentV2Tab: React.FC<AgentV2TabProps> = ({ agentType = "operational" }) => {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isCeoBrain = agentType === "ceo";
  const quickPrompts = isCeoBrain ? CEO_QUICK_PROMPTS : OPERATIONAL_QUICK_PROMPTS;

  const client = useMemo(() => {
    return new WalletAiOrchestratorClient({
      baseUrl: `${import.meta.env.VITE_SUPABASE_URL || ""}/functions/v1/wallet-ai-orchestrator`,
      getAccessToken: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      },
    });
  }, []);

  const { messages, isLoading, currentStatus, sendMessage, clearChat } =
    useWalletAgentChat({
      workspaceId: activeWorkspace?.id,
      client,
      agentType,
      onError: (err) => {
        toast({
          title: "Aviso do Assistente",
          description: err.message,
          variant: "destructive",
        });
      },
    });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isLoading) return;
    setInputText("");
    await sendMessage(text);
  };

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 backdrop-blur-sm ${
          isCeoBrain
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-primary/20 bg-primary/5"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-sm ${
              isCeoBrain
                ? "bg-amber-500 text-amber-950 font-bold"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {isCeoBrain ? <Crown className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">
                {isCeoBrain ? "Wallet CEO — Cérebro Executivo" : "Wallet IA — Cérebro Operacional"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                  isCeoBrain
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                }`}
              >
                {isCeoBrain ? "Raciocínio Estratégico · Isolamento Privado" : "Rotinas & Conciliação"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Workspace ativo:{" "}
              <strong className="text-foreground">{activeWorkspace?.nome || "Carregando..."}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={clearChat}
            disabled={messages.length === 0 || isLoading}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Nova Consulta
          </Button>
        </div>
      </div>

      {/* Main Chat Box */}
      <Card className="border border-border/60 shadow-sm bg-card/50 flex flex-col h-[560px]">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-8">
              <div
                className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-inner ${
                  isCeoBrain
                    ? "bg-amber-500/15 border border-amber-500/30 text-amber-400"
                    : "bg-primary/10 border border-primary/20 text-primary"
                }`}
              >
                {isCeoBrain ? <Crown className="h-6 w-6" /> : <Brain className="h-6 w-6" />}
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="font-semibold text-foreground text-base">
                  {isCeoBrain
                    ? "Como posso orientar suas decisões estratégicas hoje?"
                    : "Como posso auxiliar suas rotinas financeiras hoje?"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isCeoBrain
                    ? "Análise de DRE gerencial, margens por produto, expansão de canais e redução de custos. Cálculos determinísticos e sem alucinações."
                    : "Conferência de boletos, conciliação bancária, conferência de caixa e rotinas administrativas sem alteração no banco sem confirmação."}
                </p>
              </div>

              {/* Sugestões rápidas especializadas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg pt-2">
                {quickPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="text-left p-2.5 rounded-lg border border-border/60 bg-background/80 hover:bg-accent/60 hover:border-primary/40 transition-all text-xs text-foreground/90 font-medium flex items-center gap-2 shadow-xs cursor-pointer"
                  >
                    <Zap className={`h-3.5 w-3.5 shrink-0 ${isCeoBrain ? "text-amber-400" : "text-primary"}`} />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 text-sm ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isCeoBrain ? "bg-amber-500/20 text-amber-400" : "bg-primary/20 text-primary"
                    }`}
                  >
                    {isCeoBrain ? <Crown className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 space-y-2.5 leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground font-medium rounded-tr-xs"
                      : "bg-muted/60 text-foreground border border-border/40 rounded-tl-xs shadow-xs"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* Visualização rica de ferramentas executadas */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="pt-2 border-t border-border/40 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Fontes consultadas:</span>
                      </div>
                      <div className="space-y-2">
                        {msg.toolCalls.map((tc, idx) => {
                          const actionProposal =
                            tc.tool === "propor_cadastro_despesa" ||
                            tc.tool === "propor_cadastro_receita" ||
                            tc.tool === "propor_experimento_comercial"
                              ? (tc.output as any)
                              : null;

                          return (
                            <div key={idx} className="space-y-2">
                              {actionProposal && actionProposal.action_type ? (
                                <AgentActionProposalCard proposal={actionProposal} />
                              ) : (
                                <AgentVisualizationRenderer
                                  toolName={tc.tool}
                                  output={tc.output}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="h-7 w-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))
          )}

          {/* Loading status */}
          {isLoading && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl border border-border/30 w-fit">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>{currentStatus || "Processando análise determinística..."}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input Bar */}
        <div className="p-3 border-t border-border/40 bg-background/50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isCeoBrain
                  ? "Pergunte ao Cérebro CEO sobre saúde financeira, margens, DRE, CMV ou expansão..."
                  : "Pergunte à Wallet IA sobre boletos, notas fiscais, conciliações ou despesas..."
              }
              disabled={isLoading}
              className="flex-1 text-sm bg-background border-border/60 focus-visible:ring-primary/40 h-10"
            />
            <Button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className={`h-10 px-4 gap-1.5 shrink-0 ${
                isCeoBrain
                  ? "bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold"
                  : ""
              }`}
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Enviar</span>
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};
