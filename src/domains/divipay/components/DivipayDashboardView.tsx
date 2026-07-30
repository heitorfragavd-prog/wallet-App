import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";
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
  Ban
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface DivipayDashboardViewProps {
  onNavigateTab?: (tab: string) => void;
}

export function DivipayDashboardView({ onNavigateTab }: DivipayDashboardViewProps) {
  const { data, isLoading } = useDivipayDashboard();
  const { config, loading: configLoading } = useDivipayConfig();

  const balance = data?.balances[0];
  const environment = config?.environment ?? "sandbox";
  const isProduction = environment === "production";

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
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white">
              <Building2 className="w-5 h-5" />
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

      {/* Barra de Filtro */}
      <div className="flex justify-start">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onNavigateTab?.("extrato")}
          className="text-xs gap-2 rounded-xl border-border/60"
        >
          <Filter className="w-3.5 h-3.5 text-muted-foreground" /> Filtrar
        </Button>
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
                <div className="text-lg font-bold tracking-tight">R$ 0,00</div>
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
                <div className="text-lg font-bold tracking-tight">R$ 0,00</div>
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
                <div className="text-lg font-bold tracking-tight">R$ 0,00</div>
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
                <div className="text-lg font-bold tracking-tight">R$ 0,00</div>
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
                <div className="text-lg font-bold tracking-tight">R$ 0,00</div>
                <span className="text-[11px] text-destructive font-medium flex items-center gap-1">
                  -100% <span className="text-muted-foreground">desde o mês passado</span>
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
                <div className="text-lg font-bold tracking-tight">R$ 0,00</div>
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
                <div className="text-lg font-bold tracking-tight">R$ 0,00</div>
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
                <div className="text-lg font-bold tracking-tight">0</div>
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
                <div className="text-lg font-bold tracking-tight">0</div>
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
                <div className="text-lg font-bold tracking-tight">0</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Seção 3: Vendas no Mês por Meio de Pagamento */}
      <div className="space-y-3 pt-2">
        <h3 className="text-sm font-bold tracking-tight text-foreground/90">Vendas no Mês</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { title: "Cartão de Crédito", icon: CreditCard, count: 0 },
            { title: "Cartão de Débito", icon: CreditCard, count: 0 },
            { title: "Voucher", icon: Banknote, count: 0 },
            { title: "Pix", icon: QrCode, count: 0 },
            { title: "Boleto", icon: Receipt, count: 0 },
          ].map((item, idx) => (
            <Card key={idx} className="rounded-2xl border-border/50 shadow-sm hover:border-amber-500/30 transition-colors">
              <CardContent className="p-4 flex items-center gap-3">
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
    </div>
  );
}

