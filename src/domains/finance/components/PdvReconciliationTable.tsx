import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Button } from "@/shared/components/ui/button";
import { centsToFormattedReal } from "@/utils/money";
import { PdvStatusBadge } from "./PdvStatusBadge";
import { ReconcilePdvModal, TransactionToReconcile } from "./ReconcilePdvModal";
import { usePdvReconciliation } from "@/domains/finance/hooks/usePdvReconciliation";
import { ArrowRightLeft, RefreshCw, ShoppingCart } from "lucide-react";

interface PdvTransactionItem {
  id: string;
  description?: string;
  grossAmount: number | string | bigint;
  feeAmount?: number | string | bigint;
  netAmount?: number | string | bigint;
  occurredAt?: string;
  paymentMethod?: string;
  metadata?: Record<string, unknown>;
  reconciliationStatus?: "pendente" | "conciliada" | "already_reconciled" | "falha";
}

interface PdvReconciliationTableProps {
  transactions: PdvTransactionItem[];
  title?: string;
  description?: string;
}

export const PdvReconciliationTable: React.FC<PdvReconciliationTableProps> = ({
  transactions,
  title = "Vendas e Conciliações PDV",
  description = "Acompanhe o status e concilie recebíveis diretamente na sua carteira.",
}) => {
  const { conciliacoes, loading, refetch } = usePdvReconciliation();
  const [selectedTx, setSelectedTx] = useState<TransactionToReconcile | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Mapeia conciliações existentes por ID externo
  const conciliacaoMap = React.useMemo(() => {
    const map = new Map<string, (typeof conciliacoes)[number]>();
    conciliacoes.forEach((c) => {
      map.set(c.external_transaction_id, c);
    });
    return map;
  }, [conciliacoes]);

  const handleOpenReconcile = (tx: PdvTransactionItem) => {
    setSelectedTx({
      id: tx.id,
      description: tx.description,
      grossAmount: tx.grossAmount,
      feeAmount: tx.feeAmount,
      netAmount: tx.netAmount,
      occurredAt: tx.occurredAt,
      paymentMethod: tx.paymentMethod,
      metadata: tx.metadata,
    });
    setModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-purple-600" />
            {title}
          </h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={loading}
          className="self-start sm:self-auto h-8 text-xs gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="border border-border/60 rounded-xl overflow-hidden bg-card/50">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs font-semibold">Data</TableHead>
              <TableHead className="text-xs font-semibold">Identificador / Descrição</TableHead>
              <TableHead className="text-xs font-semibold">Método</TableHead>
              <TableHead className="text-xs font-semibold text-right">Bruto</TableHead>
              <TableHead className="text-xs font-semibold text-right">Líquido</TableHead>
              <TableHead className="text-xs font-semibold text-center">Status</TableHead>
              <TableHead className="text-xs font-semibold text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-xs text-muted-foreground">
                  Nenhuma transação PDV localizada para o período selecionado.
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => {
                const conciliacao = conciliacaoMap.get(tx.id);
                const status = conciliacao ? "conciliada" : (tx.reconciliationStatus || "pendente");
                const isConciliada = status === "conciliada" || status === "already_reconciled";

                const grossCents = typeof tx.grossAmount === "bigint" ? tx.grossAmount : BigInt(Math.round(Number(tx.grossAmount) * 100));
                const netCents = tx.netAmount !== undefined
                  ? (typeof tx.netAmount === "bigint" ? tx.netAmount : BigInt(Math.round(Number(tx.netAmount) * 100)))
                  : grossCents;

                return (
                  <TableRow key={tx.id} className="text-xs hover:bg-muted/20">
                    <TableCell className="font-mono text-muted-foreground">
                      {tx.occurredAt ? new Date(tx.occurredAt).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{tx.description || `Venda ${tx.id.slice(0, 8)}`}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{tx.id}</div>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {tx.paymentMethod || "Cartão"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-foreground">
                      R$ {centsToFormattedReal(grossCents)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {centsToFormattedReal(netCents)}
                    </TableCell>
                    <TableCell className="text-center">
                      <PdvStatusBadge status={status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {isConciliada ? (
                        <Button variant="ghost" size="sm" disabled className="h-7 text-xs opacity-60">
                          Conciliada
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenReconcile(tx)}
                          className="h-7 text-xs font-semibold text-purple-600 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/50 gap-1"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          Conciliar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ReconcilePdvModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        transaction={selectedTx}
        onSuccess={() => refetch()}
      />
    </div>
  );
};
