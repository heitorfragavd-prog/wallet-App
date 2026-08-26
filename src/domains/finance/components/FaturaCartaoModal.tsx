import React, { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/shared/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Printer,
  SlidersHorizontal,
  CheckCircle2,
  ThumbsUp,
  CreditCard,
  Calendar,
  DollarSign,
  Utensils,
  Home,
  Zap,
  Droplet,
  Film,
  Tv,
  Car,
  Fuel,
  HeartPulse,
  GraduationCap,
  Wrench,
  ShoppingBag,
  Tag,
  ArrowRightLeft,
  Smartphone,
  Gift,
  Shirt,
  Sparkles,
  ChevronDown,
  X,
  Check,
} from "lucide-react";
import { ContaUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { useDividas } from "@/domains/finance/hooks/useDividas";
import { useDespesas } from "@/domains/finance/hooks/useDespesas";
import { useComprasFatura } from "@/domains/finance/hooks/useComprasFatura";
import { BankLogoBadge } from "@/shared/components/BankLogoBadge";
import { useToast } from "@/shared/hooks/use-toast";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface CategoryIconInfo {
  icon: React.FC<{ className?: string }>;
  colorBg: string;
  colorText: string;
}

// Mapeamento dinâmico de ícones da biblioteca Lucide React e cores por categoria
export function getLucideCategoryInfo(categoriaNome?: string): CategoryIconInfo {
  const name = (categoriaNome || "").toLowerCase();

  if (name.includes("saúde") || name.includes("saude") || name.includes("farmacia") || name.includes("remédio") || name.includes("remedio")) {
    return { icon: HeartPulse, colorBg: "bg-blue-500", colorText: "text-blue-500" };
  }
  if (name.includes("assinatura") || name.includes("netflix") || name.includes("tv") || name.includes("streaming")) {
    return { icon: Tv, colorBg: "bg-orange-500", colorText: "text-orange-500" };
  }
  if (name.includes("aliment") || name.includes("restaurante") || name.includes("comida") || name.includes("lanche")) {
    return { icon: Utensils, colorBg: "bg-emerald-500", colorText: "text-emerald-500" };
  }
  if (name.includes("lazer") || name.includes("cinema") || name.includes("filme") || name.includes("show")) {
    return { icon: Film, colorBg: "bg-amber-500", colorText: "text-amber-500" };
  }
  if (name.includes("mercado") || name.includes("supermercado") || name.includes("compras")) {
    return { icon: ShoppingBag, colorBg: "bg-purple-500", colorText: "text-purple-500" };
  }
  if (name.includes("moradia") || name.includes("aluguel") || name.includes("casa")) {
    return { icon: Home, colorBg: "bg-indigo-500", colorText: "text-indigo-500" };
  }
  if (name.includes("luz") || name.includes("energia") || name.includes("eletric")) {
    return { icon: Zap, colorBg: "bg-yellow-500", colorText: "text-yellow-500" };
  }
  if (name.includes("água") || name.includes("agua")) {
    return { icon: Droplet, colorBg: "bg-sky-500", colorText: "text-sky-500" };
  }
  if (name.includes("transporte") || name.includes("uber") || name.includes("carro") || name.includes("combust")) {
    return { icon: Car, colorBg: "bg-rose-500", colorText: "text-rose-500" };
  }
  if (name.includes("educa") || name.includes("curso") || name.includes("escola")) {
    return { icon: GraduationCap, colorBg: "bg-teal-500", colorText: "text-teal-500" };
  }
  if (name.includes("serviço") || name.includes("manuten")) {
    return { icon: Wrench, colorBg: "bg-slate-500", colorText: "text-slate-500" };
  }

  return { icon: Tag, colorBg: "bg-gray-500", colorText: "text-gray-500" };
}

interface FaturaCartaoModalProps {
  cartao: ContaUsuario | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FaturaCartaoModal: React.FC<FaturaCartaoModalProps> = ({
  cartao,
  open,
  onOpenChange,
}) => {
  const { toast } = useToast();
  const [dataRef, setDataRef] = useState<Date>(new Date());
  
  // Estados da Barra de Filtros Organizze
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");
  const [filtroTag, setFiltroTag] = useState<string>("todas");
  const [busca, setBusca] = useState<string>("");
  const [mostrarCampoBusca, setMostrarCampoBusca] = useState<boolean>(false);
  // Modo Fatura Completa: mostra TODOS os lançamentos do cartão (parcelas de meses anteriores incluídas)
  const [modoFaturaCompleta, setModoFaturaCompleta] = useState<boolean>(true);

  const { createDivida } = useDividas();

  const mesAnoExtenso = format(dataRef, "MMMM 'de' yyyy", { locale: ptBR });
  const mesAnoCapitalizado = mesAnoExtenso.charAt(0).toUpperCase() + mesAnoExtenso.slice(1);

  const mesFaturaNum = dataRef.getMonth() + 1;
  const anoFaturaNum = dataRef.getFullYear();

  // Busca lançamentos por PERÍODO DE FECHAMENTO (data_inicio a data_fechamento)
  const { despesas: despesasFatura, fatura: faturaAtualObj, periodo, isLoading, refetch: refetchFatura } = useComprasFatura({
    cartaoId: cartao?.id,
    mesFatura: mesFaturaNum,
    anoFatura: anoFaturaNum,
    cartaoInfo: cartao,
  });

  // Busca fatura do Mês Anterior (mês - 1) conforme especificação do PDF
  const mesAnteriorDate = subMonths(dataRef, 1);
  const mesAnteriorNum = mesAnteriorDate.getMonth() + 1;
  const anoAnteriorNum = mesAnteriorDate.getFullYear();

  const { totalFatura: totalFaturaMesAnterior } = useComprasFatura({
    cartaoId: cartao?.id,
    mesFatura: mesAnteriorNum,
    anoFatura: anoAnteriorNum,
    cartaoInfo: cartao,
  });

  const { despesas: todasDespesasCartao, refetch: refetchDespesas } = useDespesas();

  // Refetch automático ao abrir o modal para garantir dados frescos do Supabase
  useEffect(() => {
    if (open) {
      refetchDespesas();
      refetchFatura();
    }
  }, [open]);

  // Fonte de dados: utiliza estritamente o filtro por período de fechamento da fatura
  const fonteBase = despesasFatura;

  // Datas formatadas para exibição
  const dataFechamentoStr = periodo.data_fechamento
    ? periodo.data_fechamento.split("-").reverse().join("/")
    : "--/--/--";
  const dataVencimentoStr = periodo.data_vencimento
    ? periodo.data_vencimento.split("-").reverse().join("/")
    : "--/--/--";

  // Categorias únicas para o dropdown
  const categoriasUnicas = useMemo(() => {
    const setCat = new Set<string>();
    fonteBase.forEach((d: any) => { if (d.categorias?.nome) setCat.add(d.categorias.nome); });
    return Array.from(setCat).sort();
  }, [fonteBase]);

  // Filtra lançamentos do período da fatura
  const lancamentos = useMemo(() => {
    if (!fonteBase) return [];

    let items = fonteBase.map((d: any) => {
      const dataDesp = new Date(d.data + "T12:00:00");
      const categoryInfo = getLucideCategoryInfo(d.categorias?.nome);
      const parcelaInfo = (d.parcela_numero && d.parcela_total)
        ? `(${d.parcela_numero}/${d.parcela_total})`
        : d.parcela_numero
          ? `(Parcela ${d.parcela_numero})`
          : null;
      return {
        id: d.id,
        tipo: "despesa",
        isParcelado: !!parcelaInfo,
        descricao: d.descricao,
        categoria: d.categorias?.nome || "Despesa Cartão",
        valor: Number(d.valor || 0),
        data: d.data,
        dataFormatted: format(dataDesp, "dd/MM/yy"),
        parcelaInfo,
        status: d.pago ? "quitada" : "pendente",
        statusTransacao: d.status_transacao || null,
        categoryInfo,
      };
    });

    // Aplicar Filtro de Categoria
    if (filtroCategoria !== "todas") {
      items = items.filter((i) => i.categoria.toLowerCase() === filtroCategoria.toLowerCase());
    }

    // Aplicar Busca Textual
    if (busca.trim()) {
      items = items.filter((i) =>
        i.descricao.toLowerCase().includes(busca.toLowerCase()) ||
        i.categoria.toLowerCase().includes(busca.toLowerCase())
      );
    }

    return items.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  }, [fonteBase, filtroCategoria, busca]);

  const isMesAtual = anoFaturaNum === new Date().getFullYear() && mesFaturaNum === (new Date().getMonth() + 1);

  const totalLancamentos = useMemo(() =>
    lancamentos.reduce((acc, i) => acc + i.valor, 0)
  , [lancamentos]);

  // Prioridade:
  // 1. Se houver lançamentos detalhados no período, usa a soma dos lançamentos.
  // 2. Se houver fatura persistida em public.faturas_cartao, usa o valor_total oficial da fatura.
  // 3. Se for mês vigente sem lançamentos (fatura aberta Open Finance), exibe o saldo_atual do cartão.
  const totalFatura = useMemo(() => {
    if (totalLancamentos > 0) return totalLancamentos;
    if (faturaAtualObj?.valor_total) return Number(faturaAtualObj.valor_total);
    if (isMesAtual && cartao?.saldo_atual) return Number(cartao.saldo_atual || 0);
    return 0;
  }, [totalLancamentos, faturaAtualObj?.valor_total, isMesAtual, cartao?.saldo_atual]);

  const handlePagarFatura = () => {
    toast({
      title: "Pagamento de Fatura",
      description: `Fatura de ${mesAnoCapitalizado} no valor de R$ ${totalFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} registrada com sucesso!`,
    });
  };

  const handleGerarDivida = async () => {
    if (!cartao || totalFatura <= 0) return;
    try {
      await createDivida.mutateAsync({
        descricao: `Fatura ${cartao.nome} - ${mesAnoCapitalizado}`,
        valor_total: totalFatura,
        valor_pago: 0,
        valor_restante: totalFatura,
        data_vencimento: periodo.data_vencimento,
        status: "pendente",
        credor: cartao.nome,
        conta_id: cartao.id,
        parcelas: 1,
        parcelas_pagas: 0,
      });
      toast({
        title: "Dívida criada! 💳",
        description: `Fatura de ${mesAnoCapitalizado} (R$ ${totalFatura.toFixed(2)}) foi adicionada às suas Dívidas.`,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao gerar dívida",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const handleImprimir = () => {
    window.print();
  };

  // Reseta para a data atual ao abrir a fatura do cartão
  React.useEffect(() => {
    if (open && cartao) {
      setDataRef(new Date());
    }
  }, [open, cartao?.id]);

  if (!cartao) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl sm:max-w-3xl max-h-[92vh] overflow-y-auto p-6 border border-border/60 bg-card space-y-6">
        {/* Topo do Header: Logo Banco + Nome + Fatura Atual + Botão Imprimir */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BankLogoBadge nomeOuId={cartao.nome} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-foreground">{cartao.nome}</span>
                <Badge className="bg-sky-500 text-white font-medium text-[11px] px-2.5 py-0.5 uppercase tracking-wide">
                  Fatura Cartão
                </Badge>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleImprimir}
            className="text-muted-foreground hover:text-foreground h-9 w-9 p-0 mr-8"
            title="Imprimir fatura"
          >
            <Printer className="w-5 h-5" />
          </Button>
        </div>



        {/* Seletor de Mês (Navegação da Fatura estilo Organizze) */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDataRef(subMonths(dataRef, 1))}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-2xl font-bold text-foreground">
            Fatura <span className="capitalize">{mesAnoCapitalizado}</span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDataRef(addMonths(dataRef, 1))}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Painel de 3 Boxes Informativos (Idêntico ao Organizze) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Box 1: Saldos e Fechamento */}
          <div className="bg-muted/30 border border-border/50 rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>SALDO MÊS ANTERIOR</span>
              <span className="font-semibold text-foreground">
                R$ {totalFaturaMesAnterior.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>FATURA ATUAL</span>
              <span className="font-semibold text-rose-500">
                R$ {totalFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-border/40">
              <span>FECHAMENTO</span>
              <span className="font-semibold text-sky-500">{dataFechamentoStr}</span>
            </div>
          </div>

          {/* Box 2: Vencimento */}
          <div className="bg-muted/30 border border-border/50 rounded-2xl p-4 flex flex-col justify-center items-center text-center space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              VENCIMENTO
            </span>
            <span className="text-xl font-extrabold text-foreground">
              {dataVencimentoStr}
            </span>
          </div>

          {/* Box 3: Valor da Fatura e Botão PAGAR */}
          <div className="bg-muted/30 border border-border/50 rounded-2xl p-4 flex flex-col justify-center items-center text-center space-y-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              VALOR DA FATURA
            </span>
            <span className="text-xl font-extrabold text-rose-500">
              R$ {totalFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
            <div className="flex gap-2">
              <Button
                onClick={handlePagarFatura}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider px-4 h-7 rounded-full shadow-sm"
              >
                PAGAR
              </Button>
              <Button
                variant="outline"
                onClick={handleGerarDivida}
                className="border-sky-500/50 text-sky-400 hover:bg-sky-500/20 font-bold text-xs uppercase tracking-wider px-4 h-7 rounded-full shadow-sm"
              >
                GERAR DÍVIDA
              </Button>
            </div>
          </div>
        </div>

        {/* Seção de Lançamentos + Botão Adicionar + Barra de Filtros Estilo Organizze */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-foreground">Lançamentos</h3>
              <span className="text-xs text-muted-foreground font-medium">({lancamentos.length})</span>
              <button
                type="button"
                onClick={() => toast({ title: "Novo Lançamento", description: "Abre formulário de novo gasto no cartão." })}
                className="w-7 h-7 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-md transition-transform hover:scale-105"
                title="Adicionar lançamento no cartão"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {/* Toggle: Fatura Completa vs Período de Fechamento */}
            <div className="flex items-center gap-1 bg-muted/40 rounded-full p-0.5 border border-border/50">
              <button
                type="button"
                onClick={() => setModoFaturaCompleta(true)}
                className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-all ${
                  modoFaturaCompleta
                    ? "bg-orange-500 text-white shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                📋 Fatura Completa
              </button>
              <button
                type="button"
                onClick={() => setModoFaturaCompleta(false)}
                className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-all ${
                  !modoFaturaCompleta
                    ? "bg-orange-500 text-white shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                📅 Por Período
              </button>
            </div>
          </div>

          {/* ── BARRA DE FILTROS LARANJA ESTILO ORGANIZZE ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-orange-500 text-white rounded-full px-5 py-2.5 text-xs font-semibold shadow-md">
              <div className="flex items-center gap-6">
                {/* Botão Limpar Filtros X */}
                <button
                  type="button"
                  onClick={() => {
                    setFiltroTipo("todos");
                    setFiltroCategoria("todas");
                    setFiltroTag("todas");
                    setBusca("");
                  }}
                  className="hover:opacity-80 transition-opacity focus:outline-none flex items-center gap-1"
                  title="Limpar todos os filtros"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>

                {/* Dropdown 1: Tipo */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1 hover:opacity-90 focus:outline-none tracking-wide">
                    <span>Tipo</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52 bg-card border border-border shadow-lg p-1">
                    <DropdownMenuItem onClick={() => setFiltroTipo("todos")} className="flex items-center justify-between text-xs py-2 px-3 cursor-pointer">
                      <span>todos os lançamentos</span>
                      {filtroTipo === "todos" && <Check className="w-4 h-4 text-emerald-500" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFiltroTipo("despesas")} className="flex items-center justify-between text-xs py-2 px-3 cursor-pointer">
                      <span>despesas</span>
                      {filtroTipo === "despesas" && <Check className="w-4 h-4 text-emerald-500" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFiltroTipo("fixos")} className="flex items-center justify-between text-xs py-2 px-3 cursor-pointer">
                      <span>lançamentos fixos</span>
                      {filtroTipo === "fixos" && <Check className="w-4 h-4 text-emerald-500" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFiltroTipo("parcelados")} className="flex items-center justify-between text-xs py-2 px-3 cursor-pointer">
                      <span>lançamentos parcelados</span>
                      {filtroTipo === "parcelados" && <Check className="w-4 h-4 text-emerald-500" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Dropdown 2: Categorias */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1 hover:opacity-90 focus:outline-none tracking-wide">
                    <span>Categorias</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60 max-h-64 overflow-y-auto bg-card border border-border shadow-lg p-1">
                    <DropdownMenuItem onClick={() => setFiltroCategoria("todas")} className="flex items-center justify-between text-xs py-2 px-3 cursor-pointer font-semibold">
                      <span>Todas as categorias</span>
                      {filtroCategoria === "todas" && <Check className="w-4 h-4 text-emerald-500" />}
                    </DropdownMenuItem>
                    {categoriasUnicas.map((cat) => (
                      <DropdownMenuItem key={cat} onClick={() => setFiltroCategoria(cat)} className="flex items-center justify-between text-xs py-2 px-3 cursor-pointer">
                        <span>{cat}</span>
                        {filtroCategoria === cat && <Check className="w-4 h-4 text-emerald-500" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Dropdown 3: Tags */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1 hover:opacity-90 focus:outline-none tracking-wide">
                    <span>Tags</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48 bg-card border border-border shadow-lg p-1">
                    <DropdownMenuItem onClick={() => setFiltroTag("todas")} className="flex items-center justify-between text-xs py-2 px-3 cursor-pointer">
                      <span>Todas as tags</span>
                      {filtroTag === "todas" && <Check className="w-4 h-4 text-emerald-500" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFiltroTag("Debs")} className="flex items-center justify-between text-xs py-2 px-3 cursor-pointer">
                      <span>Debs</span>
                      {filtroTag === "Debs" && <Check className="w-4 h-4 text-emerald-500" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFiltroTag("Pê")} className="flex items-center justify-between text-xs py-2 px-3 cursor-pointer">
                      <span>Pê</span>
                      {filtroTag === "Pê" && <Check className="w-4 h-4 text-emerald-500" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Lupa de Pesquisa Textual */}
              <button
                type="button"
                onClick={() => setMostrarCampoBusca(!mostrarCampoBusca)}
                className="hover:opacity-80 transition-opacity focus:outline-none"
                title="Buscar lançamento"
              >
                <Search className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Input Textual de Pesquisa (quando clicado na Lupa) */}
            {mostrarCampoBusca && (
              <div className="relative pt-1">
                <Input
                  placeholder="Pesquisar lançamento por nome..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-9 bg-muted/30 border-border/60 text-xs rounded-full pl-9"
                  autoFocus
                />
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Tabela de Lançamentos com Ícones Lucide React */}
          <div className="space-y-2 pt-2">
            {lancamentos.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-2 bg-muted/10 rounded-2xl border border-dashed border-border/60 p-6">
                <CreditCard className="w-10 h-10 mx-auto opacity-30 text-muted-foreground" />
                <p className="text-sm font-medium">Nenhum lançamento detalhado nesta fatura</p>
                {cartao?.pluggy_account_id ? (
                  <p className="text-xs text-muted-foreground/70 max-w-md mx-auto">
                    Este cartão está conectado via Open Finance. O valor consolidado da fatura atual é de{" "}
                    <strong className="text-foreground">
                      R$ {Number(cartao.saldo_atual || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </strong>. Os itens individuais de compra aparecerão aqui quando forem sincronizados ou importados.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/70">
                    Nenhuma despesa ou compra vinculada a este cartão no período.
                  </p>
                )}
              </div>
            ) : (
              lancamentos.map((item) => {
                const IconComponent = item.categoryInfo.icon;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-card hover:bg-muted/40 transition-colors border border-border/40"
                  >
                    {/* Data + Título do Lançamento */}
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                      <span className="text-xs text-muted-foreground font-medium shrink-0">
                        {item.dataFormatted}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-foreground">
                            {item.descricao}
                          </p>
                          {item.statusTransacao === "PENDING" && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              Pendente
                            </span>
                          )}
                        </div>
                        {item.parcelaInfo && (
                          <span className="text-[11px] font-medium text-sky-400">
                            {item.parcelaInfo}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Categoria com Ícone Lucide React e Valor */}
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-full ${item.categoryInfo.colorBg} text-white shadow-sm shrink-0`}>
                          <IconComponent className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground hidden sm:inline-block">
                          {item.categoria}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-right">
                        <span className="font-bold text-sm text-foreground whitespace-nowrap">
                          R$ {Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
