/**
 * WalletIAPage — Etapa 1 da Wallet IA Unificada
 *
 * Interface única "Wallet IA" que substitui os três seletores
 * [Agent V2] [Consulta Rápida] [IA Legada].
 *
 * Internamente usa:
 *  - useWalletIA → orquestrador + router
 *  - useConversas → sidebar persistente (reutiliza tabela chat_conversas)
 *  - useChatFinanceiro → persistência de mensagens (chat_mensagens)
 *  - AgentVisualizationRenderer → gráficos inline no chat
 *  - AgentActionProposalCard → propostas de ação inline no chat
 *  - ConversasSidebar → sidebar reutilizada da IA Legada
 *
 * O usuário NUNCA vê "Agent V2", "Consulta Rápida" ou "IA Legada".
 */

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import {
  Brain,
  Send,
  Loader2,
  Paperclip,
  X,
  AlertCircle,
  Zap,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { ConversasSidebar } from "@/components/ia/ConversasSidebar";
import { AgentVisualizationRenderer } from "@/domains/ia/components/AgentVisualizationRenderer";
import { AgentActionProposalCard } from "@/domains/ia/components/AgentActionProposalCard";
import { useConversas } from "@/domains/ia/hooks/useConversas";
import { useWalletIA, type WalletIAMessage, type WalletIAAttachment } from "@/domains/ia/hooks/useWalletIA";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useReceitas } from "@/domains/finance/hooks/useReceitas";
import { useDespesas } from "@/domains/finance/hooks/useDespesas";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { cn } from "@/lib/utils";

// ─── Fast Query determinístico (reutiliza a lógica da Consulta Rápida) ────────

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dayKey = (data: unknown) => String(data || "").split("T")[0];

const METODO_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro (PDV)", pix: "Pix", cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito", boleto: "Boleto", voucher: "Voucher/Vale",
  transferencia: "Transferência", outros: "Outros",
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

type PeriodoId = "hoje" | "ontem" | "semana" | "mes" | "mes_passado";

function detectarPeriodo(p: string, padrao: PeriodoId): PeriodoId {
  if (p.includes("ontem")) return "ontem";
  if (p.includes("hoje") || p.includes("dia de hoje")) return "hoje";
  if (p.includes("semana")) return "semana";
  if (p.includes("mes passado") || p.includes("mes anterior")) return "mes_passado";
  if (p.includes("mes")) return "mes";
  return padrao;
}

function filtroPeriodo(periodo: PeriodoId): { label: string; match: (dia: string) => boolean } {
  const hoje = new Date();
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
  const seteDias = new Date(hoje); seteDias.setDate(seteDias.getDate() - 6);
  const mesAtual = isoDay(hoje).slice(0, 7);
  const mesPassadoDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const mesPassado = isoDay(mesPassadoDate).slice(0, 7);
  switch (periodo) {
    case "hoje": return { label: "hoje", match: (d) => d === isoDay(hoje) };
    case "ontem": return { label: "ontem", match: (d) => d === isoDay(ontem) };
    case "semana": return { label: "nos últimos 7 dias", match: (d) => d >= isoDay(seteDias) && d <= isoDay(hoje) };
    case "mes_passado": return { label: "no mês passado", match: (d) => d.startsWith(mesPassado) };
    case "mes": default: return { label: "neste mês", match: (d) => d.startsWith(mesAtual) };
  }
}

function somaPorMetodo(lista: Array<{ valor: number; metodo?: string | null }>): string {
  const porMetodo = new Map<string, number>();
  for (const item of lista) {
    const m = METODO_LABEL[item.metodo || "outros"] ?? METODO_LABEL.outros;
    porMetodo.set(m, (porMetodo.get(m) ?? 0) + Number(item.valor || 0));
  }
  return [...porMetodo.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([m, v]) => `  • ${m}: **${formatCurrency(v)}**`)
    .join("\n");
}

