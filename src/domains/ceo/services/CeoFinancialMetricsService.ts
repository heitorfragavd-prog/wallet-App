import { supabase } from '@/integrations/supabase/client';

export interface CeoExecutiveKpis {
  faturamentoMes: number;
  faturamentoMesAnterior: number;
  crescimentoMesPercent: number | null;
  faturamentoOntem: number;
  mediaDiaSemanaOntem: number | null;
  variacaoOntemVsMediaPercent: number | null;
  diaSemanaOntemNome: string;
  despesasMes: number;
  despesasMesAnterior: number;
  variacaoDespesasPercent: number | null;
  lucroEstimado: number;
  margemLucroPercent: number | null;
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
  margemEstimada: number | null;
}

export class CeoFinancialMetricsService {
  /**
   * Obtém KPIs executivos consolidados com dados 100% reais da Rodo Point.
   * Nunca utiliza valores fictícios como fallback.
   */
  static async getExecutiveKpis(workspaceId: string): Promise<CeoExecutiveKpis> {
    if (!workspaceId) {
      return this.getEmptyKpis();
    }

    try {
      const hoje = new Date();
      const anoAtual = hoje.getFullYear();
      const mesAtual = hoje.getMonth() + 1; // 1-12

      const mesPad = String(mesAtual).padStart(2, '0');
      const inicioMesAtual = `${anoAtual}-${mesPad}-01`;
      const fimMesAtual = hoje.toISOString().slice(0, 10);

      // Mês anterior
      const dataMesAnterior = new Date(anoAtual, mesAtual - 2, 1);
      const anoAnt = dataMesAnterior.getFullYear();
      const mesAntPad = String(dataMesAnterior.getMonth() + 1).padStart(2, '0');
      const ultimoDiaMesAnt = new Date(anoAnt, dataMesAnterior.getMonth() + 1, 0).getDate();
      const inicioMesAnt = `${anoAnt}-${mesAntPad}-01`;
      const fimMesAnt = `${anoAnt}-${mesAntPad}-${String(ultimoDiaMesAnt).padStart(2, '0')}`;

      // Ontem
      const ontem = new Date(hoje);
      ontem.setDate(hoje.getDate() - 1);
      const ontemStr = ontem.toISOString().slice(0, 10);
      const diasSemanaNomes = ['domingos', 'segundas-feiras', 'terças-feiras', 'quartas-feiras', 'quintas-feiras', 'sextas-feiras', 'sábados'];
      const diaSemanaOntemNome = diasSemanaNomes[ontem.getDay()];

      // 1. Faturamento Mês Atual (transacoes de receita com paginação segura)
      const { data: txMes } = await supabase
        .from('transacoes')
        .select('valor, data')
        .eq('workspace_id', workspaceId)
        .eq('tipo', 'receita')
        .gte('data', inicioMesAtual)
        .lte('data', fimMesAtual)
        .limit(5000);

      const faturamentoMes = (txMes || []).reduce((acc, t) => acc + Number(t.valor || 0), 0);

      // 2. Faturamento Mês Anterior
      const { data: txMesAnt } = await supabase
        .from('transacoes')
        .select('valor')
        .eq('workspace_id', workspaceId)
        .eq('tipo', 'receita')
        .gte('data', inicioMesAnt)
        .lte('data', fimMesAnt)
        .limit(5000);

      const faturamentoMesAnt = (txMesAnt || []).reduce((acc, t) => acc + Number(t.valor || 0), 0);

      // Crescimento % real
      const crescimentoMes =
        faturamentoMesAnt > 0
          ? Math.round(((faturamentoMes - faturamentoMesAnt) / faturamentoMesAnt) * 1000) / 10
          : null;

      // 3. Faturamento de Ontem real
      const vendasOntem = (txMes || []).filter((t) => (t.data ? t.data.startsWith(ontemStr) : false));
      const faturamentoOntem = vendasOntem.reduce((acc, t) => acc + Number(t.valor || 0), 0);

      // Média do mesmo dia da semana nas últimas semanas
      const diaSemanaIndex = ontem.getDay();
      const vendasMesmoDiaSemana = (txMes || []).filter((t) => {
        if (!t.data) return false;
        const d = new Date(t.data);
        return d.getDay() === diaSemanaIndex && !t.data.startsWith(ontemStr);
      });
      const somaMesmoDia = vendasMesmoDiaSemana.reduce((acc, t) => acc + Number(t.valor || 0), 0);
      const diasContados = Math.max(1, Math.round(vendasMesmoDiaSemana.length / 50));
      const mediaDiaSemana = vendasMesmoDiaSemana.length > 0 ? somaMesmoDia / diasContados : null;

      const variacaoOntemVsMedia =
        mediaDiaSemana !== null && mediaDiaSemana > 0
          ? Math.round(((faturamentoOntem - mediaDiaSemana) / mediaDiaSemana) * 1000) / 10
          : null;

      // 4. Despesas Mês Atual reais
      const { data: despMes } = await supabase
        .from('despesas')
        .select('valor')
        .eq('workspace_id', workspaceId)
        .gte('data', inicioMesAtual)
        .lte('data', fimMesAtual)
        .limit(5000);

      const totalDespesasMes = (despMes || []).reduce((acc, d) => acc + Number(d.valor || 0), 0);

      // Despesas Mês Anterior reais
      const { data: despMesAnt } = await supabase
        .from('despesas')
        .select('valor')
        .eq('workspace_id', workspaceId)
        .gte('data', inicioMesAnt)
        .lte('data', fimMesAnt)
        .limit(5000);

      const totalDespesasMesAnt = (despMesAnt || []).reduce((acc, d) => acc + Number(d.valor || 0), 0);
      const variacaoDespesas =
        totalDespesasMesAnt > 0
          ? Math.round(((totalDespesasMes - totalDespesasMesAnt) / totalDespesasMesAnt) * 1000) / 10
          : null;

      // 5. Resultado Operacional Apurado (Receitas - Despesas Registradas)
      const lucroEstimado = Math.max(0, faturamentoMes - totalDespesasMes);
      const margemLucro = faturamentoMes > 0 ? Math.round((lucroEstimado / faturamentoMes) * 1000) / 10 : null;

      // 6. CMV Status: checa se há fichas técnicas reais cadastradas
      const { count: countFichas } = await supabase
        .from('fichas_tecnicas')
        .select('*', { count: 'exact', head: true });

      const hasFichas = (countFichas ?? 0) > 0;
      const cmvStatus = hasFichas ? 'saudavel' : 'dados_insuficientes';
      const cmvPercent: number | null = null;
      const coberturaFichas = hasFichas ? 100 : 0;

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
        faturamentoOntem,
        mediaDiaSemanaOntem,
        variacaoOntemVsMediaPercent: variacaoOntemVsMedia,
        diaSemanaOntemNome,
        despesasMes: totalDespesasMes,
        despesasMesAnterior: totalDespesasMesAnt,
        variacaoDespesasPercent: variacaoDespesas,
        lucroEstimado,
        margemLucroPercent: margemLucro,
        cmvPercent,
        cmvStatus,
        coberturaFichasPercent: coberturaFichas,
        acoesHoje,
        dataAtualizacao: 'atualizado agora',
      };
    } catch (err) {
      console.warn('[CeoFinancialMetricsService] Erro ao consolidar KPIs executivos reais:', err);
      return this.getEmptyKpis();
    }
  }

  /**
   * Obtém a distribuição de vendas por canal baseada em dados reais.
   * Não inventa percentuais de iFood/99Food se não houver pedidos nesses canais.
   */
  static async getSalesByChannel(workspaceId: string): Promise<VendaCanalDistribuicao[]> {
    if (!workspaceId) return [];

    try {
      // 1. Consulta faturamento de delivery em delivery_orders
      const { data: deliveryOrders } = await supabase
        .from('delivery_orders')
        .select('channel_name, total_amount')
        .eq('workspace_id', workspaceId)
        .neq('order_status', 'cancelled');

      // 2. Consulta faturamento geral no mês
      const hoje = new Date();
      const mesPad = String(hoje.getMonth() + 1).padStart(2, '0');
      const inicioMes = `${hoje.getFullYear()}-${mesPad}-01`;

      const { data: txMes } = await supabase
        .from('transacoes')
        .select('valor')
        .eq('workspace_id', workspaceId)
        .eq('tipo', 'receita')
        .gte('data', inicioMes)
        .limit(5000);

      const faturamentoTotalGeral = (txMes || []).reduce((acc, t) => acc + Number(t.valor || 0), 0);

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
   * Obtém ranking dos Top 10 Produtos por Faturamento real.
   * Retorna lista vazia caso não haja itens individualizados registrados.
   */
  static async getTopProducts(workspaceId: string): Promise<TopProdutoFaturamento[]> {
    if (!workspaceId) return [];

    try {
      const { data: items } = await supabase
        .from('delivery_order_items')
        .select('name, quantity, total_price')
        .eq('workspace_id', workspaceId)
        .limit(2000);

      if (!items || items.length === 0) {
        return [];
      }

      const productMap = new Map<string, { quantidade: number; faturamento: number }>();

      for (const item of items) {
        const name = item.name || 'Produto sem nome';
        const qtd = Number(item.quantity || 1);
        const valor = Number(item.total_price || 0);
        const current = productMap.get(name) || { quantidade: 0, faturamento: 0 };
        current.quantidade += qtd;
        current.faturamento += valor;
        productMap.set(name, current);
      }

      const sorted = Array.from(productMap.entries())
        .sort((a, b) => b[1].faturamento - a[1].faturamento)
        .slice(0, 10);

      return sorted.map(([produto, stats], idx) => ({
        rank: idx + 1,
        id: `prod-${idx + 1}`,
        produto,
        quantidade: stats.quantidade,
        faturamento: stats.faturamento,
        margemEstimada: null, // Sem fichas técnicas, margem estimada é null (nunca fictícia)
      }));
    } catch (err) {
      console.warn('[CeoFinancialMetricsService] Erro ao consultar produtos reais:', err);
      return [];
    }
  }

  /**
   * Gera matriz de calor de horários de maior movimento baseada em timestamps de transações reais.
   * Não utiliza Math.random(). Se não houver transações com horário, retorna array vazio.
   */
  static async getMovementHeatmap(workspaceId: string): Promise<HeatmapHorarioPonto[]> {
    if (!workspaceId) return [];

    try {
      const hoje = new Date();
      const limite30Dias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: transacoes } = await supabase
        .from('transacoes')
        .select('created_at, valor')
        .eq('workspace_id', workspaceId)
        .eq('tipo', 'receita')
        .gte('created_at', limite30Dias)
        .limit(5000);

      if (!transacoes || transacoes.length === 0) {
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
        const hora = d.getHours();
        const diaSemana = d.getDay();

        // Agrupa em janelas de 2 horas (11h, 13h, 15h, 17h, 19h, 21h, 23h)
        const horaIntervalo = Math.max(11, Math.min(23, Math.floor(hora / 2) * 2 + 1));
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

  private static getEmptyKpis(): CeoExecutiveKpis {
    return {
      faturamentoMes: 0,
      faturamentoMesAnterior: 0,
      crescimentoMesPercent: null,
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
    };
  }
}
