import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { 
  CheckCircle, 
  XCircle, 
  Eye, 
  Clock,
  AlertCircle
} from "lucide-react";
import { LogWebhookManutencao } from "@/domains/admin/hooks/useLogsWebhooksManutencao";
import { ScrollArea } from "@/shared/components/ui/scroll-area";

interface LogsWebhooksTableProps {
  logs: LogWebhookManutencao[];
  loading?: boolean;
  emptyMessage?: string;
}

export default function LogsWebhooksTable({ 
  logs, 
  loading = false,
  emptyMessage = "Nenhum log encontrado"
}: LogsWebhooksTableProps) {
  const [selectedLog, setSelectedLog] = useState<LogWebhookManutencao | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const handleViewDetails = (log: LogWebhookManutencao) => {
    setSelectedLog(log);
    setShowDetailsDialog(true);
  };

  const getStatusBadge = (statusCode?: number) => {
    if (!statusCode) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="w-3 h-3" />
          Erro
        </Badge>
      );
    }

    if (statusCode >= 200 && statusCode < 300) {
      return (
        <Badge className="bg-green-500 hover:bg-green-600 gap-1">
          <CheckCircle className="w-3 h-3" />
          {statusCode}
        </Badge>
      );
    }

    if (statusCode >= 400 && statusCode < 500) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="w-3 h-3" />
          {statusCode}
        </Badge>
      );
    }

    if (statusCode >= 500) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="w-3 h-3" />
          {statusCode}
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="gap-1">
        {statusCode}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  const formatPayload = (payload: any) => {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4 animate-pulse" />
        <p className="text-muted-foreground">Carregando logs...</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[100px]">Tentativa</TableHead>
              <TableHead>Data/Hora</TableHead>
              <TableHead className="w-[100px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  {getStatusBadge(log.status_code)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {log.tentativa}ª tentativa
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {formatDate(log.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleViewDetails(log)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Detalhes
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog de Detalhes */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Detalhes do Log</DialogTitle>
            <DialogDescription>
              Informações completas sobre o envio do webhook
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <ScrollArea className="h-[60vh] pr-4">
              <div className="space-y-6">
                {/* Status e Tentativa */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Status
                    </label>
                    <div className="mt-1">
                      {getStatusBadge(selectedLog.status_code)}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Tentativa
                    </label>
                    <div className="mt-1">
                      <Badge variant="outline">
                        {selectedLog.tentativa}ª tentativa
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Data/Hora */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Data/Hora
                  </label>
                  <p className="mt-1 font-mono text-sm">
                    {formatDate(selectedLog.created_at)}
                  </p>
                </div>

                {/* IDs */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Webhook ID
                    </label>
                    <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                      {selectedLog.webhook_id}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Lembrete ID
                    </label>
                    <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                      {selectedLog.lembrete_id}
                    </p>
                  </div>
                </div>

                {/* Payload */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Payload Enviado
                  </label>
                  <pre className="mt-2 p-4 bg-muted rounded-lg overflow-x-auto text-xs">
                    {formatPayload(selectedLog.payload)}
                  </pre>
                </div>

                {/* Response */}
                {selectedLog.response && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Resposta
                    </label>
                    <pre className="mt-2 p-4 bg-muted rounded-lg overflow-x-auto text-xs">
                      {selectedLog.response}
                    </pre>
                  </div>
                )}

                {/* Erro */}
                {selectedLog.erro && (
                  <div>
                    <label className="text-sm font-medium text-red-500">
                      Erro
                    </label>
                    <div className="mt-2 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {selectedLog.erro}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
