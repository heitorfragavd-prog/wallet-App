
export function getSaoPauloDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function getSaoPauloParts(d: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  dateString: string;
} {
  const dateString = getSaoPauloDateString(d); // "YYYY-MM-DD"
  const [yearStr, monthStr, dayStr] = dateString.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = noonUtc.getUTCDay();
  return { year, month, day, dayOfWeek, dateString };
}

export function getSaoPauloYesterday(referenceDate: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  dateString: string;
} {
  const todayParts = getSaoPauloParts(referenceDate);
  const todayNoon = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day, 12, 0, 0));
  const yesterdayNoon = new Date(todayNoon.getTime() - 24 * 60 * 60 * 1000);
  return getSaoPauloParts(yesterdayNoon);
}
import { supabase } from '@/integrations/supabase/client';

export interface CeoExecutiveKpis {
  faturamentoMes: number;
  faturamentoMesAnterior: number;
  crescimentoMesPercent: number | null;
  pedidosMes: number;
  crescimentoPedidosPercent: number | null;
  ticketMedioMes: number | null;
  crescimentoTicketMedioPercent: number | null;
  resultadoOperacional: number; // Permite valor negativo real (sem Math.max(0, ...))
  margemOperacionalPercent: number | null;
  faturamentoOntem: number;
  mediaDiaSemanaOntem: number | null;
  variacaoOntemVsMediaPercent: number | null;
  diaSemanaOntemNome: string;
  despesasMes: number;
  despesasMesAnterior: number;
  variacaoDespesasPercent: number | null;
  lucroEstimado: number; // Alias retrocompatível para resultadoOperacional
  margemLucroPercent: number | null; // Alias retrocompatível para margemOperacionalPercent
  cmvPercent: number | null; // null se dados insuficientes
  cmvStatus: 'saudavel' | 'atencao' | 'critico' | 'dados_insuficientes';
  coberturaFichasPercent: number;
  acoesHoje: {
    numero: number;
    titulo: string;
    detalhe: string;
    impacto?: string;
  }[];
  dataAtualizacao: string;
  dailySales30Days: { date: string; valor: number }[];
  dadosIndisponiveis?: boolean;
  erroMensagem?: string;
}

export interface VendaCanalDistribuicao {
  canal: string;
  faturamento: number;
  percentual: number;
  cor: string;
}

export interface HeatmapHorarioPonto {
  hora: number; // 11 a 23
  diaSemana: number; // 0 (Dom) a 6 (Sáb)
  diaNome: string; // Seg, Ter, Qua, etc.
  intensidade: number; // 0 a 100
  faturamento: number;
}

export interface TopProdutoFaturamento {
  rank: number;
  id: string;
  produto: string;
  quantidade: number;
  faturamento: number;
  percentualFaturamento: number;
  margemEstimada: number | null;
}

