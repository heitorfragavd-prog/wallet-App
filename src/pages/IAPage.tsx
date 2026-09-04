import React, { useState, useRef, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import {
  Brain, Zap, Sparkles, User, Send, Loader2, MessageSquare,
  Key, FileText, Settings, Check, AlertCircle, X, FileUp,
  Trash2, ChevronDown, ChevronUp, Paperclip,
} from "lucide-react";
import { ConversasSidebar } from "@/components/ia/ConversasSidebar";
import { useToast } from "@/shared/hooks/use-toast";
import { useIAConfiguracoes } from "@/domains/ia/hooks/useIAConfiguracoes";
import { useIAAnalysis } from "@/domains/ia/hooks/useIAAnalysis";
import { useChatFinanceiro } from "@/domains/ia/hooks/useChatFinanceiro";
import { useConversas } from "@/domains/ia/hooks/useConversas";
import { useReceitas } from "@/domains/finance/hooks/useReceitas";
import { useDespesas } from "@/domains/finance/hooks/useDespesas";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { logger } from "@/core/logging/LoggerService";
import { UploadInteligente } from "@/domains/ia/components/UploadInteligente";
import { AgentV2Tab } from "@/domains/ia/components/AgentV2Tab";

// ═══════════════════════════════════════════════════════════════════════════
// CONSULTA RÁPIDA — Motor local (sem custo, sem tokens)
// ═══════════════════════════════════════════════════════════════════════════

interface MensagemLocal {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ContaSaldo {
  nome: string;
  saldo_atual: number;
  tipo: string;
}

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

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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
    case "hoje":        return { label: "hoje",             match: (d) => d === isoDay(hoje) };
    case "ontem":       return { label: "ontem",            match: (d) => d === isoDay(ontem) };
    case "semana":      return { label: "nos últimos 7 dias", match: (d) => d >= isoDay(seteDias) && d <= isoDay(hoje) };
    case "mes_passado": return { label: "no mês passado",   match: (d) => d.startsWith(mesPassado) };
    case "mes": default: return { label: "neste mês",       match: (d) => d.startsWith(mesAtual) };
  }
}

function somaPorMetodo(lista: Array<{ valor: number; metodo?: string | null }>): string {
  const porMetodo = new Map<string, number>();
  for (const item of lista) {
    const m = METODO_LABEL[item.metodo || "outros"] ?? METODO_LABEL.outros;
    porMetodo.set(m, (porMetodo.get(m) ?? 0) + Number(item.valor || 0));
  }
  return [...porMetodo.entries()].sort((a, b) => b[1] - a[1]).map(([m, v]) => `  • ${m}: **${formatCurrency(v)}**`).join("\n");
}

interface DadosIA {
  receitas: Array<{ valor: number; data: string; descricao?: string; metodo_pagamento?: string | null }>;
  despesas: Array<{ valor: number; data: string; descricao?: string }>;
  contas: ContaSaldo[];
}

