import React, { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { centsToFormattedReal, toCents } from "@/utils/money";
import { useContasUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { usePdvReconciliation } from "@/domains/finance/hooks/usePdvReconciliation";
import { Loader2, ArrowRightLeft, Wallet, AlertCircle } from "lucide-react";

export interface TransactionToReconcile {
  id: string; // ID externo
  description?: string;
  grossAmount: number | string | bigint; // em reais ou centavos
  feeAmount?: number | string | bigint; // em reais ou centavos
  netAmount?: number | string | bigint; // em reais ou centavos
  occurredAt?: string;
  paymentMethod?: string;
  metadata?: Record<string, unknown>;
}

interface ReconcilePdvModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionToReconcile | null;
  onSuccess?: () => void;
}

export const ReconcilePdvModal: React.FC<ReconcilePdvModalProps> = ({
  isOpen,
  onClose,
  transaction,
  onSuccess,
}) => {
  const { contas, loading: loadingContas } = useContasUsuario();
  const { reconcileTransaction, isReconciling } = usePdvReconciliation();
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");

  if (!transaction) return null;

  // Normalização de valores com utilitário monetário estrito
  const grossCents = typeof transaction.grossAmount === "bigint"
    ? transaction.grossAmount
    : toCents(transaction.grossAmount);

  const feeCents = transaction.feeAmount !== undefined
    ? (typeof transaction.feeAmount === "bigint" ? transaction.feeAmount : toCents(transaction.feeAmount))
    : 0n;

  const netCents = transaction.netAmount !== undefined
    ? (typeof transaction.netAmount === "bigint" ? transaction.netAmount : toCents(transaction.netAmount))
    : grossCents - feeCents;

  const handleReconcile = async () => {
    if (!selectedWalletId) return;

    try {
      await reconcileTransaction({
        p_external_id: transaction.id,
        p_wallet_id: selectedWalletId,
        p_gross_amount_cents: Number(grossCents),
        p_fee_cents: Number(feeCents),
        p_net_amount_cents: Number(netCents),
        p_occurred_at: transaction.occurredAt || new Date().toISOString(),
        p_payment_method: transaction.paymentMethod || "outros",
        p_metadata: transaction.metadata || {},
      });

      onSuccess?.();
      onClose();
    } catch {
      // Notificação de erro já exibida no hook usePdvReconciliation
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <DialogTitle className="text-xl font-bold">Conciliar Venda PDV</DialogTitle>
          <DialogDescription>
            Vincule e liquide a receita do PDV diretamente em uma conta/carteira ativa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="bg-muted/40 p-3.5 rounded-xl space-y-2 border border-border/50 text-sm">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>ID da Transação:</span>
              <span className="font-mono text-xs text-foreground font-medium">{transaction.id}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Valor Bruto:</span>
              <span className="font-semibold text-foreground">R$ {centsToFormattedReal(grossCents)}</span>
            </div>
            {feeCents > 0n && (
              <div className="flex justify-between items-center text-rose-500">
                <span>Taxa PDV:</span>
                <span>- R$ {centsToFormattedReal(feeCents)}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-border/40 pt-2 font-bold text-emerald-600 dark:text-emerald-400 text-base">
              <span>Líquido a Creditar:</span>
              <span>R$ {centsToFormattedReal(netCents)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Conta / Carteira de Destino
            </label>
            <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
              <SelectTrigger className="w-full h-11 rounded-xl">
                <SelectValue placeholder="Selecione a carteira para liquidação" />
              </SelectTrigger>
              <SelectContent>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-muted-foreground" />
                      <span>{c.nome}</span>
                      {c.tipo && <span className="text-xs text-muted-foreground">({c.tipo})</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!selectedWalletId && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Escolha a conta antes de confirmar a conciliação.</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isReconciling}>
            Cancelar
          </Button>
          <Button
            onClick={handleReconcile}
            disabled={!selectedWalletId || isReconciling || loadingContas}
            className="bg-purple-600 hover:bg-purple-700 text-white font-medium"
          >
            {isReconciling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Conciliando...
              </>
            ) : (
              "Confirmar Conciliação"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
