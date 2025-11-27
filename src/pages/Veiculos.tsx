import { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Car,
  Plus,
  Edit,
  Settings,
  RefreshCw,
  Gauge,
  Fuel,
  Wrench,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { NovoVeiculoModal } from "@/domains/vehicles/components/NovoVeiculoModal";
import { EditarVeiculoModal } from "@/domains/vehicles/components/EditarVeiculoModal";
import { GerenciarTiposManutencaoModal } from "@/domains/vehicles/components/GerenciarTiposManutencaoModal";
import { useVeiculos, Veiculo } from "@/domains/vehicles/hooks/useVeiculos";
import { useTiposManutencao } from "@/domains/vehicles/hooks/useTiposManutencao";
import { useManutencoesPendentes } from "@/domains/vehicles/hooks/useManutencoesPendentes";

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

  const { tiposManutencao, loading: loadingTipos, refetch: refetchTipos } = useTiposManutencao();
  const { manutencoesPendentes, loading: loadingManutencoes, realizarManutencao, refetch: refetchManutencoes } = useManutencoesPendentes(veiculos, tiposManutencao);

  const [novoVeiculoModalOpen, setNovoVeiculoModalOpen] = useState(false);
  const [editarVeiculoModalOpen, setEditarVeiculoModalOpen] = useState(false);
  const [veiculoSelecionado, setVeiculoSelecionado] = useState<Veiculo | null>(null);
  const [veiculoExpandido, setVeiculoExpandido] = useState<string | null>(null);
  const [gerenciarTiposModalOpen, setGerenciarTiposModalOpen] = useState(false);
  const [realizando, setRealizando] = useState<string | null>(null);

  const stats = useMemo(() => {
    const totalVeiculos = veiculos.length;
    const manutencoesAtrasadas = manutencoesPendentes.filter((m) => m.status === "Atrasada").length;
    const manutencoesPendentesCount = manutencoesPendentes.filter((m) => m.status === "Pendente").length;
    const manutencoesEmDia = manutencoesPendentes.filter((m) => m.status === "Em dia").length;
    const kmTotal = veiculos.reduce((acc, v) => acc + v.quilometragem, 0);
    return { totalVeiculos, manutencoesAtrasadas, manutencoesPendentesCount, manutencoesEmDia, kmTotal };
  }, [veiculos, manutencoesPendentes]);

  const toggleDetalhes = (veiculoId: string) => {
    setVeiculoExpandido(veiculoExpandido === veiculoId ? null : veiculoId);
  };

  const abrirEdicao = (veiculo: Veiculo) => {
    setVeiculoSelecionado(veiculo);
    setEditarVeiculoModalOpen(true);
  };

  const handleRealizarManutencao = async (manutencao: any) => {
    setRealizando(manutencao.id);
    try {
      await realizarManutencao(manutencao);
    } finally {
      setRealizando(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Não informada";
    const date = new Date(dateString + "T12:00:00");
    return date.toLocaleDateString("pt-BR");
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

  const loading = loadingVeiculos || loadingTipos || loadingManutencoes;

  const handleRefresh = () => {
    refetchVeiculos();
    refetchTipos();
    refetchManutencoes();
  };

  // Agrupar manutenções por veículo
  const manutencoesPorVeiculo = useMemo(() => {
    const grouped: Record<string, typeof manutencoesPendentes> = {};
    manutencoesPendentes.forEach((m) => {
      const key = m.veiculo_id;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
    return grouped;
  }, [manutencoesPendentes]);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl p-3 shadow-lg shadow-orange-500/20">
                <Car className="w-6 h-6 text-white" />
              </div>
              {stats.manutencoesAtrasadas > 0 && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-2 border-background flex items-center justify-center">
                  <span className="text-[10px] text-white font-bold">{stats.manutencoesAtrasadas > 9 ? "9+" : stats.manutencoesAtrasadas}</span>
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Veículos</h1>
              <p className="text-muted-foreground">Gerencie seus veículos e manutenções</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleRefresh} variant="ghost" size="sm" disabled={loading} className="h-9">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={() => setGerenciarTiposModalOpen(true)} variant="outline" size="sm" className="h-9">
              <Settings className="w-4 h-4 mr-2" />
              Tipos
            </Button>
            <Button onClick={() => setNovoVeiculoModalOpen(true)} className="bg-orange-500 hover:bg-orange-600 h-9">
              <Plus className="w-4 h-4 mr-2" />
              Novo Veículo
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-0 bg-gradient-to-br from-orange-500/10 to-orange-500/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Veículos</p>
                  <p className="text-2xl font-bold text-orange-500">{stats.totalVeiculos}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-orange-500/20">
                  <Car className="w-5 h-5 text-orange-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`border-0 ${stats.manutencoesAtrasadas > 0 ? "bg-gradient-to-br from-red-500/10 to-red-500/5" : "bg-gradient-to-br from-green-500/10 to-green-500/5"}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Atrasadas</p>
                  <p className={`text-2xl font-bold ${stats.manutencoesAtrasadas > 0 ? "text-red-500" : "text-green-500"}`}>
                    {stats.manutencoesAtrasadas}
                  </p>
                </div>
                <div className={`p-2.5 rounded-xl ${stats.manutencoesAtrasadas > 0 ? "bg-red-500/20" : "bg-green-500/20"}`}>
                  {stats.manutencoesAtrasadas > 0 ? <AlertTriangle className="w-5 h-5 text-red-500" /> : <CheckCircle className="w-5 h-5 text-green-500" />}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                  <p className="text-2xl font-bold text-yellow-500">{stats.manutencoesPendentesCount}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-yellow-500/20">
                  <Wrench className="w-5 h-5 text-yellow-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">KM Total</p>
                  <p className="text-2xl font-bold text-blue-500">{stats.kmTotal.toLocaleString()}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-500/20">
                  <Gauge className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="veiculos" className="space-y-4">
          <TabsList className="grid grid-cols-2 w-full sm:w-auto sm:inline-flex bg-muted/50">
            <TabsTrigger value="veiculos" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              <Car className="w-4 h-4 mr-2" />
              Meus Veículos ({stats.totalVeiculos})
            </TabsTrigger>
            <TabsTrigger value="manutencoes" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white relative">
              <Wrench className="w-4 h-4 mr-2" />
              Manutenções
              {stats.manutencoesAtrasadas > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full">
                  {stats.manutencoesAtrasadas}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Tab Veículos */}
          <TabsContent value="veiculos" className="space-y-4">
            {loadingVeiculos ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="p-5">
                    <div className="space-y-3">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : veiculos.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Car className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Nenhum veículo cadastrado</p>
                  <Button onClick={() => setNovoVeiculoModalOpen(true)} variant="link" className="text-orange-500 mt-2">
                    Adicionar primeiro veículo
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {veiculos.map((veiculo) => {
                  const manutencoesVeiculo = manutencoesPorVeiculo[veiculo.id] || [];
                  const atrasadas = manutencoesVeiculo.filter((m) => m.status === "Atrasada").length;
                  const pendentes = manutencoesVeiculo.filter((m) => m.status === "Pendente").length;
                  const isExpanded = veiculoExpandido === veiculo.id;

                  return (
                    <div key={veiculo.id} className="space-y-2">
                      <Card className={`group relative overflow-hidden hover:shadow-lg transition-all duration-300 ${isExpanded ? "border-orange-500/50" : "hover:border-orange-500/30"}`}>
                        {atrasadas > 0 && <div className="absolute top-0 left-0 right-0 h-1 bg-red-500" />}
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                              <div className="p-3 rounded-xl bg-orange-500/10 shrink-0">
                                <Car className="w-6 h-6 text-orange-500" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="text-lg font-semibold text-foreground">{veiculo.marca} {veiculo.modelo}</h3>
                                <p className="text-sm text-muted-foreground">{veiculo.ano} • {veiculo.placa} • {veiculo.combustivel || "Combustível não informado"}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0">
                                <Gauge className="w-3 h-3 mr-1" />
                                {veiculo.quilometragem.toLocaleString()} km
                              </Badge>
                              {atrasadas > 0 && (
                                <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-0">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  {atrasadas}
                                </Badge>
                              )}
                              {pendentes > 0 && (
                                <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-0">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {pendentes}
                                </Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleDetalhes(veiculo.id)}
                                className="h-9 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                              >
                                <Settings className="w-4 h-4 mr-2" />
                                {isExpanded ? "Ocultar" : "Detalhes"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => abrirEdicao(veiculo)}
                                className="h-9 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                              >
                                <Edit className="w-4 h-4 mr-2" />
                                Editar
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Detalhes Expandidos */}
                      {isExpanded && (
                        <Card className="border-orange-500/30 bg-gradient-to-r from-orange-500/5 to-amber-500/5">
                          <CardContent className="p-5 space-y-5">
                            {/* Informações do Veículo */}
                            <div>
                              <h4 className="font-semibold mb-3 flex items-center gap-2">
                                <Car className="w-4 h-4 text-orange-500" />
                                Informações do Veículo
                              </h4>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <p className="text-xs text-muted-foreground">Marca</p>
                                  <p className="font-medium">{veiculo.marca}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Modelo</p>
                                  <p className="font-medium">{veiculo.modelo}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Ano</p>
                                  <p className="font-medium">{veiculo.ano}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Placa</p>
                                  <p className="font-medium">{veiculo.placa}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Cor</p>
                                  <p className="font-medium">{veiculo.cor || "Não informada"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Combustível</p>
                                  <p className="font-medium">{veiculo.combustivel || "Não informado"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Data de Aquisição</p>
                                  <p className="font-medium">{formatDate(veiculo.data_aquisicao)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">Quilometragem Atual</p>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium">{veiculo.quilometragem.toLocaleString()} km</p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const novaKm = prompt(`Atualizar quilometragem de ${veiculo.marca} ${veiculo.modelo}:`, veiculo.quilometragem.toString());
                                        if (novaKm && !isNaN(Number(novaKm))) {
                                          atualizarQuilometragem(veiculo.id, Number(novaKm));
                                        }
                                      }}
                                      className="h-6 px-2 text-xs text-blue-500 border-blue-500/50 hover:bg-blue-500/10"
                                    >
                                      <Gauge className="w-3 h-3 mr-1" />
                                      Atualizar
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Manutenções */}
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold flex items-center gap-2">
                                  <Wrench className="w-4 h-4 text-orange-500" />
                                  Manutenções ({manutencoesVeiculo.length})
                                </h4>
                                <div className="flex items-center gap-2">
                                  {atrasadas > 0 && (
                                    <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-0">
                                      {atrasadas} atrasada{atrasadas > 1 ? "s" : ""}
                                    </Badge>
                                  )}
                                  <Button
                                    size="sm"
                                    onClick={() => setGerenciarTiposModalOpen(true)}
                                    variant="outline"
                                    className="h-8 text-orange-500 border-orange-500/50 hover:bg-orange-500/10"
                                  >
                                    <Settings className="w-3.5 h-3.5 mr-1" />
                                    Gerenciar Tipos
                                  </Button>
                                </div>
                              </div>
                              {manutencoesVeiculo.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {manutencoesVeiculo.map((manutencao) => {
                                    const statusConfig = getStatusConfig(manutencao.status);
                                    const StatusIcon = statusConfig.icon;
                                    const isRealizando = realizando === manutencao.id;

                                    return (
                                      <div
                                        key={manutencao.id}
                                        className={`p-3 rounded-lg border ${
                                          manutencao.status === "Atrasada"
                                            ? "bg-red-500/5 border-red-500/20"
                                            : manutencao.status === "Pendente"
                                            ? "bg-yellow-500/5 border-yellow-500/20"
                                            : "bg-muted/30 border-border"
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                          <div className="min-w-0 flex-1">
                                            <p className="font-medium text-sm truncate">{manutencao.tipo}</p>
                                            <p className="text-xs text-muted-foreground">Sistema: {manutencao.sistema}</p>
                                          </div>
                                          <Badge className={`${statusConfig.bgLight} ${statusConfig.text} border-0 shrink-0 text-xs`}>
                                            <StatusIcon className="w-3 h-3 mr-1" />
                                            {manutencao.status}
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mb-2">{manutencao.proximaEm}</p>
                                        <Button
                                          size="sm"
                                          onClick={() => handleRealizarManutencao(manutencao)}
                                          disabled={isRealizando || manutencao.realizada}
                                          className={`w-full h-8 ${
                                            manutencao.realizada
                                              ? "bg-green-500/20 text-green-600 hover:bg-green-500/30"
                                              : "bg-green-500 hover:bg-green-600 text-white"
                                          }`}
                                        >
                                          {isRealizando ? (
                                            <>
                                              <div className="w-3 h-3 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                              Realizando...
                                            </>
                                          ) : manutencao.realizada ? (
                                            <>
                                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                              Realizada
                                            </>
                                          ) : (
                                            <>
                                              <Wrench className="w-3.5 h-3.5 mr-1" />
                                              Realizar
                                            </>
                                          )}
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-center py-6 text-muted-foreground">
                                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
                                  <p className="text-sm">Nenhuma manutenção pendente</p>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Tab Manutenções */}
          <TabsContent value="manutencoes" className="space-y-4">
            {loadingManutencoes ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ) : manutencoesPendentes.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle className="w-12 h-12 text-green-500/50 mb-4" />
                  <p className="text-muted-foreground font-medium">Todas as manutenções em dia!</p>
                  <p className="text-sm text-muted-foreground">Nenhuma manutenção pendente ou atrasada</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Manutenções Atrasadas */}
                {stats.manutencoesAtrasadas > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-red-500 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Atrasadas ({stats.manutencoesAtrasadas})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {manutencoesPendentes.filter((m) => m.status === "Atrasada").map((manutencao) => {
                        const statusConfig = getStatusConfig(manutencao.status);
                        return (
                          <Card key={manutencao.id} className="border-red-500/30 bg-red-500/5">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate">{manutencao.tipo}</p>
                                  <p className="text-sm text-muted-foreground truncate">
                                    {manutencao.veiculo?.marca} {manutencao.veiculo?.modelo}
                                  </p>
                                  <p className="text-xs text-red-500 mt-1">{manutencao.proximaEm}</p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => realizarManutencao(manutencao)}
                                  disabled={manutencao.realizada}
                                  className="shrink-0 bg-green-500 hover:bg-green-600 text-white h-8"
                                >
                                  <Wrench className="w-3.5 h-3.5 mr-1" />
                                  Realizar
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Manutenções Pendentes */}
                {stats.manutencoesPendentesCount > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-yellow-500 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Pendentes ({stats.manutencoesPendentesCount})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {manutencoesPendentes.filter((m) => m.status === "Pendente").map((manutencao) => (
                        <Card key={manutencao.id} className="border-yellow-500/30 bg-yellow-500/5">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium truncate">{manutencao.tipo}</p>
                                <p className="text-sm text-muted-foreground truncate">
                                  {manutencao.veiculo?.marca} {manutencao.veiculo?.modelo}
                                </p>
                                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">{manutencao.proximaEm}</p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => realizarManutencao(manutencao)}
                                disabled={manutencao.realizada}
                                className="shrink-0 text-green-600 border-green-500/50 hover:bg-green-500/10 h-8"
                              >
                                <Wrench className="w-3.5 h-3.5 mr-1" />
                                Realizar
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manutenções Em Dia */}
                {stats.manutencoesEmDia > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-green-500 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Em Dia ({stats.manutencoesEmDia})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {manutencoesPendentes.filter((m) => m.status === "Em dia").map((manutencao) => (
                        <Card key={manutencao.id} className="bg-muted/30">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium truncate">{manutencao.tipo}</p>
                                <p className="text-sm text-muted-foreground truncate">
                                  {manutencao.veiculo?.marca} {manutencao.veiculo?.modelo}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">{manutencao.proximaEm}</p>
                              </div>
                              <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-0 shrink-0">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                OK
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

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

        <GerenciarTiposManutencaoModal
          open={gerenciarTiposModalOpen}
          onOpenChange={setGerenciarTiposModalOpen}
        />
      </div>
    </DashboardLayout>
  );
}
