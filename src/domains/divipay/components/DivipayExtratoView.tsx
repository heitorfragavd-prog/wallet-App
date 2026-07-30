import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { Search, Download } from "lucide-react";
import { useDivipayExtrato } from "@/domains/divipay/hooks/useDivipayExtrato";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export function DivipayExtratoView() {
  const { movements, loading, filters, setFilters, exportCsv } = useDivipayExtrato();

  const handleSearch = () => {
    // A mudança de filtros já dispara a query; este botão reforça a ação.
    setFilters({ ...filters });
  };

  const getStatusBadge = (status: string) => {
    const variant =
      status === "CONFIRMED" || status === "PAID" || status === "COMPLETED"
        ? "default"
        : status === "PENDING"
        ? "secondary"
        : status === "FAILED" || status === "CANCELLED" || status === "REJECTED"
        ? "destructive"
        : "outline";
    return <Badge variant={variant}>{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Extrato Divipay</h3>
        <Button variant="outline" onClick={() => exportCsv(movements)} disabled={!movements.length}>
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="initialDate">Data inicial</Label>
              <Input
                id="initialDate"
                type="date"
                value={filters.initialDate}
                onChange={(e) => setFilters({ ...filters, initialDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="finalDate">Data final</Label>
              <Input
                id="finalDate"
                type="date"
                value={filters.finalDate}
                onChange={(e) => setFilters({ ...filters, finalDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Input
                id="status"
                value={filters.status ?? ""}
                onChange={(e) => setFilters({ ...filters, status: e.target.value || null })}
                placeholder="Ex: CONFIRMED"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Input
                id="type"
                value={filters.type ?? ""}
                onChange={(e) => setFilters({ ...filters, type: e.target.value || null })}
                placeholder="Ex: CASH_IN"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSearch}>
              <Search className="w-4 h-4 mr-2" />
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : movements.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Nenhuma movimentação encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Valor Líquido</TableHead>
                    <TableHead>Taxas</TableHead>
                    <TableHead>Pagador</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDateTime(m.date)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{m.transactionCode}</TableCell>
                      <TableCell>{m.type}</TableCell>
                      <TableCell>{getStatusBadge(m.status)}</TableCell>
                      <TableCell>{formatCurrency(m.amount)}</TableCell>
                      <TableCell>{formatCurrency(m.amountLiquid)}</TableCell>
                      <TableCell>{formatCurrency(m.taxes)}</TableCell>
                      <TableCell className="max-w-xs truncate">{m.payerName || "—"}</TableCell>
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
