import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Search,
  Package,
  Layers,
  ShieldCheck,
  Percent,
  SlidersHorizontal,
  Info,
  Calendar,
  Building2,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  calcularMetricasLucroBrutoUnitario,
  diagnosticarMargensCatalogo,
  calcularEvolucaoCustosProduto,
  ClassificacaoMargemBruta,
  ProdutoCatalogoDiagnosticoInput,
  RegistroHistoricoCusto,
  RelatorioEvolucaoCustosProduto,
} from '@/domains/finance/services/unitCostCalculationService';

export interface CeoProductProfitabilityTabProps {
  workspaceId: string;
}

/**
 * Catálogo auditado de referência (Gate 1 e 2 - Rodo Point)
 * Utilizado como base inicial ou fallback resiliente se o banco retornar vazio.
 */
const DEFAULT_AUDITED_PRODUCTS: ProdutoCatalogoDiagnosticoInput[] = [
  // Cafeteria & Insumos Três Corações
  { codigo: '2030549', descricao: 'Café Coado (Dose 10g)', precoVenda: 3.50, custoAtual: 0.4445, categoria: 'Cafeteria' },
  { codigo: '2032215', descricao: 'Cappuccino c/ Leite (Sachê 20g)', precoVenda: 7.50, custoAtual: 2.7200, categoria: 'Cafeteria' },
  { codigo: '2032206', descricao: 'Café Expresso / Filtro Especial', precoVenda: 4.50, custoAtual: 0.8890, categoria: 'Cafeteria' },

  // Salgados & Padaria (Xodó Foods & Gerson)
  { codigo: '2032363', descricao: 'Pão de Queijo Super Lanche (UN)', precoVenda: 4.50, custoAtual: 1.3490, categoria: 'Salgados & Padaria' },
  { codigo: '2032401', descricao: 'Salgados R$ 8,00 Tradicionais', precoVenda: 8.00, custoAtual: 3.0000, categoria: 'Salgados & Padaria' },
  { codigo: '2047391', descricao: 'Salgados Premium Gourmet', precoVenda: 9.00, custoAtual: 3.6000, categoria: 'Salgados & Padaria' },

  // Combos & Promoções
  { codigo: '2096925', descricao: '2 Pães de Queijo (Dupla)', precoVenda: 6.90, custoAtual: 2.6980, categoria: 'Combos & Promos' },
  { codigo: '2032171', descricao: '1 Café + 2 Pães de Queijo', precoVenda: 10.90, custoAtual: 3.1425, categoria: 'Combos & Promos' },
  { codigo: '2096999', descricao: 'Combo Salgado Tradicional + Refri 200ml', precoVenda: 11.50, custoAtual: 4.3361, categoria: 'Combos & Promos' },

  // Bebidas Refrigerantes & Sucos (SPAL / Coca-Cola)
  { codigo: '2032242', descricao: 'Coca-Cola KS Vidro', precoVenda: 7.00, custoAtual: 1.7017, categoria: 'Bebidas' },
  { codigo: '2032601', descricao: 'Refrigerante Caçulinha 200ml', precoVenda: 4.00, custoAtual: 1.3361, categoria: 'Bebidas' },
  { codigo: '2032394', descricao: 'Refrigerante Lata 350ml', precoVenda: 7.00, custoAtual: 1.8300, categoria: 'Bebidas' },
  { codigo: '2033766', descricao: 'Powerade Isotônico', precoVenda: 8.90, custoAtual: 2.9217, categoria: 'Bebidas' },
  { codigo: '2032350', descricao: 'Suco Kapo 200ml', precoVenda: 4.50, custoAtual: 1.6363, categoria: 'Bebidas' },
  { codigo: '2032362', descricao: 'Monster Energy Lata 473ml', precoVenda: 14.90, custoAtual: 7.2095, categoria: 'Bebidas' },
  { codigo: '2032410', descricao: 'Suco Del Valle Frutas', precoVenda: 6.00, custoAtual: 2.8617, categoria: 'Bebidas' },
  { codigo: '2032254', descricao: 'Red Bull Energy Drink 250ml', precoVenda: 14.90, custoAtual: 8.1250, categoria: 'Bebidas' },
  { codigo: '2032312', descricao: 'Gatorade Isotônico 500ml', precoVenda: 8.90, custoAtual: 4.5158, categoria: 'Bebidas' },
  { codigo: '2032337', descricao: 'H2OH Limoneto Pet 500ml', precoVenda: 7.90, custoAtual: 4.1492, categoria: 'Bebidas' },

  // Cervejas & Bebidas Alcoólicas (Brasnorte / Ambev)
  { codigo: '2044232', descricao: 'Cerveja Brahma Lata', precoVenda: 10.00, custoAtual: 4.3139, categoria: 'Cervejas' },
  { codigo: '2032231', descricao: 'Cerveja Skol Latão 473ml', precoVenda: 10.00, custoAtual: 3.9667, categoria: 'Cervejas' },
  { codigo: '2044233', descricao: 'Cerveja Original Garrafa 600ml', precoVenda: 10.00, custoAtual: 5.0765, categoria: 'Cervejas' },
  { codigo: '2044235', descricao: 'Cerveja Stella Artois Long Neck', precoVenda: 12.00, custoAtual: 6.8750, categoria: 'Cervejas' },
  { codigo: '2044237', descricao: 'Cerveja Spaten Long Neck', precoVenda: 12.00, custoAtual: 5.0765, categoria: 'Cervejas' },
  { codigo: '2032243', descricao: 'Cerveja Corona Extra Long Neck', precoVenda: 12.00, custoAtual: 6.7717, categoria: 'Cervejas' },

  // Águas
  { codigo: '2032176', descricao: 'Água Mineral sem Gás 500ml', precoVenda: 5.00, custoAtual: 1.1000, categoria: 'Águas' },
  { codigo: '2096935', descricao: 'Água Mineral com Gás 500ml', precoVenda: 3.50, custoAtual: 1.3000, categoria: 'Águas' },

  // Produtos Sem Custo Cadastrado (Para Auditoria)
  { codigo: '2039999', descricao: 'Picolé Artesanal Especial Frutas', precoVenda: 8.50, custoAtual: null, categoria: 'Sobremesas' },
  { codigo: '2038888', descricao: 'Bolo Caseiro Fatia Tradicional', precoVenda: 6.00, custoAtual: null, categoria: 'Sobremesas' },
  { codigo: '2037777', descricao: 'Bombom Trufado Gourmet', precoVenda: 4.00, custoAtual: null, categoria: 'Doces' },
];

