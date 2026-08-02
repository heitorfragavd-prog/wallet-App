import React, { useState, useRef, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useReceitas } from "@/domains/finance/hooks/useReceitas";
import { useDespesas } from "@/domains/finance/hooks/useDespesas";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";

interface Mensagem {
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
  dinheiro: "Dinheiro (PDV)",
  pix: "Pix",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  boleto: "Boleto",
  voucher: "Voucher/Vale",
  transferencia: "Transferência",
  outros: "Outros",
};

// Remove acentos e normaliza para casar intenções ("vendeu", "vendas", "faturamento"...)
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

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
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  const seteDias = new Date(hoje);
  seteDias.setDate(seteDias.getDate() - 6);

  const mesAtual = isoDay(hoje).slice(0, 7);
  const mesPassadoDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const mesPassado = isoDay(mesPassadoDate).slice(0, 7);

  switch (periodo) {
    case "hoje":
      return { label: "hoje", match: (d) => d === isoDay(hoje) };
    case "ontem":
      return { label: "ontem", match: (d) => d === isoDay(ontem) };
    case "semana":
      return { label: "nos últimos 7 dias", match: (d) => d >= isoDay(seteDias) && d <= isoDay(hoje) };
    case "mes_passado":
      return { label: "no mês passado", match: (d) => d.startsWith(mesPassado) };
    case "mes":
    default:
      return { label: "neste mês", match: (d) => d.startsWith(mesAtual) };
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
  contas: ContaSaldo[];
}

