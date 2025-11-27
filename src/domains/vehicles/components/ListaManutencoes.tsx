import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
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
import { 
  Wrench, 
  Trash2, 
  CheckCircle, 
  Bell, 
  BellOff,
  Edit,
  Tag,
  Sparkles,
  AlertTriangle
} from "lucide-react";
import { usePlanosManutencao } from "../hooks/usePlanosManutencao";
import { useManutencoesCustomizadas } from "../hooks/useManutencoesCustomizadas";
import { useLembretesManutencao } from "../hooks/useLembretesManutencao";
import { useToast } from "@/shared/hooks/use-toast";

interface ListaManutencoesProps {
  veiculoId: string;
}

export const ListaManutencoes = ({ veiculoId }: ListaManutencoesProps) => {
  const { toast } = useToast();
  const { planos, loading: loadingPlanos, removerPlano } = usePlanosManutencao(veiculoId);
  const { customizadas, loading: loadingCustomizadas, removerCustomizada } = useManutencoesCustomizadas(veiculoId);
  const { lembretes, loading: loadingLembretes } = useLembretesManutencao(veiculoId);
  
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'plano' | 'customizada' | null;
    id: string | null;
    nome: string | null;
  }>({
    open: false,
    type: null,
    id: null,
    nome: null
  });

  const loading = loadingPlanos || loadingCustomizadas || loadingLembretes;

  // Verificar se uma manutenção tem lembrete ativo
  const temLembreteAtivo = (manutencaoId: string, tipo: 'plano' | 'customizada') => {
    return lembretes.some(
      l => l.manutencao_id === manutencaoId && 
           l.tipo_manutencao === tipo && 
           l.status === 'pendente'
    );
  };

  const handleRemoverPlano = async (id: string, nome: string) => {
    setConfirmDialog({
      open: true,
      type: 'plano',
      id,
      nome
    });
  };

  const handleRemoverCustomizada = async (id: string, nome: string) => {
    setConfirmDialog({
      open: true,
      type: 'customizada',
      id,
      nome
    });
  };

  const confirmarRemocao = async () => {
    if (!confirmDialog.id || !confirmDialog.type) return;

    setRemovendo(confirmDialog.id);
    try {
      if (confirmDialog.type === 'plano') {
        await removerPlano(confirmDialog.id);
        toast({
          title: "Manutenção Removida",
          description: `"${confirmDialog.nome}" foi removida do plano.`,
        });
      } else {
        await removerCustomizada(confirmDialog.id);
        toast({
          title: "Manutenção Removida",
          description: `"${confirmDialog.nome}" foi removida.`,
        });
      }
    } catch (error) {
      toast({
        title: "Erro ao Remover",
        description: "Não foi possível remover a manutenção. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setRemovendo(null);
      setConfirmDialog({ open: false, type: null, id: null, nome: null });
    }
  };

  const handleRealizarManutencao = (nome: string) => {
    toast({
      title: "Em desenvolvimento",
      description: `Funcionalidade de realizar manutenção "${nome}" será implementada em breve.`,
    });
  };

  const handleEditarManutencao = (nome: string) => {
    toast({
      title: "Em desenvolvimento",
      description: `Funcionalidade de editar manutenção "${nome}" será implementada em breve.`,
    });
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </Card>
        ))}
      </div>
    );
  }

  const totalManutencoes = planos.length + customizadas.length;

  if (totalManutencoes === 0) {
    return (
      <Card className="border-dashed">
        <div className="p-8 text-center">
          <Wrench className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            Nenhuma manutenção configurada para este veículo
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Clique em "Adicionar Manutenção" para começar
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {/* Manutenções do Plano */}
      {planos.map((plano) => {
        const temLembrete = temLembreteAtivo(plano.id, 'plano');
        const isRemovendo = removendo === plano.id;

        return (
          <Card 
            key={plano.id} 
            className="p-4 hover:shadow-md transition-shadow border-l-4 border-l-blue-500"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-4 h-4 text-blue-500 shrink-0" />
                  <h5 className="font-semibold text-sm truncate">
                    {plano.tipo_manutencao?.nome || 'Tipo não encontrado'}
                  </h5>
                  <Badge 
                    variant="outline" 
                    className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                  >
                    Plano
                  </Badge>
                  {temLembrete && (
                    <Badge 
                      variant="outline" 
                      className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
                    >
                      <Bell className="w-3 h-3 mr-1" />
                      Lembrete
                    </Badge>
                  )}
                  {!plano.ativo && (
                    <Badge 
                      variant="outline" 
                      className="text-xs bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30"
                    >
                      Inativo
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Sistema: {plano.tipo_manutencao?.sistema || 'N/A'}</span>
                  <span>•</span>
                  <span>Intervalo: {plano.intervalo_km.toLocaleString()} km</span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleEditarManutencao(plano.tipo_manutencao?.nome || 'manutenção')}
                  className="h-8 px-2 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                  title="Editar"
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRealizarManutencao(plano.tipo_manutencao?.nome || 'manutenção')}
                  className="h-8 px-2 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                  title="Realizar"
                >
                  <CheckCircle className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoverPlano(plano.id, plano.tipo_manutencao?.nome || 'manutenção')}
                  disabled={isRemovendo}
                  className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        );
      })}

      {/* Manutenções Customizadas */}
      {customizadas.map((customizada) => {
        const temLembrete = temLembreteAtivo(customizada.id, 'customizada');
        const isRemovendo = removendo === customizada.id;

        return (
          <Card 
            key={customizada.id} 
            className="p-4 hover:shadow-md transition-shadow border-l-4 border-l-purple-500"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-purple-500 shrink-0" />
                  <h5 className="font-semibold text-sm truncate">
                    {customizada.nome}
                  </h5>
                  <Badge 
                    variant="outline" 
                    className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
                  >
                    Customizada
                  </Badge>
                  {temLembrete && (
                    <Badge 
                      variant="outline" 
                      className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
                    >
                      <Bell className="w-3 h-3 mr-1" />
                      Lembrete
                    </Badge>
                  )}
                  {!customizada.ativo && (
                    <Badge 
                      variant="outline" 
                      className="text-xs bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30"
                    >
                      Inativo
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {customizada.sistema && (
                    <>
                      <span>Sistema: {customizada.sistema}</span>
                      <span>•</span>
                    </>
                  )}
                  {customizada.intervalo_km && (
                    <span>Intervalo: {customizada.intervalo_km.toLocaleString()} km</span>
                  )}
                  {customizada.data_prevista && (
                    <>
                      {customizada.intervalo_km && <span>•</span>}
                      <span>
                        Prevista: {new Date(customizada.data_prevista + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleEditarManutencao(customizada.nome)}
                  className="h-8 px-2 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                  title="Editar"
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRealizarManutencao(customizada.nome)}
                  className="h-8 px-2 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                  title="Realizar"
                >
                  <CheckCircle className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoverCustomizada(customizada.id, customizada.nome)}
                  disabled={isRemovendo}
                  className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        );
      })}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, type: null, id: null, nome: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Confirmar Remoção
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a manutenção <strong>"{confirmDialog.nome}"</strong>?
              <br />
              <br />
              Esta ação não pode ser desfeita. Os lembretes associados também serão cancelados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarRemocao}
              className="bg-red-500 hover:bg-red-600"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
