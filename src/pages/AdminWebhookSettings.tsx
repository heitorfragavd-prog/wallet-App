import { useState, useEffect } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { AdminTabs } from "@/domains/admin/components/AdminTabs";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useWebhookSettings } from "@/domains/admin/hooks/useWebhookSettings";
import { Loader2, TestTube, Save, AlertCircle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";

export default function AdminWebhookSettings() {
  const {
    webhookUrl,
    loading,
    saving,
    testing,
    saveWebhookUrl,
    testWebhook,
    isValidWebhookUrl,
  } = useWebhookSettings();

  const [urlInput, setUrlInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (webhookUrl !== null) {
      setUrlInput(webhookUrl || "");
    }
  }, [webhookUrl]);

  const handleUrlChange = (value: string) => {
    setUrlInput(value);
    setHasChanges(value !== (webhookUrl || ""));
    
    // Clear validation error when user starts typing
    if (validationError) {
      setValidationError(null);
    }
  };

  const handleSave = async () => {
    // Validate URL before saving
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

  const handleTest = async () => {
    await testWebhook();
  };

  const isUrlValid = !urlInput || isValidWebhookUrl(urlInput);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-10 px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-4 text-foreground">Painel Administrativo</h1>
            <AdminTabs />
          </div>

          <div className="max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle>Configurações de Webhook</CardTitle>
                <CardDescription>
                  Configure o endpoint que receberá notificações de lembretes de dívidas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loading ? (
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
                        onClick={handleSave}
                        disabled={saving || !hasChanges || !isUrlValid}
                        className="flex-1"
                      >
                        {saving ? (
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
                        onClick={handleTest}
                        disabled={testing || !webhookUrl || hasChanges}
                        variant="outline"
                      >
                        {testing ? (
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
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
