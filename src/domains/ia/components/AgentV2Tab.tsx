import React, { useState, useMemo, useRef, useEffect } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { WalletAiOrchestratorClient } from "../services/WalletAiOrchestratorClient";
import { useWalletAgentChat } from "../hooks/useWalletAgentChat";
import { AgentVisualizationRenderer } from "./AgentVisualizationRenderer";
import { AgentActionProposalCard } from "./AgentActionProposalCard";
import {
  Brain,
  Send,
  Loader2,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useToast } from "@/shared/hooks/use-toast";

const QUICK_PROMPTS = [
  "Qual meu saldo consolidado disponível hoje?",
  "Qual o resumo financeiro de receitas e despesas de agosto de 2026?",
  "Quais são minhas maiores despesas operacionais deste mês?",
  "Tenho alguma conta ou dívida pendente de pagamento?",
];

export const AgentV2Tab: React.FC = () => {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground">
                Wallet Finance Agent V2
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Responses API · Server Deterministic
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
              <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                <Brain className="h-6 w-6" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="font-semibold text-foreground text-base">
                  Como posso ajudar suas finanças hoje?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Pergunte sobre receitas, despesas, saldos ou peça resumos financeiros consolidados. Todos os cálculos são determinísticos e auditáveis.
                </p>
              </div>

              {/* Sugestões rápidas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg pt-2">
                {QUICK_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="text-left p-2.5 rounded-lg border border-border/60 bg-background/80 hover:bg-accent/60 hover:border-primary/40 transition-all text-xs text-foreground/90 font-medium flex items-center gap-2 shadow-xs"
                  >
                    <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
                      <Brain className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm shadow-xs ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : msg.isError
                        ? "bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-bl-none"
                        : "bg-muted/70 border border-border/50 text-foreground rounded-bl-none"
                    }`}
                  >
                    {/* Tool Calls badges */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mb-2.5 flex flex-wrap gap-1.5 border-b border-border/40 pb-2">
                        {msg.toolCalls.map((tc, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-mono text-muted-foreground border border-border/40 shadow-2xs"
                          >
                            <ShieldCheck className="h-3 w-3 text-emerald-500" />
                            {tc.tool}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                  <div className="bg-muted/70 border border-border/50 rounded-2xl rounded-bl-none px-4 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-primary animate-ping" />
                    <span>{currentStatus || "Processando consulta segura..."}</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </CardContent>

        {/* Input Footer */}
        <div className="p-3.5 border-t border-border/50 bg-background/50 flex gap-2">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Pergunte ao Wallet Finance Agent (ex: Qual meu faturamento de agosto?)..."
            disabled={isLoading || !activeWorkspace}
            className="flex-1 text-xs sm:text-sm h-10"
          />
          <Button
            onClick={() => handleSend()}
            disabled={isLoading || !inputText.trim() || !activeWorkspace}
            className="h-10 px-4 gap-1.5 shadow-sm"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Enviar</span>
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
};
