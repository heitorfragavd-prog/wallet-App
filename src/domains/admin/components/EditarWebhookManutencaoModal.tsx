import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { useToast } from "@/shared/hooks/use-toast";
import { useWebhooksManutencao, WebhookManutencao } from "../hooks/useWebhooksManutencao";

interface EditarWebhookManutencaoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: WebhookManutencao | null;
}

const EditarWebhookManutencaoModal = ({ 
  open, 
  onOpenChange,
  webhook
}: EditarWebhookManutencaoModalProps) => {
  const { toast } = useToast();
  const { atualizarWebhook } = useWebhooksManutencao();
  
  const [formData, setFormData] = useState({
    nome: '',
    url: '',
    ativo: true,
    dias_antecedencia_padrao: '7',
    retry_attempts: '3',
    retry_delay_seconds: '300',
    auth_header: ''
  });
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (webhook) {
      setFormData({
        nome: webhook.nome,
        url: webhook.url,
        ativo: webhook.ativo,
        dias_antecedencia_padrao: webhook.dias_antecedencia_padrao.toString(),
        retry_attempts: webhook.retry_attempts.toString(),
        retry_delay_seconds: webhook.retry_delay_seconds.toString(),
        auth_header: webhook.auth_header || ''
      });
    }
  }, [webhook]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!webhook) return;

    if (!formData.nome.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, informe o nome do webhook.",
        variant: "destructive"
      });
      return;
    }

    if (!formData.url.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, informe a URL do webhook.",
        variant: "destructive"
      });
      return;
    }

    // Validar URL
    try {
      new URL(formData.url);
    } catch {
      toast({
        title: "Erro",
        description: "URL inválida. Por favor, informe uma URL válida.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const resultado = await atualizarWebhook({
        id: webhook.id,
        nome: formData.nome.trim(),
        url: formData.url.trim(),
        ativo: formData.ativo,
        dias_antecedencia_padrao: Number(formData.dias_antecedencia_padrao),
        retry_attempts: Number(formData.retry_attempts),
        retry_delay_seconds: Number(formData.retry_delay_seconds),
        auth_header: formData.auth_header.trim() || undefined
      });

      if (resultado) {
        onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!webhook) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Webhook de Manutenção</DialogTitle>
          <DialogDescription>
            Atualize as configurações do webhook
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
              placeholder="Ex: Webhook Principal"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL do Webhook *</Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              placeholder="https://exemplo.com/webhook"
            />
            <p className="text-xs text-muted-foreground">
              URL que receberá as notificações via POST
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dias_antecedencia">Dias de Antecedência</Label>
              <Input
                id="dias_antecedencia"
                type="number"
                min="0"
                value={formData.dias_antecedencia_padrao}
                onChange={(e) => setFormData(prev => ({ ...prev, dias_antecedencia_padrao: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Padrão: 7 dias
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="retry_attempts">Tentativas</Label>
              <Input
                id="retry_attempts"
                type="number"
                min="1"
                max="10"
                value={formData.retry_attempts}
                onChange={(e) => setFormData(prev => ({ ...prev, retry_attempts: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Padrão: 3 tentativas
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="retry_delay">Delay (segundos)</Label>
              <Input
                id="retry_delay"
                type="number"
                min="0"
                value={formData.retry_delay_seconds}
                onChange={(e) => setFormData(prev => ({ ...prev, retry_delay_seconds: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Padrão: 300s (5 min)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="auth_header">Header de Autenticação (opcional)</Label>
            <Input
              id="auth_header"
              value={formData.auth_header}
              onChange={(e) => setFormData(prev => ({ ...prev, auth_header: e.target.value }))}
              placeholder="Bearer seu-token-aqui"
            />
            <p className="text-xs text-muted-foreground">
              Será enviado no header Authorization
            </p>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div className="space-y-0.5">
              <Label htmlFor="ativo">Webhook Ativo</Label>
              <p className="text-sm text-muted-foreground">
                Ativar ou desativar webhook
              </p>
            </div>
            <Switch
              id="ativo"
              checked={formData.ativo}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, ativo: checked }))}
            />
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-purple-500 hover:bg-purple-600"
            >
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};


export default EditarWebhookManutencaoModal;