function gerarRespostaIA(pergunta: string, dados: DadosIA): string {
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

  if (p.includes("devo vender") || p.includes("meta") || p.includes("ponto de equilibrio")) {
    const pontoEquilibrio = totalDespesasMes / 0.5735;
    const metaLucro = (totalDespesasMes + 10000) / 0.5735;
    return `🎯 **Meta de Vendas (base nas suas despesas reais deste mês):**\n\n- **Despesas do mês até agora:** ${formatCurrency(totalDespesasMes)}\n- 🛑 **Ponto de equilíbrio (venda mínima p/ não ter prejuízo):** **${formatCurrency(pontoEquilibrio)}**\n- 🚀 **Meta p/ lucrar ~R$ 10.000:** **${formatCurrency(metaLucro)}**\n- 📈 **Você já vendeu neste mês:** **${formatCurrency(totalReceitasMes)}**\n\n💡 ${totalReceitasMes >= pontoEquilibrio ? "✅ Você já passou do ponto de equilíbrio este mês!" : `Faltam **${formatCurrency(pontoEquilibrio - totalReceitasMes)}** em vendas para cobrir as despesas do mês.`}`;
  }
  if (p.includes("comprar") || p.includes("posso gastar") || p.includes("posso comprar")) {
    const matchValor = p.match(/\d+([.,]\d+)?/);
    const valorCompra = matchValor ? parseFloat(matchValor[0].replace(",", ".")) : 0;
    const saldoApos = saldoTotal - valorCompra;
    const viavel = saldoApos > 2000;
    return `🛍️ **Análise de compra${valorCompra ? ` de ${formatCurrency(valorCompra)}` : ""}:**\n\n- **Saldo real em contas:** ${formatCurrency(saldoTotal)}\n- **Saldo após a compra:** ${formatCurrency(saldoApos)}\n- **Avaliação:** ${viavel ? "✅ **COMPRA VIÁVEL**" : "⚠️ **ATENÇÃO AO CAIXA**"}\n\n${viavel ? "A compra não compromete sua reserva operacional." : "Recomendo adiar ou parcelar — o caixa ficaria abaixo do limite de segurança (R$ 2.000)."}`;
  }
  if (p.includes("saldo") || p.includes("conta") || p.includes("quanto tenho") || p.includes("caixa")) {
    const detalhe = contas.filter((c) => c.tipo !== "cartao_credito").map((c) => `  • **${c.nome}:** ${formatCurrency(Number(c.saldo_atual || 0))}`).join("\n");
    return `💳 **Situação de caixa agora:**\n\n${detalhe || "  • Nenhuma conta cadastrada"}\n\n💰 **Total disponível:** **${formatCurrency(saldoTotal)}**`;
  }
  if (p.includes("lucro") || p.includes("resultado") || p.includes("margem") || p.includes("sobrou")) {
    const lucroMes = totalReceitasMes - totalDespesasMes;
    const lucroMesPassado = totalReceitasMesPassado - totalDespesasMesPassado;
    return `📈 **Resultado (visão de caixa):**\n\n**Este mês:**\n- Receitas: ${formatCurrency(totalReceitasMes)}\n- Despesas: ${formatCurrency(totalDespesasMes)}\n- 💰 **Saldo do mês: ${formatCurrency(lucroMes)}** ${lucroMes >= 0 ? "✅" : "🔴"}\n\n**Mês passado:** ${formatCurrency(lucroMesPassado)} (Receitas ${formatCurrency(totalReceitasMesPassado)} − Despesas ${formatCurrency(totalDespesasMesPassado)})\n\n💡 Valores reais das suas telas de Receitas e Despesas (PDV + Divipay + lançamentos manuais).`;
  }
  if (p.includes("despesa") || p.includes("gasto") || p.includes("gastei") || p.includes("custo") || p.includes("paguei")) {
    const periodo = detectarPeriodo(p, "mes");
    const filtro = filtroPeriodo(periodo);
    const lista = despesasComDia.filter((d) => filtro.match(d.dia));
    const total = lista.reduce((a, d) => a + d.valor, 0);
    const maiores = [...lista].sort((a, b) => b.valor - a.valor).slice(0, 3);
    const top = maiores.length ? `\n\n**Maiores gastos${filtro.label === "hoje" || filtro.label === "ontem" ? "" : " do período"}:**\n${maiores.map((d) => `  • ${d.descricao || "Despesa"}: **${formatCurrency(d.valor)}**`).join("\n")}` : "";
    return `📊 **Despesas ${filtro.label}:**\n\n- **Total:** **${formatCurrency(total)}** (${lista.length} ${lista.length === 1 ? "lançamento" : "lançamentos"})${top}\n\n💡 Pergunte também: *"quanto gastei no mês passado?"* ou *"qual meu lucro este mês?"*`;
  }
  if (p.includes("vend") || p.includes("fatur") || p.includes("receita") || p.includes("receb") || p.includes("entrou")) {
    const periodo = detectarPeriodo(p, "hoje");
    const filtro = filtroPeriodo(periodo);
    const lista = receitasComDia.filter((r) => filtro.match(r.dia));
    const total = lista.reduce((a, r) => a + r.valor, 0);
    const detalheMetodos = somaPorMetodo(lista.map((r) => ({ valor: r.valor, metodo: r.metodo_pagamento })));
    return `💵 **Vendas ${filtro.label}:**\n\n- **Total vendido:** **${formatCurrency(total)}**\n- **Quantidade de vendas/entradas:** ${lista.length}\n\n${detalheMetodos ? `**Por forma de pagamento:**\n${detalheMetodos}` : ""}\n\n💡 Pergunte também: *"quanto vendeu ontem?"*, *"quanto vendeu este mês?"* ou *"qual meu lucro este mês?"*`;
  }

  const filtroHoje = filtroPeriodo("hoje");
  const vendasHoje = receitasComDia.filter((r) => filtroHoje.match(r.dia)).reduce((a, r) => a + r.valor, 0);
  return `🤖 **Resumo rápido das suas finanças:**\n\n1. **Vendas de hoje:** **${formatCurrency(vendasHoje)}**\n2. **Vendas no mês:** **${formatCurrency(totalReceitasMes)}**\n3. **Despesas no mês:** **${formatCurrency(totalDespesasMes)}**\n4. **Saldo em contas:** **${formatCurrency(saldoTotal)}**\n\nPosso responder com seus dados reais, por exemplo:\n- *"Quanto vendeu hoje?"* / *"quanto vendeu ontem?"*\n- *"Quanto gastei este mês?"*\n- *"Qual meu lucro este mês?"*\n- *"Quanto tenho em conta?"*\n- *"Posso comprar algo de R$ 2.000?"*`;
}

