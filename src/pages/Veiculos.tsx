import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Car, Plus, Edit, Settings, Loader2, RefreshCw } from "lucide-react";
import { NovoVeiculoModal } from "@/domains/vehicles/components/NovoVeiculoModal";
import { EditarVeiculoModal } from "@/domains/vehicles/components/EditarVeiculoModal";
import { DetalhesVeiculoModal } from "@/domains/vehicles/components/DetalhesVeiculoModal";
import { GerenciarTiposManutencaoModal } from "@/domains/vehicles/components/GerenciarTiposManutencaoModal";
import { useVeiculos, Veiculo } from "@/domains/vehicles/hooks/useVeiculos";
import { useTiposManutencao } from "@/domains/vehicles/hooks/useTiposManutencao";
import { useManutencoesPendentes } from "@/domains/vehicles/hooks/useManutencoesPendentes";
import { ScrollArea } from "@/shared/components/ui/scroll-area";

export default function Veiculos() {
  const {
    veiculos,
    loading: loadingVeiculos,
    adicionarVeiculo,
    editarVeiculo,
    excluirVeiculo,
    atualizarQuilometragem,
    refetch: refetchVeiculos,
  } = useVeiculos();

  const {
    tiposManutencao,
    loading: loadingTipos,
    refetch: refetchTipos,
  } = useTiposManutencao();

  const {
    manutencoesPendentes,
    loading: loadingManutencoes,
    realizarManutencao,
    refetch: refetchManutencoes,
  } = useManutencoesPendentes(veiculos, tiposManutencao);

  const [novoVeiculoModalOpen, setNovoVeiculoModalOpen] = useState(false);
  const [editarVeiculoModalOpen, setEditarVeiculoModalOpen] = useState(false);
  const [detalhesVeiculoModalOpen, setDetalhesVeiculoModalOpen] =
    useState(false);
  const [veiculoSelecionado, setVeiculoSelecionado] = useState<Veiculo | null>(
    null
  );
  const [gerenciarTiposModalOpen, setGerenciarTiposModalOpen] = useState(false);

  const abrirDetalhes = (veiculo: Veiculo) => {
    setVeiculoSelecionado(veiculo);
    setDetalhesVeiculoModalOpen(true);
  };

  const abrirEdicao = (veiculo: Veiculo) => {
    setVeiculoSelecionado(veiculo);
    setEditarVeiculoModalOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Atrasada":
        return "bg-red-100 text-red-800 border-red-200";
      case "Em dia":
        return "bg-green-100 text-green-800 border-green-200";
      case "Pendente":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const loading = loadingVeiculos || loadingTipos || loadingManutencoes;

  const handleRefresh = () => {
    refetchVeiculos();
    refetchTipos();
    refetchManutencoes();
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Veículos
            </h1>
            <p className="text-sm md:text-base text-gray-600">
              Gerencie seus veículos e manutenções
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              disabled={loading}
              className="border-orange-500 text-orange-600 hover:bg-orange-50 w-full sm:w-auto"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Atualizar
            </Button>
            <Button
              onClick={() => setGerenciarTiposModalOpen(true)}
              variant="outline"
              className="border-orange-500 text-orange-600 hover:bg-orange-50 w-full sm:w-auto"
            >
              <Settings className="w-4 h-4 mr-2" />
              Tipos de Manutenção
            </Button>
            <Button
              onClick={() => setNovoVeiculoModalOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Veículo
            </Button>
          </div>
        </div>

        {/* Lista de Veículos */}
        {loadingVeiculos ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
            {veiculos.map((veiculo) => (
              <Card
                key={veiculo.id}
                className="hover:shadow-lg transition-shadow"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base md:text-lg font-semibold">
                    {veiculo.marca} {veiculo.modelo}
                  </CardTitle>
                  <Car className="h-5 w-5 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-gray-600">
                      <strong>Ano:</strong> {veiculo.ano}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Quilometragem:</strong>{" "}
                      {veiculo.quilometragem.toLocaleString()} km
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Combustível:</strong>{" "}
                      {veiculo.combustivel || "Não informado"}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => abrirDetalhes(veiculo)}
                      className="flex-1"
                    >
                      <Settings className="w-4 h-4 mr-1" />
                      Detalhes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => abrirEdicao(veiculo)}
                      className="flex-1"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Manutenções Pendentes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg md:text-xl">
              <Settings className="w-5 h-5 mr-2 text-orange-500" />
              Manutenções Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingManutencoes ? (
              <div className="flex justify-center items-center h-20">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            ) : (
              <ScrollArea className="h-[400px] md:h-[500px] pr-4">
                <div className="space-y-4">
                  {manutencoesPendentes.length > 0 ? (
                    manutencoesPendentes.map((manutencao) => (
                      <div
                        key={manutencao.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-lg gap-3"
                      >
                        <div className="flex-1">
                          <h4 className="font-medium text-sm md:text-base">
                            {manutencao.tipo}
                          </h4>
                          <p className="text-xs md:text-sm text-gray-600">
                            Sistema: {manutencao.sistema} •{" "}
                            {manutencao.veiculo?.marca}{" "}
                            {manutencao.veiculo?.modelo}
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                          <Badge
                            className={`${getStatusColor(
                              manutencao.status
                            )} text-xs`}
                          >
                            {manutencao.status}
                          </Badge>
                          <span className="text-xs md:text-sm text-gray-600">
                            {manutencao.proximaEm}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => realizarManutencao(manutencao)}
                            disabled={manutencao.realizada}
                            className="text-green-600 border-green-300 hover:bg-green-50 w-full sm:w-auto"
                          >
                            {manutencao.realizada ? "Realizada" : "Realizar"}
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-sm md:text-base text-gray-500 py-4">
                      Nenhuma manutenção pendente encontrada.
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Modais */}
        <NovoVeiculoModal
          open={novoVeiculoModalOpen}
          onOpenChange={setNovoVeiculoModalOpen}
          onAdicionarVeiculo={adicionarVeiculo}
        />

        <EditarVeiculoModal
          veiculo={veiculoSelecionado}
          open={editarVeiculoModalOpen}
          onOpenChange={setEditarVeiculoModalOpen}
          onEditarVeiculo={editarVeiculo}
        />

        <DetalhesVeiculoModal
          veiculo={veiculoSelecionado}
          open={detalhesVeiculoModalOpen}
          onOpenChange={setDetalhesVeiculoModalOpen}
          manutencoes={manutencoesPendentes.filter(
            (m) => m.veiculo_id === veiculoSelecionado?.id
          )}
          onExcluirVeiculo={(id) => excluirVeiculo(id)}
          onEditarVeiculo={() => {
            setDetalhesVeiculoModalOpen(false);
            setEditarVeiculoModalOpen(true);
          }}
          onAtualizarQuilometragem={(id, novaQuilometragem) =>
            atualizarQuilometragem(id, novaQuilometragem)
          }
        />

        <GerenciarTiposManutencaoModal
          open={gerenciarTiposModalOpen}
          onOpenChange={setGerenciarTiposModalOpen}
        />
      </div>
    </DashboardLayout>
  );
}
