import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types";
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/shared/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useWalletAgentChat } from "../hooks/useWalletAgentChat";
import { useTelegram } from "@/domains/finance/hooks/useTelegram";
import { WalletAiOrchestratorClient } from "../services/WalletAiOrchestratorClient";
import { AgentVisualizationRenderer } from "./AgentVisualizationRenderer";
import { AgentActionProposalCard } from "./AgentActionProposalCard";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
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
  Smartphone,
  ExternalLink,
  Copy,
  Layers,
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
  const telegram = useTelegram();
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

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [convChannel, setConvChannel] = useState<string>("web");
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  const [pairingData, setPairingData] = useState<{
    token: string;
    expires_at: string;
    link: string;
  } | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  const { messages, setMessages, isLoading, currentStatus, sendMessage, clearChat } =
    useWalletAgentChat({
      workspaceId: activeWorkspace?.id,
      client,
      agentType,
      conversationId: conversationId || undefined,
      onError: (err) => {
        toast({
          title: "Aviso do Assistente",
          description: err.message,
          variant: "destructive",
        });
      },
    });

  const initChatMemory = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData.session?.user?.id;
    if (!activeWorkspace?.id || !currentUserId) return;

    try {
      const { data: convs, error: convErr } = await supabase
        .from("wallet_ai_conversations")
        .select("id, title, channel, last_channel, updated_at")
        .eq("workspace_id", activeWorkspace.id)
        .eq("user_id", currentUserId)
        .eq("agent_type", agentType)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (convErr) {
        console.warn("[AgentV2Tab] Erro ao carregar conversa:", convErr);
        return;
      }

      let activeConvId: string;
      if (convs && convs.length > 0) {
        activeConvId = convs[0].id;
        setConvChannel(convs[0].channel || "web");
      } else {
        const { data: newConv, error: createErr } = await supabase
          .from("wallet_ai_conversations")
          .insert({
            workspace_id: activeWorkspace.id,
            user_id: currentUserId,
            title: isCeoBrain ? "Sessão Executiva CEO" : "Atendimento Operacional",
            agent_type: agentType,
            channel: "web",
            last_channel: "web",
            is_shared: false,
          })
          .select("id, channel")
          .single();

        if (createErr || !newConv) {
          console.warn("[AgentV2Tab] Erro ao criar conversa inicial:", createErr);
          return;
        }
        activeConvId = newConv.id;
        setConvChannel(newConv.channel || "web");
      }

      setConversationId(activeConvId);

      // Carrega histórico de mensagens persistidas
      const { data: msgs, error: msgsErr } = await supabase
        .from("wallet_ai_messages")
        .select("id, role, content, channel, created_at")
        .eq("conversation_id", activeConvId)
        .eq("workspace_id", activeWorkspace.id)
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: true });

      if (!msgsErr && msgs && msgs.length > 0) {
        setMessages(
          msgs.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant" | "system",
            content: m.content || "",
            channel: (m.channel as "web" | "telegram") || "web",
            createdAt: new Date(m.created_at),
          }))
        );
      }
    } catch (err) {
      console.warn("[AgentV2Tab] Falha ao recuperar memória:", err);
    }
  }, [activeWorkspace?.id, agentType, isCeoBrain, setMessages]);

  useEffect(() => {
    initChatMemory();
  }, [initChatMemory]);

  // Real-time synchronization com mensagens da mesma conversa (ex: Telegram <-> App)
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`wallet_ai_messages_sync_${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wallet_ai_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as {
            id: string;
            role: "user" | "assistant" | "system";
            content: string;
            channel?: "web" | "telegram";
            created_at: string;
          };
          if (!newMsg || !newMsg.id) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [
              ...prev,
              {
                id: newMsg.id,
                role: newMsg.role,
                content: newMsg.content || "",
                channel: newMsg.channel || "web",
                createdAt: new Date(newMsg.created_at),
              },
            ];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, setMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isLoading) return;
    setInputText("");
    await sendMessage(text);
  };

  const handleGerarLinkTelegram = async () => {
    setIsGeneratingLink(true);
    try {
      const res = await telegram.gerarLinkConexao(activeWorkspace?.id);
      setPairingData(res);
      toast({
        title: "Código de conexão gerado! ✈️",
        description: `Código ${res.token} válido por 10 minutos.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao gerar conexão",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const hasBothChannels = useMemo(() => {
    if (convChannel === "omnichannel") return true;
    const hasTg = messages.some((m) => m.channel === "telegram");
    const hasWeb = messages.some((m) => m.channel === "web" || !m.channel);
    return hasTg && hasWeb;
  }, [convChannel, messages]);

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
            <div className="flex items-center gap-2 flex-wrap">
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

              {!isCeoBrain && hasBothChannels && (
                <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-400 border-sky-500/30 gap-1">
                  <Layers className="h-2.5 w-2.5" />
                  Omnichannel (App + Telegram)
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Workspace ativo:{" "}
              <strong className="text-foreground">{activeWorkspace?.nome || "Carregando..."}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de Conexão com Telegram apenas no cérebro Operacional */}
          {!isCeoBrain && (
            <Dialog open={telegramDialogOpen} onOpenChange={setTelegramDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 text-xs gap-1.5 border ${
                    telegram.isVinculado
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      : "border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20"
                  }`}
                >
                  <Send className="h-3.5 w-3.5" />
                  {telegram.isVinculado
                    ? `Telegram Conectado ${telegram.vinculo?.telegram_username ? `(@${telegram.vinculo.telegram_username})` : ""}`
                    : "Conectar Telegram"}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-sky-400" />
                    Conexão Unificada com Telegram
                  </DialogTitle>
                  <DialogDescription>
                    Conecte sua conta do Telegram para continuar suas conversas operacionais a qualquer momento com contexto e histórico unificados.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  {telegram.isVinculado ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4" /> Vínculo Ativo
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Chat ID: {telegram.vinculo?.telegram_chat_id}
                        </span>
                      </div>
                      {telegram.vinculo?.telegram_username && (
                        <p className="text-xs text-foreground">
                          Usuário: <strong>@{telegram.vinculo.telegram_username}</strong>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Suas mensagens enviadas pelo Telegram continuam perfeitamente nesta aba e vice-versa.
                      </p>
                      <div className="pt-2 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8"
                          onClick={() => telegram.testarMensagem()}
                        >
                          Enviar Mensagem de Teste
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-8 text-destructive hover:text-destructive"
                          onClick={() => telegram.desvincularConta()}
                        >
                          Desconectar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Gere um link temporário seguro para parear sua conta do Telegram com a Wallet. Válido por 10 minutos.
                      </p>

                      {pairingData ? (
                        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground">Código de 6 dígitos:</span>
                            <Badge variant="outline" className="font-mono text-sm tracking-wider px-2.5 py-0.5 bg-background">
                              {pairingData.token}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Expira em 10 minutos. Clique no botão abaixo para abrir a conversa no Telegram e conectar automaticamente:
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 text-xs gap-1.5 bg-sky-600 hover:bg-sky-700 text-white"
                              onClick={() => window.open(pairingData.link, "_blank")}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Abrir no Telegram
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1"
                              onClick={() => {
                                navigator.clipboard.writeText(pairingData.token);
                                toast({ title: "Código copiado!", description: pairingData.token });
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          className="w-full text-xs gap-1.5 bg-sky-600 hover:bg-sky-700 text-white"
                          onClick={handleGerarLinkTelegram}
                          disabled={isGeneratingLink}
                        >
                          {isGeneratingLink ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Gerar Link de Conexão (10 min)
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}

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
                  className={`max-w-[85%] rounded-2xl px-4 py-3 space-y-2 leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground font-medium rounded-tr-xs"
                      : "bg-muted/60 text-foreground border border-border/40 rounded-tl-xs shadow-xs"
                  }`}
                >
                  {/* Badge de identificação da origem do canal */}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground pb-0.5">
                    {msg.channel === "telegram" ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium bg-sky-500/15 text-sky-400 border border-sky-500/30">
                        <Send className="h-2.5 w-2.5" /> Telegram
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${
                        msg.role === "user"
                          ? "bg-primary-foreground/15 text-primary-foreground/90 border border-primary-foreground/20"
                          : "bg-background/80 text-muted-foreground border border-border/40"
                      }`}>
                        <Smartphone className="h-2.5 w-2.5" /> Aplicativo
                      </span>
                    )}
                    <span className={msg.role === "user" ? "text-primary-foreground/75" : "text-muted-foreground/75"}>
                      {msg.createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

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
                              ? (tc.output as ActionProposal)
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
