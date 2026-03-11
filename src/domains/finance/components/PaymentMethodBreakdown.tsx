import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { 
  Smartphone, 
  CreditCard, 
  Banknote, 
  Wallet, 
  ArrowRightLeft,
  TrendingDown,
  Ticket
} from "lucide-react";
import { PaymentMethod } from "../types";

interface Transaction {
  valor: number;
  metodo_pagamento?: PaymentMethod | null;
}

interface PaymentMethodBreakdownProps {
  transactions: Transaction[];
  title?: string;
  className?: string;
}

interface PaymentMethodStat {
  method: PaymentMethod | 'nao_informado';
  label: string;
  icon: any;
  total: number;
  count: number;
  percentage: number;
  color: string;
}

const paymentMethodConfig = {
  pix: { label: 'PIX', icon: Smartphone, color: 'bg-green-500' },
  cartao_credito: { label: 'Cartão de Crédito', icon: CreditCard, color: 'bg-blue-500' },
  cartao_debito: { label: 'Cartão de Débito', icon: CreditCard, color: 'bg-purple-500' },
  boleto: { label: 'Boleto', icon: Banknote, color: 'bg-orange-500' },
  dinheiro: { label: 'Dinheiro', icon: Wallet, color: 'bg-yellow-500' },
  transferencia: { label: 'Transferência', icon: ArrowRightLeft, color: 'bg-indigo-500' },
  voucher: { label: 'Voucher', icon: Ticket, color: 'bg-teal-500' },
  nao_informado: { label: 'Não Informado', icon: TrendingDown, color: 'bg-gray-500' },
};

export function PaymentMethodBreakdown({
  transactions,
  title = "Despesas por Método de Pagamento",
  className,
}: PaymentMethodBreakdownProps) {
  const stats = useMemo(() => {
    // Calculate totals by payment method
    const methodTotals = new Map<PaymentMethod | 'nao_informado', { total: number; count: number }>();
    let grandTotal = 0;

    transactions.forEach(transaction => {
      const method = transaction.metodo_pagamento || 'nao_informado';
      const current = methodTotals.get(method) || { total: 0, count: 0 };
      
      methodTotals.set(method, {
        total: current.total + transaction.valor,
        count: current.count + 1,
      });
      
      grandTotal += transaction.valor;
    });

    // Convert to array and calculate percentages
    const statsArray: PaymentMethodStat[] = Array.from(methodTotals.entries())
      .map(([method, data]) => {
        const config = paymentMethodConfig[method as keyof typeof paymentMethodConfig];
        return {
          method,
          label: config.label,
          icon: config.icon,
          total: data.total,
          count: data.count,
          percentage: grandTotal > 0 ? (data.total / grandTotal) * 100 : 0,
          color: config.color,
        };
      })
      .sort((a, b) => b.total - a.total); // Sort by total descending

    return { statsArray, grandTotal };
  }, [transactions]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (transactions.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma transação encontrada
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Total: {formatCurrency(stats.grandTotal)}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {stats.statsArray.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.method} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${stat.color} bg-opacity-10`}>
                      <Icon className={`h-4 w-4 ${stat.color.replace('bg-', 'text-')}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{stat.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {stat.count} {stat.count === 1 ? 'transação' : 'transações'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(stat.total)}</p>
                    <Badge variant="outline" className="text-xs">
                      {stat.percentage.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
                
                {/* Progress bar */}
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className={`${stat.color} h-2 rounded-full transition-all duration-300`}
                    style={{ width: `${stat.percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