const QUICK_SUGGESTIONS = [
  "Quanto vendi hoje?",
  "Qual meu lucro?",
  "Quanto tenho em conta?",
  "Quanto gastei este mês?",
  "Posso comprar algo de R$ 2.000?",
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE: ABA CONSULTA RÁPIDA
// ═══════════════════════════════════════════════════════════════════════════

function ConsultaRapidaTab() {
  const [mensagens, setMensagens] = useState<MensagemLocal[]>([
    {
      role: "assistant",
      content: `Olá! Sou seu assistente financeiro com acesso aos seus dados reais (PDV + Divipay + lançamentos).\n\nPergunte coisas como:\n- *"Quanto vendeu hoje?"* ou *"quanto vendeu ontem?"*\n- *"Quanto vendeu este mês?"*\n- *"Quanto gastei este mês?"*\n- *"Qual meu lucro este mês?"*\n- *"Quanto tenho em conta?"*\n- *"Posso comprar algo de R$ 2.000?"*`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const inicioJanela = useMemo(() => {
    const d = new Date();
    return isoDay(new Date(d.getFullYear(), d.getMonth() - 3, 1));
  }, []);

  const { receitas, loading: loadingReceitas } = useReceitas({ startDate: inicioJanela });
  const { despesas, loading: loadingDespesas } = useDespesas({ startDate: inicioJanela });
  const { data: contas = [], isLoading: loadingContas } = useQuery({
    queryKey: ["ia-chat-contas"],
    queryFn: async () => {
      const { data } = await supabase.from("contas_usuario").select("*");
      const mapped = (data ?? []).map((c: { nome?: unknown; saldo_atual?: unknown; saldo?: unknown; tipo?: unknown }) => ({
        nome: String(c.nome || ""),
        saldo_atual: Number(c.saldo_atual ?? c.saldo ?? 0),
        tipo: String(c.tipo || "")
      }));
      return mapped as ContaSaldo[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const dadosProntos = !loadingReceitas && !loadingDespesas && !loadingContas;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const handleEnviar = async (texto?: string) => {
    const pergunta = (texto || input).trim();
    if (!pergunta || isLoading || !dadosProntos) return;
    setInput("");
    setMensagens((prev) => [...prev, { role: "user", content: pergunta, timestamp: new Date() }]);
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    const resposta = gerarRespostaIA(pergunta, { receitas, despesas, contas });
    setMensagens((prev) => [...prev, { role: "assistant", content: resposta, timestamp: new Date() }]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
      {/* Botões de atalho */}
      <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-border/30 bg-gradient-to-r from-emerald-500/5 to-transparent">
        {QUICK_SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => handleEnviar(s)}
            disabled={!dadosProntos || isLoading}
            className="px-3 py-1.5 text-xs rounded-full border border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 transition-colors disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Chat */}
      <Card className="flex-1 flex flex-col overflow-hidden border-0 rounded-none bg-card/60">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {mensagens.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4 text-emerald-400" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-muted/60 text-foreground border border-border/30"
                }`}
              >
                <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-emerald-400" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
              </div>
              <div className="bg-muted/60 rounded-2xl p-3.5 text-sm text-muted-foreground border border-border/30">
                Analisando seus dados...
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </CardContent>
        <div className="p-4 border-t border-border/40 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEnviar()}
            placeholder={dadosProntos ? "Pergunte: quanto vendeu hoje? qual meu lucro?" : "Carregando seus dados financeiros..."}
            disabled={!dadosProntos}
            className="flex-1"
          />
          <Button onClick={() => handleEnviar()} disabled={isLoading || !dadosProntos} className="bg-emerald-500 hover:bg-emerald-600 text-white">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE: ABA IA AVANÇADA (Chat OpenAI + Upload)
// ═══════════════════════════════════════════════════════════════════════════

const ADV_CHAT_SUGGESTIONS = [
  "Quanto gastei este mês?",
  "Quais são minhas maiores despesas?",
  "Como estão minhas metas financeiras?",
  "Tenho alguma dívida vencendo em breve?",
];

function IAAvancadaTab() {
  const { toast } = useToast();
  const { configuracao, isLoading: configLoading, salvarConfiguracao, isConfigured } = useIAConfiguracoes();
  const { results: analysisResults } = useIAAnalysis();
  const { conversas, isLoading: conversasLoading, criarConversa, renomearConversa, deletarConversa, atualizarUltimaMensagem } = useConversas();
  const [conversaAtiva, setConversaAtiva] = useState<string | null>(null);
  const { messages, isLoading: chatLoading, isLoadingHistory, systemPrompt, setSystemPrompt, sendMessage, clearChat } = useChatFinanceiro(conversaAtiva);

  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [chatInput, setChatInput] = useState("");
  const [showSystemPromptEditor, setShowSystemPromptEditor] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; base64: string; mimeType: string } | null>(null);
  const [activeSubTab, setActiveSubTab] = useState("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputChatRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (conversasLoading || conversaAtiva) return;
    if (conversas.length > 0) setConversaAtiva(conversas[0].id);
  }, [conversas, conversasLoading, conversaAtiva]);
  useEffect(() => {
    if (configuracao) {
      // api_key não é mais retornada ao frontend (segurança — Etapa 1.1)
      // O input de API key começa vazio — usuário deve redigitar para atualizar
      setSelectedModel(configuracao.modelo);
    }
  }, [configuracao]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  // ─── Conversas ──────────────────────────
  const handleNovaConversa = async () => {
    try {
      const nova = await criarConversa.mutateAsync("Nova Conversa");
      setConversaAtiva(nova.id);
      clearChat();
    } catch (err) {
      logger.error("IA", "Erro ao criar conversa", { error: err instanceof Error ? err.message : JSON.stringify(err) });
      toast({ title: "Erro ao criar conversa", variant: "destructive" });
    }
  };
  const handleSelectConversa = (id: string) => { if (id !== conversaAtiva) setConversaAtiva(id); };
  const handleRenomear = (id: string, titulo: string) => { renomearConversa.mutate({ id, titulo }); };
  const handleDeletarConversa = async (id: string) => {
    await deletarConversa.mutateAsync(id);
    if (conversaAtiva === id) {
      const restantes = conversas.filter((c) => c.id !== id);
      setConversaAtiva(restantes.length > 0 ? restantes[0].id : null);
    }
  };
  const handleMessageSent = async (cId: string) => {
    await atualizarUltimaMensagem(cId);
    const conversa = conversas.find((c) => c.id === cId);
    if (conversa?.titulo === "Nova Conversa" && messages.length === 0 && chatInput.trim()) {
      renomearConversa.mutate({ id: cId, titulo: chatInput.trim().slice(0, 50) });
    }
  };

  // ─── Chat ───────────────────────────────
  const handleSendChat = async () => {
    if ((!chatInput.trim() && !attachedImage) || chatLoading) return;
    if (!isConfigured) {
      toast({ title: "Configuração necessária", description: "Configure sua chave API OpenAI na aba Config.", variant: "destructive" });
      return;
    }
    if (!conversaAtiva) {
      let novaId: string;
      try {
        const nova = await criarConversa.mutateAsync(chatInput.trim().slice(0, 50) || "Nova Conversa");
        novaId = nova.id; setConversaAtiva(novaId);
      } catch (err) {
        logger.error("IA", "Erro ao criar conversa automaticamente", { error: err instanceof Error ? err.message : JSON.stringify(err) });
        toast({ title: "Erro ao criar conversa", variant: "destructive" }); return;
      }
      const text = chatInput; const img = attachedImage;
      setChatInput(""); setAttachedImage(null);
      await sendMessage(text, selectedModel, img?.base64, img?.mimeType, img?.dataUrl, handleMessageSent, novaId);
      return;
    }
    const text = chatInput; const img = attachedImage;
    setChatInput(""); setAttachedImage(null);
    await sendMessage(text, selectedModel, img?.base64, img?.mimeType, img?.dataUrl, handleMessageSent);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
  };

  const handleImageAttach = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Formato inválido", description: "Envie apenas imagens (PNG, JPG, etc.).", variant: "destructive" }); return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setAttachedImage({ dataUrl, base64: dataUrl.split(",")[1], mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  // ─── Upload / Análise ──────────────────
  const openaiModels = [
    { value: "gpt-4o", label: "GPT-4o (Recomendado para visão)" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (Mais rápido)" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-4", label: "GPT-4" },
  ];

  const handleSaveConfig = async () => {
    if (!apiKey.trim()) { toast({ title: "Erro", description: "Por favor, insira uma chave API válida.", variant: "destructive" }); return; }
    await salvarConfiguracao(apiKey, selectedModel);
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
        <TabsList className="grid grid-cols-4 bg-muted/50">
          <TabsTrigger value="chat" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            <MessageSquare className="w-4 h-4 mr-1 md:mr-2" /><span className="hidden sm:inline">Chat</span>
          </TabsTrigger>
          <TabsTrigger value="upload" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            <FileUp className="w-4 h-4 mr-1 md:mr-2" /><span className="hidden sm:inline">Upload</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            <Settings className="w-4 h-4 mr-1 md:mr-2" /><span className="hidden sm:inline">Config</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            <FileText className="w-4 h-4 mr-1 md:mr-2" /><span className="hidden sm:inline">Histórico</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══ CHAT ═══ */}
        <TabsContent value="chat" className="mt-0">
          <Card className="border-0 bg-card/50 overflow-hidden">
            <div className="flex h-[calc(100vh-340px)] min-h-[450px]">
              <ConversasSidebar conversas={conversas} conversaAtiva={conversaAtiva} isLoading={conversasLoading} onSelectConversa={handleSelectConversa} onNovaConversa={handleNovaConversa} onRenomear={handleRenomear} onDeletar={handleDeletarConversa} />
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-gradient-to-r from-purple-500/5 to-transparent min-h-[52px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-purple-500/15"><Brain className="w-4 h-4 text-purple-500" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{conversas.find((c) => c.id === conversaAtiva)?.titulo ?? "Assistente Financeiro"}</p>
                      <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-[10px] text-muted-foreground">Ferramentas financeiras ativas</span></div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowSystemPromptEditor((v) => !v)} className="text-muted-foreground hover:text-foreground gap-1 shrink-0">
                    {showSystemPromptEditor ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <span className="text-xs hidden sm:inline">Prompt</span>
                  </Button>
                </div>
                {showSystemPromptEditor && (
                  <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Instrução do agente — aplicada nas próximas mensagens</Label>
                    <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={4} className="text-xs bg-background/50 border-border/50 font-mono resize-none" placeholder="Instrução de sistema para o agente..." />
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {!conversaAtiva ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                      <div className="p-4 rounded-full bg-purple-500/10"><MessageSquare className="w-8 h-8 text-purple-500" /></div>
                      <div><p className="font-medium text-foreground">Nenhuma conversa selecionada</p><p className="text-sm text-muted-foreground mt-1">Crie uma nova conversa para começar.</p></div>
                      <Button onClick={handleNovaConversa} className="bg-purple-500 hover:bg-purple-600 text-white" disabled={criarConversa.isPending}>
                        {criarConversa.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Nova Conversa
                      </Button>
                    </div>
                  ) : isLoadingHistory ? (
                    <div className="flex items-center justify-center h-full gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Carregando histórico...</span></div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                      <div className="p-4 rounded-full bg-purple-500/10"><MessageSquare className="w-8 h-8 text-purple-500" /></div>
                      <div><p className="font-medium text-foreground">Converse com seus dados financeiros</p><p className="text-sm text-muted-foreground mt-1">Faça perguntas ou envie um comprovante para cadastro automático.</p></div>
                      {!isConfigured && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 max-w-sm">
                          <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0" />
                          <span className="text-xs text-yellow-600 dark:text-yellow-400">Configure sua chave API OpenAI na aba Config para começar.</span>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 justify-center max-w-md">
                        {ADV_CHAT_SUGGESTIONS.map((s) => (
                          <button key={s} onClick={() => setChatInput(s)} className="px-3 py-1.5 text-xs rounded-full border border-purple-500/30 bg-purple-500/5 text-purple-600 dark:text-purple-400 hover:bg-purple-500/15 transition-colors">{s}</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-purple-500 text-white rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                            {msg.imageDataUrl && <img src={msg.imageDataUrl} alt="Comprovante enviado" className="w-full max-w-[200px] rounded-lg mb-2 object-cover border border-white/20" />}
                            {msg.content}
                            <div className={`text-[10px] mt-1 ${msg.role === "user" ? "text-purple-200" : "text-muted-foreground"}`}>{msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="flex justify-start">
                          <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                            <div className="flex gap-1 items-center">
                              <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                              <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                              <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>
                {attachedImage && (
                  <div className="px-4 pt-3 flex items-center gap-2 border-t border-border/30">
                    <div className="relative inline-block shrink-0">
                      <img src={attachedImage.dataUrl} alt="Anexo" className="h-14 w-14 object-cover rounded-lg border border-border/50" />
                      <button onClick={() => setAttachedImage(null)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center"><X className="w-2.5 h-2.5" /></button>
                    </div>
                    <span className="text-xs text-muted-foreground">Imagem pronta — adicione uma mensagem opcional</span>
                  </div>
                )}
                <div className="border-t border-border/50 p-3">
                  <div className="flex gap-2 items-end">
                    <button onClick={() => fileInputChatRef.current?.click()} disabled={chatLoading || !isConfigured || !conversaAtiva} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-purple-500 hover:bg-purple-500/10 transition-colors disabled:opacity-40" title="Anexar comprovante (imagem)">
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <input ref={fileInputChatRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageAttach(f); e.target.value = ""; }} />
                    <Textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={handleChatKeyDown} placeholder={!conversaAtiva ? "Crie ou selecione uma conversa..." : attachedImage ? "Mensagem opcional..." : "Pergunte sobre suas finanças..."} rows={2} disabled={chatLoading || !isConfigured} className="flex-1 bg-background/50 border-border/50 resize-none text-sm" />
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button onClick={handleSendChat} disabled={chatLoading || (!chatInput.trim() && !attachedImage) || !isConfigured} size="sm" className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white h-9 w-9 p-0"><Send className="w-4 h-4" /></Button>
                      {messages.length > 0 && <Button onClick={clearChat} variant="ghost" size="sm" className="text-muted-foreground hover:text-red-500 h-9 w-9 p-0" title="Limpar exibição"><Trash2 className="w-4 h-4" /></Button>}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">Clipe para imagens · Enter para enviar · Shift+Enter para nova linha</p>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ═══ CONFIG ═══ */}
        <TabsContent value="config" className="space-y-6">
          <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/20"><Settings className="w-5 h-5 text-blue-500" /></div>
                <h2 className="text-xl font-bold text-foreground">Configurações OpenAI</h2>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="api-key" className="flex items-center gap-2 text-muted-foreground"><Key className="w-4 h-4" /><span>Chave API OpenAI</span></Label>
                  <Input id="api-key" type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-2 bg-background/50 border-border/50" disabled={configLoading} />
                  <p className="text-sm text-muted-foreground mt-1">Sua chave API é armazenada com segurança e nunca exposta no navegador</p>
                </div>
                <div>
                  <Label htmlFor="model-select" className="text-muted-foreground">Modelo OpenAI</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="mt-2 bg-background/50 border-border/50"><SelectValue placeholder="Selecione um modelo" /></SelectTrigger>
                    <SelectContent>{openaiModels.map((model) => <SelectItem key={model.value} value={model.value}>{model.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSaveConfig} className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white" disabled={configLoading}>
                  {isConfigured ? "Atualizar Configuração" : "Salvar Configuração"}
                </Button>
                {isConfigured && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <Check className="w-4 h-4 text-green-500" /><span className="text-sm text-green-600 dark:text-green-400">API configurada e pronta para uso</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ UPLOAD ═══ */}
        <TabsContent value="upload" className="space-y-6">
          <UploadInteligente />
        </TabsContent>

        {/* ═══ HISTORY ═══ */}
        <TabsContent value="history" className="space-y-6">
          <Card className="border-0 bg-gradient-to-br from-slate-500/10 to-slate-500/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-slate-500/20"><FileText className="w-5 h-5 text-slate-500" /></div>
                <h2 className="text-xl font-bold text-foreground">Histórico de Análises</h2>
              </div>
            </CardHeader>
            <CardContent>
              {analysisResults.length === 0 ? (
                <div className="text-center py-12">
                  <div className="p-4 rounded-full bg-slate-500/10 w-fit mx-auto mb-4"><FileText className="w-8 h-8 text-slate-500" /></div>
                  <p className="text-muted-foreground">Nenhuma análise realizada ainda</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {analysisResults.map((result) => (
                    <div key={result.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50 hover:border-slate-500/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${result.status === "approved" ? "bg-green-500/10" : result.status === "rejected" ? "bg-red-500/10" : "bg-yellow-500/10"}`}>
                          <FileText className={`w-4 h-4 ${result.status === "approved" ? "text-green-500" : result.status === "rejected" ? "text-red-500" : "text-yellow-500"}`} />
                        </div>
                        <span className="text-sm font-medium">{result.file_name}</span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${result.status === "approved" ? "bg-green-500/20 text-green-600 dark:text-green-400" : result.status === "rejected" ? "bg-red-500/20 text-red-600 dark:text-red-400" : "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"}`}>
                          {result.status === "approved" ? "Aprovado" : result.status === "rejected" ? "Rejeitado" : "Pendente"}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-foreground">R$ {result.valor.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL UNIFICADA
// ═══════════════════════════════════════════════════════════════════════════

export default function IAPage() {
  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl p-3 shadow-lg shadow-purple-500/20">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Inteligência Artificial</h1>
            <p className="text-muted-foreground">Consulte seus dados ou converse com IA avançada</p>
          </div>
        </div>

        {/* Abas principais */}
        <Tabs defaultValue="agent_v2" className="space-y-4">
          <TabsList className="grid grid-cols-3 bg-muted/50 max-w-lg">
            <TabsTrigger value="agent_v2" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 font-semibold text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Agent V2</span>
            </TabsTrigger>
            <TabsTrigger value="rapida" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white gap-1.5 text-xs">
              <Zap className="w-3.5 h-3.5" />
              <span>Consulta Rápida</span>
            </TabsTrigger>
            <TabsTrigger value="avancada" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white gap-1.5 text-xs">
              <Brain className="w-3.5 h-3.5" />
              <span>IA Legada</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agent_v2" className="mt-0">
            <AgentV2Tab />
          </TabsContent>

          <TabsContent value="rapida" className="mt-0">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">Local · Sem custo · Respostas instantâneas com seus dados reais</span>
            </div>
            <Card className="border-0 bg-card/50 overflow-hidden">
              <ConsultaRapidaTab />
            </Card>
          </TabsContent>

          <TabsContent value="avancada" className="mt-0">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">API OpenAI · Chat avançado · Upload de comprovantes · Histórico salvo</span>
            </div>
            <IAAvancadaTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
