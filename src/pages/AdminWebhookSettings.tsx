import { useState, useEffect } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { AdminTabs } from "@/domains/admin/components/AdminTabs";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useWebhookSettings } from "@/domains/admin/hooks/useWebhookSettings";
import { useWhatsAppSettings } from "@/domains/admin/hooks/useWhatsAppSettings";
import { useContactSettings } from "@/domains/admin/hooks/useContactSettings";
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

  const {
    whatsappNumber,
    loading: whatsappLoading,
    saving: whatsappSaving,
    saveWhatsAppNumber,
    isValidWhatsAppNumber,
  } = useWhatsAppSettings();

  const {
    email,
    phone,
    loading: contactLoading,
    saving: contactSaving,
    saveContactEmail,
    saveContactPhone,
  } = useContactSettings();

  const [urlInput, setUrlInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const [whatsappInput, setWhatsappInput] = useState("");
  const [whatsappValidationError, setWhatsappValidationError] = useState<string | null>(null);
  const [whatsappHasChanges, setWhatsappHasChanges] = useState(false);

  const [emailInput, setEmailInput] = useState("");
  const [emailHasChanges, setEmailHasChanges] = useState(false);

  const [phoneInput, setPhoneInput] = useState("");
  const [phoneHasChanges, setPhoneHasChanges] = useState(false);

  useEffect(() => {
    if (webhookUrl !== null) {
      setUrlInput(webhookUrl || "");
    }
  }, [webhookUrl]);

  useEffect(() => {
    if (whatsappNumber !== null) {
      setWhatsappInput(whatsappNumber || "");
    }
  }, [whatsappNumber]);

  useEffect(() => {
    if (email !== null) {
      setEmailInput(email || "");
    }
  }, [email]);

  useEffect(() => {
    if (phone !== null) {
      setPhoneInput(phone || "");
    }
  }, [phone]);

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

  const handleWhatsappChange = (value: string) => {
    setWhatsappInput(value);
    setWhatsappHasChanges(value !== (whatsappNumber || ""));
    
    // Clear validation error when user starts typing
    if (whatsappValidationError) {
      setWhatsappValidationError(null);
    }
  };

  const handleWhatsappSave = async () => {
    // Validate number before saving
    if (whatsappInput && !isValidWhatsAppNumber(whatsappInput)) {
      setWhatsappValidationError("Por favor, insira um número válido com 10-15 dígitos");
      return;
    }

    const result = await saveWhatsAppNumber(whatsappInput);
    if (result.success) {
      setWhatsappHasChanges(false);
      setWhatsappValidationError(null);
    }
  };

  const handleEmailChange = (value: string) => {
    setEmailInput(value);
    setEmailHasChanges(value !== (email || ""));
  };

  const handleEmailSave = async () => {
    const result = await saveContactEmail(emailInput);
    if (result.success) {
      setEmailHasChanges(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    setPhoneInput(value);
    setPhoneHasChanges(value !== (phone || ""));
  };

  const handlePhoneSave = async () => {
    const result = await saveContactPhone(phoneInput);
    if (result.success) {
      setPhoneHasChanges(false);
    }
  };

  const isUrlValid = !urlInput || isValidWebhookUrl(urlInput);
  const isWhatsappValid = !whatsappInput || isValidWhatsAppNumber(whatsappInput);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-10 px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-4 text-foreground">Painel Administrativo</h1>
            <AdminTabs />
          </div>

          <div className="max-w-3xl space-y-6">
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

            <Card>
              <CardHeader>
                <CardTitle>Configurações do WhatsApp</CardTitle>
                <CardDescription>
                  Configure o número do WhatsApp para o botão "Wallet AI" no menu dos usuários
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {whatsappLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp-number">Número do WhatsApp</Label>
                      <Input
                        id="whatsapp-number"
                        type="tel"
                        placeholder="5511999999999"
                        value={whatsappInput}
                        onChange={(e) => handleWhatsappChange(e.target.value)}
                        className={whatsappValidationError || !isWhatsappValid ? "border-red-500" : ""}
                      />
                      {whatsappValidationError && (
                        <p className="text-sm text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" />
                          {whatsappValidationError}
                        </p>
                      )}
                      {!whatsappValidationError && whatsappInput && isWhatsappValid && (
                        <p className="text-sm text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" />
                          Número válido
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Insira apenas números (ex: 5511999999999). O número deve ter entre 10 e 15 dígitos.
                      </p>
                    </div>

                    <Alert>
                      <AlertDescription>
                        <strong>Formato:</strong> Use o formato internacional sem símbolos (código do país + DDD + número).
                        Exemplo: 5511999999999 para um número brasileiro.
                      </AlertDescription>
                    </Alert>

                    <div className="flex gap-3">
                      <Button
                        onClick={handleWhatsappSave}
                        disabled={whatsappSaving || !whatsappHasChanges || !isWhatsappValid}
                        className="flex-1"
                      >
                        {whatsappSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Salvar Número
                          </>
                        )}
                      </Button>
                    </div>

                    {whatsappHasChanges && (
                      <Alert>
                        <AlertDescription>
                          Você tem alterações não salvas.
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Configurações de Contato</CardTitle>
                <CardDescription>
                  Configure o email e telefone exibidos na landing page
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {contactLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="contact-email">Email de Contato</Label>
                        <Input
                          id="contact-email"
                          type="email"
                          placeholder="contato@wallet.cortexx.online"
                          value={emailInput}
                          onChange={(e) => handleEmailChange(e.target.value)}
                        />
                        <p className="text-sm text-muted-foreground">
                          Email exibido no rodapé da landing page
                        </p>
                      </div>

                      <Button
                        onClick={handleEmailSave}
                        disabled={contactSaving || !emailHasChanges}
                        className="w-full"
                      >
                        {contactSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Salvar Email
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="border-t pt-6 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="contact-phone">Telefone de Contato</Label>
                        <Input
                          id="contact-phone"
                          type="tel"
                          placeholder="1133333333"
                          value={phoneInput}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                        />
                        <p className="text-sm text-muted-foreground">
                          Telefone exibido no rodapé da landing page (formato: 1133333333)
                        </p>
                      </div>

                      <Button
                        onClick={handlePhoneSave}
                        disabled={contactSaving || !phoneHasChanges}
                        className="w-full"
                      >
                        {contactSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Salvar Telefone
                          </>
                        )}
                      </Button>
                    </div>
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
