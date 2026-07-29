import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Banknote, CreditCard, LayoutDashboard, RefreshCw, ShoppingCart, Ticket, TrendingUp } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Progress } from "@/shared/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { useToast } from "@/shared/hooks/use-toast";
import { useItensMercado } from "@/domains/market/hooks/useItensMercado";
import { useEyemobileDashboard } from "@/domains/eyemobile/hooks/useEyemobileDashboard";

const today = new Date().toISOString().slice(0, 10);
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
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [storeId, setStoreId] = useState<string>("all");
  const { toast } = useToast();
  const { createItemMercado } = useItensMercado();
  const dashboardQuery = useEyemobileDashboard({ startDate, endDate, storeId: storeId === "all" ? undefined : storeId });
  const dashboard = dashboardQuery.data;
  const [isSyncing, setIsSyncing] = useState(false);

  const metrics = useMemo(() => dashboard ? [
    { label: "Receita total", value: currency(dashboard.kpis.totalRevenue), icon: TrendingUp, className: "text-emerald-500 bg-emerald-500/10" },
    { label: "Total de transações", value: dashboard.kpis.totalTransactions.toLocaleString("pt-BR"), icon: Ticket, className: "text-blue-500 bg-blue-500/10" },
    { label: "Ticket médio por pessoa", value: currency(dashboard.kpis.averageTicket), icon: CreditCard, className: "text-violet-500 bg-violet-500/10" },
    { label: "Frente de caixa", value: currency(dashboard.kpis.frontCashierRevenue), icon: Banknote, className: "text-orange-500 bg-orange-500/10" },
  ] : [], [dashboard]);

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

  return <div className="space-y-6">
    <Card className="border-orange-500/20 bg-gradient-to-r from-orange-500/10 via-background to-background">
      <CardContent className="p-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-500/20 p-3"><LayoutDashboard className="h-6 w-6 text-orange-500" /></div>
          <div>
            <h2 className="text-lg font-bold">Operação Eyemobile PDV</h2>
            <p className="text-sm text-muted-foreground">Vendas, caixa, pagamentos e estoque em tempo real.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 xl:w-[620px]">
          <label className="text-xs text-muted-foreground">Data início<input aria-label="Data início" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="text-xs text-muted-foreground">Data fim<input aria-label="Data fim" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <div><span className="text-xs text-muted-foreground">Loja / negócio</span><Select value={storeId} onValueChange={setStoreId}><SelectTrigger className="mt-1"><SelectValue placeholder="Todas as lojas" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as lojas</SelectItem>{dashboard?.stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}</SelectContent></Select></div>
          <Button
            className="mt-auto"
            onClick={async () => {
              setIsSyncing(true);
              try {
                await dashboardQuery.refetch();
                if (dashboardQuery.data?.isLocalFallback) {
                  toast({ title: "Sincronização concluída (dados locais)", description: "Dados da API indisponíveis — exibindo vendas salvas no banco local.", variant: "default" });
                } else if (!dashboardQuery.data?.configured) {
                  toast({ title: "Chaves não configuradas", description: "Configure suas chaves de API do Eyemobile no Painel Admin para importar dados ao vivo.", variant: "destructive" });
                } else {
                  const count = dashboardQuery.data?.kpis?.totalTransactions ?? 0;
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
            <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Sincronizando..." : "Sincronizar"}
          </Button>
        </div>
      </CardContent>
    </Card>

    {dashboardQuery.isLoading ? <DashboardSkeleton /> : dashboardQuery.isError ? <Card><CardContent className="py-12 text-center"><AlertTriangle className="mx-auto mb-3 h-9 w-9 text-destructive" /><p className="font-medium">Não foi possível carregar a operação Eyemobile.</p><p className="mt-1 text-sm text-muted-foreground">{getErrorMessage(dashboardQuery.error)}</p></CardContent></Card> : !dashboard?.configured ? <Card className="border-orange-500/30"><CardContent className="py-12 text-center"><AlertTriangle className="mx-auto mb-3 h-9 w-9 text-orange-500" /><p className="font-semibold">Integração não configurada.</p><p className="mt-1 text-sm text-muted-foreground">Cadastre a Access Key e Secret Key da API Eyemobile no Painel Admin.</p>{onConfigure && <Button className="mt-4" variant="outline" onClick={onConfigure}>Configurar integração</Button>}</CardContent></Card> : <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <Card key={metric.label}><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-muted-foreground">{metric.label}</p><p className="mt-1 text-2xl font-bold">{metric.value}</p></div><div className={`rounded-xl p-3 ${metric.className}`}><metric.icon className="h-5 w-5" /></div></CardContent></Card>)}</div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5"><Card className="xl:col-span-3"><CardHeader><CardTitle>Vendas por hora</CardTitle><CardDescription>Frente de caixa comparada às demais origens, das 5h às 23h.</CardDescription></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={dashboard.salesByHour}><defs><linearGradient id="frontCashier" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.35}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="hour" tickLine={false} axisLine={false}/><YAxis tickFormatter={(value) => `R$ ${value}`} tickLine={false} axisLine={false}/><Tooltip formatter={(value: number) => currency(value)}/><Area type="monotone" dataKey="frontCashier" name="Frente de caixa" stroke="#f97316" fill="url(#frontCashier)" strokeWidth={2}/><Area type="monotone" dataKey="otherOrigins" name="Outras origens" stroke="#3b82f6" fill="transparent" strokeWidth={2}/></AreaChart></ResponsiveContainer></CardContent></Card>
      <Card className="xl:col-span-2"><CardHeader><CardTitle>Formas de pagamento</CardTitle><CardDescription>Participação no faturamento do período.</CardDescription></CardHeader><CardContent className="space-y-3">{dashboard.payments.length ? dashboard.payments.map((payment) => <div key={payment.name}><div className="mb-1 flex justify-between text-sm"><span>{payment.name}</span><span className="font-medium">{currency(payment.value)} · {payment.percentage.toFixed(1)}%</span></div><Progress value={payment.percentage} className="h-2" /></div>) : <p className="py-16 text-center text-sm text-muted-foreground">Sem pagamentos no período.</p>}</CardContent></Card></div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5"><Card className="xl:col-span-3"><CardHeader><CardTitle>Top 10 produtos mais vendidos</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Qtd.</TableHead><TableHead>ID</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Valor total</TableHead></TableRow></TableHeader><TableBody>{dashboard.topProducts.length ? dashboard.topProducts.map((product) => <TableRow key={product.id}><TableCell>{product.quantity.toLocaleString("pt-BR")}</TableCell><TableCell className="font-mono text-xs">{product.id}</TableCell><TableCell>{product.product}</TableCell><TableCell className="text-right font-medium">{currency(product.total)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Nenhum produto vendido no período.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
      <Card className="xl:col-span-2"><CardHeader><CardTitle>Caixas, turnos e dispositivos</CardTitle></CardHeader><CardContent className="space-y-3">{dashboard.operationSummary.map((item) => <div key={item.label} className="flex items-center justify-between rounded-lg bg-muted/50 p-3"><span className="text-sm text-muted-foreground">{item.label}</span><span className="font-semibold">{currency(item.value)}</span></div>)}{dashboard.devices.length > 0 && <><p className="pt-2 text-sm font-medium">Maquininhas / POS ativas</p>{dashboard.devices.map((device) => <div key={device.name} className="flex justify-between text-sm"><span>{device.name} <span className="text-muted-foreground">({device.transactions} trans.)</span></span><span className="font-medium">{currency(device.total)}</span></div>)}</>}</CardContent></Card></div>
      <Card className={dashboard.criticalStock.length ? "border-yellow-500/30" : ""}><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" />Estoque crítico e depósitos</CardTitle><CardDescription>Produtos com saldo atual menor ou igual ao estoque mínimo do Eyemobile.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Depósito</TableHead><TableHead>Estoque</TableHead><TableHead>Mínimo</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader><TableBody>{dashboard.criticalStock.length ? dashboard.criticalStock.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.product}</TableCell><TableCell>{item.depot}</TableCell><TableCell className="text-destructive">{item.stock} {item.unit}</TableCell><TableCell>{item.minStock} {item.unit}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => addToShoppingList(item)}><ShoppingCart className="mr-2 h-4 w-4" />Enviar ao Mercado</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Nenhum item em estoque crítico.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
    </>}
  </div>;
}