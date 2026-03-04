import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useFinancialContext = () => {
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(true);

  const buildContext = useCallback(async () => {
    setLoading(true);
    try {
      const hoje = new Date();
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];
      const fimMes = hoje.toISOString().split("T")[0];
      const inicio90 = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const mesLabel = hoje.toLocaleString("pt-BR", { month: "long", year: "numeric" });

      const [
        { data: transacoes },
        { data: despesas },
        { data: receitas },
        { data: dividas },
        { data: metas },
        { data: contas },
      ] = await Promise.all([
        supabase.from("transacoes").select("*, categorias(nome)").gte("data", inicio90).order("data", { ascending: false }).limit(50),
        supabase.from("despesas").select("*, categorias(nome)").gte("data", inicio90).order("data", { ascending: false }).limit(100),
        supabase.from("receitas").select("*, categorias(nome)").gte("data", inicio90).order("data", { ascending: false }).limit(100),
        supabase.from("dividas").select("*").neq("status", "quitada"),
        supabase.from("metas").select("*").eq("status", "ativa"),
        supabase.from("contas").select("*"),
      ]);

      const despesasMes = (despesas || []).filter(d => d.data >= inicioMes && d.data <= fimMes);
      const receitasMes = (receitas || []).filter(r => r.data >= inicioMes && r.data <= fimMes);
      const transacoesDespMes = (transacoes || []).filter(t => t.tipo === "despesa" && t.data >= inicioMes && t.data <= fimMes);
      const transacoesRecMes = (transacoes || []).filter(t => t.tipo === "receita" && t.data >= inicioMes && t.data <= fimMes);

      const totalDespesasMes = [...despesasMes, ...transacoesDespMes].reduce((s, d) => s + Number(d.valor), 0);
      const totalReceitasMes = [...receitasMes, ...transacoesRecMes].reduce((s, r) => s + Number(r.valor), 0);
      const saldoMes = totalReceitasMes - totalDespesasMes;

      // Top categorias de despesa no mês
      const catMap: Record<string, number> = {};
      [...despesasMes, ...transacoesDespMes].forEach(d => {
        const cat = (d as any).categorias?.nome || "Sem categoria";
        catMap[cat] = (catMap[cat] || 0) + Number(d.valor);
      });
      const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

      const totalSaldoContas = (contas || []).reduce((s, c) => s + Number((c as any).saldo || 0), 0);
      const totalDividas = (dividas || []).reduce((s, d) => s + Number((d as any).valor_total || (d as any).valor || 0), 0);
      const parcelasMes = (dividas || []).reduce((s, d) => s + Number((d as any).valor_parcela || 0), 0);

      // Últimas 10 transações combinadas
      const allRecentes = [
        ...(despesas || []).map(d => ({ ...d, tipo: "despesa" as const })),
        ...(receitas || []).map(r => ({ ...r, tipo: "receita" as const })),
        ...(transacoes || []),
      ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).slice(0, 10);

      const fmt = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
      const fmtDate = (d: string) => {
        try { return new Date(d + "T12:00:00").toLocaleDateString("pt-BR"); } catch { return d; }
      };

      let ctx = `# Contexto Financeiro do Usuário\n`;
      ctx += `Data de referência: ${hoje.toLocaleDateString("pt-BR")}\n\n`;

      ctx += `## Resumo do Mês Atual (${mesLabel})\n`;
      ctx += `- Receitas: ${fmt(totalReceitasMes)}\n`;
      ctx += `- Despesas: ${fmt(totalDespesasMes)}\n`;
      ctx += `- Saldo do mês: ${fmt(saldoMes)} (${saldoMes >= 0 ? "positivo" : "negativo"})\n\n`;

      if (contas && contas.length > 0) {
        ctx += `## Contas Bancárias\n`;
        ctx += `- Saldo total: ${fmt(totalSaldoContas)}\n`;
        (contas || []).forEach(c => {
          ctx += `  - ${(c as any).nome}: ${fmt(Number((c as any).saldo || 0))}\n`;
        });
        ctx += "\n";
      }

      if (topCats.length > 0) {
        ctx += `## Maiores Categorias de Despesa no Mês\n`;
        topCats.forEach(([cat, val]) => {
          ctx += `- ${cat}: ${fmt(val)}\n`;
        });
        ctx += "\n";
      }

      if (dividas && dividas.length > 0) {
        ctx += `## Dívidas Ativas\n`;
        ctx += `- Total em dívidas: ${fmt(totalDividas)}\n`;
        ctx += `- Parcelas mensais: ${fmt(parcelasMes)}\n`;
        (dividas || []).slice(0, 8).forEach(d => {
          const venc = (d as any).data_vencimento || (d as any).vencimento;
          ctx += `  - ${(d as any).descricao || (d as any).nome || "Dívida"}: ${fmt(Number((d as any).valor_total || (d as any).valor || 0))}${venc ? ` (vence: ${fmtDate(venc)})` : ""}\n`;
        });
        ctx += "\n";
      }

      if (metas && metas.length > 0) {
        ctx += `## Metas Ativas\n`;
        (metas || []).forEach(m => {
          const pct = Number(m.valor_meta) > 0 ? Math.round((Number(m.valor_atual) / Number(m.valor_meta)) * 100) : 0;
          ctx += `- ${m.nome}: ${fmt(Number(m.valor_atual))} de ${fmt(Number(m.valor_meta))} (${pct}%)\n`;
        });
        ctx += "\n";
      }

      if (allRecentes.length > 0) {
        ctx += `## Últimas Transações (90 dias)\n`;
        allRecentes.forEach(t => {
          const sinal = t.tipo === "receita" ? "+" : "-";
          const cat = (t as any).categorias?.nome || "";
          ctx += `- ${fmtDate(t.data)} | ${sinal}${fmt(Number(t.valor))} | ${t.descricao}${cat ? ` | ${cat}` : ""}\n`;
        });
        ctx += "\n";
      }

      ctx += `*Dados carregados em ${new Date().toLocaleString("pt-BR")}*`;
      setContext(ctx);
    } catch (error) {
      console.error("Erro ao construir contexto financeiro:", error);
      setContext("Não foi possível carregar os dados financeiros no momento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    buildContext();
  }, [buildContext]);

  return { context, loading, refresh: buildContext };
};
