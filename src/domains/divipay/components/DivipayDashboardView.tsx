import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { BankLogoBadge } from "@/shared/components/BankLogoBadge";
import { useDivipayDashboard } from "@/domains/divipay/hooks/useDivipayDashboard";
import { useDivipayConfig } from "@/domains/divipay/hooks/useDivipayConfig";
import { CheckCircle2, XCircle, Wallet, ArrowDownLeft, ArrowUpRight, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export function DivipayDashboardView() {
  const { data, isLoading } = useDivipayDashboard();
  const { config, loading: configLoading } = useDivipayConfig();

  const balance = data?.balances[0];
  const environment = config?.environment ?? "sandbox";
  const isProduction = environment === "production";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <BankLogoBadge slug="divipay" size="lg" />
          <div>
            <h2 className="text-2xl font-bold">Divipay</h2>
            <p className="text-muted-foreground text-sm">Gestão de cobranças, saques e extrato</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isProduction ? "default" : "secondary"}>
            {isProduction ? "Produção" : "Sandbox"}
          </Badge>
          <div className="flex items-center gap-2 text-sm">
            {isLoading ? (
              <Skeleton className="h-5 w-32" />
            ) : data?.connected ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-green-600">Conectado</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-red-600">Desconectado</span>
              </>
            )}
          </div>
        </div>
      </div>

      {data?.connectionError && !isLoading && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/30">
          {data.connectionError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Saldo disponível
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || configLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(balance?.balance ?? 0)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Saldo bloqueado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || configLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(balance?.balanceBlocked ?? 0)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Saldo travado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || configLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(balance?.balanceLocked ?? 0)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4" />
              Entradas do mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold text-green-600">{formatCurrency(data?.entradas ?? 0)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4" />
              Saídas do mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold text-destructive">{formatCurrency(data?.saidas ?? 0)}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