export class CeoFinancialMetricsService {
  /**
   * Helper de paginação segura que busca todos os registros sem truncamento
   * por limites de max-rows do PostgREST (lida perfeitamente com >5.000 linhas).
   */
  public static async fetchAllPaginated<T>(
    fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>
  ): Promise<T[]> {
    const pageSize = 1000;
    let from = 0;
    const all: T[] = [];
    while (true) {
      const { data, error } = await fetchPage(from, from + pageSize - 1);
      if (error) {
        console.error('[CeoFinancialMetricsService] Erro ao paginar dados:', error);
        throw new Error(
          `Falha ao buscar registros paginados: ${
            error instanceof Error ? error.message : JSON.stringify(error)
          }`
        );
      }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  /**
   * Obtém KPIs executivos consolidados com dados 100% reais da Rodo Point.
   * Paginação integral (>5.000 registros), períodos equivalentes e resultado operacional real.
   */
  static async getExecutiveKpis(
    workspaceId: string,
    referenceDate: Date = new Date()
  ): Promise<CeoExecutiveKpis> {
    if (!workspaceId) {
      return this.getEmptyKpis();
    }

    try {
      const todayParts = getSaoPauloParts(referenceDate);
      const yesterdayParts = getSaoPauloYesterday(referenceDate);

      const anoAtual = todayParts.year;
      const mesAtual = todayParts.month;
      const diaAtual = todayParts.day;

      const mesPad = String(mesAtual).padStart(2, '0');
      const inicioMesAtual = `${anoAtual}-${mesPad}-01`;
      const fimMesAtual = todayParts.dateString;

      // Período equivalente no mês anterior (1 até diaAtual do mês anterior)
      const priorMonthNoon = new Date(Date.UTC(anoAtual, mesAtual - 2, 1, 12, 0, 0));
      const priorParts = getSaoPauloParts(priorMonthNoon);
      const daysInPriorMonth = new Date(Date.UTC(priorParts.year, priorParts.month, 0)).getUTCDate();
      const diaLimiteEquivalente = Math.min(diaAtual, daysInPriorMonth);
      const inicioMesAnt = `${priorParts.year}-${String(priorParts.month).padStart(2, '0')}-01`;
      const fimMesAntEquivalente = `${priorParts.year}-${String(priorParts.month).padStart(2, '0')}-${String(diaLimiteEquivalente).padStart(2, '0')}`;

      // Ontem em fuso horário America/Sao_Paulo (independente de mês/ano)
      const ontemStr = yesterdayParts.dateString;
      const diasSemanaNomes = ['domingos', 'segundas-feiras', 'terças-feiras', 'quartas-feiras', 'quintas-feiras', 'sextas-feiras', 'sábados'];
      const diaSemanaOntemNome = diasSemanaNomes[yesterdayParts.dayOfWeek];

      // 1. Faturamento e Transações do Mês Atual (paginação segura completa)
      const txMes = await this.fetchAllPaginated<{ valor: number; data: string; created_at?: string }>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('valor, data, created_at')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', inicioMesAtual)
            .lte('data', `${fimMesAtual}T23:59:59.999Z`)
            .order('data', { ascending: true })
            .range(from, to)
      );

      const faturamentoMes = txMes.reduce((acc, t) => acc + Number(t.valor || 0), 0);
      const pedidosMes = txMes.length;
      const ticketMedioMes = pedidosMes > 0 ? Math.round((faturamentoMes / pedidosMes) * 100) / 100 : null;

      // 2. Faturamento Mês Anterior (Período Equivalente)
      const txMesAnt = await this.fetchAllPaginated<{ valor: number }>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('valor')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', inicioMesAnt)
            .lte('data', `${fimMesAntEquivalente}T23:59:59.999Z`)
            .range(from, to)
      );

      const faturamentoMesAnt = txMesAnt.reduce((acc, t) => acc + Number(t.valor || 0), 0);
      const pedidosMesAnt = txMesAnt.length;
      const ticketMedioMesAnt = pedidosMesAnt > 0 ? faturamentoMesAnt / pedidosMesAnt : null;

      // Crescimento % real vs período equivalente
      const crescimentoMes =
        faturamentoMesAnt > 0
          ? Math.round(((faturamentoMes - faturamentoMesAnt) / faturamentoMesAnt) * 1000) / 10
          : null;

      const crescimentoPedidos =
        pedidosMesAnt > 0
          ? Math.round(((pedidosMes - pedidosMesAnt) / pedidosMesAnt) * 1000) / 10
          : null;

      const crescimentoTicket =
        ticketMedioMes !== null && ticketMedioMesAnt !== null && ticketMedioMesAnt > 0
          ? Math.round(((ticketMedioMes - ticketMedioMesAnt) / ticketMedioMesAnt) * 1000) / 10
          : null;

      // 3. Faturamento de Ontem real (Consulta dedicada independente do mês — resolve virada de mês/ano)
      const txOntem = await this.fetchAllPaginated<{ valor: number; data: string }>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('valor, data')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', ontemStr)
            .lte('data', `${ontemStr}T23:59:59.999Z`)
            .range(from, to)
      );
      const faturamentoOntem = txOntem.reduce((acc, t) => acc + Number(t.valor || 0), 0);

      // Média real do mesmo dia da semana nas últimas 4 semanas (28 dias antes de ontem)
      const date28DaysAgo = new Date(
        Date.UTC(yesterdayParts.year, yesterdayParts.month - 1, yesterdayParts.day, 12, 0, 0).getTime() -
          28 * 24 * 60 * 60 * 1000
      );
      const inicioHistoricoStr = getSaoPauloDateString(date28DaysAgo);

      const txHistoricoSemana = await this.fetchAllPaginated<{ valor: number; data: string }>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('valor, data')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', inicioHistoricoStr)
            .lte('data', `${ontemStr}T23:59:59.999Z`)
            .range(from, to)
      );