interface DadosIA {
  receitas: Array<{ valor: number; data: string; descricao?: string; metodo_pagamento?: string | null }>;
  despesas: Array<{ valor: number; data: string; descricao?: string }>;
  contas: Array<{ nome: string; saldo_atual: number; tipo: string }>;
}

function gerarRespostaRapida(pergunta: string, dados: DadosIA): string {
  const p = norm(pergunta);
  const { receitas, despesas, contas } = dados;
  const receitasComDia = receitas.map((r) => ({ ...r, dia: dayKey(r.data), valor: Number(r.valor || 0) }));
  const despesasComDia = despesas.map((d) => ({ ...d, dia: dayKey(d.data), valor: Number(d.valor || 0) }));
  const saldoTotal = contas.filter((c) => c.tipo !== "cartao_credito").reduce((a, c) => a + Number(c.saldo_atual || 0), 0);
  const filtroMes = filtroPeriodo("mes");
  const filtroMesPassado = filtroPeriodo("mes_passado");
  const receitasMes = receitasComDia.filter((r) => filtroMes.match(r.dia));
  const despesasMes = despesasComDia.filter((d) => filtroMes.match(d.dia));
  const totalReceitasMes = receitasMes.reduce((a, r) => a + r.valor, 0);
  const totalDespesasMes = despesasMes.reduce((a, d) => a + d.valor, 0);
  const totalReceitasMesPassado = receitasComDia.filter((r) => filtroMesPassado.match(r.dia)).reduce((a, r) => a + r.valor, 0);
  const totalDespesasMesPassado = despesasComDia.filter((d) => filtroMesPassado.match(d.dia)).reduce((a, d) => a + d.valor, 0);

  if (p.includes("saldo") || p.includes("quanto tenho") || p.includes("caixa")) {
    const detalhe = contas.filter((c) => c.tipo !== "cartao_credito").map((c) => `  • **${c.nome}:** ${formatCurrency(Number(c.saldo_atual || 0))}`).join("\n");
    return `💳 **Situação de caixa agora:**\n\n${detalhe || "  • Nenhuma conta cadastrada"}\n\n💰 **Total disponível:** **${formatCurrency(saldoTotal)}**`;
  }
  if (p.includes("lucro") || p.includes("resultado") || p.includes("margem") || p.includes("sobrou")) {
    const lucroMes = totalReceitasMes - totalDespesasMes;
    const lucroMesPassado = totalReceitasMesPassado - totalDespesasMesPassado;
    return `📈 **Resultado (visão de caixa):**\n\n**Este mês:**\n- Receitas: ${formatCurrency(totalReceitasMes)}\n- Despesas: ${formatCurrency(totalDespesasMes)}\n- 💰 **Saldo do mês: ${formatCurrency(lucroMes)}** ${lucroMes >= 0 ? "✅" : "🔴"}\n\n**Mês passado:** ${formatCurrency(lucroMesPassado)}`;
  }
  if (p.includes("despesa") || p.includes("gasto") || p.includes("gastei") || p.includes("custo") || p.includes("paguei")) {
    const periodo = detectarPeriodo(p, "mes");
    const filtro = filtroPeriodo(periodo);
    const lista = despesasComDia.filter((d) => filtro.match(d.dia));
    const total = lista.reduce((a, d) => a + d.valor, 0);
    const maiores = [...lista].sort((a, b) => b.valor - a.valor).slice(0, 3);
    const top = maiores.length ? `\n\n**Maiores gastos:**\n${maiores.map((d) => `  • ${d.descricao || "Despesa"}: **${formatCurrency(d.valor)}**`).join("\n")}` : "";
    return `📊 **Despesas ${filtro.label}:**\n\n- **Total:** **${formatCurrency(total)}** (${lista.length} lançamentos)${top}`;
  }
  if (p.includes("vend") || p.includes("fatur") || p.includes("receita") || p.includes("receb") || p.includes("entrou")) {
    const periodo = detectarPeriodo(p, "hoje");
    const filtro = filtroPeriodo(periodo);
    const lista = receitasComDia.filter((r) => filtro.match(r.dia));
    const total = lista.reduce((a, r) => a + r.valor, 0);
    const detalheMetodos = somaPorMetodo(lista.map((r) => ({ valor: r.valor, metodo: r.metodo_pagamento })));
    return `💵 **Vendas ${filtro.label}:**\n\n- **Total vendido:** **${formatCurrency(total)}**\n- **Quantidade:** ${lista.length} vendas/entradas\n\n${detalheMetodos ? `**Por forma de pagamento:**\n${detalheMetodos}` : ""}`;
  }
  if (p.includes("posso comprar") || p.includes("posso gastar")) {
    const match = p.match(/\d+([.,]\d+)?/);
    const valorCompra = match ? parseFloat(match[0].replace(",", ".")) : 0;
    const saldoApos = saldoTotal - valorCompra;
    const viavel = saldoApos > 2000;
    return `🛍️ **Análise de compra${valorCompra ? ` de ${formatCurrency(valorCompra)}` : ""}:**\n\n- **Saldo em contas:** ${formatCurrency(saldoTotal)}\n- **Saldo após a compra:** ${formatCurrency(saldoApos)}\n- **Avaliação:** ${viavel ? "✅ **COMPRA VIÁVEL**" : "⚠️ **ATENÇÃO AO CAIXA**"}`;
  }

  const filtroHoje = filtroPeriodo("hoje");
  const vendasHoje = receitasComDia.filter((r) => filtroHoje.match(r.dia)).reduce((a, r) => a + r.valor, 0);
  return `🤖 **Resumo financeiro rápido:**\n\n1. **Vendas de hoje:** **${formatCurrency(vendasHoje)}**\n2. **Vendas no mês:** **${formatCurrency(totalReceitasMes)}**\n3. **Despesas no mês:** **${formatCurrency(totalDespesasMes)}**\n4. **Saldo em contas:** **${formatCurrency(saldoTotal)}**`;
}

