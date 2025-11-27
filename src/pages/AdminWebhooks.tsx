import { useState, useEffect } from "react";
import { AdminLayoutModern } from "@/domains/admin/components/AdminLayoutModern";
import { AdminPageHeader } from "@/domains/admin/components/AdminPageHeader";
import { AdminStatsCard } from "@/domains/admin/components/AdminStatsCard";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { 
  Webhook, 
  Plus, 
  RefreshCw, 
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Bell,
  Car,
  Loader2,
  TestTube,
  Save,
  AlertCircle
} from "lucide-react";
import { useWebhooksManutencao } from "@/domains/admin/hooks/useWebhooksManutencao";
import { useLogsWebhooksManutencao } from "@/domains/admin/hooks/useLogsWebhooksManutencao";
import { useWebhookSettings } from "@/domains/admin/hooks/useWebhookSettings";
import WebhookManutencaoCard from "@/domains/admin/components/WebhookManutencaoCard";
import LogsWebhooksTable from "@/domains/admin/components/LogsWebhooksTable";
import { NovoWebhookManutencaoModal } from "@/domains/admin/components/NovoWebhookManutencaoModal";

interface WebhookStats {
  total: number;
  sucessos: number;
  erros: number;
  taxaSucesso: string;
  ultimosSete: number;
}