      const diaSemanaIndex = yesterdayParts.dayOfWeek;
      const vendasMesmoDiaSemana = txHistoricoSemana.filter((t) => {
        if (!t.data) return false;
        const dStr = t.data.slice(0, 10);
        if (dStr === ontemStr) return false;
        const [y, m, d] = dStr.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        return dt.getUTCDay() === diaSemanaIndex;
      });

      const somaMesmoDia = vendasMesmoDiaSemana.reduce((acc, t) => acc + Number(t.valor || 0), 0);
      const diasDistintos = new Set(vendasMesmoDiaSemana.map((t) => t.data.slice(0, 10))).size;
      const mediaDiaSemana = diasDistintos > 0 ? Math.round((somaMesmoDia / diasDistintos) * 100) / 100 : null;

      const variacaoOntemVsMedia =
        mediaDiaSemana !== null && mediaDiaSemana > 0
          ? Math.round(((faturamentoOntem - mediaDiaSemana) / mediaDiaSemana) * 1000) / 10
          : null;

      // 4. Despesas Mês Atual reais (paginação completa)
      const despMes = await this.fetchAllPaginated<{ valor: number }>(
        (from, to) =>
          supabase
            .from('despesas')
            .select('valor')
            .eq('workspace_id', workspaceId)
            .gte('data', inicioMesAtual)
            .lte('data', fimMesAtual)
            .range(from, to)
      );

      const totalDespesasMes = despMes.reduce((acc, d) => acc + Number(d.valor || 0), 0);

      // Despesas Mês Anterior equivalentes
      const despMesAnt = await this.fetchAllPaginated<{ valor: number }>(
        (from, to) =>
          supabase
            .from('despesas')
            .select('valor')
            .eq('workspace_id', workspaceId)
            .gte('data', inicioMesAnt)
            .lte('data', fimMesAntEquivalente)
            .range(from, to)
      );

      const totalDespesasMesAnt = despMesAnt.reduce((acc, d) => acc + Number(d.valor || 0), 0);
      const variacaoDespesas =
        totalDespesasMesAnt > 0
          ? Math.round(((totalDespesasMes - totalDespesasMesAnt) / totalDespesasMesAnt) * 1000) / 10
          : null;

      // 5. Resultado Operacional Real (Receitas - Despesas), permitindo valor negativo
      const resultadoOperacional = faturamentoMes - totalDespesasMes;
      const margemOperacional = faturamentoMes > 0 ? Math.round((resultadoOperacional / faturamentoMes) * 1000) / 10 : null;

      // 6. CMV Status: checa se há fichas técnicas reais e cobertura efetiva
      const { count: countFichas } = await supabase
        .from('fichas_tecnicas')
        .select('*', { count: 'exact', head: true });

