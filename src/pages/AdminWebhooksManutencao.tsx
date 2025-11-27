import { useState } from "react";
import { AdminLayoutModern } from "@/domains/admin/components/AdminLayoutModern";
import { AdminPageHeader } from "@/domains/admin/components/AdminPageHeader";
import { AdminStatsCard } from "@/domains/admin/components/AdminStatsCard";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { 
  Webhook, 
  Plus, 
  RefreshCw, 
  Activity,
  CheckCircle,
  XCircle,
  Clock
} from "lucide-react";
import { useWebhooksManutencao } from "@/domains/admin/hooks/useWebhooksManutencao";
import { useLogsWebhooksManutencao } from "@/domains/admin/hooks/useLogsWebhooksManutencao";
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

export default function AdminWebhooksManutencao() {
  const { webhooks, loading, refetch } = useWebhooksManutencao();
  const { logs, total, getEstatisticas } = useLogsWebhooksManutencao();
  
  const [estatisticas, setEstatisticas] = useState<WebhookStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [novoWebhookModalOpen, setNovoWebhookModalOpen] = useState(false);

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

  // Carregar estatísticas ao montar
  useState(() => {
    carregarEstatisticas();
  });

  const webhooksAtivos = webhooks.filter(w => w.ativo).length;
  const webhooksInativos = webhooks.filter(w => !w.ativo).length;

  const handleNovoWebhook = () => {
    setNovoWebhookModalOpen(true);
  };

  const handleWebhookCreated = () => {
    setNovoWebhookModalOpen(false);
    handleRefresh();
  };

  return (
    <AdminLayoutModern>
      <AdminPageHeader
        title="Webhooks de Manutenção"
        subtitle="Gerencie notificações automáticas de manutenção de veículos"
        icon={Webhook}
        iconColor="bg-purple-500"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Integrações' },
          { label: 'Webhooks Manutenção' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button 
              onClick={handleRefresh} 
              variant="ghost" 
              size="sm" 
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button 
              onClick={handleNovoWebhook}
              className="bg-purple-500 hover:bg-purple-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Webhook
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <AdminStatsCard
          title="Total Webhooks"
          value={webhooks.length}
          icon={Webhook}
          gradient="purple"
          loading={loading}
        />
        <AdminStatsCard
          title="Ativos"
          value={webhooksAtivos}
          icon={CheckCircle}
          gradient="green"
          loading={loading}
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
      <Tabs defaultValue="webhooks" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full sm:w-auto sm:inline-flex bg-muted/50">
          <TabsTrigger 
            value="webhooks" 
            className="data-[state=active]:bg-purple-500 data-[state=active]:text-white"
          >
            <Webhook className="w-4 h-4 mr-2" />
            Webhooks ({webhooks.length})
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

        {/* Tab: Webhooks */}
        <TabsContent value="webhooks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Webhooks</CardTitle>
              <CardDescription>
                Configure webhooks para receber notificações de manutenções pendentes de veículos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando webhooks...
                </div>
              ) : webhooks.length === 0 ? (
                <div className="text-center py-12">
                  <Webhook className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhum webhook configurado</p>
                  <Button 
                    onClick={handleNovoWebhook}
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
