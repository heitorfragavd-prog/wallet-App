import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Car, Edit, Trash2, AlertTriangle, Settings } from "lucide-react";
import { useState } from "react";
import { AtualizarQuilometragemModal } from "./AtualizarQuilometragemModal";
import { Veiculo } from "@/domains/vehicles/hooks/useVeiculos";
import { ManutencaoPendente } from "@/domains/vehicles/hooks/useManutencoesPendentes";

interface DetalhesVeiculoModalProps {
  veiculo: Veiculo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manutencoes: ManutencaoPendente[];
  onExcluirVeiculo: (id: string) => void;
  onEditarVeiculo: () => void;
  onAtualizarQuilometragem: (id: string, novaQuilometragem: number) => void;
}

export const DetalhesVeiculoModal = ({ 
  veiculo, 
  open, 
  onOpenChange, 
  manutencoes, 
  onExcluirVeiculo, 
  onEditarVeiculo,
  onAtualizarQuilometragem
}: DetalhesVeiculoModalProps) => {
  const [quilometragemModalOpen, setQuilometragemModalOpen] = useState(false);

  const handleExcluir = () => {
    if (veiculo) {
      onExcluirVeiculo(veiculo.id);
      onOpenChange(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Atrasada":
        return "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30";
      case "Em dia":
        return "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30";
      case "Pendente":
        return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  if (!veiculo) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto [&>button]:hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center">
                <Car className="w-6 h-6 mr-2 text-orange-500" />
                {veiculo.marca} {veiculo.modelo} {veiculo.ano}
              </DialogTitle>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditarVeiculo}
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExcluir}
                  className="text-red-600 dark:text-red-400 border-red-500/50 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Excluir
                </Button>
              </div>
            </div>
            <p className="text-muted-foreground">Gerenciamento de manutenções e histórico do veículo</p>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Informações do Veículo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Car className="w-5 h-5 mr-2 text-orange-500" />
                  Informações do Veículo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Marca:</p>
                    <p className="font-medium">{veiculo.marca}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Modelo:</p>
                    <p className="font-medium">{veiculo.modelo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ano:</p>
                    <p className="font-medium">{veiculo.ano}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Placa:</p>
                    <p className="font-medium">{veiculo.placa}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cor:</p>
                    <p className="font-medium">{veiculo.cor}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Combustível:</p>
                    <p className="font-medium">{veiculo.combustivel}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Data de aquisição:</p>
                    <p className="font-medium">{veiculo.data_aquisicao || "Não informada"}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-muted-foreground">Quilometragem:</p>
                    <div className="flex items-center space-x-2">
                      <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30">
                        {veiculo.quilometragem.toLocaleString()} km
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setQuilometragemModalOpen(true)}
                        className="text-green-600 dark:text-green-400 border-green-500/50 hover:bg-green-500/10"
                      >
                        Atualizar Quilometragem
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Manutenções Pendentes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" />
                  Manutenções Pendentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {manutencoes.length > 0 ? (
                  <div className="space-y-3">
                    {manutencoes.map((manutencao) => (
                      <div key={manutencao.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                        <div>
                          <h4 className="font-medium text-foreground">{manutencao.tipo}</h4>
                          <p className="text-sm text-muted-foreground">Sistema: {manutencao.sistema}</p>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Badge className={getStatusColor(manutencao.status)}>
                            {manutencao.status}
                          </Badge>
                          <span className="text-sm text-muted-foreground">{manutencao.proximaEm}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 dark:text-green-400 border-green-500/50 hover:bg-green-500/10"
                          >
                            Realizar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Settings className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                    <p>Nenhuma manutenção pendente</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <AtualizarQuilometragemModal
        veiculo={veiculo}
        open={quilometragemModalOpen}
        onOpenChange={setQuilometragemModalOpen}
        onAtualizarQuilometragem={onAtualizarQuilometragem}
      />
    </>
  );
};