      const { count: countProdutos } = await supabase
        .from('produtos_eyemobile')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId);

      const totalFichas = countFichas ?? 0;
      const totalProdutos = countProdutos ?? 0;
      const hasFichas = totalFichas > 0;
      const coberturaFichas = totalProdutos > 0 && totalFichas > 0
        ? Math.min(100, Math.round((totalFichas / totalProdutos) * 100))
        : 0;
      const cmvPercent: number | null = null;
      const cmvStatus = hasFichas ? 'atencao' : 'dados_insuficientes';

      // 7. Evolução diária de vendas (últimos 30 dias reais)
      const limite30Dias = new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000);
      const limite30DiasStr = limite30Dias.toISOString().slice(0, 10);

      const tx30Dias = await this.fetchAllPaginated<{ valor: number; data: string }>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('valor, data')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', limite30DiasStr)
            .lte('data', fimMesAtual)
            .order('data', { ascending: true })
            .range(from, to)
      );

      const mapDaily = new Map<string, number>();
      for (const t of tx30Dias) {
        if (!t.data) continue;
        const dia = t.data.slice(0, 10);
        mapDaily.set(dia, (mapDaily.get(dia) || 0) + Number(t.valor || 0));
      }

      const dailySales30Days: { date: string; valor: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000);
        const diaStr = d.toISOString().slice(0, 10);
        const diaFormatado = `${d.getDate()}/${d.getMonth() + 1}`;
        dailySales30Days.push({
          date: diaFormatado,
          valor: mapDaily.get(diaStr) || 0,
        });
      }

      // Ações sugeridas baseadas na situação REAL do workspace
      const acoesHoje: { numero: number; titulo: string; detalhe: string; impacto?: string }[] = [];

      if (!hasFichas) {
        acoesHoje.push({
          numero: 1,
          titulo: 'Cadastrar fichas técnicas dos produtos',
          detalhe: 'Necessário para apuração real de CMV e margem unitária.',
        });
      } else {
        acoesHoje.push({
          numero: 1,
          titulo: 'Revisar margens de produtos no PDV',
          detalhe: 'Acompanhar precificação com base nos custos de insumos.',
        });
      }

      acoesHoje.push({
        numero: 2,
        titulo: 'Configurar canais de delivery no KDS',
        detalhe: 'Completar integração de pedidos para captura unificada na cozinha.',
      });

      if (totalDespesasMes > 0) {
        acoesHoje.push({
          numero: 3,
          titulo: 'Acompanhar conciliações de despesas',
          detalhe: `Total de R$ ${totalDespesasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} lançado no mês.`,
        });
      } else {
        acoesHoje.push({
          numero: 3,
          titulo: 'Acompanhar sincronização do Eyemobile PDV',
          detalhe: 'Verificar status de fechamentos de caixa e transações diárias.',
        });
      }

      return {
        faturamentoMes,
        faturamentoMesAnterior: faturamentoMesAnt,
        crescimentoMesPercent: crescimentoMes,
        pedidosMes,
        crescimentoPedidosPercent: crescimentoPedidos,
        ticketMedioMes,
        crescimentoTicketMedioPercent: crescimentoTicket,
        resultadoOperacional,
        margemOperacionalPercent: margemOperacional,
        faturamentoOntem,
        mediaDiaSemanaOntem,
        variacaoOntemVsMediaPercent: variacaoOntemVsMedia,
        diaSemanaOntemNome,
        despesasMes: totalDespesasMes,
        despesasMesAnterior: totalDespesasMesAnt,
        variacaoDespesasPercent: variacaoDespesas,
        lucroEstimado: resultadoOperacional,
        margemLucroPercent: margemOperacional,
        cmvPercent,
        cmvStatus,
        coberturaFichasPercent: coberturaFichas,
        acoesHoje,
        dataAtualizacao: 'atualizado agora',
        dailySales30Days,
      };
    } catch (err: unknown) {
      console.warn('[CeoFinancialMetricsService] Erro ao consolidar KPIs executivos reais:', err);
      const empty = this.getEmptyKpis();
      return {
        ...empty,
        dadosIndisponiveis: true,
        erroMensagem: err instanceof Error ? err.message : 'Falha na consulta ao banco de dados',
        dataAtualizacao: 'dados indisponíveis no momento',
      };
    }
  }

  /**
   * Obtém a distribuição de vendas por canal baseada em dados reais.
   * Não inventa percentuais de iFood/99Food se não houver pedidos nesses canais.
   */
  static async getSalesByChannel(workspaceId: string): Promise<VendaCanalDistribuicao[]> {
    if (!workspaceId) return [];

    try {
      const { data: deliveryOrders } = await supabase
        .from('delivery_orders')
        .select('channel_name, total_amount')
        .eq('workspace_id', workspaceId)
        .neq('order_status', 'cancelled');

      const hoje = new Date();
      const mesPad = String(hoje.getMonth() + 1).padStart(2, '0');
      const inicioMes = `${hoje.getFullYear()}-${mesPad}-01`;

      const txMes = await this.fetchAllPaginated<{ valor: number }>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('valor')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', inicioMes)
            .range(from, to)
      );

      const faturamentoTotalGeral = txMes.reduce((acc, t) => acc + Number(t.valor || 0), 0);

      if (faturamentoTotalGeral === 0 && (!deliveryOrders || deliveryOrders.length === 0)) {
        return [];
      }

      const channelMap = new Map<string, number>();
      let faturamentoDeliveryTotal = 0;

      for (const order of deliveryOrders || []) {
        const canal = order.channel_name || 'Delivery Direto';
        const valor = Number(order.total_amount || 0);
        channelMap.set(canal, (channelMap.get(canal) || 0) + valor);
        faturamentoDeliveryTotal += valor;
      }

      const faturamentoSalao = Math.max(0, faturamentoTotalGeral - faturamentoDeliveryTotal);
      const totalCombinado = faturamentoSalao + faturamentoDeliveryTotal;

      const result: VendaCanalDistribuicao[] = [];

      if (faturamentoSalao > 0 || channelMap.size === 0) {
        const pct = totalCombinado > 0 ? Math.round((faturamentoSalao / totalCombinado) * 1000) / 10 : 100;
        result.push({
          canal: 'Salão / Balcão',
          faturamento: faturamentoSalao > 0 ? faturamentoSalao : faturamentoTotalGeral,
          percentual: pct,
          cor: '#3b82f6',
        });
      }

      const colors: Record<string, string> = {
        ifood: '#ef4444',
        '99food': '#f59e0b',
        direto: '#10b981',
      };

      for (const [canal, valor] of channelMap.entries()) {
        const pct = totalCombinado > 0 ? Math.round((valor / totalCombinado) * 1000) / 10 : 0;
        result.push({
          canal,
          faturamento: valor,
          percentual: pct,
          cor: colors[canal.toLowerCase()] || '#8b5cf6',
        });
      }

      return result;
    } catch (err) {
      console.warn('[CeoFinancialMetricsService] Erro ao consolidar canais reais:', err);
      return [];
    }
  }

  /**
   * Obtém ranking dos Top 5 Produtos por Faturamento real.
   * Prioriza vendas reais do PDV Eyemobile e pedidos do Delivery.
   * Se não houver itens individualizados no banco, retorna lista vazia.
   */
  static async getTopProducts(workspaceId: string): Promise<TopProdutoFaturamento[]> {
    if (!workspaceId) return [];

    try {
      const productMap = new Map<string, { quantidade: number; faturamento: number }>();

      // 1. Consulta itens de delivery_order_items (pedidos delivery)
      const { data: itemsDelivery } = await supabase
        .from('delivery_order_items')
        .select('name, quantity, total_price')
        .eq('workspace_id', workspaceId)
        .limit(2000);

      for (const item of itemsDelivery || []) {
        const name = item.name || 'Produto sem nome';
        const qtd = Number(item.quantity || 1);
        const valor = Number(item.total_price || 0);
        const current = productMap.get(name) || { quantidade: 0, faturamento: 0 };
        current.quantidade += qtd;
        current.faturamento += valor;
        productMap.set(name, current);
      }

      // Se não houver itens detalhados individualmente de vendas no banco, retorna lista vazia
      // (ranking disponível apenas para vendas com itens registrados)
      if (productMap.size === 0) {
        return [];
      }

      const totalFaturamento = Array.from(productMap.values()).reduce((acc, p) => acc + p.faturamento, 0);

      const sorted = Array.from(productMap.entries())
        .sort((a, b) => b[1].faturamento - a[1].faturamento)
        .slice(0, 5);

      return sorted.map(([produto, stats], idx) => {
        const pct = totalFaturamento > 0 ? Math.round((stats.faturamento / totalFaturamento) * 1000) / 10 : 0;
        return {
          rank: idx + 1,
          id: `prod-${idx + 1}`,
          produto,
          quantidade: stats.quantidade,
          faturamento: stats.faturamento,
          percentualFaturamento: pct,
          margemEstimada: null, // Sem fichas técnicas validadas, margem é null
        };
      });
    } catch (err) {
      console.warn('[CeoFinancialMetricsService] Erro ao consultar produtos reais:', err);
      return [];
    }
  }

  /**
   * Gera matriz de calor de horários de maior movimento com fuso horário America/Sao_Paulo (UTC-3).
   * Não utiliza Math.random().
   */
  static async getMovementHeatmap(workspaceId: string): Promise<HeatmapHorarioPonto[]> {
    if (!workspaceId) return [];

    try {
      const hoje = new Date();
      const limite30Dias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const transacoes = await this.fetchAllPaginated<{ created_at?: string; valor?: number }>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('created_at, valor')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('created_at', limite30Dias)
            .range(from, to)
      );

      if (transacoes.length === 0) {
        return [];
      }

      const gridMap = new Map<string, { faturamento: number; contagem: number }>();
      const dias = [
        { num: 1, nome: 'Seg' },
        { num: 2, nome: 'Ter' },
        { num: 3, nome: 'Qua' },
        { num: 4, nome: 'Qui' },
        { num: 5, nome: 'Sex' },
        { num: 6, nome: 'Sáb' },
        { num: 0, nome: 'Dom' },
      ];

      let maxFaturamentoPonto = 0;

      for (const t of transacoes) {
        if (!t.created_at) continue;
        const d = new Date(t.created_at);
        // Aplica fuso America/Sao_Paulo (UTC-3)
        const utcHours = d.getUTCHours();
        let horaSP = utcHours - 3;
        if (horaSP < 0) horaSP += 24;

        const diaSemana = d.getDay();

        // Agrupa em janelas (11h, 13h, 15h, 17h, 19h, 21h, 23h)
        const horaIntervalo = Math.max(11, Math.min(23, Math.floor(horaSP / 2) * 2 + 1));
        const key = `${diaSemana}_${horaIntervalo}`;
        const current = gridMap.get(key) || { faturamento: 0, contagem: 0 };
        const valor = Number(t.valor || 0);
        current.faturamento += valor;
        current.contagem += 1;
        gridMap.set(key, current);

        if (current.faturamento > maxFaturamentoPonto) {
          maxFaturamentoPonto = current.faturamento;
        }
      }

      const pontos: HeatmapHorarioPonto[] = [];

      for (let hora = 11; hora <= 23; hora += 2) {
        for (const d of dias) {
          const key = `${d.num}_${hora}`;
          const dado = gridMap.get(key);
          const faturamento = dado ? dado.faturamento : 0;
          const intensidade = maxFaturamentoPonto > 0 ? Math.round((faturamento / maxFaturamentoPonto) * 100) : 0;

          pontos.push({
            hora,
            diaSemana: d.num,
            diaNome: d.nome,
            intensidade,
            faturamento,
          });
        }
      }

      return pontos;
    } catch (err) {
      console.warn('[CeoFinancialMetricsService] Erro ao consolidar heatmap de horários:', err);
      return [];
    }
  }

  static getEmptyKpis(): CeoExecutiveKpis {
    return {
      faturamentoMes: 0,
      faturamentoMesAnterior: 0,
      crescimentoMesPercent: null,
      pedidosMes: 0,
      crescimentoPedidosPercent: null,
      ticketMedioMes: null,
      crescimentoTicketMedioPercent: null,
      resultadoOperacional: 0,
      margemOperacionalPercent: null,
      faturamentoOntem: 0,
      mediaDiaSemanaOntem: null,
      variacaoOntemVsMediaPercent: null,
      diaSemanaOntemNome: 'ontem',
      despesasMes: 0,
      despesasMesAnterior: 0,
      variacaoDespesasPercent: null,
      lucroEstimado: 0,
      margemLucroPercent: null,
      cmvPercent: null,
      cmvStatus: 'dados_insuficientes',
      coberturaFichasPercent: 0,
      acoesHoje: [
        {
          numero: 1,
          titulo: 'Cadastrar fichas técnicas dos produtos',
          detalhe: 'Necessário para apuração real de CMV e margem unitária.',
        },
        {
          numero: 2,
          titulo: 'Configurar canais de delivery no KDS',
          detalhe: 'Ativar credenciais do iFood e 99Food no KDS para captura de pedidos.',
        },
        {
          numero: 3,
          titulo: 'Acompanhar lançamentos de caixa',
          detalhe: 'Verificar sincronização de vendas com o Eyemobile PDV.',
        },
      ],
      dataAtualizacao: 'aguardando sincronização',
      dailySales30Days: [],
    };
  }
}
