import React, { useState, useMemo } from "react";
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
} from "lucide-react";
import { ContaUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { useDividas } from "@/domains/finance/hooks/useDividas";
import { useDespesas } from "@/domains/finance/hooks/useDespesas";
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
  const [busca, setBusca] = useState("");

  const { dividas } = useDividas();
  const { despesas } = useDespesas();

  const mesAnoExtenso = format(dataRef, "MMMM 'de' yyyy", { locale: ptBR });
  const mesAnoCapitalizado = mesAnoExtenso.charAt(0).toUpperCase() + mesAnoExtenso.slice(1);

  // Data de fechamento e vencimento formatados
  const diaFech = cartao?.dia_fechamento || 1;
  const diaVenc = cartao?.dia_vencimento || 10;
  
  const dataFechamentoStr = `${String(diaFech).padStart(2, "0")}/${String(dataRef.getMonth() + 1).padStart(2, "0")}/${String(dataRef.getFullYear()).slice(-2)}`;
  const dataVencimentoStr = `${String(diaVenc).padStart(2, "0")}/${String(dataRef.getMonth() + 1).padStart(2, "0")}/${String(dataRef.getFullYear()).slice(-2)}`;

  // Filtra lançamentos atrelados a este cartão
  const lancamentos = useMemo(() => {
    if (!cartao) return [];

    // 1. Dívidas parceladas ou compras no cartão
    const divsDoCartao = dividas
      .filter((d) => d.conta_id === cartao.id)
      .map((d) => {
        const dataVenc = new Date(d.data_vencimento);
        const categoryInfo = getLucideCategoryInfo(d.categorias?.nome);
        return {
          id: d.id,
          tipo: "divida",
          descricao: d.descricao,
          categoria: d.categorias?.nome || "Compras Cartão",
          valor: d.valor_restante,
          data: d.data_vencimento,
          dataFormatted: format(dataVenc, "dd/MM/yy"),
          parcelaInfo: d.parcelas > 1 ? `Parcela ${d.parcelas_pagas + 1}/${d.parcelas}` : null,
          status: d.status,
          categoryInfo,
        };
      });

    // 2. Despesas lançadas direto no cartão
    const despesasDoCartao = despesas
      .filter((desp) => desp.forma_pagamento === "cartao_credito")
      .map((desp) => {
        const dataDesp = new Date(desp.data);
        const categoryInfo = getLucideCategoryInfo(desp.categorias?.nome);
        return {
          id: desp.id,
          tipo: "despesa",
          descricao: desp.descricao,
          categoria: desp.categorias?.nome || "Despesa Cartão",
          valor: desp.valor,
          data: desp.data,
          dataFormatted: format(dataDesp, "dd/MM/yy"),
          parcelaInfo: null,
          status: desp.pago ? "quitada" : "pendente",
          categoryInfo,
        };
      });

    const todos = [...divsDoCartao, ...despesasDoCartao];

    return todos
      .filter((item) =>
        item.descricao.toLowerCase().includes(busca.toLowerCase()) ||
        item.categoria.toLowerCase().includes(busca.toLowerCase())
      )
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  }, [cartao, dividas, despesas, busca]);

  const totalFatura = lancamentos.reduce((sum, item) => sum + Number(item.valor), 0);

  const handlePagarFatura = () => {
    toast({
      title: "Pagamento de Fatura",
      description: `Fatura de ${mesAnoCapitalizado} no valor de R$ ${totalFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} registrada com sucesso!`,
    });
  };

  const handleImprimir = () => {
    window.print();
  };

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
                  Fatura Atual
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
              <span className="font-semibold text-foreground">R$ 0,00</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>FATURA ATUAL</span>
              <span className="font-semibold text-rose-500">
                R$ -{totalFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
              R$ -{totalFatura.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
            <Button
              onClick={handlePagarFatura}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider px-6 h-7 rounded-full shadow-sm"
            >
              PAGAR
            </Button>
          </div>
        </div>

        {/* Cabeçalho da Seção de Lançamentos + Botão Adicionar */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-foreground">Lançamentos</h3>
              <button
                type="button"
                onClick={() => toast({ title: "Novo Lançamento", description: "Abre formulário de novo gasto no cartão." })}
                className="w-7 h-7 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-md transition-transform hover:scale-105"
                title="Adicionar lançamento no cartão"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Barra de Pesquisa e Filtros */}
          <div className="relative flex items-center">
            <div className="absolute left-3.5 text-muted-foreground flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              <span className="text-xs text-muted-foreground/60">|</span>
            </div>
            <Input
              placeholder="Filtrar por..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-12 pr-10 h-11 bg-muted/20 border-border/60 rounded-full text-sm placeholder:text-muted-foreground/60"
            />
            <Search className="w-4 h-4 absolute right-4 text-muted-foreground" />
          </div>

          {/* Tabela de Lançamentos com Ícones Lucide React */}
          <div className="space-y-2 pt-2">
            {lancamentos.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-2 bg-muted/10 rounded-2xl border border-dashed border-border/60">
                <CreditCard className="w-10 h-10 mx-auto opacity-30 text-muted-foreground" />
                <p className="text-sm font-medium">Nenhum lançamento nesta fatura</p>
                <p className="text-xs text-muted-foreground/70">
                  Os gastos realizados com este cartão aparecerão organizados aqui.
                </p>
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
                        <p className="font-semibold text-sm text-foreground">
                          {item.descricao}
                        </p>
                        {item.parcelaInfo && (
                          <span className="text-[11px] text-muted-foreground">
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
                          R$ -{Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
