
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
import {
  FinancialConsolidationService,
  DespesaInput,
  TransacaoInput,
} from '@/domains/finance/services/FinancialConsolidationService';

export interface CeoExecutiveKpis {
  faturamentoMes: number;
  faturamentoMesAnterior: number;
  crescimentoMesPercent: number | null;
  crescimentoMes?: number | null;
  pedidosMes: number;
  crescimentoPedidosPercent: number | null;
  crescimentoPedidos?: number | null;
  ticketMedioMes: number | null;
  crescimentoTicketMedioPercent: number | null;
  crescimentoTicket?: number | null;
  resultadoOperacional: number; // Permite valor negativo real (sem Math.max(0, ...))
  margemOperacionalPercent: number | null;
  margemOperacional?: number | null;
  faturamentoOntem: number;
  mediaDiaSemanaOntem: number | null;
  variacaoOntemVsMediaPercent: number | null;
  variacaoOntemVsMedia?: number | null;
  diaSemanaOntemNome: string;
  despesasMes: number;
  despesasMesAnterior: number;
  variacaoDespesasPercent: number | null;
  lucroEstimado: number; // Alias retrocompatível para resultadoOperacional
  margemLucroPercent: number | null; // Alias retrocompatível para margemOperacionalPercent
  cmvPercent: number | null; // null se dados insuficientes
  cmvStatus: 'saudavel' | 'atencao' | 'critico' | 'dados_insuficientes';
  coberturaFichasPercent: number;
  cmvConfirmado: number | null;
  receitaComCustoConhecido: number;
  receitaComCustoPendente: number;
  coberturaCmvPercent: number;
  lucroBrutoConfirmado: number | null;
  margemBrutaConfirmadaPercent: number | null;
  produtosComCustoCadastrado: number;
  totalProdutosCatalogo: number;
  acoesHoje: {
    numero: number;
    titulo: string;
    detalhe: string;
    impacto?: string;
  }[];
  dataAtualizacao: string;
  dailySales30Days: { date: string; valor: number }[];
  topProducts?: TopProdutoFaturamento[];
  dadosIndisponiveis?: boolean;
  erroMensagem?: string;
  despesasIndisponiveis?: boolean;
  faturamentoIndisponivel?: boolean;
  motivoIndisponibilidadeDespesas?: string | null;
  motivoIndisponibilidadeCmv?: string | null;
}

export interface TransacaoReceitaItem {
  id?: string;
  valor: number;
  data: string;
  created_at?: string;
  descricao?: string | null;
  observacoes?: string | null;
  deduplication_key?: string | null;
  itens?: unknown;
}

/**
 * Deduplica registros de receita (ex: múltiplas inserções de vendas sincronizadas Eyemobile)
 * identificando chaves de venda únicas em deduplication_key, observações ou descrição.
 */
