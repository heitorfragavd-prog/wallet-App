import { useState, useEffect } from "react";
import { AdminLayoutModern } from "@/domains/admin/components/AdminLayoutModern";
import { AdminPageHeader } from "@/domains/admin/components/AdminPageHeader";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useWhatsAppSettings } from "@/domains/admin/hooks/useWhatsAppSettings";
import { useContactSettings } from "@/domains/admin/hooks/useContactSettings";
import { Loader2, Save, AlertCircle, CheckCircle, Settings, MessageCircle, Mail, Phone } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { EyemobileSettingsCard } from "@/domains/admin/components/EyemobileSettingsCard";

export default function AdminWebhookSettings() {
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

  const [whatsappInput, setWhatsappInput] = useState("");
  const [whatsappValidationError, setWhatsappValidationError] = useState<string | null>(null);
  const [whatsappHasChanges, setWhatsappHasChanges] = useState(false);

  const [emailInput, setEmailInput] = useState("");
  const [emailHasChanges, setEmailHasChanges] = useState(false);

  const [phoneInput, setPhoneInput] = useState("");
  const [phoneHasChanges, setPhoneHasChanges] = useState(false);

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

  const handleWhatsappChange = (value: string) => {
    setWhatsappInput(value);
    setWhatsappHasChanges(value !== (whatsappNumber || ""));
    
    if (whatsappValidationError) {
      setWhatsappValidationError(null);
    }
  };

  const handleWhatsappSave = async () => {
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

  const isWhatsappValid = !whatsappInput || isValidWhatsAppNumber(whatsappInput);

  return (
    <AdminLayoutModern>
      <AdminPageHeader
        title="Configurações"
        subtitle="Configure WhatsApp, informações de contato e integrações"
        icon={Settings}
        iconColor="bg-orange-500"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Integrações' },
          { label: 'Configurações' }
        ]}
      />

      <div className="max-w-3xl space-y-6">
        {/* WhatsApp */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <MessageCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <CardTitle>Configurações do WhatsApp</CardTitle>
                <CardDescription>
                  Configure o número do WhatsApp para o botão "Wallet AI" no menu dos usuários
                </CardDescription>
              </div>
            </div>
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

                <Button
                  onClick={handleWhatsappSave}
                  disabled={whatsappSaving || !whatsappHasChanges || !isWhatsappValid}
                  className="w-full"
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

        {/* Contato */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Mail className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle>Configurações de Contato</CardTitle>
                <CardDescription>
                  Configure o email e telefone exibidos na landing page
                </CardDescription>
              </div>
            </div>
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
                    <Label htmlFor="contact-email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email de Contato
                    </Label>
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
                    <Label htmlFor="contact-phone" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Telefone de Contato
                    </Label>
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

        {/* Eyemobile Settings Card */}
        <EyemobileSettingsCard />
      </div>
    </AdminLayoutModern>
  );
}
