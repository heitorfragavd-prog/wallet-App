import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  Car,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Clock,
  Wrench,
  Gauge,
  Fuel,
  Calendar,
  Palette,
  CreditCard,
  Settings,
} from "lucide-react";
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
  onRealizarManutencao?: (manutencao: ManutencaoPendente) => void;
}

export const DetalhesVeiculoModal = ({
  veiculo,
  open,
  onOpenChange,
  manutencoes,
  onExcluirVeiculo,
  onEditarVeiculo,
  onAtualizarQuilometragem,
  onRealizarManutencao,
}: DetalhesVeiculoModalProps) => {
  const [quilometragemModalOpen, setQuilometragemModalOpen] = useState(false);
  const [realizando, setRealizando] = useState<string | null>(null);

  const handleExcluir = () => {
    if (veiculo) {
      onExcluirVeiculo(veiculo.id);
      onOpenChange(false);
    }
  };

  const handleRealizarManutencao = async (manutencao: ManutencaoPendente) => {
    if (!onRealizarManutencao) return;
    
    setRealizando(manutencao.id);
    try {
      await onRealizarManutencao(manutencao);
    } finally {
      setRealizando(null);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "Atrasada":
        return { color: "bg-red-500", bgLight: "bg-red-500/10", text: "text-red-600 dark:text-red-400", icon: AlertTriangle };
      case "Em dia":
        return { color: "bg-green-500", bgLight: "bg-green-500/10", text: "text-green-600 dark:text-green-400", icon: CheckCircle };
      case "Pendente":
        return { color: "bg-yellow-500", bgLight: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", icon: Clock };
      default:
        return { color: "bg-gray-500", bgLight: "bg-gray-500/10", text: "text-gray-600", icon: Clock };
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Não informada";
    const date = new Date(dateString + "T12:00:00");
    return date.toLocaleDateString("pt-BR");
  };

  // Estatísticas de manutenção
  const manutencoesAtrasadas = manutencoes.filter((m) => m.status === "Atrasada").length;
  const manutencoesPendentes = manutencoes.filter((m) => m.status === "Pendente").length;
  const manutencoesEmDia = manutencoes.filter((m) => m.status === "Em dia").length;

  if (!veiculo) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto [&>button]:hidden p-0">
          {/* Header */}
          <DialogHeader className="p-6 pb-4 border-b border-border bg-gradient-to-r from-orange-500/10 to-amber-500/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20">
                  <Car className="w-6 h-6 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold">
                    {veiculo.marca} {veiculo.modelo} {veiculo.ano}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {veiculo.placa} • {veiculo.combustivel || "Combustível não informado"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onEditarVeiculo} className="h-9">
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-9">
                  Fechar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExcluir}
                  className="h-9 text-red-600 dark:text-red-400 border-red-500/50 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/20">
                      <Gauge className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Quilometragem</p>
                      <p className="text-lg font-bold text-blue-500">{veiculo.quilometragem.toLocaleString()} km</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={`border-0 ${manutencoesAtrasadas > 0 ? "bg-gradient-to-br from-red-500/10 to-red-500/5" : "bg-gradient-to-br from-green-500/10 to-green-500/5"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${manutencoesAtrasadas > 0 ? "bg-red-500/20" : "bg-green-500/20"}`}>
                      {manutencoesAtrasadas > 0 ? (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Atrasadas</p>
                      <p className={`text-lg font-bold ${manutencoesAtrasadas > 0 ? "text-red-500" : "text-green-500"}`}>
                        {manutencoesAtrasadas}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-yellow-500/20">
                      <Clock className="w-4 h-4 text-yellow-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pendentes</p>
                      <p className="text-lg font-bold text-yellow-500">{manutencoesPendentes}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/20">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Em dia</p>
                      <p className="text-lg font-bold text-green-500">{manutencoesEmDia}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Informações do Veículo */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Car className="w-5 h-5 text-orange-500" />
                  <h3 className="font-semibold">Informações do Veículo</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Car className="w-3 h-3" /> Marca
                    </p>
                    <p className="font-medium">{veiculo.marca}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Settings className="w-3 h-3" /> Modelo
                    </p>
                    <p className="font-medium">{veiculo.modelo}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Ano
                    </p>
                    <p className="font-medium">{veiculo.ano}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CreditCard className="w-3 h-3" /> Placa
                    </p>
                    <p className="font-medium">{veiculo.placa}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Palette className="w-3 h-3" /> Cor
                    </p>
                    <p className="font-medium">{veiculo.cor || "Não informada"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Fuel className="w-3 h-3" /> Combustível
                    </p>
                    <p className="font-medium">{veiculo.combustivel || "Não informado"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Data de Aquisição
                    </p>
                    <p className="font-medium">{formatDate(veiculo.data_aquisicao)}</p>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Gauge className="w-3 h-3" /> Quilometragem Atual
                    </p>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border-0 text-sm px-3 py-1">
                        {veiculo.quilometragem.toLocaleString()} km
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setQuilometragemModalOpen(true)}
                        className="h-8 text-green-600 dark:text-green-400 border-green-500/50 hover:bg-green-500/10"
                      >
                        <Gauge className="w-4 h-4 mr-1" />
                        Atualizar
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Manutenções Pendentes */}
            <Card className={manutencoesAtrasadas > 0 ? "border-red-500/30" : ""}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Wrench className={`w-5 h-5 ${manutencoesAtrasadas > 0 ? "text-red-500" : "text-orange-500"}`} />
                    <h3 className="font-semibold">Manutenções</h3>
                  </div>
                  {manutencoesAtrasadas > 0 && (
                    <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-0">
                      {manutencoesAtrasadas} atrasada{manutencoesAtrasadas > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>

                {manutencoes.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {manutencoes.map((manutencao) => {
                      const statusConfig = getStatusConfig(manutencao.status);
                      const StatusIcon = statusConfig.icon;
                      const isRealizando = realizando === manutencao.id;

                      return (
                        <div
                          key={manutencao.id}
                          className={`p-4 rounded-xl border transition-all ${
                            manutencao.status === "Atrasada"
                              ? "bg-red-500/5 border-red-500/20"
                              : manutencao.status === "Pendente"
                              ? "bg-yellow-500/5 border-yellow-500/20"
                              : "bg-muted/30 border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-foreground">{manutencao.tipo}</h4>
                                <Badge className={`${statusConfig.bgLight} ${statusConfig.text} border-0 text-xs`}>
                                  <StatusIcon className="w-3 h-3 mr-1" />
                                  {manutencao.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">Sistema: {manutencao.sistema}</p>
                              <p className="text-xs text-muted-foreground mt-1">{manutencao.proximaEm}</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleRealizarManutencao(manutencao)}
                              disabled={isRealizando || manutencao.realizada}
                              className={`shrink-0 ${
                                manutencao.realizada
                                  ? "bg-green-500/20 text-green-600 hover:bg-green-500/30"
                                  : "bg-green-500 hover:bg-green-600 text-white"
                              }`}
                            >
                              {isRealizando ? (
                                <>
                                  <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  Realizando...
                                </>
                              ) : manutencao.realizada ? (
                                <>
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Realizada
                                </>
                              ) : (
                                <>
                                  <Wrench className="w-4 h-4 mr-1" />
                                  Realizar
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <CheckCircle className="w-12 h-12 mb-3 text-green-500/50" />
                    <p className="font-medium">Tudo em dia!</p>
                    <p className="text-sm">Nenhuma manutenção pendente</p>
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
