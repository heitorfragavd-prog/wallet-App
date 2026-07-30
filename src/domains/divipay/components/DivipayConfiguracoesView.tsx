import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { Save, Webhook, Copy, Check } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useDivipayConfig } from "@/domains/divipay/hooks/useDivipayConfig";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import { formatDateTime } from "@/lib/utils";
import type { DivipayEnvironment } from "@/domains/divipay/types";

export function DivipayConfiguracoesView() {
  const { config, loading, saving, saveCredentials, refetch } = useDivipayConfig();
  const { toast } = useToast();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [environment, setEnvironment] = useState<DivipayEnvironment>("sandbox");
  const [copied, setCopied] = useState(false);
  const [configuringWebhook, setConfiguringWebhook] = useState(false);

  // Sincroniza estados locais quando a config carrega
  useEffect(() => {
    if (config) {
      setClientId(config.client_id ?? "");
      setClientSecret(config.client_secret ?? "");
      setEnvironment((config.environment as DivipayEnvironment) ?? "sandbox");
    }
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha client_id e client_secret.",
        variant: "destructive",
      });
      return;
    }
    try {
      await saveCredentials(clientId.trim(), clientSecret.trim(), environment);
    } catch {
      // erro já exibido
    }
  };

  const webhookUrl = config?.webhook_url ?? null;

  const handleCopyWebhook = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      toast({ title: "Copiado!", description: "URL do webhook copiada." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" });
    }
  };

  const handleConfigureWebhook = async () => {
    try {
      setConfiguringWebhook(true);
      await divipayService.configureWebhook();
      toast({ title: "Webhook configurado", description: "Webhook registrado na Divipay com sucesso." });
      refetch();
    } catch (err: unknown) {
      toast({
        title: "Erro ao configurar webhook",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setConfiguringWebhook(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Configurações Divipay</h3>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Credenciais</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-32" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID *</Label>
                <Input
                  id="clientId"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="client_id da Divipay"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret *</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="client_secret da Divipay"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  As credenciais são armazenadas criptografadas no banco e nunca expostas no frontend.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="environment">Ambiente</Label>
                <Select value={environment} onValueChange={(v) => setEnvironment(v as DivipayEnvironment)}>
                  <SelectTrigger id="environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                    <SelectItem value="production">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Salvando..." : "Salvar credenciais"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook className="w-4 h-4" />
            Webhook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL do webhook</Label>
            {webhookUrl ? (
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={handleCopyWebhook}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Configure o webhook automaticamente para visualizar a URL.
              </p>
            )}
          </div>
          <Button onClick={handleConfigureWebhook} disabled={configuringWebhook || !config?.client_id}>
            {configuringWebhook ? "Configurando..." : "Configurar webhook na Divipay"}
          </Button>
        </CardContent>
      </Card>

      <WebhookLogsTable />
    </div>
  );
}

function WebhookLogsTable() {
  const { data: logsData = [], isLoading: logsLoading } = useQuery({
    queryKey: ["divipay-webhook-logs"],
    queryFn: () => divipayService.getWebhookLogs(20),
    staleTime: 1000 * 60,
    retry: 1,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Últimos logs de webhook</CardTitle>
      </CardHeader>
      <CardContent>
        {logsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : logsData.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Nenhum log de webhook recebido ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recebido em</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>ID externo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsData.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>{log.event_type || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={log.processed ? "default" : "destructive"}>
                        {log.processed ? "Processado" : "Erro"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.external_id || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