/**
 * Histórico cronológico auditado de compras (Xodó Foods e Café Três Corações)
 */
const DEFAULT_AUDITED_HISTORY: RegistroHistoricoCusto[] = [
  // Xodó Foods - Pão de Queijo Super Lanche
  {
    produtoCodigo: '2032363',
    produtoDescricao: 'Pão de Queijo Super Lanche',
    fornecedor: 'Xodó Foods',
    fornecedorCnpj: '52.315.807/0001-17',
    numeroNf: '233767',
    dataCompra: '2026-10-26',
    custoUnitarioAquisicao: 1.2800,
    quantidadeComprada: 350,
  },
  {
    produtoCodigo: '2032363',
    produtoDescricao: 'Pão de Queijo Super Lanche',
    fornecedor: 'Xodó Foods',
    fornecedorCnpj: '52.315.807/0001-17',
    numeroNf: '235622',
    dataCompra: '2026-10-30',
    custoUnitarioAquisicao: 1.3000,
    quantidadeComprada: 490,
  },
  {
    produtoCodigo: '2032363',
    produtoDescricao: 'Pão de Queijo Super Lanche',
    fornecedor: 'Xodó Foods',
    fornecedorCnpj: '52.315.807/0001-17',
    numeroNf: '236028',
    dataCompra: '2026-11-02',
    custoUnitarioAquisicao: 1.3200,
    quantidadeComprada: 350,
  },
  {
    produtoCodigo: '2032363',
    produtoDescricao: 'Pão de Queijo Super Lanche',
    fornecedor: 'Xodó Foods',
    fornecedorCnpj: '52.315.807/0001-17',
    numeroNf: '240118',
    dataCompra: '2026-11-13',
    custoUnitarioAquisicao: 1.3400,
    quantidadeComprada: 560,
  },
  {
    produtoCodigo: '2032363',
    produtoDescricao: 'Pão de Queijo Super Lanche',
    fornecedor: 'Xodó Foods',
    fornecedorCnpj: '52.315.807/0001-17',
    numeroNf: '240338',
    dataCompra: '2026-11-16',
    custoUnitarioAquisicao: 1.3490,
    quantidadeComprada: 350,
  },
  {
    produtoCodigo: '2032363',
    produtoDescricao: 'Pão de Queijo Super Lanche',
    fornecedor: 'Xodó Foods',
    fornecedorCnpj: '52.315.807/0001-17',
    numeroNf: '242284',
    dataCompra: '2026-11-20',
    custoUnitarioAquisicao: 1.5100, // Aumento de 11.9% -> Dispara Alerta
    quantidadeComprada: 490,
  },

  // Café Três Corações - Cappuccino Sachê
  {
    produtoCodigo: '2032215',
    produtoDescricao: 'Cappuccino c/ Leite (Sachê)',
    fornecedor: 'Café Três Corações',
    fornecedorCnpj: '17.467.515/0001-07',
    numeroNf: '3075523',
    dataCompra: '2026-11-18',
    custoUnitarioAquisicao: 2.4800,
    quantidadeComprada: 100,
  },
  {
    produtoCodigo: '2032215',
    produtoDescricao: 'Cappuccino c/ Leite (Sachê)',
    fornecedor: 'Café Três Corações',
    fornecedorCnpj: '17.467.515/0001-07',
    numeroNf: '3089849',
    dataCompra: '2026-12-04',
    custoUnitarioAquisicao: 2.7200, // Aumento de 9.7%
    quantidadeComprada: 150,
  },

  // Café Três Corações - Café Coado Dose 10g
  {
    produtoCodigo: '2030549',
    produtoDescricao: 'Café Coado (Dose 10g)',
    fornecedor: 'Café Três Corações',
    fornecedorCnpj: '17.467.515/0001-07',
    numeroNf: '3075523',
    dataCompra: '2026-11-18',
    custoUnitarioAquisicao: 0.4000,
    quantidadeComprada: 500,
  },
  {
    produtoCodigo: '2030549',
    produtoDescricao: 'Café Coado (Dose 10g)',
    fornecedor: 'Café Três Corações',
    fornecedorCnpj: '17.467.515/0001-07',
    numeroNf: '3089849',
    dataCompra: '2026-12-04',
    custoUnitarioAquisicao: 0.4445, // Aumento de 11.1% -> Dispara Alerta
    quantidadeComprada: 500,
  },
];