// ─── Componente de Mensagem ───────────────────────────────────────────────────

const MessageBubble: React.FC<{
  msg: WalletIAMessage;
  onConfirmAction?: (proposalId: string, payload?: Record<string, unknown>) => void;
  onCancelAction?: (proposalId: string) => void;
}> = ({ msg, onConfirmAction, onCancelAction }) => {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-3 group", isUser && "justify-end")}>
      {/* Avatar IA */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-sm">
          <Brain className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={cn("max-w-[80%] space-y-2", isUser && "items-end")}>
        {/* Imagem anexada */}
        {msg.imageDataUrl && (
          <img
            src={msg.imageDataUrl}
            alt="Imagem anexada"
            className="rounded-xl max-h-48 object-cover border border-border/50"
          />
        )}

        {/* Balão de mensagem */}
        {msg.content && (
          <div
            className={cn(
              "rounded-2xl px-4 py-3 text-sm leading-relaxed",
              isUser
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : msg.isError
                ? "bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 rounded-bl-sm"
                : "bg-card border border-border/50 text-foreground rounded-bl-sm"
            )}
          >
            {isUser ? (
              <span>{msg.content}</span>
            ) : (
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>
            )}
          </div>
        )}

        {/* Visualização (gráfico, KPI, tabela) */}
        {msg.visualization && !isUser && (
          <div className="mt-2">
            <AgentVisualizationRenderer contract={msg.visualization} />
          </div>
        )}

        {/* Proposta de Ação */}
        {msg.actionProposal && !isUser && onConfirmAction && onCancelAction && (
          <div className="mt-2">
            <AgentActionProposalCard
              proposal={msg.actionProposal as any}
              onConfirm={onConfirmAction}
              onCancel={onCancelAction}
            />
          </div>
        )}

        {/* Metadados de observabilidade (apenas em dev) */}
        {msg.routeUsed && import.meta.env.DEV && (
          <div className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
            {msg.routeUsed === "FAST_QUERY" && <Zap className="w-2.5 h-2.5" />}
            {msg.routeUsed === "AGENT_V2" && <Sparkles className="w-2.5 h-2.5" />}
            <span>{msg.routeUsed}</span>
            {msg.correlationId && <span>· {msg.correlationId.slice(0, 6)}</span>}
          </div>
        )}

        {/* Horário */}
        <p className="text-[10px] text-muted-foreground/60 px-1">
          {msg.createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Avatar usuário */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center shadow-sm border border-border/50">
          <span className="text-xs font-semibold text-muted-foreground">EU</span>
        </div>
      )}
    </div>
  );
};

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function WalletIAPage() {
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();

  // ── Sidebar de conversas ──────────────────────────────────────────────────
  const {
    conversas,
    isLoading: conversasLoading,
    criarConversa,
    renomearConversa,
    deletarConversa,
    atualizarUltimaMensagem,
  } = useConversas();

  const [conversaAtiva, setConversaAtiva] = useState<string | null>(null);

  // Seleciona a primeira conversa ao carregar
  useEffect(() => {
    if (conversasLoading || conversaAtiva) return;
    if (conversas.length > 0) setConversaAtiva(conversas[0].id);
  }, [conversas, conversasLoading, conversaAtiva]);

  // ── Dados financeiros para a Consulta Rápida ──────────────────────────────
  const inicioJanela = useMemo(() => {
    // CORREÇÃO (Etapa 1.1): Usa Date aritmético real.
    // ORDEM IMPORTANTE: setDate(1) ANTES de setMonth() para evitar overflow.
    // Ex: 31/Dez → setMonth(11-3=8=Set): Set não tem 31 dias → overflow para Out.
    // Com setDate(1) primeiro: 1/Dez → setMonth(8=Set) → 1/Set ✅
    const d = new Date();
    d.setDate(1);                   // primeiro dia do mês atual (evita overflow)
    d.setMonth(d.getMonth() - 3);  // 3 meses atrás
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0"); // +1 porque getMonth() é 0-indexed
    return `${y}-${m}-01`;
  }, []);

  const { receitas } = useReceitas({ startDate: inicioJanela });
  const { despesas } = useDespesas({ startDate: inicioJanela });
  const { data: contas = [] } = useQuery({
    queryKey: ["wallet-ia-contas"],
    queryFn: async () => {
      const { data } = await supabase.from("contas_usuario").select("*");
      return (data ?? []).map((c: any) => ({
        nome: String(c.nome || ""),
        saldo_atual: Number(c.saldo_atual ?? c.saldo ?? 0),
        tipo: String(c.tipo || ""),
      }));
    },
    staleTime: 1000 * 60 * 5,
  });

  const dadosFinanceiros = useMemo(
    () => ({ receitas, despesas, contas }),
    [receitas, despesas, contas]
  );

  const fastQueryFn = useCallback(
    (pergunta: string) => gerarRespostaRapida(pergunta, dadosFinanceiros),
    [dadosFinanceiros]
  );

  // ── Persistência de mensagens ─────────────────────────────────────────────
  const onMessagePersist = useCallback(
    async (msg: WalletIAMessage, conversaId: string) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        await supabase.from("chat_mensagens").insert({
          id: msg.id,
          conversa_id: conversaId,
          user_id: session.user.id,
          role: msg.role,
          conteudo: msg.content,
        });
      } catch (err) {
        logger.error("WalletIAPage", "Erro ao persistir mensagem", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    []
  );

  const onMessageSent = useCallback(
    (conversaId: string) => {
      atualizarUltimaMensagem(conversaId);
    },
    [atualizarUltimaMensagem]
  );

  // ── Hook central Wallet IA ────────────────────────────────────────────────
  const { messages, isLoading, currentStatus, sendMessage, clearChat, loadHistory } =
    useWalletIA({
      workspaceId: activeWorkspace?.id,
      conversaId: conversaAtiva ?? undefined,
      dadosFinanceiros,
      fastQueryFn,
      onMessagePersist,
      onMessageSent,
      onError: (err) => {
        logger.error("WalletIAPage", "Erro do assistente", { message: err.message });
      },
    });

  // ── Action Proposal callbacks ─────────────────────────────────────────────
  // REGRA ABSOLUTA: o card da proposta ser renderizado NÃO executa nada.
  // A execução só ocorre quando o usuário confirmar explicitamente via onConfirmAction.
  // Por enquanto, exibe toast informativo e aguarda infraestrutura do Action Gateway
  // (Etapa 4) para execução real. Nenhuma mutação financeira ocorre aqui.
  const handleConfirmAction = useCallback(
    (proposalId: string, _payload?: Record<string, unknown>) => {
      logger.info("WalletIAPage", "Proposta de ação confirmada pelo usuário", { proposalId });
      toast({
        title: "Ação registrada",
        description: "A proposta foi confirmada. A execução automática chegará na Etapa 4 — Action Gateway.",
      });
    },
    [toast]
  );

  const handleCancelAction = useCallback(
    (proposalId: string) => {
      logger.info("WalletIAPage", "Proposta de ação cancelada pelo usuário", { proposalId });
      toast({
        title: "Ação cancelada",
        description: "A proposta foi descartada.",
        variant: "destructive",
      });
    },
    [toast]
  );

  // ── Carregar histórico ao trocar de conversa ──────────────────────────────
  useEffect(() => {
    if (!conversaAtiva) {
      clearChat();
      return;
    }

    const loadConversaHistory = async () => {
      const { data, error } = await supabase
        .from("chat_mensagens")
        .select("id, role, conteudo, imagem_base64, created_at")
        .eq("conversa_id", conversaAtiva)
        .order("created_at", { ascending: true });

      if (error) {
        logger.error("WalletIAPage", "Erro ao carregar histórico", { error: error.message });
        return;
      }

      const history: WalletIAMessage[] = (data ?? []).map((row) => ({
        id: row.id,
        role: row.role as "user" | "assistant",
        content: row.conteudo,
        createdAt: new Date(row.created_at),
        imageDataUrl: row.imagem_base64
          ? `data:image/jpeg;base64,${row.imagem_base64}`
          : undefined,
      }));

      loadHistory(history);
    };

    clearChat();
    loadConversaHistory();
  }, [conversaAtiva]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gerenciamento de conversas ────────────────────────────────────────────
  const handleNovaConversa = async () => {
    try {
      const nova = await criarConversa.mutateAsync("Nova Conversa");
      setConversaAtiva(nova.id);
      clearChat();
    } catch {
      toast({ title: "Erro ao criar conversa", variant: "destructive" });
    }
  };

  const handleSelectConversa = (id: string) => {
    if (id !== conversaAtiva) setConversaAtiva(id);
  };

  // Geração automática de título após 1ª resposta
  const handleAutoTitle = useCallback(
    async (conversaId: string, primeiraMsg: string) => {
      const conversa = conversas.find((c) => c.id === conversaId);
      if (conversa?.titulo !== "Nova Conversa") return;
      const titulo = primeiraMsg.trim().slice(0, 50) || "Nova Conversa";
      renomearConversa.mutate({ id: conversaId, titulo });
    },
    [conversas, renomearConversa]
  );

  // ── Input e anexos ────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState("");
  const [attachment, setAttachment] = useState<WalletIAAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async () => {
    const text = inputText.trim();
    if ((!text && !attachment) || isLoading) return;

    // Criar conversa automaticamente se não houver uma ativa
    let cId = conversaAtiva;
    if (!cId) {
      try {
        const nova = await criarConversa.mutateAsync(text.slice(0, 50) || "Nova Conversa");
        cId = nova.id;
        setConversaAtiva(cId);
      } catch {
        toast({ title: "Erro ao criar conversa", variant: "destructive" });
        return;
      }
    }

    setInputText("");
    const att = attachment;
    setAttachment(null);

    await sendMessage(text, att ? [att] : undefined);

    // Título automático
    if (cId && text) {
      await handleAutoTitle(cId, text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast({ title: "Tipo não suportado", description: "Envie imagens (PNG, JPG) ou PDF.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 10MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAttachment({
        type: file.type.startsWith("image/") ? "image" : "pdf",
        mimeType: file.type,
        base64: dataUrl.split(",")[1],
        dataUrl,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Sidebar de conversas (reutilizada da IA Legada) */}
        <ConversasSidebar
          conversas={conversas}
          conversaAtiva={conversaAtiva}
          isLoading={conversasLoading}
          onSelectConversa={handleSelectConversa}
          onNovaConversa={handleNovaConversa}
          onRenomear={(id, titulo) => renomearConversa.mutate({ id, titulo })}
          onDeletar={async (id) => {
            await deletarConversa.mutateAsync(id);
            if (conversaAtiva === id) {
              const restantes = conversas.filter((c) => c.id !== id);
              setConversaAtiva(restantes.length > 0 ? restantes[0].id : null);
            }
          }}
        />

        {/* Área principal do chat */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {/* Header */}
          <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-card/50 backdrop-blur-sm">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-md shadow-purple-500/20">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background" />
            </div>
            <div>
              <h1 className="font-bold text-foreground leading-tight">Wallet IA</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Online · Dados reais
                {activeWorkspace && (
                  <span className="text-muted-foreground/60">· {activeWorkspace.nome}</span>
                )}
              </p>
            </div>
          </div>

          {/* Área de mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Estado vazio */}
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-violet-600/20 border border-purple-500/20 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-purple-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground text-lg">Como posso ajudar?</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pergunte sobre suas finanças, envie uma nota fiscal ou peça uma análise.
                  </p>
                </div>
                {/* Sugestões */}
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {[
                    "Quanto vendi hoje?",
                    "Qual meu lucro este mês?",
                    "Quanto tenho em conta?",
                    "Compare este mês com o anterior",
                    "Mostre em gráfico minhas despesas",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setInputText(s);
                        textareaRef.current?.focus();
                      }}
                      className="px-3 py-1.5 text-xs rounded-full border border-border/70 bg-muted/50 text-muted-foreground hover:bg-muted hover:border-border transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mensagens */}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onConfirmAction={handleConfirmAction}
                onCancelAction={handleCancelAction}
              />
            ))}

            {/* Status de loading */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-sm">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <div className="bg-card border border-border/50 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{currentStatus || "Processando..."}</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input de mensagem */}
          <div className="flex-shrink-0 border-t border-border/50 bg-card/50 backdrop-blur-sm p-4">
            {/* Preview de anexo */}
            {attachment && (
              <div className="mb-3 flex items-center gap-2 p-2 rounded-xl bg-muted/50 border border-border/50">
                {attachment.type === "image" ? (
                  <img src={attachment.dataUrl} alt={attachment.name} className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-600">PDF</span>
                  </div>
                )}
                <span className="text-sm text-foreground flex-1 truncate">{attachment.name}</span>
                <button
                  onClick={() => setAttachment(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              {/* Botão de anexo */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="flex-shrink-0 w-9 h-9 rounded-xl border border-border/70 bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-40"
                title="Enviar imagem ou PDF"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={handleFileSelect}
              />

              {/* Textarea */}
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  placeholder="Pergunte ou envie imagem/PDF/NF/boleto..."
                  rows={1}
                  className={cn(
                    "w-full resize-none rounded-xl border border-border/70 bg-background px-4 py-2.5 pr-12 text-sm text-foreground placeholder:text-muted-foreground",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors",
                    "disabled:opacity-50 max-h-40 overflow-y-auto"
                  )}
                  style={{ minHeight: "42px" }}
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = "auto";
                    t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
                  }}
                />
              </div>

              {/* Botão enviar */}
              <Button
                onClick={handleSend}
                disabled={isLoading || (!inputText.trim() && !attachment)}
                size="icon"
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary hover:bg-primary/90 shadow-sm"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground/50 mt-2 text-center">
              Enter para enviar · Shift+Enter para nova linha
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
