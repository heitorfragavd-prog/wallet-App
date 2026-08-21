import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface FinancialDebtContext {
  descricao?: string;
  valor_total?: number;
  valor_pago?: number;
  data_vencimento?: string;
  status?: string;
}

interface FinancialAccountContext {
  id: string;
  nome: string;
  saldo_atual: number;
  tipo: string;
}

interface StockItemContext {
  quantidade_estoque?: number;
  quantidade_ideal?: number;
  status?: string;
}

interface GoalContext {
  nome?: string;
  titulo?: string;
  valor_alvo?: number;
  valor_atual?: number;
  status?: string;
}

interface VehicleContext {
  manutencoes?: Array<{ status?: string }>;
}

export interface FinancialContext {
  dividas: {
    totalPendente: number;
    totalVencido: number;
    totalQuitado: number;
    proximosVencimentos: FinancialDebtContext[];
  };
  receitas: {
    totalMes: number;
    totalHoje: number;
    porCategoria: { categoria: string; valor: number }[];
  };
  despesas: {
    totalMes: number;
    totalHoje: number;
    porCategoria: { categoria: string; valor: number }[];
  };
  contas: {
    saldoTotal: number;
    contas: FinancialAccountContext[];
  };
  eyemobile: {
    vendasHoje: number;
    vendasMes: number;
    produtosBaixoEstoque: StockItemContext[];
  };
  divipay: {
    saldoDisponivel: number;
    saquesPendentes: number;
  };
  metas: {
    ativas: GoalContext[];
    progresso: number;
  };
  veiculos: {
    totalManutencaoPendente: number;
    veiculos: VehicleContext[];
  };
  investimentos: {
    posicaoAtual: number;
    rendimentoMes: number;
  };
}