export default function AdminWebhooks() {
  const { webhooks, loading, refetch } = useWebhooksManutencao();
  const { logs, total, getEstatisticas } = useLogsWebhooksManutencao();
  const {
    webhookUrl,
    loading: debtLoading,
    saving: debtSaving,
    testing: debtTesting,
    saveWebhookUrl,
    testWebhook,
    isValidWebhookUrl,
  } = useWebhookSettings();
  
  const [estatisticas, setEstatisticas] = useState<WebhookStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [novoWebhookModalOpen, setNovoWebhookModalOpen] = useState(false);
  
  // Debt webhook state
  const [urlInput, setUrlInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (webhookUrl !== null) {
      setUrlInput(webhookUrl || "");
    }
  }, [webhookUrl]);

  const carregarEstatisticas = async () => {
    setLoadingStats(true);
    const stats = await getEstatisticas();
    setEstatisticas(stats);
    setLoadingStats(false);
  };

  const handleRefresh = () => {
    refetch();
    carregarEstatisticas();
  };

  useState(() => {
    carregarEstatisticas();
  });

  const webhooksAtivos = webhooks.filter(w => w.ativo).length;
  const webhooksInativos = webhooks.filter(w => !w.ativo).length;
  const totalWebhooks = webhooks.length + (webhookUrl ? 1 : 0);

  // Debt webhook handlers
  const handleUrlChange = (value: string) => {
    setUrlInput(value);
    setHasChanges(value !== (webhookUrl || ""));
    if (validationError) {
      setValidationError(null);
    }
  };

  const handleDebtSave = async () => {
    if (urlInput && !isValidWebhookUrl(urlInput)) {
      setValidationError("Por favor, insira uma URL válida (HTTP ou HTTPS)");
      return;
    }
    const result = await saveWebhookUrl(urlInput);
    if (result.success) {
      setHasChanges(false);
      setValidationError(null);
    }
  };

  const handleDebtTest = async () => {
    await testWebhook();
  };

  const isUrlValid = !urlInput || isValidWebhookUrl(urlInput);

  return (
    <AdminLayoutModern>
      <AdminPageHeader
        title="Webhooks"
        subtitle="Gerencie todas as integrações de webhooks do sistema"
        icon={Webhook}
        iconColor="bg-purple-500"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Integrações' },
          { label: 'Webhooks' }
        ]}
        actions={
          <Button 
            onClick={handleRefresh} 
            variant="ghost" 
            size="sm" 
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <AdminStatsCard
          title="Total Webhooks"
          value={totalWebhooks}
          icon={Webhook}
          gradient="purple"
          loading={loading || debtLoading}
        />
        <AdminStatsCard
          title="Ativos"
          value={webhooksAtivos + (webhookUrl ? 1 : 0)}
          icon={CheckCircle}
          gradient="green"
          loading={loading || debtLoading}
        />
        <AdminStatsCard
          title="Inativos"
          value={webhooksInativos}
          icon={XCircle}
          gradient="orange"
          loading={loading}
        />
        <AdminStatsCard
          title="Envios (7d)"
          value={loadingStats ? "..." : estatisticas?.ultimosSete || 0}
          icon={Activity}
          gradient="blue"
          loading={loadingStats}
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="dividas" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full sm:w-auto sm:inline-flex bg-muted/50">
          <TabsTrigger 
            value="dividas" 
            className="data-[state=active]:bg-purple-500 data-[state=active]:text-white"
          >
            <Bell className="w-4 h-4 mr-2" />
            Lembretes
          </TabsTrigger>
          <TabsTrigger 
            value="manutencao" 
            className="data-[state=active]:bg-purple-500 data-[state=active]:text-white"
          >
            <Car className="w-4 h-4 mr-2" />
            Manutenção ({webhooks.length})
          </TabsTrigger>
          <TabsTrigger 
            value="logs" 
            className="data-[state=active]:bg-purple-500 data-[state=active]:text-white"
          >
            <Clock className="w-4 h-4 mr-2" />
            Logs ({total})
          </TabsTrigger>
          <TabsTrigger 
            value="stats" 
            className="data-[state=active]:bg-purple-500 data-[state=active]:text-white"
          >
            <Activity className="w-4 h-4 mr-2" />
            Estatísticas
          </TabsTrigger>
        </TabsList>

        {/* Tab: Lembretes de Dívidas */}
        <TabsContent value="dividas" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Bell className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <CardTitle>Webhook de Lembretes de Dívidas</CardTitle>
                  <CardDescription>
                    Configure o endpoint que receberá notificações de lembretes de dívidas dos usuários
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {debtLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="webhook-url">URL do Webhook</Label>
                    <Input
                      id="webhook-url"
                      type="url"
                      placeholder="https://exemplo.com/webhook"
                      value={urlInput}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      className={validationError || !isUrlValid ? "border-red-500" : ""}
                    />
                    {validationError && (
                      <p className="text-sm text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {validationError}
                      </p>
                    )}
                    {!validationError && urlInput && isUrlValid && (
                      <p className="text-sm text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" />
                        URL válida
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      O webhook receberá dados de lembretes de dívidas quando forem acionados
                    </p>
                  </div>

                  <Alert>
                    <AlertDescription>
                      <strong>Formato do Payload:</strong> O webhook receberá um POST com JSON contendo
                      informações do usuário (nome, telefone, email), dados da dívida (descrição, credor,
                      valores, vencimento) e metadados do lembrete.
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-3">
                    <Button
                      onClick={handleDebtSave}
                      disabled={debtSaving || !hasChanges || !isUrlValid}
                      className="flex-1"
                    >
                      {debtSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Salvar Configuração
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={handleDebtTest}
                      disabled={debtTesting || !webhookUrl || hasChanges}
                      variant="outline"
                    >
                      {debtTesting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Testando...
                        </>
                      ) : (
                        <>
                          <TestTube className="h-4 w-4 mr-2" />
                          Testar Webhook
                        </>
                      )}
                    </Button>
                  </div>

                  {hasChanges && (
                    <Alert>
                      <AlertDescription>
                        Você tem alterações não salvas. Salve antes de testar o webhook.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Manutenção de Veículos */}
        <TabsContent value="manutencao" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <Car className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <CardTitle>Webhooks de Manutenção de Veículos</CardTitle>
                  <CardDescription>
                    Configure webhooks para receber notificações de manutenções pendentes
                  </CardDescription>
                </div>
              </div>
              <Button 
                onClick={() => setNovoWebhookModalOpen(true)}
                className="bg-purple-500 hover:bg-purple-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Webhook
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando webhooks...
                </div>
              ) : webhooks.length === 0 ? (
                <div className="text-center py-12">
                  <Car className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhum webhook de manutenção configurado</p>
                  <Button 
                    onClick={() => setNovoWebhookModalOpen(true)}
                    className="mt-4 bg-purple-500 hover:bg-purple-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Criar Primeiro Webhook
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {webhooks.map((webhook) => (
                    <WebhookManutencaoCard 
                      key={webhook.id} 
                      webhook={webhook}
                      onUpdate={handleRefresh}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Logs */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logs de Envios</CardTitle>
              <CardDescription>
                Histórico de webhooks enviados e suas respostas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogsWebhooksTable 
                logs={logs} 
                loading={loading}
                emptyMessage="Nenhum log de webhook encontrado"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Estatísticas */}
        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Resumo Geral</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingStats ? (
                  <p className="text-muted-foreground">Carregando estatísticas...</p>
                ) : estatisticas ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total de Envios</span>
                      <span className="text-2xl font-bold">{estatisticas.total}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Sucessos</span>
                      <span className="text-2xl font-bold text-green-500">{estatisticas.sucessos}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Erros</span>
                      <span className="text-2xl font-bold text-red-500">{estatisticas.erros}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Taxa de Sucesso</span>
                      <span className="text-2xl font-bold text-blue-500">{estatisticas.taxaSucesso}%</span>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Nenhuma estatística disponível</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Últimos 7 Dias</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <p className="text-muted-foreground">Carregando...</p>
                ) : estatisticas ? (
                  <div className="text-center py-8">
                    <p className="text-5xl font-bold text-purple-500">{estatisticas.ultimosSete}</p>
                    <p className="text-sm text-muted-foreground mt-2">webhooks enviados</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Nenhum dado disponível</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal de Novo Webhook */}
      <NovoWebhookManutencaoModal 
        open={novoWebhookModalOpen} 
        onOpenChange={(open) => {
          setNovoWebhookModalOpen(open);
          if (!open) {
            handleRefresh();
          }
        }} 
      />
    </AdminLayoutModern>
  );
}
