import { useState } from "react";
import { Card } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Webhook, Trash2, Edit, TestTube } from "lucide-react";
import { useWebhooksManutencao } from "@/domains/admin/hooks/useWebhooksManutencao";
import { useToast } from "@/shared/hooks/use-toast";
import EditarWebhookManutencaoModal from "./EditarWebhookManutencaoModal";
import TestarWebhookModal from "./TestarWebhookModal";

interface WebhookManutencao {
  id: string;
  nome: string;
  url: string;
  ativo: boolean;
  dias_antecedencia_padrao: number;
  retry_attempts: number;
  retry_delay_seconds: number;
  auth_header?: string;
  created_at: string;
  updated_at: string;
}

interface WebhookManutencaoCardProps {
  webhook: WebhookManutencao;
  onUpdate?: () => void;
}

export default function WebhookManutencaoCard({ webhook, onUpdate }: WebhookManutencaoCardProps) {
  const { excluirWebhook } = useWebhooksManutencao();
  const { toast } = useToast();
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await excluirWebhook(webhook.id);
      toast({
        title: "Sucesso",
        description: "Webhook excluído com sucesso!",
      });
      setShowDeleteDialog(false);
      onUpdate?.();
    } catch (_error) {
      toast({
        title: "Erro",
        description: "Erro ao excluir webhook",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    onUpdate?.();
  };

  const handleTestSuccess = () => {
    setShowTestModal(false);
  };

  return (
    <>
      <Card className="p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-4">
          {/* Ícone e Info */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`p-2.5 rounded-xl ${webhook.ativo ? 'bg-purple-500/20' : 'bg-gray-500/20'}`}>
              <Webhook className={`w-5 h-5 ${webhook.ativo ? 'text-purple-500' : 'text-gray-500'}`} />
            </div>
            
            <div className="flex-1 min-w-0">
              {/* Nome e Status */}
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-semibold text-foreground truncate">{webhook.nome}</h4>
                <Badge 
                  variant={webhook.ativo ? "default" : "secondary"}
                  className={webhook.ativo ? "bg-green-500 hover:bg-green-600" : ""}
                >
                  {webhook.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              
              {/* URL */}
              <p className="text-sm text-muted-foreground truncate mb-3" title={webhook.url}>
                {webhook.url}
              </p>
              
              {/* Configurações */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="font-medium">Antecedência:</span>
                  <span>{webhook.dias_antecedencia_padrao} dias</span>
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="flex items-center gap-1">
                  <span className="font-medium">Tentativas:</span>
                  <span>{webhook.retry_attempts}x</span>
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="flex items-center gap-1">
                  <span className="font-medium">Delay:</span>
                  <span>{webhook.retry_delay_seconds}s</span>
                </span>
                {webhook.auth_header && (
                  <>
                    <span className="hidden sm:inline">•</span>
                    <span className="flex items-center gap-1">
                      <span className="font-medium">Auth:</span>
                      <span className="text-green-500">✓</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setShowTestModal(true)}
              className="h-8"
            >
              <TestTube className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Testar</span>
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setShowEditModal(true)}
              className="h-8"
            >
              <Edit className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Editar</span>
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              className="h-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Excluir</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Modal de Edição */}
      <EditarWebhookManutencaoModal
        webhook={webhook}
        open={showEditModal}
        onOpenChange={setShowEditModal}
        onSuccess={handleEditSuccess}
      />

      {/* Modal de Teste */}
      <TestarWebhookModal
        webhook={webhook}
        open={showTestModal}
        onOpenChange={setShowTestModal}
        onSuccess={handleTestSuccess}
      />

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o webhook <strong>{webhook.nome}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
