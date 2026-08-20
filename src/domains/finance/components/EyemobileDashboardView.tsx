import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Banknote, CreditCard, LayoutDashboard, RefreshCw, ShoppingCart, Ticket, TrendingUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Progress } from "@/shared/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { useToast } from "@/shared/hooks/use-toast";
import { useItensMercado } from "@/domains/market/hooks/useItensMercado";
import { useEyemobileDashboard } from "@/domains/eyemobile/hooks/useEyemobileDashboard";
import { DateRangePicker, useDateRangeFilter } from "@/shared/components/DateRangePicker";

const getLocalDateString = (offsetDays: number = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const today = getLocalDateString(0);
const yesterday = getLocalDateString(-1);
const last7Days = getLocalDateString(-6);
const monthStart = `${today.slice(0, 8)}01`;
const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function DashboardSkeleton() {
  return <div className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32" />)}</div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
    <Skeleton className="h-72" />
  </div>;
}

interface EyemobileDashboardViewProps {
  onConfigure?: () => void;
}

export function EyemobileDashboardView({ onConfigure }: EyemobileDashboardViewProps) {
  const { dateRange, setRange } = useDateRangeFilter({ defaultPeriod: "today" });
  const startDate = dateRange.startDate || today;
  const endDate = dateRange.endDate || today;
  const isHoje = startDate === today && endDate === today;
  const isOntem = startDate === yesterday && endDate === yesterday;
  const isUltimos7 = startDate === last7Days && endDate === today;
  const isMes = startDate === monthStart && endDate === today;

  const [storeId, setStoreId] = useState<string>("all");
  const { toast } = useToast();
  const { createItemMercado } = useItensMercado();
  const dashboardQuery = useEyemobileDashboard({ startDate, endDate, storeId: storeId === "all" ? undefined : storeId });
  const dashboard = dashboardQuery.data;
  const [isSyncing, setIsSyncing] = useState(false);

  // Estados de paginacao do Estoque Critico (10 itens padrao)
  const [stockItemsPerPage, setStockItemsPerPage] = useState<number>(10);
  const [stockCurrentPage, setStockCurrentPage] = useState<number>(1);

  const metrics = useMemo(() => {
    if (!dashboard) return [];
    return [
      { label: isHoje ? "Receita de hoje" : "Receita do período", value: currency(dashboard.kpis.totalRevenue), icon: TrendingUp, className: "text-emerald-500 bg-emerald-500/10" },
      { label: "Total de transações", value: dashboard.kpis.totalTransactions.toLocaleString("pt-BR"), icon: Ticket, className: "text-blue-500 bg-blue-500/10" },
      { label: "Ticket médio por pessoa", value: currency(dashboard.kpis.averageTicket), icon: CreditCard, className: "text-violet-500 bg-violet-500/10" },
      { label: "Frente de caixa", value: currency(dashboard.kpis.frontCashierRevenue), icon: Banknote, className: "text-orange-500 bg-orange-500/10" },
    ];
  }, [dashboard, isHoje]);

  // Lista paginada de Estoque Critico
  const criticalStockList = useMemo(() => dashboard?.criticalStock ?? [], [dashboard]);
  const stockTotalPages = Math.max(1, Math.ceil(criticalStockList.length / stockItemsPerPage));
  const paginatedCriticalStock = useMemo(() => {
    const start = (stockCurrentPage - 1) * stockItemsPerPage;
    return criticalStockList.slice(start, start + stockItemsPerPage);
  }, [criticalStockList, stockCurrentPage, stockItemsPerPage]);

  const addToShoppingList = async (item: NonNullable<typeof dashboard>["criticalStock"][number]) => {
    const result = await createItemMercado({
      descricao: item.product,
      quantidade_atual: item.stock,
      quantidade_ideal: Math.max(item.minStock * 2, item.minStock + 1),
      unidade_medida: item.unit,
      preco_atual: item.price,
    });
    if (!result.error) toast({ title: "Item enviado para Mercado", description: `${item.product} foi incluído na lista de compras.` });
  };

  // Helper para extrair mensagem de erro de forma segura
  const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object' && 'message' in err) return String((err as Record<string, unknown>).message);
    return "Tente sincronizar novamente.";
  };

  return (
    <div className="space-y-6">
      {/* Header & Filtros Inspirados no Eyemobile */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground uppercase">Frente de Caixa (Eyemobile)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Vendas, caixa, pagamentos e estoque em tempo real.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-muted/30 p-2 rounded-2xl border border-border/50">
          <div className="flex items-center gap-1 bg-background/60 p-1 rounded-xl border border-border/40">
            <button
              type="button"
              onClick={() => setRange(today, today)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                isHoje ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setRange(yesterday, yesterday)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                isOntem ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              Ontem
            </button>
            <button
              type="button"
              onClick={() => setRange(last7Days, today)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                isUltimos7 ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              7 dias
            </button>
            <button
              type="button"
              onClick={() => setRange(monthStart, today)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                isMes ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              Este Mês
            </button>
          </div>

          <div className="h-4 w-px bg-border" />

          <DateRangePicker
            value={dateRange}
            onChange={setRange}
            placeholder="Filtrar por período"
            className="border-0 bg-transparent text-foreground font-semibold text-sm focus:ring-0"
          />
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 px-2">
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="h-8 border-0 bg-transparent text-xs font-semibold text-foreground focus:ring-0 focus:ring-offset-0 px-2 gap-1.5 w-[140px]">
                <SelectValue placeholder="Todas as lojas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as lojas</SelectItem>
                {dashboard?.stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium px-4 shadow-sm shadow-purple-600/10"
            onClick={async () => {
              setIsSyncing(true);
              try {
                const result = await dashboardQuery.syncLive();
                if (result?.isLocalFallback) {
                  toast({ title: "Sincronização concluída (dados locais)", description: "Dados da API indisponíveis — exibindo vendas salvas no banco local.", variant: "default" });
                } else if (!result?.configured) {
                  toast({ title: "Chaves não configuradas", description: "Configure suas chaves de API do Eyemobile no Painel Admin para importar dados ao vivo.", variant: "destructive" });
                } else {
                  const count = result?.kpis?.totalTransactions ?? 0;
                  toast({ title: "Sincronização concluída", description: `${count} vendas importadas com sucesso!`, variant: "default" });
                }
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                toast({ title: "Erro ao sincronizar", description: msg, variant: "destructive" });
              } finally {
                setIsSyncing(false);
              }
            }}
            disabled={isSyncing}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Sincronizando..." : "Sincronizar"}
          </Button>
        </div>
      </div>

      {/* Barra Horizontal de Destaques Inspirada no Eyemobile */}
      {dashboard && (
        <div className="bg-gradient-to-r from-purple-700 via-indigo-800 to-purple-900 text-white rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg shadow-purple-950/20 border border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2 rounded-xl">
              <LayoutDashboard className="h-5 w-5 text-purple-200" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-purple-200">Período da Operação</p>
              <p className="text-sm font-semibold text-white">
                {storeId === "all" ? "Todas as lojas" : dashboard.stores.find(s => s.id === storeId)?.name || "Loja Selecionada"} 
                <span className="mx-2 text-purple-300">|</span> 
                {startDate.split("-").reverse().join("/")} - {endDate.split("-").reverse().join("/")}
              </p>
            </div>
          </div>
          
          <div className="h-px md:h-8 w-full md:w-px bg-purple-500/30" />

          <div className="flex items-center gap-3 md:justify-center flex-1">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-purple-200 md:text-center">Total de transações</p>
              <p className="text-lg font-black text-white md:text-center mt-0.5">
                {dashboard.kpis.totalTransactions.toLocaleString("pt-BR")}
              </p>
            </div>
          </div>

          <div className="h-px md:h-8 w-full md:w-px bg-purple-500/30" />

          <div className="flex items-center gap-3 md:justify-end flex-1">
            <div className="text-left md:text-right">
              <p className="text-[10px] uppercase font-bold tracking-widest text-purple-200">Ticket médio por pessoa</p>
              <p className="text-lg font-black text-white mt-0.5">
                {currency(dashboard.kpis.averageTicket)}
              </p>
            </div>
          </div>
        </div>
      )}

      {dashboardQuery.isLoading ? (
        <DashboardSkeleton />
      ) : dashboardQuery.isError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-3 h-9 w-9 text-destructive" />
            <p className="font-medium">Não foi possível carregar a operação Eyemobile.</p>
            <p className="mt-1 text-sm text-muted-foreground">{getErrorMessage(dashboardQuery.error)}</p>
          </CardContent>
        </Card>
      ) : !dashboard?.configured ? (
        <Card className="border-orange-500/30">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-3 h-9 w-9 text-orange-500" />
            <p className="font-semibold">Integração não configurada.</p>
            <p className="mt-1 text-sm text-muted-foreground">Cadastre a Access Key e Secret Key da API Eyemobile no Painel Admin.</p>
            {onConfigure && <Button className="mt-4" variant="outline" onClick={onConfigure}>Configurar integração</Button>}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <Card key={metric.label} className="overflow-hidden">
                <CardContent className="flex items-center justify-between p-4 sm:p-5 gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-muted-foreground truncate" title={metric.label}>{metric.label}</p>
                    <p className="mt-1 text-lg sm:text-xl xl:text-2xl font-bold tracking-tight text-foreground truncate" title={metric.value}>{metric.value}</p>
                  </div>
                  <div className={`rounded-xl p-2.5 sm:p-3 shrink-0 ${metric.className}`}>
                    <metric.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5"><Card className="xl:col-span-3"><CardHeader><CardTitle>Vendas por hora</CardTitle><CardDescription>Frente de caixa comparada às demais origens, das 5h às 23h.</CardDescription></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={dashboard.salesByHour}><defs><linearGradient id="frontCashier" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.35}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="hour" tickLine={false} axisLine={false}/><YAxis tickFormatter={(value) => `R$ ${value}`} tickLine={false} axisLine={false}/><Tooltip formatter={(value: number) => currency(value)}/><Area type="monotone" dataKey="frontCashier" name="Frente de caixa" stroke="#f97316" fill="url(#frontCashier)" strokeWidth={2}/><Area type="monotone" dataKey="otherOrigins" name="Outras origens" stroke="#3b82f6" fill="transparent" strokeWidth={2}/></AreaChart></ResponsiveContainer></CardContent></Card>
      <Card className="xl:col-span-2"><CardHeader><CardTitle>Formas de pagamento</CardTitle><CardDescription>Participação no faturamento do período.</CardDescription></CardHeader><CardContent className="space-y-3">{dashboard.payments.length ? dashboard.payments.map((payment) => <div key={payment.name}><div className="mb-1 flex justify-between text-sm"><span>{payment.name}</span><span className="font-medium">{currency(payment.value)} · {payment.percentage.toFixed(1)}%</span></div><Progress value={payment.percentage} className="h-2" /></div>) : <p className="py-16 text-center text-sm text-muted-foreground">Sem pagamentos no período.</p>}</CardContent></Card></div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5"><Card className="xl:col-span-3"><CardHeader><CardTitle>Top 10 produtos mais vendidos</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Qtd.</TableHead><TableHead>ID</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Valor total</TableHead></TableRow></TableHeader><TableBody>{dashboard.topProducts.length ? dashboard.topProducts.map((product) => <TableRow key={product.id}><TableCell>{product.quantity.toLocaleString("pt-BR")}</TableCell><TableCell className="font-mono text-xs">{product.id}</TableCell><TableCell>{product.product}</TableCell><TableCell className="text-right font-medium">{currency(product.total)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Nenhum produto vendido no período.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
      <Card className="xl:col-span-2"><CardHeader><CardTitle>Caixas, turnos e dispositivos</CardTitle></CardHeader><CardContent className="space-y-3">{dashboard.operationSummary.map((item) => <div key={item.label} className="flex items-center justify-between rounded-lg bg-muted/50 p-3"><span className="text-sm text-muted-foreground">{item.label}</span><span className="font-semibold">{currency(item.value)}</span></div>)}{dashboard.devices.length > 0 && <><p className="pt-2 text-sm font-medium">Maquininhas / POS ativas</p>{dashboard.devices.map((device) => <div key={device.name} className="flex justify-between text-sm"><span>{device.name} <span className="text-muted-foreground">({device.transactions} trans.)</span></span><span className="font-medium">{currency(device.total)}</span></div>)}</>}</CardContent></Card></div>

      {/* Tabela Estoque Critico com Paginacao estilo Divipay (Exibir 10, 20, 50, 100) */}
      <Card className={criticalStockList.length ? "border-yellow-500/30" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Estoque crítico e depósitos
          </CardTitle>
          <CardDescription>
            Produtos com saldo atual menor ou igual ao estoque mínimo do Eyemobile.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Depósito</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Mínimo</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCriticalStock.length ? (
                paginatedCriticalStock.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.product}</TableCell>
                    <TableCell>{item.depot}</TableCell>
                    <TableCell className="text-destructive font-bold">{item.stock} {item.unit}</TableCell>
                    <TableCell>{item.minStock} {item.unit}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => addToShoppingList(item)}>
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Enviar ao Mercado
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Nenhum item em estoque crítico.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Rodape de Paginacao idêntico ao Divipay (<< < > >> Página X de Y | Exibir 10 v) */}
          {criticalStockList.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-end gap-4 p-4 border-t border-border/40 text-xs">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setStockCurrentPage(1)}
                  disabled={stockCurrentPage === 1}
                  className="h-8 w-8 rounded-lg border-border/60"
                  title="Primeira página"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setStockCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={stockCurrentPage === 1}
                  className="h-8 w-8 rounded-lg border-border/60"
                  title="Página anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setStockCurrentPage((p) => Math.min(stockTotalPages, p + 1))}
                  disabled={stockCurrentPage === stockTotalPages}
                  className="h-8 w-8 rounded-lg border-border/60"
                  title="Próxima página"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setStockCurrentPage(stockTotalPages)}
                  disabled={stockCurrentPage === stockTotalPages}
                  className="h-8 w-8 rounded-lg border-border/60"
                  title="Última página"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </Button>
              </div>

              <span className="text-xs text-muted-foreground font-medium">
                Página <strong className="text-foreground font-bold">{stockCurrentPage}</strong> de <strong className="text-foreground font-bold">{stockTotalPages}</strong>
              </span>

              <div className="flex items-center gap-2">
                <Select
                  value={String(stockItemsPerPage)}
                  onValueChange={(val) => {
                    setStockItemsPerPage(Number(val));
                    setStockCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs w-[120px] rounded-lg border-border/60 bg-background">
                    <SelectValue placeholder="Exibir 10" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="10">Exibir 10</SelectItem>
                    <SelectItem value="20">Exibir 20</SelectItem>
                    <SelectItem value="50">Exibir 50</SelectItem>
                    <SelectItem value="100">Exibir 100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>)}
  </div>);
}