import { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Progress } from "@/shared/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";
import {
  Search,
  Plus,
  AlertTriangle,
  Calendar,
  DollarSign,
  CreditCard,
  Edit,
  Trash2,
  X,
  Clock,
  CheckCircle2,
  Wallet,
  Building2,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { useDividas } from "@/domains/finance/hooks/useDividas";
import { EditarDividaModal } from "@/domains/finance/components/EditarDividaModal";
import { ReminderStatusBadge } from "@/domains/finance/components/ReminderStatusBadge";
import { ReminderSelector } from "@/domains/finance/components/ReminderSelector";
import { useDebtReminders } from "@/domains/finance/hooks/useDebtReminders";

interface DebtReminderInfo {
  id: string;
  reminder_hours: number;
  trigger_at: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string;
}

interface Divida {
  id: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  valor_restante: number;
  data_vencimento: string;
  parcelas: number;
  parcelas_pagas: number;
  status: "pendente" | "vencida" | "quitada";
  categoria_id?: string;
  credor: string;
  categorias?: { id: string; nome: string };
  debt_reminders?: DebtReminderInfo[];
  created_at?: string;
}

// Função para formatar data
const formatarData = (dataString: string) => {
  if (!dataString) return "";
  const [ano, mes, dia] = dataString.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
};

const Dividas = () => {
  const { toast } = useToast();
  const { categoriasDespesa } = useCategorias();
  const { dividas, loading, createDivida, updateDivida, deleteDivida } = useDividas();
  const { createReminder } = useDebtReminders();
  const [activeTab, setActiveTab] = useState("lista");
  const [dividaEditando, setDividaEditando] = useState<Divida | null>(null);
  const [modalEditarAberto, setModalEditarAberto] = useState(false);

  const [filtro, setFiltro] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");

  // Formulário para nova dívida
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novoValorTotal, setNovoValorTotal] = useState("");
  const [novaDataVencimento, setNovaDataVencimento] = useState("");
  const [novasParcelas, setNovasParcelas] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [novoCredor, setNovoCredor] = useState("");
  const [novoReminderHours, setNovoReminderHours] = useState<number | null>(null);

  // Dados processados
  const { dividasFiltradas, totalDividas, dividasVencidas, dividasPendentes, dividasQuitadas, categorias, totalPago, progressoGeral } = useMemo(() => {
    const filtradas = dividas
      .filter((d) => {
        const matchDescricao = d.descricao.toLowerCase().includes(filtro.toLowerCase());
        const matchStatus = statusFiltro === "" || d.status === statusFiltro;
        const matchCategoria = categoriaFiltro === "" || d.categorias?.nome === categoriaFiltro;
        return matchDescricao && matchStatus && matchCategoria;
      })
      .sort((a, b) => {
        // Prioridade: 1. Vencidas primeiro, 2. Pendentes por proximidade de vencimento, 3. Quitadas por último
        const statusPriority: { [key: string]: number } = { vencida: 0, pendente: 1, quitada: 2 };
        const priorityA = statusPriority[a.status] ?? 1;
        const priorityB = statusPriority[b.status] ?? 1;
        
        if (priorityA !== priorityB) return priorityA - priorityB;
        
        // Dentro do mesmo status, ordenar por data de vencimento (mais próxima primeiro)
        return new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime();
      });

    const total = dividas.reduce((sum, d) => sum + d.valor_restante, 0);
    const pago = dividas.reduce((sum, d) => sum + d.valor_pago, 0);
    const totalGeral = dividas.reduce((sum, d) => sum + d.valor_total, 0);
    const vencidas = dividas.filter((d) => d.status === "vencida").length;
    const pendentes = dividas.filter((d) => d.status === "pendente").length;
    const quitadas = dividas.filter((d) => d.status === "quitada").length;
    const cats = [...new Set(dividas.map((d) => d.categorias?.nome).filter(Boolean))];

    return {
      dividasFiltradas: filtradas,
      totalDividas: total,
      dividasVencidas: vencidas,
      dividasPendentes: pendentes,
      dividasQuitadas: quitadas,
      categorias: cats,
      totalPago: pago,
      progressoGeral: totalGeral > 0 ? (pago / totalGeral) * 100 : 0,
    };
  }, [dividas, filtro, statusFiltro, categoriaFiltro]);

  const limparFiltros = () => {
    setFiltro("");
    setStatusFiltro("");
    setCategoriaFiltro("");
  };

  const temFiltrosAtivos = filtro !== "" || statusFiltro !== "" || categoriaFiltro !== "";

  const handleAdicionarDivida = async () => {
    if (!novaDescricao || !novoValorTotal || !novaDataVencimento || !novasParcelas || !novaCategoria || !novoCredor) {
      toast({ title: "Erro", description: "Por favor, preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    const categoria = categoriasDespesa.find((c) => c.nome === novaCategoria);
    const result = await createDivida({
      descricao: novaDescricao,
      valor_total: parseFloat(novoValorTotal),
      valor_pago: 0,
      valor_restante: parseFloat(novoValorTotal),
      data_vencimento: novaDataVencimento,
      parcelas: parseInt(novasParcelas),
      parcelas_pagas: 0,
      status: new Date(novaDataVencimento) < new Date() ? "vencida" : "pendente",
      categoria_id: categoria?.id,
      credor: novoCredor,
    });

    if (result?.data?.id && novoReminderHours !== null && novoReminderHours > 0) {
      await createReminder(result.data.id, novoReminderHours, novaDataVencimento);
    }

    setNovaDescricao(""); setNovoValorTotal(""); setNovaDataVencimento("");
    setNovasParcelas(""); setNovaCategoria(""); setNovoCredor(""); setNovoReminderHours(null);
    setActiveTab("lista");
  };

  const handleCancelar = () => {
    setNovaDescricao(""); setNovoValorTotal(""); setNovaDataVencimento("");
    setNovasParcelas(""); setNovaCategoria(""); setNovoCredor(""); setNovoReminderHours(null);
    setActiveTab("lista");
  };

  const handleExcluirDivida = async (id: string) => { await deleteDivida(id); };

  const handleEditarDivida = (id: string) => {
    const divida = dividas.find((d) => d.id === id);
    if (divida) { setDividaEditando(divida); setModalEditarAberto(true); }
  };

  const handleSalvarEdicao = async (dividaEditada: Divida) => {
    const categoria = categoriasDespesa.find((c) => c.nome === dividaEditada.categoria);
    await updateDivida(dividaEditada.id, {
      descricao: dividaEditada.descricao, valor_total: dividaEditada.valor_total,
      valor_pago: dividaEditada.valor_pago, data_vencimento: dividaEditada.data_vencimento,
      parcelas: dividaEditada.parcelas, parcelas_pagas: dividaEditada.parcelas_pagas,
      status: dividaEditada.status, categoria_id: categoria?.id, credor: dividaEditada.credor,
    });
    setDividaEditando(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pendente": return <Badge className="bg-yellow-500/20 text-yellow-600 border-0 hover:bg-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
      case "vencida": return <Badge className="bg-red-500/20 text-red-600 border-0 hover:bg-red-500/30"><AlertTriangle className="w-3 h-3 mr-1" />Vencida</Badge>;
      case "quitada": return <Badge className="bg-green-500/20 text-green-600 border-0 hover:bg-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Quitada</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-3 shadow-lg shadow-rose-500/20">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dívidas</h1>
              <p className="text-muted-foreground">Controle e gerenciamento de dívidas</p>
            </div>
          </div>
          <Button onClick={() => setActiveTab("adicionar")} className="bg-rose-500 hover:bg-rose-600">
            <Plus className="w-4 h-4 mr-2" />
            Nova Dívida
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 bg-gradient-to-br from-rose-500/10 to-rose-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total a Pagar</p>
                  {loading ? <Skeleton className="h-8 w-32" /> : (
                    <p className="text-2xl font-bold text-rose-500">
                      R$ {totalDividas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-rose-500/20">
                  <DollarSign className="w-5 h-5 text-rose-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-red-500/10 to-red-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Vencidas</p>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <p className="text-2xl font-bold text-red-500">{dividasVencidas}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-red-500/20">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Pendentes</p>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <p className="text-2xl font-bold text-yellow-600">{dividasPendentes}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-yellow-500/20">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Quitadas</p>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <p className="text-2xl font-bold text-green-500">{dividasQuitadas}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-green-500/20">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Progresso Geral */}
        {!loading && dividas.length > 0 && (
          <Card className="border-0 bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-pink-500/10">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Progresso de Quitação</p>
                  <p className="text-xs text-muted-foreground">
                    R$ {totalPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} pagos de R$ {(totalPago + totalDividas).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <Badge className="bg-violet-500/20 text-violet-600 border-0">{progressoGeral.toFixed(0)}%</Badge>
              </div>
              <Progress value={progressoGeral} className="h-2" />
            </CardContent>
          </Card>
        )}


        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="lista" className="data-[state=active]:bg-rose-500 data-[state=active]:text-white">
              Lista de Dívidas
            </TabsTrigger>
            <TabsTrigger value="adicionar" className="data-[state=active]:bg-rose-500 data-[state=active]:text-white">
              Adicionar Dívida
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="space-y-4">
            {/* Filtros */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input placeholder="Buscar dívidas..." value={filtro} onChange={(e) => setFiltro(e.target.value)} className="pl-10" />
                  </div>
                  <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}
                    className="h-10 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
                    <option value="">Todos os status</option>
                    <option value="pendente">Pendentes</option>
                    <option value="vencida">Vencidas</option>
                    <option value="quitada">Quitadas</option>
                  </select>
                  <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}
                    className="h-10 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
                    <option value="">Todas as categorias</option>
                    {categorias.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  {temFiltrosAtivos && (
                    <Button variant="outline" size="sm" onClick={limparFiltros} className="h-10">
                      <X className="w-4 h-4 mr-1" />Limpar
                    </Button>
                  )}
                </div>
                {temFiltrosAtivos && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span className="text-xs text-muted-foreground">Filtros ativos:</span>
                    {filtro && <Badge variant="secondary" className="text-xs">Busca: {filtro}<button onClick={() => setFiltro("")} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button></Badge>}
                    {statusFiltro && <Badge variant="secondary" className="text-xs">{statusFiltro === "pendente" ? "Pendentes" : statusFiltro === "vencida" ? "Vencidas" : "Quitadas"}<button onClick={() => setStatusFiltro("")} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button></Badge>}
                    {categoriaFiltro && <Badge variant="secondary" className="text-xs">{categoriaFiltro}<button onClick={() => setCategoriaFiltro("")} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button></Badge>}
                    <span className="text-xs text-muted-foreground ml-2">{dividasFiltradas.length} resultado{dividasFiltradas.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lista Desktop */}
            <div className="hidden md:block">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-semibold">Descrição</TableHead>
                        <TableHead className="font-semibold">Credor</TableHead>
                        <TableHead className="font-semibold">Parcelas</TableHead>
                        <TableHead className="font-semibold">Vencimento</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Lembrete</TableHead>
                        <TableHead className="font-semibold text-right">Valor Restante</TableHead>
                        <TableHead className="font-semibold text-center w-24">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        [...Array(5)].map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                            <TableCell><Skeleton className="h-8 w-16 mx-auto" /></TableCell>
                          </TableRow>
                        ))
                      ) : dividasFiltradas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            <Wallet className="w-10 h-10 mx-auto mb-2 opacity-20" />
                            Nenhuma dívida encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        dividasFiltradas.map((divida) => (
                          <TableRow key={divida.id} className="group">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${divida.status === "vencida" ? "bg-red-500/10" : divida.status === "quitada" ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
                                  <CreditCard className={`w-4 h-4 ${divida.status === "vencida" ? "text-red-500" : divida.status === "quitada" ? "text-green-500" : "text-yellow-600"}`} />
                                </div>
                                <div>
                                  <span className="font-medium">{divida.descricao}</span>
                                  <p className="text-xs text-muted-foreground">{divida.categorias?.nome || "Sem categoria"}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-sm">{divida.credor}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <span className="text-sm">{divida.parcelas_pagas}/{divida.parcelas}</span>
                                <Progress value={(divida.parcelas_pagas / divida.parcelas) * 100} className="h-1 w-16" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Calendar className="w-3.5 h-3.5" />
                                <span className="text-sm">{formatarData(divida.data_vencimento)}</span>
                              </div>
                            </TableCell>
                            <TableCell>{getStatusBadge(divida.status)}</TableCell>
                            <TableCell>
                              {divida.debt_reminders && divida.debt_reminders.length > 0 && (
                                <ReminderStatusBadge status={divida.debt_reminders[0].status} triggerAt={divida.debt_reminders[0].trigger_at} sentAt={divida.debt_reminders[0].sent_at} />
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-semibold text-rose-500">R$ {divida.valor_restante.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="sm" onClick={() => handleEditarDivida(divida.id)} className="h-8 w-8 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10">
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Excluir Dívida</AlertDialogTitle>
                                      <AlertDialogDescription>Tem certeza que deseja excluir a dívida "{divida.descricao}"? Esta ação não pode ser desfeita.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleExcluirDivida(divida.id)} className="bg-red-500 hover:bg-red-600">Excluir</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Lista Mobile */}
            <div className="md:hidden">
              <Card>
                <CardContent className="p-4">
                  <ScrollArea className="h-[500px]">
                    {loading ? (
                      <div className="space-y-4">
                        {[...Array(4)].map((_, i) => (
                          <div key={i} className="p-4 rounded-xl border border-border space-y-3">
                            <div className="flex justify-between"><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-20" /></div>
                            <Skeleton className="h-4 w-24" />
                            <div className="grid grid-cols-2 gap-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div>
                          </div>
                        ))}
                      </div>
                    ) : dividasFiltradas.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Wallet className="w-10 h-10 mb-2 opacity-20" />
                        <p className="text-sm">Nenhuma dívida encontrada</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {dividasFiltradas.map((divida) => (
                          <div key={divida.id} className={`p-4 rounded-xl border ${divida.status === "vencida" ? "border-red-500/30 bg-red-500/5" : divida.status === "quitada" ? "border-green-500/30 bg-green-500/5" : "border-border"}`}>
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${divida.status === "vencida" ? "bg-red-500/10" : divida.status === "quitada" ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
                                  <CreditCard className={`w-4 h-4 ${divida.status === "vencida" ? "text-red-500" : divida.status === "quitada" ? "text-green-500" : "text-yellow-600"}`} />
                                </div>
                                <div>
                                  <p className="font-medium">{divida.descricao}</p>
                                  <p className="text-xs text-muted-foreground">{divida.credor}</p>
                                </div>
                              </div>
                              {getStatusBadge(divida.status)}
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                              <div>
                                <p className="text-xs text-muted-foreground">Parcelas</p>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{divida.parcelas_pagas}/{divida.parcelas}</span>
                                  <Progress value={(divida.parcelas_pagas / divida.parcelas) * 100} className="h-1 flex-1" />
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Vencimento</p>
                                <p className="font-medium">{formatarData(divida.data_vencimento)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Categoria</p>
                                <p className="font-medium">{divida.categorias?.nome || "Sem categoria"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Valor Restante</p>
                                <p className="font-semibold text-rose-500">R$ {divida.valor_restante.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                              </div>
                            </div>
                            {divida.debt_reminders && divida.debt_reminders.length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs text-muted-foreground mb-1">Lembrete</p>
                                <ReminderStatusBadge status={divida.debt_reminders[0].status} triggerAt={divida.debt_reminders[0].trigger_at} sentAt={divida.debt_reminders[0].sent_at} />
                              </div>
                            )}
                            <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
                              <Button variant="ghost" size="sm" onClick={() => handleEditarDivida(divida.id)} className="h-8 w-8 p-0 text-blue-500"><Edit className="w-4 h-4" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500"><Trash2 className="w-4 h-4" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir Dívida</AlertDialogTitle>
                                    <AlertDialogDescription>Tem certeza que deseja excluir "{divida.descricao}"?</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleExcluirDivida(divida.id)} className="bg-red-500">Excluir</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>


          <TabsContent value="adicionar">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-rose-500" />
                  Nova Dívida
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="descricao">Descrição *</Label>
                      <Input id="descricao" placeholder="Ex: Cartão de crédito, financiamento..." value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="credor">Credor *</Label>
                      <Input id="credor" placeholder="Ex: Banco ABC, Loja XYZ..." value={novoCredor} onChange={(e) => setNovoCredor(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="valor">Valor Total *</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                        <Input id="valor" type="number" placeholder="0,00" value={novoValorTotal} onChange={(e) => setNovoValorTotal(e.target.value)} className="pl-10" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="parcelas">Número de Parcelas *</Label>
                      <Input id="parcelas" type="number" placeholder="Ex: 12" value={novasParcelas} onChange={(e) => setNovasParcelas(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="categoria">Categoria *</Label>
                      <select id="categoria" value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)}
                        className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500">
                        <option value="">Selecione uma categoria</option>
                        {categoriasDespesa.map((cat) => <option key={cat.id} value={cat.nome}>{cat.nome}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vencimento">Data de Vencimento *</Label>
                      <Input id="vencimento" type="date" value={novaDataVencimento} onChange={(e) => setNovaDataVencimento(e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="reminder">Lembrete</Label>
                      <ReminderSelector value={novoReminderHours} onChange={setNovoReminderHours} />
                      <p className="text-xs text-muted-foreground">Configure um lembrete para ser notificado antes do vencimento</p>
                    </div>
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
                    <Button variant="outline" onClick={handleCancelar}>Cancelar</Button>
                    <Button onClick={handleAdicionarDivida} className="bg-rose-500 hover:bg-rose-600">
                      <Plus className="w-4 h-4 mr-2" />Adicionar Dívida
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de Edição */}
        <EditarDividaModal isOpen={modalEditarAberto} onClose={() => { setModalEditarAberto(false); setDividaEditando(null); }} divida={dividaEditando} onSave={handleSalvarEdicao} />
      </div>
    </DashboardLayout>
  );
};

export default Dividas;
