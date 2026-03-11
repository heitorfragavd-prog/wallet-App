import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Smartphone, 
  CreditCard, 
  Banknote, 
  Wallet, 
  ArrowRightLeft,
  Trash2,
  Ticket
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";
import { usePagamentosDivida } from "../hooks/usePagamentosDivida";
import { PaymentMethod } from "../types";

interface HistoricoPagamentosProps {
  dividaId: string;
  className?: string;
}

const paymentMethodIcons: Record<PaymentMethod, typeof Smartphone> = {
  pix: Smartphone,
  cartao_credito: CreditCard,
  cartao_debito: CreditCard,
  boleto: Banknote,
  dinheiro: Wallet,
  transferencia: ArrowRightLeft,
  voucher: Ticket,
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: 'PIX',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  voucher: 'Voucher',
};

export function HistoricoPagamentos({ dividaId, className }: HistoricoPagamentosProps) {
  const { pagamentos, loading, deletePagamento } = usePagamentosDivida(dividaId);

  const handleDelete = async (id: string) => {
    await deletePagamento(id);
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Histórico de Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  if (pagamentos.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Histórico de Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Histórico de Pagamentos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {pagamentos.map((pagamento) => {
            const Icon = paymentMethodIcons[pagamento.metodo_pagamento];
            
            return (
              <div
                key={pagamento.id}
                className="flex items-start justify-between p-4 border rounded-lg"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {paymentMethodLabels[pagamento.metodo_pagamento]}
                    </span>
                    <span className="text-sm text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(pagamento.data_pagamento), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="text-lg font-semibold text-green-600">
                    R$ {pagamento.valor.toFixed(2)}
                  </div>
                  {pagamento.observacoes && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {pagamento.observacoes}
                    </p>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover Pagamento</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja remover este pagamento? Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(pagamento.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