export const CeoProductProfitabilityTab: React.FC<CeoProductProfitabilityTabProps> = ({
  workspaceId,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [margemAlvoDesejada, setMargemAlvoDesejada] = useState<number>(30.0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [produtosBase, setProdutosBase] = useState<ProdutoCatalogoDiagnosticoInput[]>(DEFAULT_AUDITED_PRODUCTS);
  const [historicoCustos, setHistoricoCustos] = useState<RegistroHistoricoCusto[]>(DEFAULT_AUDITED_HISTORY);
  const [produtoHistoricoSelecionado, setProdutoHistoricoSelecionado] = useState<string>('2032363');
  const [abaInterna, setAbaInterna] = useState<string>('ranking');

  // Carrega produtos e histórico do Supabase
  const carregarDados = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);

    try {
      const [prodsRes, histRes] = await Promise.all([
        supabase
          .from('produtos_eyemobile')
          .select('codigo, descricao, categoria, preco_venda, custo_atual')
          .eq('workspace_id', workspaceId),
        supabase
          .from('historico_custo_produto')
          .select('produto_codigo, custo_unitario, data_compra, fornecedor, fornecedor_cnpj, numero_nf')
          .eq('workspace_id', workspaceId)
          .order('data_compra', { ascending: true }),
      ]);

      if (prodsRes.data && prodsRes.data.length > 0) {
        const formatados: ProdutoCatalogoDiagnosticoInput[] = prodsRes.data.map((p) => ({
          codigo: String(p.codigo),
          descricao: p.descricao || 'Produto sem nome',
          categoria: p.categoria || 'Geral',
          precoVenda: Number(p.preco_venda || 0),
          custoAtual: p.custo_atual !== null && p.custo_atual !== undefined ? Number(p.custo_atual) : null,
        }));
        setProdutosBase(formatados);
      } else {
        setProdutosBase(DEFAULT_AUDITED_PRODUCTS);
      }

      if (histRes.data && histRes.data.length > 0) {
        const histFormatado: RegistroHistoricoCusto[] = histRes.data.map((h) => ({
          produtoCodigo: String(h.produto_codigo),
          custoUnitarioAquisicao: Number(h.custo_unitario || 0),
          dataCompra: h.data_compra || new Date().toISOString().slice(0, 10),
          fornecedor: h.fornecedor || 'Fornecedor Fiscal',
          fornecedorCnpj: h.fornecedor_cnpj || undefined,
          numeroNf: h.numero_nf || undefined,
        }));
        setHistoricoCustos(histFormatado);
      } else {
        setHistoricoCustos(DEFAULT_AUDITED_HISTORY);
      }
    } catch (err) {
      console.warn('[CeoProductProfitabilityTab] Erro ao carregar dados do Supabase. Utilizando dados auditados locais:', err);
      setProdutosBase(DEFAULT_AUDITED_PRODUCTS);
      setHistoricoCustos(DEFAULT_AUDITED_HISTORY);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Executa diagnóstico em lote através do motor de custos
  const diagnosticoRelatorio = useMemo(() => {
    return diagnosticarMargensCatalogo(produtosBase, margemAlvoDesejada);
  }, [produtosBase, margemAlvoDesejada]);

  // Lista de todas as categorias distintas
  const categoriasDisponiveis = useMemo(() => {
    const cats = new Set<string>();
    for (const p of produtosBase) {
      if (p.categoria) cats.add(p.categoria);
    }
    return Array.from(cats).sort();
  }, [produtosBase]);

  // Filtra itens com base no termo de busca e categoria selecionada
  const itensFiltrados = useMemo(() => {
    return produtosBase
      .filter((p) => {
        const matchSearch =
          searchTerm.trim() === '' ||
          p.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.categoria && p.categoria.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchCat = filtroCategoria === 'todas' || p.categoria === filtroCategoria;
        return matchSearch && matchCat;
      })
      .map((p) => {
        const metricas = calcularMetricasLucroBrutoUnitario({
          custoUnitarioConvertido: p.custoAtual ?? 0,
          precoVendaAtual: p.precoVenda,
          margemMinimaAlvoPercent: margemAlvoDesejada,
        });

        const isCombo =
          p.categoria === 'Combos & Promos' ||
          p.descricao.toLowerCase().includes('combo') ||
          p.descricao.toLowerCase().includes('dupla') ||
          p.descricao.toLowerCase().includes('2 pães');

        return {
          codigo: p.codigo,
          descricao: p.descricao,
          categoria: p.categoria || 'Geral',
          precoVenda: p.precoVenda,
          custoAtual: p.custoAtual,
          lucroBrutoUnitario: metricas.lucroBrutoUnitario,
          margemBrutaPercent: metricas.margemBrutaPercent,
          markupPercent: metricas.markupPercent,
          markupMultiplicador: metricas.markupMultiplicador,
          status: metricas.classificacaoMargem,
          precoVendaSugeridoAlvo: metricas.precoVendaSugeridoAlvo,
          alertaStatus: metricas.alertaStatus,
          isCombo,
        };
      });
  }, [produtosBase, searchTerm, filtroCategoria, margemAlvoDesejada]);

  // Ranking: Mais Lucrativos (Top Lucro Bruto Unitário R$)
  const topLucrativos = useMemo(() => {
    return [...itensFiltrados]
      .filter((i) => i.custoAtual !== null && i.custoAtual > 0)
      .sort((a, b) => b.lucroBrutoUnitario - a.lucroBrutoUnitario);
  }, [itensFiltrados]);

  // Ranking: Menor Margem / Crítica / Prejuízo
  const menorMargemOuCritica = useMemo(() => {
    return [...itensFiltrados]
      .filter((i) => i.custoAtual !== null && i.custoAtual > 0)
      .sort((a, b) => a.margemBrutaPercent - b.margemBrutaPercent);
  }, [itensFiltrados]);

  // Produtos sem custo conhecido
  const produtosSemCusto = useMemo(() => {
    return itensFiltrados.filter((i) => i.custoAtual === null || i.custoAtual <= 0);
  }, [itensFiltrados]);

  // Resumo Executivo: Margem Média Ponderada
  const resumoExecutivo = useMemo(() => {
    const totalAnalisados = produtosBase.length;
    const comCusto = produtosBase.filter((p) => p.custoAtual !== null && p.custoAtual > 0);
    const semCusto = totalAnalisados - comCusto.length;

    let somaPrecoVenda = 0;
    let somaCusto = 0;

    for (const p of comCusto) {
      somaPrecoVenda += p.precoVenda;
      somaCusto += p.custoAtual || 0;
    }

    const margemMediaPonderada =
      somaPrecoVenda > 0 ? ((somaPrecoVenda - somaCusto) / somaPrecoVenda) * 100 : 0;

    const coberturaPercentual =
      totalAnalisados > 0 ? (comCusto.length / totalAnalisados) * 100 : 0;

    return {
      totalAnalisados,
      totalComCusto: comCusto.length,
      totalSemCusto: semCusto,
      coberturaPercentual: Math.round(coberturaPercentual * 10) / 10,
      margemMediaPonderada: Math.round(margemMediaPonderada * 10) / 10,
      totalPrejuizo: diagnosticoRelatorio.totalPrejuizo,
      totalCritica: diagnosticoRelatorio.totalMargemCritica,
      totalAlerta: diagnosticoRelatorio.totalMargemAlerta,
      totalSaudavel: diagnosticoRelatorio.totalSaudavel,
    };
  }, [produtosBase, diagnosticoRelatorio]);

  // Relatório de Evolução Temporal do produto selecionado
  const evolucaoProdutoSelecionado: RelatorioEvolucaoCustosProduto = useMemo(() => {
    const registros = historicoCustos.filter(
      (h) => h.produtoCodigo === produtoHistoricoSelecionado
    );
    return calcularEvolucaoCustosProduto(registros, 10.0);
  }, [historicoCustos, produtoHistoricoSelecionado]);

  // Análise de Categorias & Rentabilidade Agrupada
  const analisePorCategoria = useMemo(() => {
    const mapa = new Map<
      string,
      {
        categoria: string;
        qtdProdutos: number;
        somaPrecoVenda: number;
        somaCusto: number;
        produtosComCusto: number;
      }
    >();

    for (const p of produtosBase) {
      const cat = p.categoria || 'Geral';
      const atual = mapa.get(cat) || {
        categoria: cat,
        qtdProdutos: 0,
        somaPrecoVenda: 0,
        somaCusto: 0,
        produtosComCusto: 0,
      };

      atual.qtdProdutos += 1;
      atual.somaPrecoVenda += p.precoVenda;
      if (p.custoAtual !== null && p.custoAtual > 0) {
        atual.somaCusto += p.custoAtual;
        atual.produtosComCusto += 1;
      }

      mapa.set(cat, atual);
    }

    return Array.from(mapa.values())
      .map((item) => {
        const margem =
          item.somaPrecoVenda > 0
            ? ((item.somaPrecoVenda - item.somaCusto) / item.somaPrecoVenda) * 100
            : 0;
        return {
          categoria: item.categoria,
          qtdProdutos: item.qtdProdutos,
          produtosComCusto: item.produtosComCusto,
          precoMedio: item.qtdProdutos > 0 ? item.somaPrecoVenda / item.qtdProdutos : 0,
          custoMedio:
            item.produtosComCusto > 0 ? item.somaCusto / item.produtosComCusto : 0,
          margemMediaPercent: Math.round(margem * 10) / 10,
        };
      })
      .sort((a, b) => b.margemMediaPercent - a.margemMediaPercent);
  }, [produtosBase]);

  // Combos identificados
  const combosIdentificados = useMemo(() => {
    return itensFiltrados.filter((i) => i.isCombo);
  }, [itensFiltrados]);

  // Helper para estilizar status de margem
  const renderBadgeStatus = (status: ClassificacaoMargemBruta, margemPct: number) => {
    switch (status) {
      case 'prejuizo':
        return (
          <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/30 gap-1 text-[11px] font-semibold">
            <AlertTriangle className="w-3 h-3" />
            Prejuízo ({margemPct.toFixed(1)}%)
          </Badge>
        );
      case 'margem_critica':
        return (
          <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 gap-1 text-[11px] font-semibold">
            <AlertTriangle className="w-3 h-3" />
            Crítica ({margemPct.toFixed(1)}%)
          </Badge>
        );
      case 'margem_alerta':
        return (
          <Badge className="bg-sky-500/15 text-sky-400 border border-sky-500/30 gap-1 text-[11px] font-semibold">
            <Info className="w-3 h-3" />
            Atenção ({margemPct.toFixed(1)}%)
          </Badge>
        );
      case 'saudavel':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 gap-1 text-[11px] font-semibold">
            <CheckCircle2 className="w-3 h-3" />
            Saudável ({margemPct.toFixed(1)}%)
          </Badge>
        );
      case 'sem_custo':
      default:
        return (
          <Badge className="bg-slate-500/15 text-slate-400 border border-slate-500/30 gap-1 text-[11px] font-semibold">
            <HelpCircle className="w-3 h-3" />
            Sem Custo
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* BANNER DE INVARIANTE DE SEGURANÇA E IMUTABILIDADE */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-card/80 border border-emerald-500/30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-foreground">
                Painel de Rentabilidade e Lucro por Produto (Gate 6)
              </h2>
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                Imutável &bull; Read-Only
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Análise puramente analítica baseada no rateio das NFs de compra reais e catálogo do PDV.
              Os preços de venda e estoques nunca são alterados automaticamente.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={carregarDados}
            disabled={isLoading}
            className="h-8 text-xs gap-1.5 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* 1) RESUMO EXECUTIVO (KPI CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Produtos Analisados */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Produtos no Catálogo</span>
              <Package className="w-4 h-4 text-muted-foreground/60" />
            </div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {resumoExecutivo.totalAnalisados}
            </div>
            <div className="mt-2 text-xs flex items-center justify-between text-muted-foreground">
              <span>Cobertura de Custos</span>
              <span className="font-semibold text-emerald-400">
                {resumoExecutivo.coberturaPercentual}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Produtos com Custo Conhecido */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Com Custo Apurado</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {resumoExecutivo.totalComCusto}
            </div>
            <div className="mt-2 text-xs text-emerald-400 font-medium">
              Base auditada por NF ou Ficha Técnica
            </div>
          </CardContent>
        </Card>

        {/* Produtos sem Custo (Pendente Auditoria) */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Sem Custo Cadastrado</span>
              <HelpCircle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-foreground mt-1 text-amber-400">
              {resumoExecutivo.totalSemCusto}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {resumoExecutivo.totalSemCusto > 0
                ? 'Requer vinculação de NF ou Ficha'
                : 'Catálogo 100% coberto'}
            </div>
          </CardContent>
        </Card>

        {/* Margem Bruta Média Ponderada */}
        <Card className="bg-card/70 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Margem Bruta Ponderada</span>
              <Percent className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {resumoExecutivo.margemMediaPonderada.toFixed(1)}%
            </div>
            <div className="mt-2 text-xs flex items-center gap-1.5">
              <span className="text-muted-foreground">Meta Alvo:</span>
              <span className="font-semibold text-orange-400">{margemAlvoDesejada.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BARRA DE FILTROS & AJUSTE DE MARGEM ALVO */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-card/60 border border-border/50">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por produto, código ou categoria..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9 text-xs bg-background/50"
            />
          </div>

          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="w-[160px] h-9 text-xs bg-background/50">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas Categorias</SelectItem>
              {categoriasDisponiveis.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400" />
            Margem Alvo:
          </span>
          <Select
            value={String(margemAlvoDesejada)}
            onValueChange={(val) => setMargemAlvoDesejada(Number(val))}
          >
            <SelectTrigger className="w-[110px] h-9 text-xs bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20% Mínima</SelectItem>
              <SelectItem value="25">25% Mínima</SelectItem>
              <SelectItem value="30">30% Padrão</SelectItem>
              <SelectItem value="35">35% Saudável</SelectItem>
              <SelectItem value="40">40% Alta</SelectItem>
              <SelectItem value="50">50% Premium</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* NAVEGAÇÃO DE ABAS INTERNAS DO PAINEL */}
      <div className="grid grid-cols-2 sm:grid-cols-5 h-auto p-1 bg-muted/40 rounded-xl gap-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={abaInterna === 'ranking'}
          onClick={() => setAbaInterna('ranking')}
          className={`text-xs py-2 px-3 rounded-lg font-semibold transition-all duration-200 ${
            abaInterna === 'ranking'
              ? 'bg-orange-500 text-white shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          Ranking & Margens
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={abaInterna === 'sem_custo'}
          onClick={() => setAbaInterna('sem_custo')}
          className={`text-xs py-2 px-3 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 ${
            abaInterna === 'sem_custo'
              ? 'bg-orange-500 text-white shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <span>Sem Custo</span>
          {resumoExecutivo.totalSemCusto > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
              {resumoExecutivo.totalSemCusto}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={abaInterna === 'historico'}
          onClick={() => setAbaInterna('historico')}
          className={`text-xs py-2 px-3 rounded-lg font-semibold transition-all duration-200 ${
            abaInterna === 'historico'
              ? 'bg-orange-500 text-white shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          Evolução de Custos
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={abaInterna === 'combos_categorias'}
          onClick={() => setAbaInterna('combos_categorias')}
          className={`text-xs py-2 px-3 rounded-lg font-semibold transition-all duration-200 ${
            abaInterna === 'combos_categorias'
              ? 'bg-orange-500 text-white shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          Combos & Categorias
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={abaInterna === 'sugestoes'}
          onClick={() => setAbaInterna('sugestoes')}
          className={`col-span-2 sm:col-span-1 text-xs py-2 px-3 rounded-lg font-semibold transition-all duration-200 ${
            abaInterna === 'sugestoes'
              ? 'bg-orange-500 text-white shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          Sugestões de Preço
        </button>
      </div>

      {/* 2) ABA: RANKING & MARGENS (MAIS LUCRATIVOS E MENOR MARGEM) */}
      <div className={abaInterna === 'ranking' ? 'space-y-4' : 'hidden'}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Produtos Mais Lucrativos (R$ Unitário) */}
          <Card className="border-border/50 bg-card/70">
            <CardHeader className="p-4 pb-2 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Top Lucrativos (Maior Lucro Bruto Unitário)
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Itens com maior ganho monetário bruto (PV &minus; Custo CMV) por unidade vendida.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                  Top {Math.min(5, topLucrativos.length)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                {topLucrativos.slice(0, 5).map((item, idx) => (
                  <div key={item.codigo} className="p-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-4">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {item.descricao}
                        </span>
                        {item.isCombo && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold">
                            Combo
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground ml-6">
                        PV: R$ {item.precoVenda.toFixed(2)} | Custo: R$ {item.custoAtual?.toFixed(2)} | Markup: {item.markupMultiplicador.toFixed(2)}x
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-emerald-400">
                        +R$ {item.lucroBrutoUnitario.toFixed(2)}
                      </div>
                      <div className="text-[11px] font-medium text-muted-foreground">
                        {item.margemBrutaPercent.toFixed(1)}% margem
                      </div>
                    </div>
                  </div>
                ))}
                {topLucrativos.length === 0 && (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Nenhum produto com custo encontrado com os filtros atuais.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Produtos com Menor Margem / Margem Crítica */}
          <Card className="border-border/50 bg-card/70">
            <CardHeader className="p-4 pb-2 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-amber-400" />
                    Menor Margem &bull; Margem Crítica (&lt;15%)
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Itens com menor retenção percentual ou em zona de risco de rentabilidade.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
                  Atenção
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                {menorMargemOuCritica.slice(0, 5).map((item, idx) => (
                  <div key={item.codigo} className="p-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-4">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {item.descricao}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground ml-6">
                        PV: R$ {item.precoVenda.toFixed(2)} | Custo: R$ {item.custoAtual?.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div>{renderBadgeStatus(item.status, item.margemBrutaPercent)}</div>
                      <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                        Lucro: R$ {item.lucroBrutoUnitario.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
                {menorMargemOuCritica.length === 0 && (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Nenhum produto encontrado.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* TABELA GERAL DE PRODUTOS ANALISADOS */}
        <Card className="border-border/50 bg-card/70">
          <CardHeader className="p-4 pb-2 border-b border-border/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-bold text-foreground">
                  Todos os Produtos do Catálogo Analisados ({itensFiltrados.length})
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Cálculo determinístico com segregação contábil inequívoca: Lucro Bruto unitário (Preço &minus; CMV).
                </CardDescription>
              </div>
              <div className="text-[11px] text-muted-foreground italic">
                *Não deduz despesas fixas, folha ou custos operacionais gerais.
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30 text-muted-foreground">
                  <th className="p-3 font-semibold">Código</th>
                  <th className="p-3 font-semibold">Produto</th>
                  <th className="p-3 font-semibold">Categoria</th>
                  <th className="p-3 font-semibold text-right">Preço Venda</th>
                  <th className="p-3 font-semibold text-right">Custo Unit.</th>
                  <th className="p-3 font-semibold text-right">Lucro Bruto</th>
                  <th className="p-3 font-semibold text-right">Margem %</th>
                  <th className="p-3 font-semibold text-right">Markup</th>
                  <th className="p-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {itensFiltrados.map((item) => (
                  <tr key={item.codigo} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-mono text-muted-foreground">{item.codigo}</td>
                    <td className="p-3 font-semibold text-foreground">
                      {item.descricao}
                      {item.isCombo && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                          Combo
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{item.categoria}</td>
                    <td className="p-3 text-right font-semibold text-foreground">
                      R$ {item.precoVenda.toFixed(2)}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {item.custoAtual !== null ? `R$ ${item.custoAtual.toFixed(2)}` : '—'}
                    </td>
                    <td className="p-3 text-right font-semibold text-foreground">
                      {item.custoAtual !== null ? (
                        <span className={item.lucroBrutoUnitario >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          R$ {item.lucroBrutoUnitario.toFixed(2)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 text-right font-bold">
                      {item.custoAtual !== null ? (
                        <span
                          className={
                            item.margemBrutaPercent >= margemAlvoDesejada
                              ? 'text-emerald-400'
                              : item.margemBrutaPercent >= 15
                              ? 'text-sky-400'
                              : 'text-amber-400'
                          }
                        >
                          {item.margemBrutaPercent.toFixed(1)}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {item.custoAtual !== null ? `${item.markupMultiplicador.toFixed(2)}x` : '—'}
                    </td>
                    <td className="p-3 text-center">
                      {renderBadgeStatus(item.status, item.margemBrutaPercent)}
                    </td>
                  </tr>
                ))}
                {itensFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Nenhum produto encontrado com os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* 3) ABA: PRODUTOS COM CUSTO DESCONHECIDO */}
      <div className={abaInterna === 'sem_custo' ? 'space-y-4' : 'hidden'}>
        <Card className="border-border/50 bg-card/70">
          <CardHeader className="p-4 pb-2 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-amber-400" />
                  Produtos com Custo Desconhecido ({produtosSemCusto.length})
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Itens cadastrados no catálogo do PDV que não possuem custo de aquisição apurado por NF ou Ficha Técnica.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
                Auditoria Fiscal Necessária
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-amber-200">
                  Princípio Fail-Closed de Conversão de Embalagens (Gate 3)
                </div>
                <p className="text-amber-300/90 leading-relaxed">
                  O sistema de custos segue estritamente o princípio fail-closed: fatores de conversão (ex: cx para unidade, kg para sachê)
                  nunca são presumidos arbitrariamente. Para que o custo seja apurado, deve haver uma vinculação documental comprovada com a Nota Fiscal
                  ou uma medição aferida confirmada pelo gestor.
                </p>
              </div>
            </div>

            <div className="border border-border/40 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30 text-muted-foreground">
                    <th className="p-3 font-semibold">Código PDV</th>
                    <th className="p-3 font-semibold">Descrição do Produto</th>
                    <th className="p-3 font-semibold">Categoria</th>
                    <th className="p-3 font-semibold text-right">Preço de Venda</th>
                    <th className="p-3 font-semibold text-center">Status Fiscal</th>
                    <th className="p-3 font-semibold">Recomendação de Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {produtosSemCusto.map((item) => (
                    <tr key={item.codigo} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-mono text-muted-foreground">{item.codigo}</td>
                      <td className="p-3 font-semibold text-foreground">{item.descricao}</td>
                      <td className="p-3 text-muted-foreground">{item.categoria}</td>
                      <td className="p-3 text-right font-semibold text-foreground">
                        R$ {item.precoVenda.toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px]">
                          Sem NF Vinculada
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {item.categoria === 'Sobremesas' || item.categoria === 'Doces'
                          ? 'Localizar NF de insumos e registrar rendimento de fabricação / ficha técnica.'
                          : 'Mapear código GTIN/EAN com a NF de compra mais recente no Gmail/SEFAZ.'}
                      </td>
                    </tr>
                  ))}
                  {produtosSemCusto.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        Excelente! Todos os produtos cadastrados possuem custo de aquisição apurado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4) ABA: HISTÓRICO DE EVOLUÇÃO TEMPORAL DE CUSTOS & ALERTAS DE FORNECEDORES */}
      <div className={abaInterna === 'historico' ? 'space-y-4' : 'hidden'}>
        <Card className="border-border/50 bg-card/70">
          <CardHeader className="p-4 pb-2 border-b border-border/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-400" />
                  Evolução Temporal de Custos & Alertas de Fornecedores (Gate 5)
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Histórico imutável de compras por produto, com detecção automática de aumento expressivo (&ge; 10%).
                </CardDescription>
              </div>

              {/* Seletor do produto para visualização do histórico */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs text-muted-foreground shrink-0">Produto:</span>
                <Select
                  value={produtoHistoricoSelecionado}
                  onValueChange={setProdutoHistoricoSelecionado}
                >
                  <SelectTrigger className="w-full sm:w-[260px] h-9 text-xs bg-background/50">
                    <SelectValue placeholder="Selecione um produto..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2032363">Pão de Queijo Super Lanche (Xodó Foods)</SelectItem>
                    <SelectItem value="2032215">Cappuccino c/ Leite (Três Corações)</SelectItem>
                    <SelectItem value="2030549">Café Coado Dose (Três Corações)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {/* KPIs do Histórico do Produto Selecionado */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">Total Compras</div>
                <div className="text-base font-bold text-foreground mt-0.5">
                  {evolucaoProdutoSelecionado.totalComprasRegistradas} NFs
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">Primeiro Custo</div>
                <div className="text-base font-bold text-foreground mt-0.5">
                  {evolucaoProdutoSelecionado.primeiroCustoHistorico !== null
                    ? `R$ ${evolucaoProdutoSelecionado.primeiroCustoHistorico.toFixed(2)}`
                    : '—'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">Último Custo</div>
                <div className="text-base font-bold text-foreground mt-0.5">
                  {evolucaoProdutoSelecionado.ultimoCustoHistorico !== null
                    ? `R$ ${evolucaoProdutoSelecionado.ultimoCustoHistorico.toFixed(2)}`
                    : '—'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">Menor Custo</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">
                  {evolucaoProdutoSelecionado.menorCustoHistorico !== null
                    ? `R$ ${evolucaoProdutoSelecionado.menorCustoHistorico.toFixed(2)}`
                    : '—'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">Maior Custo</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">
                  {evolucaoProdutoSelecionado.maiorCustoHistorico !== null
                    ? `R$ ${evolucaoProdutoSelecionado.maiorCustoHistorico.toFixed(2)}`
                    : '—'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">Variação Total</div>
                <div className="text-base font-bold mt-0.5">
                  {evolucaoProdutoSelecionado.variacaoTotalPeriodoPercent !== null ? (
                    <span
                      className={
                        evolucaoProdutoSelecionado.variacaoTotalPeriodoPercent > 0
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }
                    >
                      {evolucaoProdutoSelecionado.variacaoTotalPeriodoPercent > 0 ? '+' : ''}
                      {evolucaoProdutoSelecionado.variacaoTotalPeriodoPercent.toFixed(1)}%
                    </span>
                  ) : (
                    '—'
                  )}
                </div>
              </div>
            </div>

            {/* Alerta de Aumento Recente */}
            {evolucaoProdutoSelecionado.possuiAumentoRecenteAlerta && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    <strong>Alerta de Inflação de Fornecedor:</strong> A última compra deste item teve aumento &ge; 10% em relação à compra anterior.
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] text-rose-400 border-rose-500/40">
                  Aumento Expressivo
                </Badge>
              </div>
            )}

            {/* Timeline / Tabela Cronológica de Compras */}
            <div className="border border-border/40 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30 text-muted-foreground">
                    <th className="p-3 font-semibold">Data da Compra</th>
                    <th className="p-3 font-semibold">Fornecedor</th>
                    <th className="p-3 font-semibold">NF Número</th>
                    <th className="p-3 font-semibold text-right">Custo Unitário (PDV)</th>
                    <th className="p-3 font-semibold text-right">Variação vs Anterior</th>
                    <th className="p-3 font-semibold text-center">Alerta de Aumento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {evolucaoProdutoSelecionado.historicoOrdenado.map((item, idx) => (
                    <tr key={`${item.dataCompra}-${idx}`} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-medium text-foreground">
                        {new Date(item.dataCompra).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                      </td>
                      <td className="p-3 text-muted-foreground flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground/60" />
                        <span>{item.fornecedor}</span>
                      </td>
                      <td className="p-3 font-mono text-muted-foreground">
                        {item.numeroNf ? `NF ${item.numeroNf}` : '—'}
                      </td>
                      <td className="p-3 text-right font-semibold text-foreground">
                        R$ {item.custoUnitario.toFixed(4)}
                      </td>
                      <td className="p-3 text-right font-bold">
                        {item.variacaoVsAnteriorPercent !== null ? (
                          <span
                            className={
                              item.variacaoVsAnteriorPercent >= 10
                                ? 'text-rose-400'
                                : item.variacaoVsAnteriorPercent > 0
                                ? 'text-amber-400'
                                : item.variacaoVsAnteriorPercent < 0
                                ? 'text-emerald-400'
                                : 'text-muted-foreground'
                            }
                          >
                            {item.variacaoVsAnteriorPercent > 0 ? '+' : ''}
                            {item.variacaoVsAnteriorPercent.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-500 font-normal">Base inicial</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {item.alertaAumentoExpressivo ? (
                          <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] gap-1 font-bold">
                            <AlertTriangle className="w-3 h-3" />
                            &ge; 10% Aumento
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Normal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {evolucaoProdutoSelecionado.historicoOrdenado.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        Nenhum registro histórico de compra encontrado para este item.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 5) ABA: COMBOS & MARGEM POR CATEGORIA */}
      <div className={abaInterna === 'combos_categorias' ? 'space-y-4' : 'hidden'}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Margem Bruta por Categoria */}
          <Card className="border-border/50 bg-card/70">
            <CardHeader className="p-4 pb-2 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    Margem Bruta por Categoria de Produto
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Rentabilidade média agrupada por departamento do catálogo.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] text-purple-400 border-purple-500/30">
                  {analisePorCategoria.length} Categorias
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                {analisePorCategoria.map((cat) => (
                  <div key={cat.categoria} className="p-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-foreground">{cat.categoria}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {cat.qtdProdutos} produtos ({cat.produtosComCusto} com custo) &bull; Preço Médio: R$ {cat.precoMedio.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-xs font-bold ${
                          cat.margemMediaPercent >= margemAlvoDesejada
                            ? 'text-emerald-400'
                            : cat.margemMediaPercent >= 15
                            ? 'text-sky-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {cat.margemMediaPercent.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">margem média</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Rentabilidade de Combos e Vendas Combinadas */}
          <Card className="border-border/50 bg-card/70">
            <CardHeader className="p-4 pb-2 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-orange-400" />
                    Rentabilidade Estimada de Combos
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Margem de contribuição em produtos compostos e ofertas em grupo.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] text-orange-400 border-orange-500/30">
                  {combosIdentificados.length} Combos
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                {combosIdentificados.map((combo) => (
                  <div key={combo.codigo} className="p-3.5 space-y-1.5 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{combo.descricao}</span>
                      <span className="text-xs font-bold text-emerald-400">
                        R$ {combo.lucroBrutoUnitario.toFixed(2)} lucro
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        Preço: R$ {combo.precoVenda.toFixed(2)} | Insumos: R$ {combo.custoAtual?.toFixed(2)}
                      </span>
                      <span className="font-semibold text-foreground">
                        Margem: {combo.margemBrutaPercent.toFixed(1)}% (Markup: {combo.markupMultiplicador.toFixed(2)}x)
                      </span>
                    </div>
                  </div>
                ))}
                {combosIdentificados.length === 0 && (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    Nenhum combo identificado no catálogo atual.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 6) ABA: SUGESTÕES INTELIGENTES DE REVISÃO DE PREÇOS (SIMULADOR SEGURO) */}
      <div className={abaInterna === 'sugestoes' ? 'space-y-4' : 'hidden'}>
        <Card className="border-border/50 bg-card/70">
          <CardHeader className="p-4 pb-2 border-b border-border/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-400" />
                  Sugestões Inteligentes de Revisão de Preços (Simulador Seguro)
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Projeção estritamente informativa do preço de venda ideal para atingir a margem mínima alvo estabelecida ({margemAlvoDesejada.toFixed(0)}%).
                </CardDescription>
              </div>
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-[11px] text-primary flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Modo Simulação: Nenhuma alteração é gravada no PDV</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="p-3 rounded-lg bg-muted/20 border border-border/30 text-xs text-muted-foreground flex items-center justify-between">
              <div>
                Fórmula determinística do Preço Sugerido:
                <code className="ml-1.5 px-1.5 py-0.5 rounded bg-muted font-mono text-foreground font-semibold">
                  Preço Sugerido = Custo Unitário / (1 &minus; Margem Alvo)
                </code>
              </div>
              <div className="font-semibold text-orange-400">
                Alvo Atual: {margemAlvoDesejada.toFixed(0)}%
              </div>
            </div>

            <div className="border border-border/40 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30 text-muted-foreground">
                    <th className="p-3 font-semibold">Produto</th>
                    <th className="p-3 font-semibold">Categoria</th>
                    <th className="p-3 font-semibold text-right">Custo CMV</th>
                    <th className="p-3 font-semibold text-right">Preço Atual</th>
                    <th className="p-3 font-semibold text-right">Margem Atual</th>
                    <th className="p-3 font-semibold text-right">Preço Sugerido Alvo</th>
                    <th className="p-3 font-semibold text-right">Ajuste Estimado</th>
                    <th className="p-3 font-semibold text-center">Prioridade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {itensFiltrados
                    .filter((i) => i.custoAtual !== null && i.custoAtual > 0)
                    .map((item) => {
                      const diferenca = item.precoVendaSugeridoAlvo - item.precoVenda;
                      const precisaAjuste = diferenca > 0.05;
                      const ehCritico = item.status === 'prejuizo' || item.status === 'margem_critica';

                      return (
                        <tr key={item.codigo} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-semibold text-foreground">{item.descricao}</td>
                          <td className="p-3 text-muted-foreground">{item.categoria}</td>
                          <td className="p-3 text-right text-muted-foreground">
                            R$ {item.custoAtual?.toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-medium text-foreground">
                            R$ {item.precoVenda.toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-bold">
                            <span
                              className={
                                item.margemBrutaPercent >= margemAlvoDesejada
                                  ? 'text-emerald-400'
                                  : item.margemBrutaPercent >= 15
                                  ? 'text-sky-400'
                                  : 'text-amber-400'
                              }
                            >
                              {item.margemBrutaPercent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3 text-right font-bold text-orange-400">
                            R$ {item.precoVendaSugeridoAlvo.toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-semibold">
                            {precisaAjuste ? (
                              <span className="text-amber-400">
                                +R$ {diferenca.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-emerald-400">Margem Atingida</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {ehCritico ? (
                              <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                                Alta Prioridade
                              </Badge>
                            ) : precisaAjuste ? (
                              <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px]">
                                Moderada
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]">
                                Conforme
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
