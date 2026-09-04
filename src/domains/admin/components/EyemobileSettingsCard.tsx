import { useState, useEffect } from "react";
import { useEyemobileConfig, EyemobileConfig } from "../hooks/useEyemobileConfig";
import { useContasUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Loader2,
  Save,
  CheckCircle,
  AlertCircle,
  Wifi,
  RefreshCw,
  Clock,
  Settings,
  HelpCircle,
  RotateCcw,
} from "lucide-react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";

export function EyemobileSettingsCard() {
  const {
    config,
    logs,
    loading: configLoading,
    saving: configSaving,
    testing: configTesting,
    syncing: configSyncing,
    syncProgress,
    saveConfig,
    testConnection,
    triggerSync,
    triggerFullHistorySync,
    resetSyncOffset,
  } = useEyemobileConfig();

  const { contas, loading: contasLoading } = useContasUsuario();
  const { categoriasReceita, categoriasDespesa, loading: categoriasLoading } = useCategorias();

  // Local Form state
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [environment, setEnvironment] = useState<"production" | "staging">("production");
  const [defaultContaId, setDefaultContaId] = useState<string | null>(null);
  const [defaultCategoriaReceitaId, setDefaultCategoriaReceitaId] = useState<string | null>(null);
  const [defaultCategoriaTaxaId, setDefaultCategoriaTaxaId] = useState<string | null>(null);
  const [autoSyncSales, setAutoSyncSales] = useState(true);
  const [autoSyncStock, setAutoSyncStock] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  // Load configuration values into form when loaded
  useEffect(() => {
    if (config) {
      setAccessKey(config.access_key || "");
      setSecretKey(config.secret_key || "");
      setEnvironment(config.environment || "production");
      setDefaultContaId(config.default_conta_id || "none");
      setDefaultCategoriaReceitaId(config.default_categoria_receita_id || "none");
      setDefaultCategoriaTaxaId(config.default_categoria_taxa_id || "none");
      setAutoSyncSales(config.auto_sync_sales ?? true);
      setAutoSyncStock(config.auto_sync_stock ?? true);
    }
  }, [config]);

  // Track if values changed compared to config
  useEffect(() => {
    if (!config) {
      setHasChanges(
        accessKey !== "" ||
        secretKey !== "" ||
        environment !== "production" ||
        (defaultContaId !== null && defaultContaId !== "none") ||
        (defaultCategoriaReceitaId !== null && defaultCategoriaReceitaId !== "none") ||
        (defaultCategoriaTaxaId !== null && defaultCategoriaTaxaId !== "none") ||
        autoSyncSales !== true ||
        autoSyncStock !== true
      );
      return;
    }

    setHasChanges(
      accessKey !== (config.access_key || "") ||
      secretKey !== (config.secret_key || "") ||
      environment !== (config.environment || "production") ||
      (defaultContaId || "none") !== (config.default_conta_id || "none") ||
      (defaultCategoriaReceitaId || "none") !== (config.default_categoria_receita_id || "none") ||
      (defaultCategoriaTaxaId || "none") !== (config.default_categoria_taxa_id || "none") ||
      autoSyncSales !== (config.auto_sync_sales ?? true) ||
      autoSyncStock !== (config.auto_sync_stock ?? true)
    );
  }, [
    config,
    accessKey,
    secretKey,
    environment,
    defaultContaId,
    defaultCategoriaReceitaId,
    defaultCategoriaTaxaId,
    autoSyncSales,
    autoSyncStock,
  ]);

  const handleSave = async () => {
    const payload: Omit<EyemobileConfig, "id" | "user_id" | "created_at" | "updated_at"> = {
      access_key: accessKey,
      secret_key: secretKey,
      environment,
      store_id: null,
      default_conta_id: defaultContaId === "none" ? null : defaultContaId,
      default_categoria_receita_id: defaultCategoriaReceitaId === "none" ? null : defaultCategoriaReceitaId,
      default_categoria_taxa_id: defaultCategoriaTaxaId === "none" ? null : defaultCategoriaTaxaId,
      auto_sync_sales: autoSyncSales,
      auto_sync_stock: autoSyncStock,
    };
    await saveConfig(payload);
  };

  const handleTestConnection = async () => {
    await testConnection({
      access_key: accessKey,
      secret_key: secretKey,
      environment,
    });
  };

  const handleSyncNow = async () => {
    await triggerSync("ALL");
  };

  const handleFullHistorySync = async () => {
    await triggerFullHistorySync();
  };

  const getLogStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Sucesso</Badge>;
      case "WARNING":
        return <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">Aviso</Badge>;
      case "ERROR":
        return <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">Erro</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isFormValid = accessKey.trim() !== "" && secretKey.trim() !== "";
  const isLoading = configLoading || contasLoading || categoriasLoading;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/20">
            <Settings className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <CardTitle>Integração Eyemobile PDV</CardTitle>
            <CardDescription>
              Conecte suas vendas e estoque físico do Eyemobile ao seu Wallet App
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Access Key */}
              <div className="space-y-2">
                <Label htmlFor="eyemobile-access-key">Access Key (X-EYEMOBILE-ACCESS-KEY)</Label>
                <Input
                  id="eyemobile-access-key"
                  type="password"
                  placeholder="Insira sua Access Key"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                />
              </div>

              {/* Secret Key */}
              <div className="space-y-2">
                <Label htmlFor="eyemobile-secret-key">Secret Key (X-EYEMOBILE-SECRET-KEY)</Label>
                <Input
                  id="eyemobile-secret-key"
                  type="password"
                  placeholder="Insira sua Secret Key"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {/* Ambiente */}
              <div className="space-y-2">
                <Label htmlFor="eyemobile-env">Ambiente da API</Label>
                <Select
                  value={environment}
                  onValueChange={(val: "production" | "staging") => setEnvironment(val)}
                >
                  <SelectTrigger id="eyemobile-env">
                    <SelectValue placeholder="Selecione o ambiente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Produção (api.eyemobile.com.br)</SelectItem>
                    <SelectItem value="staging">Staging (staging-api.eyemobile.com.br)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Conta Padrão */}
              <div className="space-y-2">
                <Label htmlFor="eyemobile-conta">Conta de Destino das Vendas</Label>
                <Select
                  value={defaultContaId || "none"}
                  onValueChange={(val) => setDefaultContaId(val)}
                >
                  <SelectTrigger id="eyemobile-conta">
                    <SelectValue placeholder="Selecione uma conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (Não associar)</SelectItem>
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} ({c.tipo === "cartao_credito" ? "Cartão" : "Conta"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Categoria Vendas */}
              <div className="space-y-2">
                <Label htmlFor="eyemobile-cat-receita">Categoria Padrão de Vendas</Label>
                <Select
                  value={defaultCategoriaReceitaId || "none"}
                  onValueChange={(val) => setDefaultCategoriaReceitaId(val)}
                >
                  <SelectTrigger id="eyemobile-cat-receita">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (Não categorizar)</SelectItem>
                    {categoriasReceita.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Categoria Taxas */}
              <div className="space-y-2">
                <Label htmlFor="eyemobile-cat-taxa">Categoria para Taxas de Cartão/Gateway</Label>
                <Select
                  value={defaultCategoriaTaxaId || "none"}
                  onValueChange={(val) => setDefaultCategoriaTaxaId(val)}
                >
                  <SelectTrigger id="eyemobile-cat-taxa">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (Ignorar taxas)</SelectItem>
                    {categoriasDespesa.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Toggles */}
              <div className="flex flex-col justify-center gap-4 border p-4 rounded-lg bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-sync-sales" className="text-sm font-medium">
                      Sincronizar Vendas Automático
                    </Label>
                    <p className="text-xs text-muted-foreground">Importa novas vendas como receitas</p>
                  </div>
                  <Switch
                    id="auto-sync-sales"
                    checked={autoSyncSales}
                    onCheckedChange={setAutoSyncSales}
                  />
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-sync-stock" className="text-sm font-medium">
                      Alertar Estoque Baixo na Lista de Compras
                    </Label>
                    <p className="text-xs text-muted-foreground">Adiciona itens com estoque baixo à lista</p>
                  </div>
                  <Switch
                    id="auto-sync-stock"
                    checked={autoSyncStock}
                    onCheckedChange={setAutoSyncStock}
                  />
                </div>
              </div>
            </div>

            {/* Actions Buttons */}
            <div className="flex flex-wrap gap-3 pt-3 border-t">
              <Button
                onClick={handleSave}
                disabled={configSaving || !hasChanges || !isFormValid}
                className="flex items-center gap-2"
              >
                {configSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Salvar Configurações
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={configTesting || !isFormValid}
                className="flex items-center gap-2 border-dashed"
              >
                {configTesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testando...
                  </>
                ) : (
                  <>
                    <Wifi className="h-4 w-4 text-orange-500" />
                    Testar Conexão
                  </>
                )}
              </Button>

              {config?.id && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleSyncNow}
                    disabled={configSyncing}
                    className="flex items-center gap-2 ml-auto"
                  >
                    {configSyncing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sincronizando...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 text-emerald-500" />
                        Sincronizar Agora
                      </>
                    )}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={handleFullHistorySync}
                      disabled={configSyncing}
                      className="flex items-center gap-2"
                    >
                      {configSyncing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4 text-orange-500" />
                          {config?.last_synced_offset && config.last_synced_offset > 0 ? (
                            <span>Retomar Sincronização (pág. {Math.floor(config.last_synced_offset / 100)})</span>
                          ) : (
                            <span>Sincronizar Histórico Completo</span>
                          )}
                        </>
                      )}
                    </Button>

                    {config?.last_synced_offset && config.last_synced_offset > 0 && !configSyncing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetSyncOffset}
                        title="Zerar progresso para recomeçar do início"
                        className="text-xs text-muted-foreground hover:text-red-500"
                      >
                        Reiniciar do Início
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Progress Bar para sincronização histórica */}
            {syncProgress.isSyncing && syncProgress.mode === "HISTORY" && (
              <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-orange-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-orange-500">
                    Sincronizando Histórico Completo...
                  </span>
                  <span className="text-sm font-bold text-orange-500">
                    {syncProgress.percentComplete}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-orange-500 to-emerald-500 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${syncProgress.percentComplete}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>
                    {syncProgress.totalPages 
                      ? `Página ${syncProgress.currentPage} de ${syncProgress.totalPages}`
                      : `Página ${syncProgress.currentPage}...`
                    }
                  </span>
                  <span>
                    {syncProgress.currentPage > 1 
                      ? `${syncProgress.totalItems.toLocaleString("pt-BR")} novas vendas (${(syncProgress.totalProcessed || 0).toLocaleString("pt-BR")} avaliadas)`
                      : "Iniciando..."
                    }
                  </span>
                </div>
                {syncProgress.status === "error" && syncProgress.errorMessage && (
                  <div className="mt-2 text-xs text-red-500">
                    Erro: {syncProgress.errorMessage}
                  </div>
                )}
              </div>
            )}

            {/* Sync Logs */}
            {logs.length > 0 && (
              <div className="mt-6 border-t pt-6">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Logs de Sincronização Recentes
                </h4>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted text-muted-foreground border-b text-left">
                        <th className="p-3 font-medium">Data/Hora</th>
                        <th className="p-3 font-medium">Tipo</th>
                        <th className="p-3 font-medium">Status</th>
                        <th className="p-3 font-medium">Itens Proc.</th>
                        <th className="p-3 font-medium">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-xs">
                            {new Date(log.created_at).toLocaleString("pt-BR")}
                          </td>
                          <td className="p-3 text-xs font-semibold">
                            {log.type === "TEST" ? "TESTE CONEXÃO" : log.type === "SALES" ? "VENDAS" : log.type === "STOCK" ? "ESTOQUE" : "GERAL"}
                          </td>
                          <td className="p-3">{getLogStatusBadge(log.status)}</td>
                          <td className="p-3 text-center">{log.items_processed}</td>
                          <td className="p-3 text-xs max-w-[200px] truncate text-muted-foreground">
                            {log.error_message || (log.payload ? JSON.stringify(log.payload) : "Nenhum erro")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}