export function deduplicateRevenues<T extends TransacaoReceitaItem>(transacoes: T[]): T[] {
  const seen = new Set<string>();
  const deduplicated: T[] = [];

  for (const t of transacoes) {
    let key: string | null = null;

    if (t.deduplication_key) {
      key = `dedup:${t.deduplication_key}`;
    } else {
      const obs = t.observacoes || "";
      const desc = t.descricao || "";
      const matchObs = obs.match(/Venda:\s*#(\d+)/i);
      const matchDesc = desc.match(/Venda Eyemobile\s*#(\d+)/i);

      if (matchObs) {
        key = `eyemobile:sale:${matchObs[1]}`;
      } else if (matchDesc) {
        key = `eyemobile:sale:${matchDesc[1]}`;
      } else if (t.id) {
        key = `id:${t.id}`;
      }
    }

    if (key) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
    }

    deduplicated.push(t);
  }

  return deduplicated;
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
  custoUnitario?: number | null;
  cmvTotal?: number | null;
  lucroBrutoTotal?: number | null;
  margemBrutaPercent?: number | null;
  statusCusto?: 'confirmado' | 'pendente_ficha' | 'sem_nota';
}

export interface ProdutoRentabilidadeItem {
  id: string;
  codigo: string;
  produto: string;
  quantidade: number;
  faturamento: number;
  precoVendaMedio: number;
  custoUnitario: number | null;
  cmvTotal: number | null;
  lucroBrutoTotal: number | null;
  margemBrutaPercent: number | null;
  statusCusto: 'confirmado' | 'pendente_ficha' | 'sem_nota';
}

export interface RelatorioRentabilidadeComercial {
  receitaTotal: number;
  receitaComCusto: number;
  receitaSemCusto: number;
  cmvTotal: number;
  lucroBrutoTotal: number;
  margemBrutaMedia: number;
  coberturaReceitaPercent: number;
  produtosComCustoQtd: number;
  produtosTotalQtd: number;
  itens: ProdutoRentabilidadeItem[];
  maisLucrativos: ProdutoRentabilidadeItem[];
  maioresMargens: ProdutoRentabilidadeItem[];
  menoresMargens: ProdutoRentabilidadeItem[];
  semCusto: ProdutoRentabilidadeItem[];
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
      const hoje = referenceDate;
      const todayParts = getSaoPauloParts(hoje);
      const yesterdayParts = getSaoPauloYesterday(hoje);

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

      // 1. Faturamento e Transações do Mês Atual (paginação segura completa com deduplicação de vendas PDV)
      const txMesRaw = await this.fetchAllPaginated<TransacaoReceitaItem>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('id, valor, data, created_at, descricao, observacoes, deduplication_key, itens')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', inicioMesAtual)
            .lte('data', `${fimMesAtual}T23:59:59.999Z`)
            .order('data', { ascending: true })
            .range(from, to)
      );

      const txMes = deduplicateRevenues(txMesRaw);
      const faturamentoMes = txMes.reduce((acc, t) => acc + Number(t.valor || 0), 0);
      const pedidosMes = txMes.length;
      const ticketMedioMes = pedidosMes > 0 ? Math.round((faturamentoMes / pedidosMes) * 100) / 100 : null;

      // 2. Faturamento Mês Anterior (Período Equivalente com deduplicação)
      const txMesAntRaw = await this.fetchAllPaginated<TransacaoReceitaItem>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('id, valor, data, created_at, descricao, observacoes, deduplication_key')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', inicioMesAnt)
            .lte('data', `${fimMesAntEquivalente}T23:59:59.999Z`)
            .range(from, to)
      );

      const txMesAnt = deduplicateRevenues(txMesAntRaw);
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
      const txOntemRaw = await this.fetchAllPaginated<TransacaoReceitaItem>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('id, valor, data, created_at, descricao, observacoes, deduplication_key')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', ontemStr)
            .lte('data', `${ontemStr}T23:59:59.999Z`)
            .range(from, to)
      );
      const txOntem = deduplicateRevenues(txOntemRaw);
      const faturamentoOntem = txOntem.reduce((acc, t) => acc + Number(t.valor || 0), 0);

      // Média real do mesmo dia da semana nas últimas 4 semanas (28 dias antes de ontem)
      const yesterdayNoonMs = Date.UTC(yesterdayParts.year, yesterdayParts.month - 1, yesterdayParts.day, 12, 0, 0);
      const date28DaysAgo = new Date(yesterdayNoonMs - 28 * 24 * 60 * 60 * 1000);
      const inicioHistoricoStr = getSaoPauloDateString(date28DaysAgo);

      const txHistoricoSemanaRaw = await this.fetchAllPaginated<TransacaoReceitaItem>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('id, valor, data, created_at, descricao, observacoes, deduplication_key')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', inicioHistoricoStr)
            .lte('data', `${ontemStr}T23:59:59.999Z`)
            .range(from, to)
      );
      const txHistoricoSemana = deduplicateRevenues(txHistoricoSemanaRaw);

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

      // 4. Despesas Mês Atual reais (consolidação canônica com prevenção estrita de duplicidade)
      let totalDespesasMes = 0;
      let totalDespesasMesAnt = 0;
      let despesasIndisponiveis = false;
      let motivoIndisponibilidadeDespesas: string | null = null;

      try {
        const despMes = await this.fetchAllPaginated<DespesaInput>(
          (from, to) =>
            supabase
              .from('despesas')
              .select('id, valor, data, descricao, status, metodo_pagamento, deduplication_key, observacoes, fatura_id, workspace_id')
              .eq('workspace_id', workspaceId)
              .gte('data', inicioMesAtual)
              .lte('data', fimMesAtual)
              .range(from, to)
        );

        const txDespMes = await this.fetchAllPaginated<TransacaoInput>(
          (from, to) =>
            supabase
              .from('transacoes')
              .select('id, valor, data, descricao, tipo, metodo_pagamento, deduplication_key, observacoes, cartao_id, workspace_id')
              .eq('workspace_id', workspaceId)
              .eq('tipo', 'despesa')
              .gte('data', inicioMesAtual)
              .lte('data', `${fimMesAtual}T23:59:59.999Z`)
              .range(from, to)
        );

        const repMes = FinancialConsolidationService.consolidate({
          workspaceId,
          despesas: despMes,
          transacoes: txDespMes,
          options: {
            startDate: inicioMesAtual,
            endDate: fimMesAtual,
            ignoreInternalTransfers: true,
            ignoreCreditCardInvoicePayments: true,
          },
        });
        totalDespesasMes = repMes.totalPorCompetencia;

        // Despesas Mês Anterior equivalentes
        const despMesAnt = await this.fetchAllPaginated<DespesaInput>(
          (from, to) =>
            supabase
              .from('despesas')
              .select('id, valor, data, descricao, status, metodo_pagamento, deduplication_key, observacoes, fatura_id, workspace_id')
              .eq('workspace_id', workspaceId)
              .gte('data', inicioMesAnt)
              .lte('data', fimMesAntEquivalente)
              .range(from, to)
        );

        const txDespMesAnt = await this.fetchAllPaginated<TransacaoInput>(
          (from, to) =>
            supabase
              .from('transacoes')
              .select('id, valor, data, descricao, tipo, metodo_pagamento, deduplication_key, observacoes, cartao_id, workspace_id')
              .eq('workspace_id', workspaceId)
              .eq('tipo', 'despesa')
              .gte('data', inicioMesAnt)
              .lte('data', `${fimMesAntEquivalente}T23:59:59.999Z`)
              .range(from, to)
        );

        const repMesAnt = FinancialConsolidationService.consolidate({
          workspaceId,
          despesas: despMesAnt,
          transacoes: txDespMesAnt,
          options: {
            startDate: inicioMesAnt,
            endDate: fimMesAntEquivalente,
            ignoreInternalTransfers: true,
            ignoreCreditCardInvoicePayments: true,
          },
        });
        totalDespesasMesAnt = repMesAnt.totalPorCompetencia;
      } catch (errDesp: unknown) {
        console.warn('[CeoFinancialMetricsService] Despesas indisponíveis ou não configuradas:', errDesp);
        despesasIndisponiveis = true;
        motivoIndisponibilidadeDespesas =
          errDesp instanceof Error ? errDesp.message : 'Falha ao consultar tabela de despesas';
      }

      const variacaoDespesas =
        !despesasIndisponiveis && totalDespesasMesAnt > 0
          ? Math.round(((totalDespesasMes - totalDespesasMesAnt) / totalDespesasMesAnt) * 1000) / 10
          : null;

      // 5. Resultado Operacional Real (Receitas - Despesas), preservando fidelidade contábil
      const resultadoOperacional = despesasIndisponiveis ? faturamentoMes : (faturamentoMes - totalDespesasMes);
      const margemOperacional =
        !despesasIndisponiveis && faturamentoMes > 0 && totalDespesasMes > 0
          ? Math.round((resultadoOperacional / faturamentoMes) * 1000) / 10
          : null;

      // 6. CMV e Rentabilidade Real: apuração sobre custos de atacado comprovados e produtos_eyemobile
      let totalFichas = 0;
      let totalProdutos = 0;
      let hasFichas = false;
      let coberturaFichas = 0;
      let cmvPercent: number | null = null;
      let cmvStatus: 'saudavel' | 'atencao' | 'critico' | 'dados_insuficientes' = 'dados_insuficientes';
      let motivoIndisponibilidadeCmv: string | null = null;
      let cmvConfirmado: number | null = null;
      let receitaComCustoConhecido = 0;
      let receitaComCustoPendente = 0;
      let coberturaCmvPercent = 0;
      let lucroBrutoConfirmado: number | null = null;
      let margemBrutaConfirmadaPercent: number | null = null;
      let produtosComCustoCadastrado = 0;
      let totalProdutosCatalogo = 0;

      try {
        const { count: countFichas } = await supabase
          .from('fichas_tecnicas')
          .select('*', { count: 'exact', head: true });
        totalFichas = countFichas ?? 0;
        hasFichas = totalFichas > 0;

        const { data: prodsEyemobile } = await supabase
          .from('produtos_eyemobile')
          .select('codigo, descricao, custo_atual, preco_venda')
          .eq('workspace_id', workspaceId);

        const catalogo = prodsEyemobile || [];
        totalProdutos = catalogo.length;
        totalProdutosCatalogo = catalogo.length;
        coberturaFichas = totalProdutos > 0 && totalFichas > 0
          ? Math.min(100, Math.round((totalFichas / totalProdutos) * 100))
          : 0;

        const costMap = new Map<string, { custo: number; descricao: string }>();
        for (const p of catalogo) {
          const c = Number(p.custo_atual || 0);
          if (c > 0 && p.codigo) {
            costMap.set(String(p.codigo), { custo: c, descricao: p.descricao || '' });
            produtosComCustoCadastrado++;
          }
        }

        let cmvAcumulado = 0;
        let temItens = false;

        for (const t of txMes) {
          if (!t.itens || !Array.isArray(t.itens)) continue;
          for (const item of t.itens) {
            if (!item || typeof item !== 'object') continue;
            temItens = true;
            const raw = item as Record<string, unknown>;
            const pId = String(raw.product_id || raw.id || '');
            const qtd = Number(raw.quantity ?? raw.quantidade ?? 1);
            const totalItem = Number(raw.total ?? raw.valor ?? (Number(raw.price || 0) * qtd));

            const matchCusto = costMap.get(pId);
            if (matchCusto && matchCusto.custo > 0) {
              const custoItem = matchCusto.custo * qtd;
              cmvAcumulado += custoItem;
              receitaComCustoConhecido += totalItem;
            } else {
              receitaComCustoPendente += totalItem;
            }
          }
        }

        if (receitaComCustoConhecido > 0 && cmvAcumulado > 0) {
          cmvConfirmado = Math.round(cmvAcumulado * 100) / 100;
          lucroBrutoConfirmado = Math.round((receitaComCustoConhecido - cmvAcumulado) * 100) / 100;
          cmvPercent = Math.round((cmvAcumulado / receitaComCustoConhecido) * 1000) / 10;
          margemBrutaConfirmadaPercent = Math.round(((receitaComCustoConhecido - cmvAcumulado) / receitaComCustoConhecido) * 1000) / 10;
          const receitaTotalApurada = receitaComCustoConhecido + receitaComCustoPendente;
          coberturaCmvPercent = receitaTotalApurada > 0 ? Math.round((receitaComCustoConhecido / receitaTotalApurada) * 1000) / 10 : 0;
          cmvStatus = cmvPercent <= 40 ? 'saudavel' : 'atencao';
        } else if (!temItens || costMap.size === 0) {
          cmvStatus = 'dados_insuficientes';
          motivoIndisponibilidadeCmv = costMap.size === 0
            ? 'Custos unitários de produtos ainda não cadastrados no sistema'
            : 'Transações sem detalhamento de itens no período';
        }
      } catch (errCmv) {
        console.warn('[CeoFinancialMetricsService] Aviso ao apurar CMV:', errCmv);
        cmvStatus = 'dados_insuficientes';
        motivoIndisponibilidadeCmv = 'Falha ao consultar custos no banco de dados';
      }

      // 7. Evolução diária de vendas (últimos 30 dias reais com deduplicação)
      const limite30Dias = new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000);
      const limite30DiasStr = limite30Dias.toISOString().slice(0, 10);

      const tx30DiasRaw = await this.fetchAllPaginated<TransacaoReceitaItem>(
        (from, to) =>
          supabase
            .from('transacoes')
            .select('id, valor, data, created_at, descricao, observacoes, deduplication_key, itens')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', limite30DiasStr)
            .lte('data', `${fimMesAtual}T23:59:59.999Z`)
            .order('data', { ascending: true })
            .range(from, to)
      );

      const tx30Dias = deduplicateRevenues(tx30DiasRaw);
      const topProducts = this.extractTopProductsFromTransactions(tx30Dias);
      const mapDaily = new Map<string, number>();
      for (const t of tx30Dias) {
        if (!t.data) continue;
        const dia = t.data.slice(0, 10);
        mapDaily.set(dia, (mapDaily.get(dia) || 0) + Number(t.valor || 0));
      }

      const dailySales30Days: { date: string; valor: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000);
        const diaStr = getSaoPauloDateString(d);
        const parts = diaStr.split('-');
        const diaFormatado = `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}`;
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
        crescimentoMes,
        crescimentoMesPercent: crescimentoMes,
        pedidosMes,
        crescimentoPedidos,
        crescimentoPedidosPercent: crescimentoPedidos,
        ticketMedioMes,
        crescimentoTicket,
        crescimentoTicketMedioPercent: crescimentoTicket,
        resultadoOperacional,
        margemOperacional,
        margemOperacionalPercent: margemOperacional,
        faturamentoOntem,
        mediaDiaSemanaOntem: mediaDiaSemana,
        variacaoOntemVsMedia,
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
        cmvConfirmado,
        receitaComCustoConhecido,
        receitaComCustoPendente,
        coberturaCmvPercent,
        lucroBrutoConfirmado,
        margemBrutaConfirmadaPercent,
        produtosComCustoCadastrado,
        totalProdutosCatalogo,
        acoesHoje,
        dataAtualizacao: 'atualizado agora',
        dailySales30Days,
        topProducts,
        despesasIndisponiveis,
        motivoIndisponibilidadeDespesas,
        motivoIndisponibilidadeCmv,
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
   * Extrai e agrega os Top Produtos a partir de transações deduplicadas contendo JSONB de itens.
   */
  public static extractTopProductsFromTransactions(
    transacoes: TransacaoReceitaItem[]
  ): TopProdutoFaturamento[] {
    const productMap = new Map<string, { quantidade: number; faturamento: number }>();

    for (const t of transacoes) {
      if (!t.itens || !Array.isArray(t.itens)) continue;
      for (const item of t.itens) {
        if (!item || typeof item !== 'object') continue;
        const raw = item as Record<string, unknown>;
        const name = (raw.product_name as string) || (raw.name as string) || (raw.descricao as string) || 'Item sem nome';
        const qtd = Number(raw.quantity ?? raw.quantidade ?? 1);
        const valor = Number(raw.total ?? raw.valor ?? (Number(raw.price || 0) * qtd));
        const current = productMap.get(name) || { quantidade: 0, faturamento: 0 };
        current.quantidade += qtd;
        current.faturamento += valor;
        productMap.set(name, current);
      }
    }

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
        margemEstimada: null,
      };
    });
  }

  /**
   * Obtém ranking dos Top 5 Produtos por Faturamento real.
   * Prioriza vendas reais do PDV Eyemobile e pedidos do Delivery.
   */
  /**
   * Obtém ranking dos Top 5 Produtos por Faturamento real.
   * Suporta intervalo de datas personalizado (startDate, endDate) ou transações pré-carregadas.
   * Utiliza paginação segura sem limite arbitrário de 2000 registros.
   */
  static async getTopProducts(
    workspaceId: string,
    optionsOrTx?:
      | TransacaoReceitaItem[]
      | {
          startDate?: string;
          endDate?: string;
          customTransactions?: TransacaoReceitaItem[];
        }
  ): Promise<TopProdutoFaturamento[]> {
    if (!workspaceId) return [];

    try {
      let customTransactions: TransacaoReceitaItem[] | undefined;
      let startDate: string | undefined;
      let endDate: string | undefined;

      if (Array.isArray(optionsOrTx)) {
        customTransactions = optionsOrTx;
      } else if (optionsOrTx && typeof optionsOrTx === 'object') {
        customTransactions = optionsOrTx.customTransactions;
        startDate = optionsOrTx.startDate;
        endDate = optionsOrTx.endDate;
      }

      if (customTransactions && customTransactions.length > 0) {
        const topFromTx = this.extractTopProductsFromTransactions(customTransactions);
        if (topFromTx.length > 0) return topFromTx;
      }

      const productMap = new Map<string, { quantidade: number; faturamento: number }>();

      // 1. Consulta itens de transações do PDV no período solicitado (com paginação segura completa)
      let queryStart = startDate;
      const queryEnd = endDate;

      if (!queryStart) {
        const hoje = new Date();
        const limite30Dias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
        queryStart = limite30Dias.toISOString().slice(0, 10);
      }

      const txRaw = await this.fetchAllPaginated<TransacaoReceitaItem>((from, to) => {
        let q = supabase
          .from('transacoes')
          .select('id, valor, data, created_at, descricao, observacoes, deduplication_key, itens')
          .eq('workspace_id', workspaceId)
          .eq('tipo', 'receita')
          .gte('data', queryStart!)
          .not('itens', 'is', null)
          .order('data', { ascending: false });

        if (queryEnd) {
          q = q.lte('data', `${queryEnd}T23:59:59.999Z`);
        }

        return q.range(from, to);
      });

      if (txRaw && Array.isArray(txRaw)) {
        const deduplicated = deduplicateRevenues(txRaw as TransacaoReceitaItem[]);
        for (const t of deduplicated) {
          if (!t.itens || !Array.isArray(t.itens)) continue;
          for (const item of t.itens) {
            if (!item || typeof item !== 'object') continue;
            const raw = item as Record<string, unknown>;
            const name = (raw.product_name as string) || (raw.name as string) || (raw.descricao as string) || 'Item sem nome';
            const qtd = Number(raw.quantity ?? raw.quantidade ?? 1);
            const valor = Number(raw.total ?? raw.valor ?? (Number(raw.price || 0) * qtd));
            const current = productMap.get(name) || { quantidade: 0, faturamento: 0 };
            current.quantidade += qtd;
            current.faturamento += valor;
            productMap.set(name, current);
          }
        }
      }

      // 2. Consulta itens de delivery_order_items (pedidos delivery)
      let queryDelivery = supabase
        .from('delivery_order_items')
        .select('product_name, quantity, total_price, created_at')
        .eq('workspace_id', workspaceId);

      if (queryStart) {
        queryDelivery = queryDelivery.gte('created_at', `${queryStart}T00:00:00.000Z`);
      }
      if (queryEnd) {
        queryDelivery = queryDelivery.lte('created_at', `${queryEnd}T23:59:59.999Z`);
      }

      const { data: itemsDelivery } = await queryDelivery.limit(2000);

      for (const item of itemsDelivery || []) {
        const rawItem = item as Record<string, unknown>;
        const name = (rawItem.product_name as string) || (rawItem.name as string) || 'Produto sem nome';
        const qtd = Number(item.quantity || 1);
        const valor = Number(item.total_price || 0);
        const current = productMap.get(name) || { quantidade: 0, faturamento: 0 };
        current.quantidade += qtd;
        current.faturamento += valor;
        productMap.set(name, current);
      }

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
          margemEstimada: null,
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

  /**
   * Obtém relatório completo de rentabilidade comercial e margens brutas
   * cruzando os itens de vendas com custos de atacado reais comprovados.
   */
  static async getCommercialProfitability(
    workspaceId: string,
    options?: {
      startDate?: string;
      endDate?: string;
      customTransactions?: TransacaoReceitaItem[];
    }
  ): Promise<RelatorioRentabilidadeComercial> {
    if (!workspaceId) {
      return {
        receitaTotal: 0,
        receitaComCusto: 0,
        receitaSemCusto: 0,
        cmvTotal: 0,
        lucroBrutoTotal: 0,
        margemBrutaMedia: 0,
        coberturaReceitaPercent: 0,
        produtosComCustoQtd: 0,
        produtosTotalQtd: 0,
        itens: [],
        maisLucrativos: [],
        maioresMargens: [],
        menoresMargens: [],
        semCusto: [],
      };
    }

    try {
      // 1. Carrega catálogo de produtos com custos
      const { data: prodsData } = await supabase
        .from('produtos_eyemobile')
        .select('codigo, descricao, custo_atual, preco_venda')
        .eq('workspace_id', workspaceId);

      const catalogo = prodsData || [];
      const costMap = new Map<string, { custo: number; descricao: string; precoVenda: number }>();
      let prodsComCusto = 0;

      for (const p of catalogo) {
        const c = Number(p.custo_atual || 0);
        const pv = Number(p.preco_venda || 0);
        if (p.codigo) {
          costMap.set(String(p.codigo), { custo: c, descricao: p.descricao || '', precoVenda: pv });
          if (c > 0) prodsComCusto++;
        }
      }

      // 2. Carrega ou utiliza transações do período
      let tx: TransacaoReceitaItem[] = [];
      if (options?.customTransactions && options.customTransactions.length > 0) {
        tx = options.customTransactions;
      } else {
        let queryStart = options?.startDate;
        const queryEnd = options?.endDate;
        if (!queryStart) {
          const hoje = new Date();
          const d30 = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
          queryStart = d30.toISOString().slice(0, 10);
        }

        const raw = await this.fetchAllPaginated<TransacaoReceitaItem>((from, to) => {
          let q = supabase
            .from('transacoes')
            .select('id, valor, data, created_at, descricao, observacoes, deduplication_key, itens')
            .eq('workspace_id', workspaceId)
            .eq('tipo', 'receita')
            .gte('data', queryStart!)
            .not('itens', 'is', null)
            .order('data', { ascending: false });

          if (queryEnd) {
            q = q.lte('data', `${queryEnd}T23:59:59.999Z`);
          }
          return q.range(from, to);
        });

        tx = deduplicateRevenues(raw);
      }

      // 3. Agrega itens vendidos
      const itemAgg = new Map<string, {
        id: string;
        produto: string;
        quantidade: number;
        faturamento: number;
        prices: number[];
      }>();

      for (const t of tx) {
        if (!t.itens || !Array.isArray(t.itens)) continue;
        for (const item of t.itens) {
          if (!item || typeof item !== 'object') continue;
          const raw = item as Record<string, unknown>;
          const pId = String(raw.product_id || raw.id || 'sem_id');
          const name = (raw.product_name as string) || (raw.name as string) || (raw.descricao as string) || 'Item sem nome';
          const qtd = Number(raw.quantity ?? raw.quantidade ?? 1);
          const pr = Number(raw.price || 0);
          const totalItem = Number(raw.total ?? raw.valor ?? (pr * qtd));

          const cur = itemAgg.get(pId) || {
            id: pId,
            produto: name,
            quantidade: 0,
            faturamento: 0,
            prices: [],
          };
          cur.quantidade += qtd;
          cur.faturamento += totalItem;
          if (pr > 0) cur.prices.push(pr);
          itemAgg.set(pId, cur);
        }
      }

      let receitaTotal = 0;
      let receitaComCusto = 0;
      let receitaSemCusto = 0;
      let cmvTotal = 0;

      const itensRelatorio: ProdutoRentabilidadeItem[] = [];

      for (const [pId, agg] of itemAgg.entries()) {
        receitaTotal += agg.faturamento;
        const info = costMap.get(pId);
        const custoUnit = info && info.custo > 0 ? info.custo : null;

        // Preço médio praticado
        const precoVendaMedio = agg.prices.length > 0
          ? agg.prices.reduce((a, b) => a + b, 0) / agg.prices.length
          : (agg.quantidade > 0 ? agg.faturamento / agg.quantidade : 0);

        if (custoUnit !== null && custoUnit > 0) {
          const cmvItem = custoUnit * agg.quantidade;
          const lucroTotal = agg.faturamento - cmvItem;
          const lucroUnit = precoVendaMedio - custoUnit;
          const margemPct = agg.faturamento > 0 ? (lucroTotal / agg.faturamento) * 100 : 0;

          receitaComCusto += agg.faturamento;
          cmvTotal += cmvItem;

          itensRelatorio.push({
            id: pId,
            codigo: pId,
            produto: agg.produto,
            quantidade: agg.quantidade,
            faturamento: Math.round(agg.faturamento * 100) / 100,
            precoVendaMedio: Math.round(precoVendaMedio * 100) / 100,
            custoUnitario: Math.round(custoUnit * 10000) / 10000,
            cmvTotal: Math.round(cmvItem * 100) / 100,
            lucroBrutoTotal: Math.round(lucroTotal * 100) / 100,
            margemBrutaPercent: Math.round(margemPct * 10) / 10,
            statusCusto: 'confirmado',
          });
        } else {
          receitaSemCusto += agg.faturamento;
          itensRelatorio.push({
            id: pId,
            codigo: pId,
            produto: agg.produto,
            quantidade: agg.quantidade,
            faturamento: Math.round(agg.faturamento * 100) / 100,
            precoVendaMedio: Math.round(precoVendaMedio * 100) / 100,
            custoUnitario: null,
            cmvTotal: null,
            lucroBrutoTotal: null,
            margemBrutaPercent: null,
            statusCusto: 'sem_nota',
          });
        }
      }

      const lucroBrutoTotal = receitaComCusto - cmvTotal;
      const margemBrutaMedia = receitaComCusto > 0 ? Math.round((lucroBrutoTotal / receitaComCusto) * 1000) / 10 : 0;
      const coberturaReceitaPercent = receitaTotal > 0 ? Math.round((receitaComCusto / receitaTotal) * 1000) / 10 : 0;

      const confirmados = itensRelatorio.filter((i) => i.statusCusto === 'confirmado');
      const semCusto = itensRelatorio.filter((i) => i.statusCusto !== 'confirmado');

      const maisLucrativos = [...confirmados].sort((a, b) => (b.lucroBrutoTotal || 0) - (a.lucroBrutoTotal || 0));
      const maioresMargens = [...confirmados].sort((a, b) => (b.margemBrutaPercent || 0) - (a.margemBrutaPercent || 0));
      const menoresMargens = [...confirmados].sort((a, b) => (a.margemBrutaPercent || 0) - (b.margemBrutaPercent || 0));

      return {
        receitaTotal: Math.round(receitaTotal * 100) / 100,
        receitaComCusto: Math.round(receitaComCusto * 100) / 100,
        receitaSemCusto: Math.round(receitaSemCusto * 100) / 100,
        cmvTotal: Math.round(cmvTotal * 100) / 100,
        lucroBrutoTotal: Math.round(lucroBrutoTotal * 100) / 100,
        margemBrutaMedia,
        coberturaReceitaPercent,
        produtosComCustoQtd: prodsComCusto,
        produtosTotalQtd: catalogo.length,
        itens: itensRelatorio,
        maisLucrativos,
        maioresMargens,
        menoresMargens,
        semCusto,
      };
    } catch (err) {
      console.warn('[CeoFinancialMetricsService] Erro ao calcular rentabilidade:', err);
      return {
        receitaTotal: 0,
        receitaComCusto: 0,
        receitaSemCusto: 0,
        cmvTotal: 0,
        lucroBrutoTotal: 0,
        margemBrutaMedia: 0,
        coberturaReceitaPercent: 0,
        produtosComCustoQtd: 0,
        produtosTotalQtd: 0,
        itens: [],
        maisLucrativos: [],
        maioresMargens: [],
        menoresMargens: [],
        semCusto: [],
      };
    }
  }

  static getEmptyKpis(): CeoExecutiveKpis {
    return {
      faturamentoMes: 0,
      faturamentoMesAnterior: 0,
      crescimentoMes: null,
      crescimentoMesPercent: null,
      pedidosMes: 0,
      crescimentoPedidos: null,
      crescimentoPedidosPercent: null,
      ticketMedioMes: null,
      crescimentoTicket: null,
      crescimentoTicketMedioPercent: null,
      resultadoOperacional: 0,
      margemOperacional: null,
      margemOperacionalPercent: null,
      faturamentoOntem: 0,
      mediaDiaSemanaOntem: null,
      variacaoOntemVsMedia: null,
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
      cmvConfirmado: null,
      receitaComCustoConhecido: 0,
      receitaComCustoPendente: 0,
      coberturaCmvPercent: 0,
      lucroBrutoConfirmado: null,
      margemBrutaConfirmadaPercent: null,
      produtosComCustoCadastrado: 0,
      totalProdutosCatalogo: 0,
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
      topProducts: [],
    };
  }
}
