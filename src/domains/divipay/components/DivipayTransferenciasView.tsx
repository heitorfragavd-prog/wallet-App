import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { useDivipayTransferencias } from "@/domains/divipay/hooks/useDivipayTransferencias";
import { NovaTransferenciaModal } from "./NovaTransferenciaModal";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export function DivipayTransferenciasView() {
  const { transferencias, loading } = useDivipayTransferencias();

  const getStatusBadge = (status: string) => {
    const variant =
      status === "COMPLETED" || status === "PAID" || status === "CONFIRMED"
        ? "default"
        : status === "PENDING"
        ? "secondary"
        : status === "FAILED" || status === "CANCELLED"
        ? "destructive"
        : "outline";
    return <Badge variant={variant}>{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Transferências Pix</h3>
        <NovaTransferenciaModal />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Histórico de transferências</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : transferencias.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Nenhuma transferência encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Chave Pix</TableHead>
                    <TableHead>Criada em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transferencias.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="max-w-xs truncate">{t.description || "—"}</TableCell>
                      <TableCell>{formatCurrency(Number(t.amount))}</TableCell>
                      <TableCell>{getStatusBadge(t.status)}</TableCell>
                      <TableCell className="font-mono text-xs">{t.recipient_key || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDateTime(t.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
