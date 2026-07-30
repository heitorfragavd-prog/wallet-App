import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useDivipayDashboard } from "@/domains/divipay/hooks/useDivipayDashboard";
import { useDivipayConfig } from "@/domains/divipay/hooks/useDivipayConfig";
import { 
  CheckCircle2, 
  XCircle, 
  Wallet, 
  Building2, 
  QrCode, 
  Receipt, 
  FileText, 
  DollarSign, 
  TrendingUp, 
  Filter, 
  CreditCard, 
  Banknote, 
  Copy,
  ArrowUpRight,
  RefreshCw,
  Ban,
  Search,
  ChevronUp
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";


import type { DivipayDashboardFilters } from "@/domains/divipay/hooks/useDivipayDashboard";

interface DivipayDashboardViewProps {
  onNavigateTab?: (tab: string) => void;
}

export function DivipayDashboardView({ onNavigateTab }: DivipayDashboardViewProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterInitialDate, setFilterInitialDate] = useState("2026-07-01T00:00");
  const [filterFinalDate, setFilterFinalDate] = useState("2026-07-31T11:59");
  const [filterMaquineta, setFilterMaquineta] = useState("");
  const [filterPromoter, setFilterPromoter] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<DivipayDashboardFilters | undefined>();

  const { data, isLoading } = useDivipayDashboard(appliedFilters);
  const { config, loading: configLoading } = useDivipayConfig();

  const balance = data?.balances[0];
  const environment = config?.environment ?? "sandbox";
  const isProduction = environment === "production";

  const handleSearch = () => {
    setAppliedFilters({
      initialDate: filterInitialDate.split("T")[0],
      finalDate: filterFinalDate.split("T")[0],
      type: filterType,
    });
  };



  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Sub-header de Status / Ambiente */}
      <div className="flex items-center justify-between bg-card/60 p-3 px-4 rounded-lg border border-border/50 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant={isProduction ? "default" : "secondary"} className="bg-amber-500 hover:bg-amber-600 text-white font-medium text-[11px] px-2.5">
            {isProduction ? "Produção" : "Sandbox"}
          </Badge>
          <span className="text-muted-foreground">Divipay Integration v1.0</span>
        </div>
        <div className="flex items-center gap-2 font-medium">
          {isLoading ? (
            <Skeleton className="h-4 w-24" />
          ) : data?.connected ? (
            <span className="flex items-center gap-1.5 text-emerald-500">
              <CheckCircle2 className="w-3.5 h-3.5" /> Conectado
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-destructive">
              <XCircle className="w-3.5 h-3.5" /> Desconectado
            </span>
          )}
        </div>
      </div>

      {data?.connectionError && !isLoading && (
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/30 flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span>{data.connectionError}</span>
        </div>
      )}

      {/* Banner Principal de Conta & Saldo (Design Oficial Divipay) */}
      <div className="bg-gradient-to-r from-amber-500 via-amber-500 to-orange-500 text-white rounded-2xl p-6 shadow-lg shadow-amber-500/10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center p-2 text-white">
              <img src="/logos/divipay.png" alt="Divipay Logo" className="h-full w-full object-contain brightness-0 invert" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">49.683.323 Heitor Fraga de Oliveira</h2>
              <p className="text-xs text-white/80 flex items-center gap-1.5">
                Conta: <span className="font-semibold">5902321</span>
                <Copy className="w-3 h-3 cursor-pointer opacity-70 hover:opacity-100 transition-opacity" />
              </p>
            </div>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onNavigateTab?.("cobrancas")}
            className="bg-white/10 hover:bg-white/20 border-white/30 text-white text-xs gap-2 backdrop-blur-sm self-start sm:self-auto"
          >
            <QrCode className="w-3.5 h-3.5" /> Cobrar por Pix
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-1">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-white/70">Saldo Disponível</span>
            {isLoading || configLoading ? (
              <Skeleton className="h-9 w-40 bg-white/20 mt-1" />
            ) : (
              <div className="text-3xl font-extrabold tracking-tight mt-0.5">
                {formatCurrency(balance?.balance ?? 4514.80)}
              </div>
            )}
          </div>
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-white/70">Saldo Bloqueado</span>
            {isLoading || configLoading ? (
              <Skeleton className="h-9 w-40 bg-white/20 mt-1" />
            ) : (
              <div className="text-3xl font-extrabold tracking-tight mt-0.5">
                {formatCurrency(balance?.balanceBlocked ?? 0)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Botão Ação Rápida Secundário */}
      <div>
        <Button 
          size="sm" 
          onClick={() => onNavigateTab?.("configuracoes")}
          className="bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs rounded-xl shadow-sm"
        >
          Configurar conta para saque automático
        </Button>
      </div>

      {/* Atalhos Rápidos Circulares (Estilo Divipay Oficial) */}
      <div className="flex items-center gap-6 overflow-x-auto pb-2 pt-1">
        {[
          { label: "Pix", icon: QrCode, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", tab: "cobrancas" },
          { label: "Extrato", icon: Receipt, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400", tab: "extrato" },
          { label: "Cobranças", icon: FileText, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", tab: "cobrancas" },
          { label: "Saques", icon: DollarSign, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400", tab: "transferencias" },
          { label: "Vendas", icon: TrendingUp, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400", tab: "extrato" },
        ].map((item, idx) => (
          <div 
            key={idx} 
            onClick={() => onNavigateTab?.(item.tab)}
            className="flex flex-col items-center gap-2 cursor-pointer group flex-shrink-0"
          >
            <div className={`w-12 h-12 rounded-2xl ${item.color} flex items-center justify-center group-hover:scale-105 transition-transform duration-200 shadow-sm`}>
              <item.icon className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Barra de Filtro e Painel Retrátil Oficial Divipay */}
      <div className="space-y-4">
        <div className="flex justify-start">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs gap-2 rounded-xl border-border/60 hover:bg-accent"
          >
            <Filter className="w-3.5 h-3.5 text-amber-500" /> 
            {showFilters ? "Fechar filtros" : "Filtrar"}
          </Button>
        </div>

        {showFilters && (
          <Card className="rounded-2xl border-amber-500/20 bg-card/80 backdrop-blur-sm p-4 sm:p-5 shadow-sm space-y-4 animate-in fade-in-50 duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="filter-type" className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                  TIPO DA VENDA:
                </Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger id="filter-type" className="h-9 text-xs rounded-xl bg-background/50 border-border/60">
                    <SelectValue placeholder="Forma de Pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Forma de Pagamento</SelectItem>
                    <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                    <SelectItem value="DEBIT_CARD">Cartão de Débito</SelectItem>
                    <SelectItem value="PIX">Pix</SelectItem>
                    <SelectItem value="TICKET">Boleto</SelectItem>
                    <SelectItem value="CASH">Dinheiro</SelectItem>
                    <SelectItem value="VOUCHER">Voucher</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-initial-date" className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                  DATA INICIAL:
                </Label>
                <Input 
                  id="filter-initial-date"
                  type="datetime-local" 
                  value={filterInitialDate}
                  onChange={(e) => setFilterInitialDate(e.target.value)}
                  className="h-9 text-xs rounded-xl bg-background/50 border-border/60"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-final-date" className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                  DATA FINAL:
                </Label>
                <Input 
                  id="filter-final-date"
                  type="datetime-local" 
                  value={filterFinalDate}
                  onChange={(e) => setFilterFinalDate(e.target.value)}
                  className="h-9 text-xs rounded-xl bg-background/50 border-border/60"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-maquineta" className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                  TERMINAL:
                </Label>
                <Select value={filterMaquineta} onValueChange={setFilterMaquineta}>
                  <SelectTrigger id="filter-maquineta" className="h-9 text-xs rounded-xl bg-background/50 border-border/60">
                    <SelectValue placeholder="Clique para selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Terminais</SelectItem>
                    <SelectItem value="t1">Maquineta POS 01</SelectItem>
                    <SelectItem value="t2">Maquineta POS 02</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-promoter" className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                  PROMOTER:
                </Label>
                <Select value={filterPromoter} onValueChange={setFilterPromoter}>
                  <SelectTrigger id="filter-promoter" className="h-9 text-xs rounded-xl bg-background/50 border-border/60">
                    <SelectValue placeholder="Clique para selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Promoters</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button 
                onClick={handleSearch} 
                className="bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs px-6 h-9 rounded-xl shadow-sm gap-2"
              >
                <Search className="w-3.5 h-3.5" /> Buscar
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setShowFilters(false)} 
                className="text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 font-medium text-xs h-9 rounded-xl gap-1.5"
              >
                <ChevronUp className="w-3.5 h-3.5" /> Fechar filtros
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Seção 1: Resumo de Cobranças */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold tracking-tight text-foreground/90">Resumo de Cobranças</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl border-border/50 shadow-sm hover:border-emerald-500/30 transition-colors">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight">{formatCurrency(data?.cobrancasSummary?.finalizadas ?? 0)}</div>
                <span className="text-xs text-muted-foreground font-medium">Finalizadas</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm hover:border-amber-500/30 transition-colors">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight">{formatCurrency(data?.cobrancasSummary?.pendentes ?? 0)}</div>
                <span className="text-xs text-muted-foreground font-medium">Pendentes</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm hover:border-destructive/30 transition-colors">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight">{formatCurrency(data?.cobrancasSummary?.canceladas ?? 0)}</div>
                <span className="text-xs text-muted-foreground font-medium">Canceladas</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm hover:border-blue-500/30 transition-colors">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight">{formatCurrency(data?.cobrancasSummary?.devolucoes ?? 0)}</div>
                <span className="text-xs text-muted-foreground font-medium">Devoluções</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Seção 2: Resumo de Vendas */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold tracking-tight text-foreground/90">Resumo de Vendas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-medium">Valor em Vendas</span>
                <div className="text-lg font-bold tracking-tight">{formatCurrency(data?.vendasSummary?.valorEmVendas ?? 0)}</div>
                <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
                  +0% <span className="text-muted-foreground">desde o mês passado</span>
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-medium">Valor bloqueado</span>
                <div className="text-lg font-bold tracking-tight">{formatCurrency(data?.vendasSummary?.valorBloqueado ?? 0)}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-medium">Líquido Clientes</span>
                <div className="text-lg font-bold tracking-tight">{formatCurrency(data?.vendasSummary?.liquidoClientes ?? 0)}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quantitativo de vendas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-medium">Total de vendas</span>
                <div className="text-lg font-bold tracking-tight">{data?.vendasSummary?.totalVendas ?? 0}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-medium">Finalizadas</span>
                <div className="text-lg font-bold tracking-tight">{data?.vendasSummary?.finalizadas ?? 0}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-medium">Canceladas</span>
                <div className="text-lg font-bold tracking-tight">{data?.vendasSummary?.canceladas ?? 0}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Seção 3: Vendas no Mês por Meio de Pagamento & Gráfico de Evolução Diária */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        {/* Lado Esquerdo: Cards dos Meios de Pagamento */}
        <div className="lg:col-span-5 space-y-3">
          <h3 className="text-sm font-bold tracking-tight text-foreground/90">Vendas por Meio de Pagamento</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: "Cartão de Crédito", icon: CreditCard, count: data?.metodosPagamento?.cartaoCredito ?? 0 },
              { title: "Cartão de Débito", icon: CreditCard, count: data?.metodosPagamento?.cartaoDebito ?? 0 },
              { title: "Voucher", icon: Banknote, count: data?.metodosPagamento?.voucher ?? 0 },
              { title: "Pix", icon: QrCode, count: data?.metodosPagamento?.pix ?? 0 },
              { title: "Boleto", icon: Receipt, count: data?.metodosPagamento?.boleto ?? 0 },
            ].map((item, idx) => (
              <Card key={idx} className="rounded-2xl border-border/50 shadow-sm hover:border-amber-500/30 transition-colors">
                <CardContent className="p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-medium block leading-tight">{item.title}</span>
                    <div className="text-base font-bold tracking-tight mt-0.5">{item.count}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Lado Direito: Gráfico de Evolução de Vendas no Mês (Estilo Divipay Oficial) */}
        <div className="lg:col-span-7 space-y-3">
          <h3 className="text-sm font-bold tracking-tight text-foreground/90">Vendas no Mês (Evolução Diária)</h3>
          <Card className="rounded-2xl border-border/50 shadow-sm p-4 sm:p-5 bg-card/80 backdrop-blur-sm">
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : (
              <div className="space-y-4">
                {/* SVG Area Chart com Gradiente Laranja Divipay */}
                <div className="h-44 w-full relative">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="divipayGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Linha e Área do Gráfico */}
                    {data?.chartData && data.chartData.length > 0 ? (
                      (() => {
                        const points = data.chartData;
                        const maxVal = Math.max(...points.map((p) => p.count), 1);
                        const widthStep = 500 / Math.max(points.length - 1, 1);

                        const svgPoints = points
                          .map((p, i) => {
                            const x = i * widthStep;
                            const y = 140 - (p.count / maxVal) * 120;
                            return `${x},${y}`;
                          })
                          .join(" ");

                        const areaPoints = `0,145 ${svgPoints} 500,145`;

                        return (
                          <>
                            <polygon points={areaPoints} fill="url(#divipayGradient)" />
                            <polyline
                              fill="none"
                              stroke="#f59e0b"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={svgPoints}
                            />
                          </>
                        );
                      })()
                    ) : (
                      /* Gráfico Demonstrativo de Linha Onda Amarela Oficial */
                      <>
                        <polygon points="0,145 0,90 50,70 100,85 150,50 200,65 250,55 300,75 350,45 400,60 450,50 500,145" fill="url(#divipayGradient)" />
                        <polyline
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points="0,90 50,70 100,85 150,50 200,65 250,55 300,75 350,45 400,60 450,50"
                        />
                      </>
                    )}
                  </svg>
                </div>

                {/* Eixo X com Datas (Espalhado por todo o mês de 01 a 31) */}
                <div className="flex justify-between items-center text-[10px] text-muted-foreground font-medium px-1 overflow-x-auto gap-2">
                  {data?.chartData && data.chartData.length > 0 ? (
                    (() => {
                      const totalPoints = data.chartData.length;
                      const step = Math.max(1, Math.floor(totalPoints / 10));
                      const filteredPoints = data.chartData.filter((_, idx) => idx % step === 0 || idx === totalPoints - 1);
                      return filteredPoints.map((pt, i) => (
                        <span key={i} className="whitespace-nowrap">{pt.date}</span>
                      ));
                    })()
                  ) : (
                    ["01/07", "04/07", "08/07", "12/07", "16/07", "20/07", "24/07", "28/07", "30/07"].map((d, i) => (
                      <span key={i}>{d}</span>
                    ))
                  )}
                </div>

              </div>
            )}
          </Card>
        </div>
      </div>


    </div>
  );
}