export const useFinancialContext = () => {
  const [contextData, setContextData] = useState<FinancialContext | null>(null);
  const [contextText, setContextText] = useState("");
  const [loading, setLoading] = useState(true);
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id;

  const buildContext = useCallback(async () => {
    setLoading(true);
    if (!workspaceId) {
      setContextData(null);
      setContextText("Selecione um workspace para consultar dados financeiros.");
      setLoading(false);
      return;
    }
    try {
      const hoje = new Date();
      const hojeIso = hoje.toISOString().split("T")[0];
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];

      // Construir as queries base do Supabase
      const qDividas = supabase.from("dividas").select("*").eq("workspace_id", workspaceId);
      const qReceitas = supabase.from("receitas").select("*, categorias!categoria_id(nome)").eq("workspace_id", workspaceId);
      const qDespesas = supabase.from("despesas").select("*, categorias!categoria_id(nome)").eq("workspace_id", workspaceId);
      const qTransacoes = supabase.from("transacoes").select("*, categorias!categoria_id(nome)").eq("workspace_id", workspaceId);
      const qContas = supabase.from("contas_usuario").select("*").eq("workspace_id", workspaceId);
      const qEyemobileLogs = supabase.from("eyemobile_sync_logs").select("*").order("created_at", { ascending: false }).limit(5);
      const qVeiculos = supabase.from("veiculos").select("*, manutencoes(*)").eq("workspace_id", workspaceId);
      const qInvestimentos = supabase.from("investimentos").select("*").eq("workspace_id", workspaceId);
      const qRendimentos = supabase.from("historico_rendimentos").select("*").eq("ano", hoje.getFullYear()).eq("mes", hoje.getMonth() + 1);
      const qItensMercado = supabase.from("itens_mercado").select("*, categorias_mercado(nome)").eq("workspace_id", workspaceId);
      const qDivipayTransacoes = supabase.from("divipay_transacoes").select("*").eq("type", "withdraw").eq("status", "pending");
      const qMetas = supabase.from("metas").select("*").eq("workspace_id", workspaceId);

      const [
        { data: resDividas },
        { data: resReceitas },
        { data: resDespesas },
        { data: resTransacoes },
        { data: resContas },
        { data: resEyemobileLogs },
        { data: resVeiculos },
        { data: resInvestimentos },
        { data: resRendimentos },
        { data: resItensMercado },
        { data: resDivipayTransacoes },
        { data: resMetas },
      ] = await Promise.all([
        qDividas,
        qReceitas,
        qDespesas,
        qTransacoes,
        qContas,
        qEyemobileLogs,
        qVeiculos,
        qInvestimentos,
        qRendimentos,
        qItensMercado,
        qDivipayTransacoes,
        qMetas,
      ]);

      // ─── DÍVIDAS ───
      const dividasList = resDividas || [];
      const totalPendente = dividasList
        .filter(d => d.status === "pendente")
        .reduce((sum, d) => sum + (Number(d.valor_total || 0) - Number(d.valor_pago || 0)), 0);
      const totalVencido = dividasList
        .filter(d => d.status === "vencida" || (d.status === "pendente" && d.data_vencimento && d.data_vencimento < hojeIso))
        .reduce((sum, d) => sum + (Number(d.valor_total || 0) - Number(d.valor_pago || 0)), 0);
      const totalQuitado = dividasList
        .filter(d => d.status === "quitada")
        .reduce((sum, d) => sum + Number(d.valor_pago || d.valor_total || 0), 0);
      const proximosVencimentos = dividasList
        .filter(d => d.status !== "quitada")
        .sort((a, b) => (a.data_vencimento || "").localeCompare(b.data_vencimento || ""))
        .slice(0, 5);

      // ─── RECEITAS (União da tabela receitas e transações de receita) ───
      const rawReceitas = resReceitas || [];
      const rawTransacoesReceita = (resTransacoes || []).filter(t => t.tipo === "receita");
      const receitasList = [...rawReceitas, ...rawTransacoesReceita];
      
      const receitasNoMes = receitasList.filter(r => r.data >= inicioMes && r.data <= hojeIso);
      const totalReceitasMes = receitasNoMes.reduce((sum, r) => sum + Number(r.valor || 0), 0);
      const totalReceitasHoje = receitasNoMes
        .filter(r => r.data === hojeIso)
        .reduce((sum, r) => sum + Number(r.valor || 0), 0);

      const receitasCatMap: Record<string, number> = {};
      receitasNoMes.forEach(r => {
        const cat = r.categorias?.nome || "Outros";
        receitasCatMap[cat] = (receitasCatMap[cat] || 0) + Number(r.valor || 0);
      });
      const receitasPorCategoria = Object.entries(receitasCatMap)
        .map(([categoria, valor]) => ({ categoria, valor }))
        .sort((a, b) => b.valor - a.valor);

      // ─── DESPESAS (União da tabela despesas e transações de despesa) ───
      const rawDespesas = resDespesas || [];
      const rawTransacoesDespesa = (resTransacoes || []).filter(t => t.tipo === "despesa");
      const despesasList = [...rawDespesas, ...rawTransacoesDespesa];

      const despesasNoMes = despesasList.filter(d => d.data >= inicioMes && d.data <= hojeIso);
      const totalDespesasMes = despesasNoMes.reduce((sum, d) => sum + Number(d.valor || 0), 0);
      const totalDespesasHoje = despesasNoMes
        .filter(d => d.data === hojeIso)
        .reduce((sum, d) => sum + Number(d.valor || 0), 0);

      const despesasCatMap: Record<string, number> = {};
      despesasNoMes.forEach(d => {
        const cat = d.categorias?.nome || "Outros";
        despesasCatMap[cat] = (despesasCatMap[cat] || 0) + Number(d.valor || 0);
      });
      const despesasPorCategoria = Object.entries(despesasCatMap)
        .map(([categoria, valor]) => ({ categoria, valor }))
        .sort((a, b) => b.valor - a.valor);

      // ─── CONTAS BANCÁRIAS ───
      const contasRaw = (resContas || []) as unknown as Array<{
        id: string;
        nome: string;
        saldo_atual?: number;
        saldo?: number;
        tipo: string;
      }>;
      const contasMapped = contasRaw.map((c) => ({
        id: c.id,
        nome: c.nome,
        saldo_atual: Number(c.saldo_atual ?? c.saldo ?? 0),
        tipo: c.tipo
      }));
      const saldoTotal = contasMapped
        .filter(c => c.tipo !== "cartao_credito")
        .reduce((sum, c) => sum + c.saldo_atual, 0);

      // ─── EYEMOBILE ───
      const vendasHoje = receitasList
        .filter(r => r.data === hojeIso && (String(r.observacoes || "").toLowerCase().includes("eyemobile") || String(r.origem || "").toLowerCase().includes("eyemobile")))
        .reduce((sum, r) => sum + Number(r.valor || 0), 0);
      const vendasMes = receitasList
        .filter(r => r.data >= inicioMes && r.data <= hojeIso && (String(r.observacoes || "").toLowerCase().includes("eyemobile") || String(r.origem || "").toLowerCase().includes("eyemobile")))
        .reduce((sum, r) => sum + Number(r.valor || 0), 0);
      const produtosBaixoEstoque = ((resItensMercado || []) as unknown as StockItemContext[])
        .filter((item) => Number(item.quantidade_estoque || 0) <= Number(item.quantidade_ideal || 0) || item.status === "baixo");

      // ─── DIVIPAY ───
      const divipayConta = contasMapped.find(c => c.nome.toLowerCase().includes("divipay"));
      const saldoDisponivel = divipayConta ? divipayConta.saldo_atual : 0;
      const saquesPendentes = (resDivipayTransacoes || [])
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      // ─── METAS ───
      const metasAtivas = (resMetas || []).filter(m => m.status === "ativa");
      const progressoMedio = metasAtivas.length > 0
        ? metasAtivas.reduce((sum, m) => sum + (Number(m.valor_alvo) > 0 ? (Number(m.valor_atual) / Number(m.valor_alvo)) * 100 : 0), 0) / metasAtivas.length
        : 0;

      // ─── VEÍCULOS ───
      const veiculosList = (resVeiculos || []) as unknown as VehicleContext[];
      const totalManutencaoPendente = veiculosList.reduce((sum, v) => {
        const pendentes = (v.manutencoes || []).filter((m) => m.status === "pendente").length;
        return sum + pendentes;
      }, 0);

      // ─── INVESTIMENTOS ───
      const investimentosList = resInvestimentos || [];
      const posicaoAtual = investimentosList.reduce((sum, i) => sum + Number(i.valor_atual || i.valor_investido || 0), 0);
      const rendimentoMes = (resRendimentos || []).reduce((sum, r) => sum + Number(r.rendimento_mes || 0), 0);

      const aggregatedContext: FinancialContext = {
        dividas: { totalPendente, totalVencido, totalQuitado, proximosVencimentos },
        receitas: { totalMes: totalReceitasMes, totalHoje: totalReceitasHoje, porCategoria: receitasPorCategoria },
        despesas: { totalMes: totalDespesasMes, totalHoje: totalDespesasHoje, porCategoria: despesasPorCategoria },
        contas: { saldoTotal, contas: contasMapped },
        eyemobile: { vendasHoje, vendasMes, produtosBaixoEstoque },
        divipay: { saldoDisponivel, saquesPendentes },
        metas: { ativas: metasAtivas, progresso: progressoMedio },
        veiculos: { totalManutencaoPendente, veiculos: veiculosList },
        investimentos: { posicaoAtual, rendimentoMes }
      };

      setContextData(aggregatedContext);

      // Formatar representação textual (Markdown)
      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const fmtDate = (d: string) => {
        try { return new Date(d + "T12:00:00").toLocaleDateString("pt-BR"); } catch { return d; }
      };

      let text = `# CONTEXTO FINANCEIRO REAL DO USUÁRIO\n`;
      text += `Atualizado em: ${hoje.toLocaleString("pt-BR")}\n`;
      if (activeWorkspace) {
        text += `Workspace ativo: ${activeWorkspace.nome} (Tipo: ${activeWorkspace.tipo})\n`;
      }
      text += `\n`;

      text += `## 💰 Caixa & Saldos\n`;
      text += `- **Saldo total (caixa livre):** ${fmt(saldoTotal)}\n`;
      contasMapped.forEach(c => {
        text += `  - *${c.nome}* (${c.tipo}): ${fmt(c.saldo_atual)}\n`;
      });
      text += `\n`;

      text += `## 📈 Receitas & Despesas (Este Mês)\n`;
      text += `- **Total Receitas:** ${fmt(totalReceitasMes)} (Hoje: ${fmt(totalReceitasHoje)})\n`;
      text += `- **Total Despesas:** ${fmt(totalDespesasMes)} (Hoje: ${fmt(totalDespesasHoje)})\n`;
      text += `- **Lucro/Resultado:** ${fmt(totalReceitasMes - totalDespesasMes)}\n`;
      if (despesasPorCategoria.length > 0) {
        text += `- **Maiores Gastos por Categoria:**\n`;
        despesasPorCategoria.slice(0, 5).forEach(c => {
          text += `  - ${c.categoria}: ${fmt(c.valor)}\n`;
        });
      }
      text += `\n`;

      text += `## 🛑 Dívidas & Compromissos\n`;
      text += `- **Total Pendente:** ${fmt(totalPendente)}\n`;
      text += `- **Total Vencido:** ${fmt(totalVencido)}\n`;
      if (proximosVencimentos.length > 0) {
        text += `- **Próximos Vencimentos:**\n`;
        proximosVencimentos.forEach(d => {
          text += `  - ${d.descricao} | ${fmt(Number(d.valor_total || 0) - Number(d.valor_pago || 0))}${d.data_vencimento ? ` (vence ${fmtDate(d.data_vencimento)})` : ""}\n`;
        });
      }
      text += `\n`;

      text += `## 🤝 Divipay & Adiantamentos\n`;
      text += `- **Saldo Disponível Divipay:** ${fmt(saldoDisponivel)}\n`;
      text += `- **Saques Pendentes/Retenções:** ${fmt(saquesPendentes)}\n\n`;

      text += `## 🏪 Eyemobile PDV & Vendas\n`;
      text += `- **Vendas PDV Hoje:** ${fmt(vendasHoje)}\n`;
      text += `- **Vendas PDV no Mês:** ${fmt(vendasMes)}\n`;
      if (produtosBaixoEstoque.length > 0) {
        text += `- **Produtos Críticos (baixo estoque):** ${produtosBaixoEstoque.length} itens\n`;
      }
      text += `\n`;

      text += `## 🎯 Metas Ativas\n`;
      if (metasAtivas.length > 0) {
        metasAtivas.forEach(m => {
          const mPct = Number(m.valor_alvo) > 0 ? ((Number(m.valor_atual) / Number(m.valor_alvo)) * 100).toFixed(0) : "0";
          text += `- *${m.nome || m.titulo}*: ${fmt(Number(m.valor_atual))} de ${fmt(Number(m.valor_alvo))} (${mPct}%)\n`;
        });
      } else {
        text += `- Nenhuma meta ativa\n`;
      }
      text += `\n`;

      text += `## 🚗 Veículos & Manutenções\n`;
      text += `- **Manutenções Pendentes:** ${totalManutencaoPendente}\n\n`;

      text += `## 🪙 Investimentos\n`;
      text += `- **Posição Atual:** ${fmt(posicaoAtual)}\n`;
      text += `- **Rendimento no Mês:** ${fmt(rendimentoMes)}\n\n`;

      if (resEyemobileLogs && resEyemobileLogs.length > 0) {
        text += `## 📊 Sincronização Eyemobile\n`;
        text += `- Status: ${resEyemobileLogs[0].status} em ${new Date(resEyemobileLogs[0].created_at).toLocaleString("pt-BR")}\n`;
      }

      setContextText(text);
    } catch (error) {
      logger.error("useFinancialContext", "Erro ao construir contexto financeiro", {
        error: error instanceof Error ? error.message : String(error)
      });
      setContextText("Não foi possível carregar os dados financeiros no momento.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, activeWorkspace]);

  useEffect(() => {
    buildContext();
  }, [buildContext]);

  return {
    contextData,
    contextText,
    loading,
    refresh: buildContext
  };
};
