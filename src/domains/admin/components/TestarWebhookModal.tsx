import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { CheckCircle, XCircle, Loader2, TestTube } from "lucide-react";
import { useWebhooksManutencao, WebhookManutencao } from "../hooks/useWebhooksManutencao";

interface TestarWebhookModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: WebhookManutencao | null;
}

const TestarWebhookModal = ({ 
  open, 
  onOpenChange,
  webhook
}: TestarWebhookModalProps) => {
  const { testarWebhook } = useWebhooksManutencao();
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<{ sucesso: boolean; mensagem: string } | null>(null);

  const handleTestar = async () => {
    if (!webhook) return;

    setTestando(true);
    setResultado(null);

    try {
      const sucesso = await testarWebhook(webhook.id);
      setResultado({
        sucesso,
        mensagem: sucesso 
          ? "Webhook testado com sucesso! Verifique se recebeu a notificação."
          : "Falha ao testar webhook. Verifique a URL e tente novamente."
      });
    } finally {
      setTestando(false);
    }
  };

  if (!webhook) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Testar Webhook</DialogTitle>
          <DialogDescription>
            Enviar uma notificação de teste para validar o webhook
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Nome:</span>
              <span className="text-sm text-muted-foreground">{webhook.nome}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status:</span>
              <Badge variant={webhook.ativo ? "default" : "secondary"} className={webhook.ativo ? "bg-green-500" : ""}>
                {webhook.ativo ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">URL:</span>
              <span className="text-sm text-muted-foreground text-right break-all">{webhook.url}</span>
            </div>
          </div>

          {resultado && (
            <Alert variant={resultado.sucesso ? "default" : "destructive"}>
              <div className="flex items-start gap-2">
                {resultado.sucesso ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
                <AlertDescription>{resultado.mensagem}</AlertDescription>
              </div>
            </Alert>
          )}

          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">Payload de Teste:</p>
            <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
{`{
  "tipo": "teste",
  "mensagem": "Este é um teste de webhook",
  "timestamp": "${new Date().toISOString()}",
  "webhook_id": "${webhook.id}"
}`}
            </pre>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={testando}
            >
              Fechar
            </Button>
            <Button
              onClick={handleTestar}
              disabled={testando}
              className="bg-purple-500 hover:bg-purple-600"
            >
              {testando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <TestTube className="w-4 h-4 mr-2" />
                  Testar Webhook
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


export default TestarWebhookModal;
