import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Copy, Check, Ban } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useDivipayCobrancas } from "@/domains/divipay/hooks/useDivipayCobrancas";
import { NovaCobrancaPixModal } from "./NovaCobrancaPixModal";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useState } from "react";

export function DivipayCobrancasView() {
  const { cobrancas, loading, cancelCobranca, isCancelling } = useDivipayCobrancas();
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (text: string | null, id: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast({ title: "Copiado!", description: "Pix Copia e Cola copiado." });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" });
    }
  };

  const handleCancel = async (cobranca: (typeof cobrancas)[0]) => {
    try {
      await cancelCobranca(cobranca);
    } catch {
      // erro já exibido pelo hook
    }
  };

  const getStatusBadge = (status: string) => {
    const variant =
      status === "PAID" || status === "CONFIRMED"
        ? "default"
        : status === "PENDING"
        ? "secondary"
        : status === "CANCELLED" || status === "EXPIRED"
        ? "destructive"
        : "outline";
    return <Badge variant={variant}>{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Cobranças Pix</h3>
        <NovaCobrancaPixModal />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Histórico de cobranças</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : cobrancas.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Nenhuma cobrança encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead>Pix Copia e Cola</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cobrancas.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-xs truncate">{c.description || "—"}</TableCell>
                      <TableCell>{formatCurrency(Number(c.amount))}</TableCell>
                      <TableCell>{getStatusBadge(c.status)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDateTime(c.created_at)}</TableCell>
                      <TableCell>
                        {c.pix_copy_paste ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(c.pix_copy_paste, c.id)}
                          >
                            {copiedId === c.id ? (
                              <Check className="w-4 h-4 mr-1" />
                            ) : (
                              <Copy className="w-4 h-4 mr-1" />
                            )}
                            Copiar
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.status === "PENDING" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleCancel(c)}
                            disabled={isCancelling}
                          >
                            <Ban className="w-4 h-4 mr-1" />
                            Cancelar
                          </Button>
                        )}
                      </TableCell>
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