// Motor de respostas com os MESMOS dados consolidados das telas
// (Receitas = manual + PDV dinheiro + Divipay líquido; Despesas = manual + saques Divipay)
function gerarRespostaIA(pergunta: string, dados: DadosIA): string {
  const p = norm(pergunta);
  const { receitas, despesas, contas } = dados;

  const receitasComDia = receitas.map((r) => ({ ...r, dia: dayKey(r.data), valor: Number(r.valor || 0) }));
  const despesasComDia = despesas.map((d) => ({ ...d, dia: dayKey(d.data), valor: Number(d.valor || 0) }));

  const saldoTotal = contas
    .filter((c) => c.tipo !== "cartao_credito")
    .reduce((a, c) => a + Number(c.saldo_atual || 0), 0);

  const filtroMes = filtroPeriodo("mes");
  const filtroMesPassado = filtroPeriodo("mes_passado");
  const receitasMes = receitasComDia.filter((r) => filtroMes.match(r.dia));
  const despesasMes = despesasComDia.filter((d) => filtroMes.match(d.dia));
  const totalReceitasMes = receitasMes.reduce((a, r) => a + r.valor, 0);
  const totalDespesasMes = despesasMes.reduce((a, d) => a + d.valor, 0);
  const totalReceitasMesPassado = receitasComDia.filter((r) => filtroMesPassado.match(r.dia)).reduce((a, r) => a + r.valor, 0);
  const totalDespesasMesPassado = despesasComDia.filter((d) => filtroMesPassado.match(d.dia)).reduce((a, d) => a + d.valor, 0);

  // ── META / PONTO DE EQUILÍBRIO ("quanto devo vender", "meta") ─────────────
  if (p.includes("devo vender") || p.includes("meta") || p.includes("ponto de equilibrio")) {
    const pontoEquilibrio = totalDespesasMes / 0.5735; // Simples 12,65% + CMV 30%
    const metaLucro = (totalDespesasMes + 10000) / 0.5735;
    return `🎯 **Meta de Vendas (base nas suas despesas reais deste mês):**

- **Despesas do mês até agora:** ${formatCurrency(totalDespesasMes)}
- 🛑 **Ponto de equilíbrio (venda mínima p/ não ter prejuízo):** **${formatCurrency(pontoEquilibrio)}**
- 🚀 **Meta p/ lucrar ~R$ 10.000:** **${formatCurrency(metaLucro)}**
- 📈 **Você já vendeu neste mês:** **${formatCurrency(totalReceitasMes)}**

💡 ${totalReceitasMes >= pontoEquilibrio ? "✅ Você já passou do ponto de equilíbrio este mês!" : `Faltam **${formatCurrency(pontoEquilibrio - totalReceitasMes)}** em vendas para cobrir as despesas do mês.`}`;
  }

  // ── COMPRA / POSSO GASTAR ──────────────────────────────────────────────────
  if (p.includes("comprar") || p.includes("posso gastar") || p.includes("posso comprar")) {
    const matchValor = p.match(/\d+([.,]\d+)?/);
    const valorCompra = matchValor ? parseFloat(matchValor[0].replace(",", ".")) : 0;
    const saldoApos = saldoTotal - valorCompra;
    const viavel = saldoApos > 2000;
    return `🛍️ **Análise de compra${valorCompra ? ` de ${formatCurrency(valorCompra)}` : ""}:**

- **Saldo real em contas:** ${formatCurrency(saldoTotal)}
- **Saldo após a compra:** ${formatCurrency(saldoApos)}
- **Avaliação:** ${viavel ? "✅ **COMPRA VIÁVEL**" : "⚠️ **ATENÇÃO AO CAIXA**"}

${viavel ? "A compra não compromete sua reserva operacional." : "Recomendo adiar ou parcelar — o caixa ficaria abaixo do limite de segurança (R$ 2.000)."}`;
  }

  // ── SALDO / CONTAS ─────────────────────────────────────────────────────────
  if (p.includes("saldo") || p.includes("conta") || p.includes("quanto tenho") || p.includes("caixa")) {
    const detalhe = contas
      .filter((c) => c.tipo !== "cartao_credito")
      .map((c) => `  • **${c.nome}:** ${formatCurrency(Number(c.saldo_atual || 0))}`)
      .join("\n");
    return `💳 **Situação de caixa agora:**

${detalhe || "  • Nenhuma conta cadastrada"}

💰 **Total disponível:** **${formatCurrency(saldoTotal)}**`;
  }

  // ── LUCRO / RESULTADO ──────────────────────────────────────────────────────
  if (p.includes("lucro") || p.includes("resultado") || p.includes("margem") || p.includes("sobrou")) {
    const lucroMes = totalReceitasMes - totalDespesasMes;
    const lucroMesPassado = totalReceitasMesPassado - totalDespesasMesPassado;
    return `📈 **Resultado (visão de caixa):**

**Este mês:**
- Receitas: ${formatCurrency(totalReceitasMes)}
- Despesas: ${formatCurrency(totalDespesasMes)}
- 💰 **Saldo do mês: ${formatCurrency(lucroMes)}** ${lucroMes >= 0 ? "✅" : "🔴"}

**Mês passado:** ${formatCurrency(lucroMesPassado)} (Receitas ${formatCurrency(totalReceitasMesPassado)} − Despesas ${formatCurrency(totalDespesasMesPassado)})

💡 Valores reais das suas telas de Receitas e Despesas (PDV + Divipay + lançamentos manuais).`;
  }

  // ── DESPESAS / GASTOS ──────────────────────────────────────────────────────
  if (p.includes("despesa") || p.includes("gasto") || p.includes("gastei") || p.includes("custo") || p.includes("paguei")) {
    const periodo = detectarPeriodo(p, "mes");
    const filtro = filtroPeriodo(periodo);
    const lista = despesasComDia.filter((d) => filtro.match(d.dia));
    const total = lista.reduce((a, d) => a + d.valor, 0);
    const maiores = [...lista].sort((a, b) => b.valor - a.valor).slice(0, 3);
    const top = maiores.length
      ? `\n\n**Maiores gastos${filtro.label === "hoje" || filtro.label === "ontem" ? "" : " do período"}:**\n${maiores.map((d) => `  • ${d.descricao || "Despesa"}: **${formatCurrency(d.valor)}**`).join("\n")}`
      : "";
    return `📊 **Despesas ${filtro.label}:**

- **Total:** **${formatCurrency(total)}** (${lista.length} ${lista.length === 1 ? "lançamento" : "lançamentos"})${top}

💡 Pergunte também: *"quanto gastei no mês passado?"* ou *"qual meu lucro este mês?"*`;
  }

  // ── VENDAS / FATURAMENTO / RECEITAS ────────────────────────────────────────
  if (p.includes("vend") || p.includes("fatur") || p.includes("receita") || p.includes("receb") || p.includes("entrou")) {
    const periodo = detectarPeriodo(p, "hoje");
    const filtro = filtroPeriodo(periodo);
    const lista = receitasComDia.filter((r) => filtro.match(r.dia));
    const total = lista.reduce((a, r) => a + r.valor, 0);
    const detalheMetodos = somaPorMetodo(lista.map((r) => ({ valor: r.valor, metodo: r.metodo_pagamento })));
    return `💵 **Vendas ${filtro.label}:**

- **Total vendido:** **${formatCurrency(total)}**
- **Quantidade de vendas/entradas:** ${lista.length}

${detalheMetodos ? `**Por forma de pagamento:**\n${detalheMetodos}` : ""}

💡 Pergunte também: *"quanto vendeu ontem?"*, *"quanto vendeu este mês?"* ou *"qual meu lucro este mês?"*`;
  }

  // ── VISÃO GERAL (fallback) ─────────────────────────────────────────────────
  const filtroHoje = filtroPeriodo("hoje");
  const vendasHoje = receitasComDia.filter((r) => filtroHoje.match(r.dia)).reduce((a, r) => a + r.valor, 0);
  return `🤖 **Resumo rápido das suas finanças:**

1. **Vendas de hoje:** **${formatCurrency(vendasHoje)}**
2. **Vendas no mês:** **${formatCurrency(totalReceitasMes)}**
3. **Despesas no mês:** **${formatCurrency(totalDespesasMes)}**
4. **Saldo em contas:** **${formatCurrency(saldoTotal)}**

Posso responder com seus dados reais, por exemplo:
- *"Quanto vendeu hoje?"* / *"quanto vendeu ontem?"*
- *"Quanto gastei este mês?"*
- *"Qual meu lucro este mês?"*
- *"Quanto tenho em conta?"*
- *"Posso comprar algo de R$ 2.000?"*`;
}

export default function IAChat() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      role: "assistant",
      content: `Olá! Sou seu assistente financeiro com acesso aos seus dados reais (PDV + Divipay + lançamentos).

Pergunte coisas como:
- *"Quanto vendeu hoje?"* ou *"quanto vendeu ontem?"*
- *"Quanto vendeu este mês?"*
- *"Quanto gastei este mês?"*
- *"Qual meu lucro este mês?"*
- *"Quanto tenho em conta?"*
- *"Posso comprar algo de R$ 2.000?"*`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Janela de dados: últimos 3 meses + mês atual (suficiente p/ hoje, mês e mês passado)
  const inicioJanela = useMemo(() => {
    const d = new Date();
    return isoDay(new Date(d.getFullYear(), d.getMonth() - 3, 1));
  }, []);

  const { receitas, loading: loadingReceitas } = useReceitas({ startDate: inicioJanela });
  const { despesas, loading: loadingDespesas } = useDespesas({ startDate: inicioJanela });
  const { data: contas = [], isLoading: loadingContas } = useQuery({
    queryKey: ["ia-chat-contas"],
    queryFn: async () => {
      const { data } = await supabase.from("contas_usuario").select("nome, saldo_atual, tipo");
      return (data ?? []) as ContaSaldo[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const dadosProntos = !loadingReceitas && !loadingDespesas && !loadingContas;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const handleEnviar = async () => {
    if (!input.trim() || isLoading || !dadosProntos) return;
    const pergunta = input.trim();
    setInput("");
    setMensagens((prev) => [...prev, { role: "user", content: pergunta, timestamp: new Date() }]);
    setIsLoading(true);

    // Pequeno delay para sensação de processamento
    await new Promise((r) => setTimeout(r, 400));
    const resposta = gerarRespostaIA(pergunta, { receitas, despesas, contas });
    setMensagens((prev) => [...prev, { role: "assistant", content: resposta, timestamp: new Date() }]);
    setIsLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto h-[calc(100vh-100px)] flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/15">
            <Sparkles className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Assistente Financeiro IA</h1>
            <p className="text-sm text-muted-foreground">Respostas com seus dados reais — PDV, Divipay e lançamentos</p>
          </div>
        </div>

        {/* Card do Chat */}
        <Card className="flex-1 flex flex-col overflow-hidden border-border/40 bg-card/60 backdrop-blur-sm">
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {mensagens.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-purple-400" />
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
                <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
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
            <Button onClick={handleEnviar} disabled={isLoading || !dadosProntos} className="bg-purple-500 hover:bg-purple-600 text-white">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
