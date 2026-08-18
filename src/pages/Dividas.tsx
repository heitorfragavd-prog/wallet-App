import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Progress } from "@/shared/components/ui/progress";
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
  Save,
  Bell,
  History,
  Smartphone,
  Zap,
  Banknote,
  ArrowRightLeft,
  Ticket,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { useDividas, Divida } from "@/domains/finance/hooks/useDividas";
import { useContasUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { BankLogoBadge } from "@/shared/components/BankLogoBadge";
import { DateRangePicker, useDateRangeFilter } from "@/shared/components/DateRangePicker";
import { ReminderSelector } from "@/domains/finance/components/ReminderSelector";
import { useDebtReminders } from "@/domains/finance/hooks/useDebtReminders";
import { RegistrarPagamentoModal } from "@/domains/finance/components/RegistrarPagamentoModal";
import { PagarDividaDivipayModal } from "@/domains/divipay/components/PagarDividaDivipayModal";
import { usePagamentosDivida } from "@/domains/finance/hooks/usePagamentosDivida";
import { PaymentMethod } from "@/domains/finance/types";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { useTransacoes } from "@/domains/finance/hooks/useTransacoes";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { usePrivacy } from "@/contexts/PrivacyContext";

// Função para formatar data
const formatarData = (dataString: string) => {
  if (!dataString) return "";
  const [ano, mes, dia] = dataString.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
};

// Calcula dias até o vencimento (negativo = já venceu)
const calcularDiasAteVencimento = (dataVencimento: string): number => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const vencimento = new Date(dataVencimento.split("T")[0] + "T00:00:00");
  return Math.ceil((vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
};

const DiasVencimentoBadge = ({ dataVencimento, status }: { dataVencimento: string; status: string }) => {
  if (status === "quitada") return null;
  const dias = calcularDiasAteVencimento(dataVencimento);
  if (dias < 0) return <span className="text-xs font-medium text-red-500">{Math.abs(dias)}d vencida</span>;
  if (dias === 0) return <span className="text-xs font-medium text-red-500">Vence hoje!</span>;
  if (dias <= 7) return <span className="text-xs font-medium text-orange-500">{dias}d restantes</span>;
  if (dias <= 30) return <span className="text-xs font-medium text-yellow-600">{dias}d restantes</span>;
  return <span className="text-xs text-muted-foreground">{dias}d</span>;
};

const getMetodoPagamentoBadge = (metodo: string | undefined | null) => {
  if (!metodo) return null;
  const labels: Record<string, string> = {
    pix: "🔑 Pix",
    boleto: "📄 Boleto",
    transferencia: "🏦 Transf.",
    cartao_credito: "💳 C. Crédito",
    cartao_debito: "💳 C. Débito",
    dinheiro: "💵 Dinheiro",
    outros: "❓ Outro",
  };
  const label = labels[metodo] || metodo;
  return (
    <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4.5 border-rose-500/20 text-rose-400 bg-rose-500/5 select-none font-medium">
      {label}
    </Badge>
  );
};


// Ícones e labels para métodos de pagamento
const paymentMethodIcons: Record<PaymentMethod, typeof Smartphone> = {
  pix: Smartphone,
  cartao_credito: CreditCard,
  cartao_debito: CreditCard,
  boleto: Banknote,
  dinheiro: Wallet,
  transferencia: ArrowRightLeft,
  voucher: Ticket,
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: 'PIX',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  voucher: 'Voucher',
};

const Dividas = () => {
  const { toast } = useToast();
  const { isPrivate, formatCurrency } = usePrivacy();
  const { categoriasDespesa } = useCategorias();
  const { contas } = useContasUsuario();

  // ── Filtro de data (vencimento)
  const { dateRange, setRange, clearFilter } = useDateRangeFilter();

  const { dividas, loading, createDivida, updateDivida, deleteDivida, refetch: refetchDividas } = useDividas({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const { createReminder, getReminderByDebtId, updateReminder, deleteReminder } = useDebtReminders();
  const { pagamentos, loading: loadingPagamentos, fetchAllPagamentos, deletePagamento } = usePagamentosDivida();
  const { createTransacao } = useTransacoes();
  const [activeTab, setActiveTab] = useState("lista");
  const [dividaEditando, setDividaEditando] = useState<string | null>(null);
  
  // Estado para o modal de pagamento
  const [dividaSelecionada, setDividaSelecionada] = useState<Divida | null>(null);
  const [modalPagamentoAberto, setModalPagamentoAberto] = useState(false);

  // Estado para o modal "Pagar via Divipay"
  const [dividaDivipaySelecionada, setDividaDivipaySelecionada] = useState<Divida | null>(null);
  const [modalDivipayAberto, setModalDivipayAberto] = useState(false);

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
  const [novoDocumentoFavorecido, setNovoDocumentoFavorecido] = useState("");
  const [novaContaId, setNovaContaId] = useState("");
  const [novoReminderHours, setNovoReminderHours] = useState<number | null>(null);
  const [isTaxaAtiva, setIsTaxaAtiva] = useState(false);
  const [novoValorTaxa, setNovoValorTaxa] = useState("");

  // Novos campos de pagamento para nova dívida
  const [novoMetodoPagamento, setNovoMetodoPagamento] = useState<string>("pix");
  const [novaChavePix, setNovaChavePix] = useState("");
  const [novoPixCopiaCola, setNovoPixCopiaCola] = useState("");
  const [novoCodigoBarras, setNovoCodigoBarras] = useState("");
  const [novaLinhaDigitavel, setNovaLinhaDigitavel] = useState("");
  const [novoBanco, setNovoBanco] = useState("");
  const [novaAgencia, setNovaAgencia] = useState("");
  const [novaConta, setNovaConta] = useState("");
  const [novoTitular, setNovoTitular] = useState("");
  const [novoTipoConta, setNovoTipoConta] = useState<"corrente" | "poupanca">("corrente");

  // Estados para edição inline
  const [editDescricao, setEditDescricao] = useState("");
  const [editValorTotal, setEditValorTotal] = useState("");
  const [editValorPago, setEditValorPago] = useState("");
  const [editDataVencimento, setEditDataVencimento] = useState("");
  const [editParcelas, setEditParcelas] = useState("");
  const [editParcelasPagas, setEditParcelasPagas] = useState("");
  const [editCategoria, setEditCategoria] = useState("");
  const [editCredor, setEditCredor] = useState("");
  const [editDocumentoFavorecido, setEditDocumentoFavorecido] = useState("");
  const [editReminderHours, setEditReminderHours] = useState<number | null>(null);
  const [existingReminderId, setExistingReminderId] = useState<string | null>(null);

  // Novos campos de pagamento para edição
  const [editMetodoPagamento, setEditMetodoPagamento] = useState<string>("pix");
  const [editChavePix, setEditChavePix] = useState("");
  const [editPixCopiaCola, setEditPixCopiaCola] = useState("");
  const [editCodigoBarras, setEditCodigoBarras] = useState("");
  const [editLinhaDigitavel, setEditLinhaDigitavel] = useState("");
  const [editBanco, setEditBanco] = useState("");
  const [editAgencia, setEditAgencia] = useState("");
  const [editConta, setEditConta] = useState("");
  const [editTitular, setEditTitular] = useState("");
  const [editTipoConta, setEditTipoConta] = useState<"corrente" | "poupanca">("corrente");

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

    if (isTaxaAtiva && (!novoValorTaxa || Number(novoValorTaxa) <= 0)) {
      toast({ title: "Erro", description: "Por favor, preencha o valor da taxa.", variant: "destructive" });
      return;
    }

    const contaBancariaJson = novoMetodoPagamento === "transferencia" && novoBanco ? {
      banco: novoBanco,
      agencia: novaAgencia,
      conta: novaConta,
      titular: novoTitular,
      tipo: novoTipoConta
    } : null;

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
      conta_id: novaContaId || null,
      credor: novoCredor,
      documento_favorecido: novoDocumentoFavorecido.trim() || null,
      valor_taxa: isTaxaAtiva && novoValorTaxa ? parseFloat(novoValorTaxa) : 0,
      metodo_pagamento_esperado: novoMetodoPagamento as any,
      chave_pix: novoMetodoPagamento === "pix" ? novaChavePix : null,
      pix_copia_cola: novoMetodoPagamento === "pix" ? novoPixCopiaCola : null,
      codigo_barras: novoMetodoPagamento === "boleto" ? novoCodigoBarras : null,
      linha_digitavel: novoMetodoPagamento === "boleto" ? novaLinhaDigitavel : null,
      conta_bancaria: contaBancariaJson,
    });

    if (result?.id && novoReminderHours !== null && novoReminderHours > 0) {
      await createReminder(result.id, novoReminderHours, novaDataVencimento);
    }

    setNovaDescricao(""); setNovoValorTotal(""); setNovaDataVencimento("");
    setNovasParcelas(""); setNovaCategoria(""); setNovoCredor(""); setNovaContaId(""); setNovoReminderHours(null);
    setNovoDocumentoFavorecido("");
    setIsTaxaAtiva(false); setNovoValorTaxa("");
    setNovoMetodoPagamento("pix"); setNovaChavePix(""); setNovoPixCopiaCola("");
    setNovoCodigoBarras(""); setNovaLinhaDigitavel("");
    setNovoBanco(""); setNovaAgencia(""); setNovaConta(""); setNovoTitular(""); setNovoTipoConta("corrente");
    setActiveTab("lista");
  };

  const handleCancelar = () => {
    setNovaDescricao(""); setNovoValorTotal(""); setNovaDataVencimento("");
    setNovasParcelas(""); setNovaCategoria(""); setNovoCredor(""); setNovaContaId(""); setNovoReminderHours(null);
    setNovoDocumentoFavorecido("");
    setIsTaxaAtiva(false); setNovoValorTaxa("");
    setNovoMetodoPagamento("pix"); setNovaChavePix(""); setNovoPixCopiaCola("");
    setNovoCodigoBarras(""); setNovaLinhaDigitavel("");
    setNovoBanco(""); setNovaAgencia(""); setNovaConta(""); setNovoTitular(""); setNovoTipoConta("corrente");
    setActiveTab("lista");
  };

  const handleExcluirDivida = async (id: string) => { await deleteDivida(id); };

  const handleEditarDivida = async (id: string) => {
    const divida = dividas.find((d) => d.id === id);
    if (divida) {
      setDividaEditando(id);
      setEditDescricao(divida.descricao);
      setEditValorTotal(divida.valor_total.toString());
      setEditValorPago(divida.valor_pago.toString());
      setEditDataVencimento(divida.data_vencimento.split('T')[0]);
      setEditParcelas(divida.parcelas.toString());
      setEditParcelasPagas(divida.parcelas_pagas.toString());
      setEditCategoria(divida.categorias?.nome || "");
      setEditCredor(divida.credor);
      setEditDocumentoFavorecido(divida.documento_favorecido || "");
      
      setEditMetodoPagamento(divida.metodo_pagamento_esperado || "pix");
      setEditChavePix(divida.chave_pix || "");
      setEditPixCopiaCola(divida.pix_copia_cola || "");
      setEditCodigoBarras(divida.codigo_barras || "");
      setEditLinhaDigitavel(divida.linha_digitavel || "");
      const cb = divida.conta_bancaria as any;
      if (cb) {
        setEditBanco(cb.banco || "");
        setEditAgencia(cb.agencia || "");
        setEditConta(cb.conta || "");
        setEditTitular(cb.titular || "");
        setEditTipoConta(cb.tipo || "corrente");
      } else {
        setEditBanco("");
        setEditAgencia("");
        setEditConta("");
        setEditTitular("");
        setEditTipoConta("corrente");
      }

      // Load existing reminder
      const reminder = await getReminderByDebtId(id);
      if (reminder) {
        setEditReminderHours(reminder.reminder_hours);
        setExistingReminderId(reminder.id);
      } else {
        setEditReminderHours(null);
        setExistingReminderId(null);
      }
    }
  };

  const handleSalvarEdicao = async (id: string) => {
    if (!editDescricao || !editValorTotal || !editDataVencimento || !editParcelas || !editCategoria || !editCredor) {
      toast({ title: "Erro", description: "Por favor, preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }

    const valorTotalNum = parseFloat(editValorTotal);
    const valorPagoNum = parseFloat(editValorPago) || 0;
    const parcelasNum = parseInt(editParcelas);
    const parcelasPagasNum = parseInt(editParcelasPagas) || 0;

    const categoria = categoriasDespesa.find((c) => c.nome === editCategoria);
    const status = parcelasPagasNum >= parcelasNum ? 'quitada' : 
                   new Date(editDataVencimento) < new Date() ? 'vencida' : 'pendente';

    const contaBancariaJson = editMetodoPagamento === "transferencia" && editBanco ? {
      banco: editBanco,
      agencia: editAgencia,
      conta: editConta,
      titular: editTitular,
      tipo: editTipoConta
    } : null;

    await updateDivida(id, {
      descricao: editDescricao,
      valor_total: valorTotalNum,
      valor_pago: valorPagoNum,
      valor_restante: valorTotalNum - valorPagoNum,
      data_vencimento: editDataVencimento,
      parcelas: parcelasNum,
      parcelas_pagas: parcelasPagasNum,
      status,
      categoria_id: categoria?.id,
      credor: editCredor,
      documento_favorecido: editDocumentoFavorecido.trim() || null,
      metodo_pagamento_esperado: editMetodoPagamento as any,
      chave_pix: editMetodoPagamento === "pix" ? editChavePix : null,
      pix_copia_cola: editMetodoPagamento === "pix" ? editPixCopiaCola : null,
      codigo_barras: editMetodoPagamento === "boleto" ? editCodigoBarras : null,
      linha_digitavel: editMetodoPagamento === "boleto" ? editLinhaDigitavel : null,
      conta_bancaria: contaBancariaJson,
    });

    // Handle reminder creation/update/deletion
    if (editReminderHours !== null && editReminderHours > 0) {
      if (existingReminderId) {
        await updateReminder(existingReminderId, editReminderHours, editDataVencimento);
      } else {
        await createReminder(id, editReminderHours, editDataVencimento);
      }
    } else if (existingReminderId && editReminderHours === null) {
      await deleteReminder(existingReminderId);
    }

    setDividaEditando(null);
    handleCancelarEdicao();
  };

  const handleCancelarEdicao = () => {
    setDividaEditando(null);
    setEditDescricao("");
    setEditValorTotal("");
    setEditValorPago("");
    setEditDataVencimento("");
    setEditParcelas("");
    setEditParcelasPagas("");
    setEditCategoria("");
    setEditCredor("");
    setEditDocumentoFavorecido("");
    setEditReminderHours(null);
    setExistingReminderId(null);
    setEditMetodoPagamento("pix");
    setEditChavePix("");
    setEditPixCopiaCola("");
    setEditCodigoBarras("");
    setEditLinhaDigitavel("");
    setEditBanco("");
    setEditAgencia("");
    setEditConta("");
    setEditTitular("");
    setEditTipoConta("corrente");
  };

  // Handlers para o modal de pagamento
  const handleAbrirModalPagamento = (divida: Divida) => {
    setDividaSelecionada(divida);
    setModalPagamentoAberto(true);
  };

  // Handler para o modal "Pagar via Divipay"
  const handleAbrirModalDivipay = (divida: Divida) => {
    setDividaDivipaySelecionada(divida);
    setModalDivipayAberto(true);
  };

  const handlePagamentoSucesso = () => {
    refetchDividas();
    fetchAllPagamentos();
  };

  // Carregar histórico quando a aba de histórico for selecionada
  useEffect(() => {
    if (activeTab === "historico") {
      fetchAllPagamentos();
    }
  }, [activeTab]);

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
                      {formatCurrency(totalDividas)}
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
                    {formatCurrency(totalPago)} pagos de {formatCurrency(totalPago + totalDividas)}
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
            <TabsTrigger value="historico" className="data-[state=active]:bg-rose-500 data-[state=active]:text-white">
              <History className="w-4 h-4 mr-1" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="space-y-4">
            {/* Filtros */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Filtro por data de vencimento */}
                  <DateRangePicker
                    value={dateRange}
                    onChange={setRange}
                    onClear={clearFilter}
                    placeholder="Filtrar por vencimento"
                  />
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
            <div className="hidden md:block space-y-3">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-5 w-24" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : dividasFiltradas.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Wallet className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    Nenhuma dívida encontrada
                  </CardContent>
                </Card>
              ) : (
                dividasFiltradas.map((divida) => (
                  <Card key={divida.id} className={dividaEditando === divida.id ? "ring-2 ring-rose-500" : ""}>
                    <CardContent className="p-4">
                      {dividaEditando === divida.id ? (
                        // Formulário de edição inline
                        <div className="space-y-4">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-rose-500">Editando Dívida</h3>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleSalvarEdicao(divida.id)} className="bg-rose-500 hover:bg-rose-600">
                                <Save className="w-4 h-4 mr-1" />Salvar
                              </Button>
                              <Button size="sm" variant="outline" onClick={handleCancelarEdicao}>
                                <X className="w-4 h-4 mr-1" />Cancelar
                              </Button>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="edit-descricao">Descrição *</Label>
                              <Input id="edit-descricao" value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)} placeholder="Ex: Cartão de crédito" />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-credor">Credor *</Label>
                              <Input id="edit-credor" value={editCredor} onChange={(e) => setEditCredor(e.target.value)} placeholder="Ex: Banco ABC" />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-documento-favorecido">CPF/CNPJ ou Chave Pix</Label>
                              <Input id="edit-documento-favorecido" value={editDocumentoFavorecido} onChange={(e) => setEditDocumentoFavorecido(e.target.value)} placeholder="Opcional — conciliação Divipay" />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-categoria">Categoria *</Label>
                              <select id="edit-categoria" value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)}
                                className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500">
                                <option value="">Selecione</option>
                                {categoriasDespesa.map((cat) => <option key={cat.id} value={cat.nome}>{cat.nome}</option>)}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-valor-total">Valor Total *</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                                <Input id="edit-valor-total" type="number" value={editValorTotal} onChange={(e) => setEditValorTotal(e.target.value)} className="pl-10" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-valor-pago">Valor Pago</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                                <Input id="edit-valor-pago" type="number" value={editValorPago} onChange={(e) => setEditValorPago(e.target.value)} className="pl-10" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-vencimento">Vencimento *</Label>
                              <Input id="edit-vencimento" type="date" value={editDataVencimento} onChange={(e) => setEditDataVencimento(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-parcelas">Total Parcelas *</Label>
                              <Input id="edit-parcelas" type="number" value={editParcelas} onChange={(e) => setEditParcelas(e.target.value)} />
                            </div>
                            {(() => {
                              const vt = parseFloat(editValorTotal);
                              const np = parseInt(editParcelas);
                              const valido = !isNaN(vt) && vt > 0 && !isNaN(np) && np > 0;
                              if (!valido) return null;
                              const valorParcela = vt / np;
                              return (
                                <div className="md:col-span-3 flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-rose-500" />
                                    <span className="text-sm text-muted-foreground">Valor de cada parcela</span>
                                  </div>
                                  <span className="text-lg font-bold text-rose-500">
                                    R$ {valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              );
                            })()}
                            <div className="space-y-2">
                              <Label htmlFor="edit-parcelas-pagas">Parcelas Pagas</Label>
                              <Input id="edit-parcelas-pagas" type="number" value={editParcelasPagas} onChange={(e) => setEditParcelasPagas(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-reminder">Lembrete</Label>
                              <ReminderSelector value={editReminderHours} onChange={setEditReminderHours} />
                            </div>
                          </div>

                          <div className="space-y-4 border rounded-lg p-4 bg-muted/20 mt-4">
                            <h4 className="text-sm font-semibold text-rose-500">Dados de Pagamento (Opcional)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="edit-metodo-pagamento">Método de Pagamento Esperado</Label>
                                <select
                                  id="edit-metodo-pagamento"
                                  value={editMetodoPagamento}
                                  onChange={(e) => setEditMetodoPagamento(e.target.value)}
                                  className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500"
                                >
                                  <option value="pix">🔑 Pix</option>
                                  <option value="boleto">📄 Boleto</option>
                                  <option value="transferencia">🏦 Transferência Bancária</option>
                                  <option value="cartao_credito">💳 Cartão de Crédito</option>
                                  <option value="cartao_debito">💳 Cartão de Débito</option>
                                  <option value="dinheiro">💵 Dinheiro</option>
                                  <option value="outros">❓ Outros</option>
                                </select>
                              </div>
                            </div>

                            {editMetodoPagamento === "pix" && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/30">
                                <div className="space-y-2">
                                  <Label htmlFor="edit-chave-pix">Chave Pix</Label>
                                  <Input
                                    id="edit-chave-pix"
                                    placeholder="CPF, CNPJ, Celular, E-mail ou Chave Aleatória"
                                    value={editChavePix}
                                    onChange={(e) => setEditChavePix(e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="edit-pix-copia-cola">Pix Copia e Cola (Código QR)</Label>
                                  <textarea
                                    id="edit-pix-copia-cola"
                                    placeholder="Código longo para pagamento copia e cola"
                                    value={editPixCopiaCola}
                                    onChange={(e) => setEditPixCopiaCola(e.target.value)}
                                    className="w-full min-h-[40px] h-10 px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500"
                                  />
                                </div>
                              </div>
                            )}

                            {editMetodoPagamento === "boleto" && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/30">
                                <div className="space-y-2">
                                  <Label htmlFor="edit-codigo-barras">Código de Barras</Label>
                                  <Input
                                    id="edit-codigo-barras"
                                    placeholder="Somente números"
                                    value={editCodigoBarras}
                                    onChange={(e) => setEditCodigoBarras(e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="edit-linha-digitavel">Linha Digitável</Label>
                                  <Input
                                    id="edit-linha-digitavel"
                                    placeholder="Linha digitável do boleto"
                                    value={editLinhaDigitavel}
                                    onChange={(e) => setEditLinhaDigitavel(e.target.value)}
                                  />
                                </div>
                              </div>
                            )}

                            {editMetodoPagamento === "transferencia" && (
                              <div className="space-y-4 pt-2 border-t border-border/30">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="edit-banco">Banco</Label>
                                    <Input
                                      id="edit-banco"
                                      placeholder="Nome do banco ou código"
                                      value={editBanco}
                                      onChange={(e) => setEditBanco(e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="edit-agencia">Agência</Label>
                                    <Input
                                      id="edit-agencia"
                                      placeholder="Ex: 0001"
                                      value={editAgencia}
                                      onChange={(e) => setEditAgencia(e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="edit-conta-bancaria">Conta</Label>
                                    <Input
                                      id="edit-conta-bancaria"
                                      placeholder="Ex: 12345-6"
                                      value={editConta}
                                      onChange={(e) => setEditConta(e.target.value)}
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="edit-titular">Titular da Conta</Label>
                                    <Input
                                      id="edit-titular"
                                      placeholder="Nome completo / Razão Social"
                                      value={editTitular}
                                      onChange={(e) => setEditTitular(e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="edit-tipo-conta">Tipo de Conta</Label>
                                    <select
                                      id="edit-tipo-conta"
                                      value={editTipoConta}
                                      onChange={(e) => setEditTipoConta(e.target.value as any)}
                                      className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500"
                                    >
                                      <option value="corrente">Conta Corrente</option>
                                      <option value="poupanca">Conta Poupança</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        // Visualização normal com grid fixo
                        <div className="grid grid-cols-[auto_1fr_420px] gap-4 items-center">
                          {/* Coluna 1: Ícone */}
                          <div className={`p-3 rounded-lg ${divida.status === "vencida" ? "bg-red-500/10" : divida.status === "quitada" ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
                            <CreditCard className={`w-5 h-5 ${divida.status === "vencida" ? "text-red-500" : divida.status === "quitada" ? "text-green-500" : "text-yellow-600"}`} />
                          </div>

                          {/* Coluna 2: Informações em grid fixo */}
                          <div className="grid grid-cols-6 gap-3 items-center">
                            <div>
                              <p className="font-medium">{divida.descricao}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-muted-foreground">{divida.categorias?.nome || "Sem categoria"}</span>
                                {getMetodoPagamentoBadge(divida.metodo_pagamento_esperado)}
                                {divida.contas_usuario && (
                                  <div className="flex items-center gap-1">
                                    <BankLogoBadge nomeOuId={divida.contas_usuario.nome} size="sm" className="w-5 h-5 text-[8px]" />
                                    <span className="text-xs text-blue-400 font-medium">
                                      {divida.contas_usuario.nome}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Credor</p>
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-sm">{divida.credor}</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Parcelas</p>
                              <div className="space-y-1">
                                <span className="text-sm font-medium">{divida.parcelas_pagas}/{divida.parcelas}</span>
                                <Progress value={(divida.parcelas_pagas / divida.parcelas) * 100} className="h-1" />
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Vencimento</p>
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-sm">{formatarData(divida.data_vencimento)}</span>
                              </div>
                              <DiasVencimentoBadge dataVencimento={divida.data_vencimento} status={divida.status} />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Valor Restante</p>
                              <p className="font-semibold text-rose-500 whitespace-nowrap">{formatCurrency(divida.valor_restante)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Parcela</p>
                              <p className="font-semibold text-foreground whitespace-nowrap">{formatCurrency(divida.valor_total / divida.parcelas)}</p>
                            </div>
                          </div>

                          {/* Coluna 3: Ações com largura fixa de 420px */}
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-[90px] flex justify-center">
                              {getStatusBadge(divida.status)}
                            </div>
                            <div className="w-[32px] flex justify-center">
                              {divida.debt_reminders && divida.debt_reminders.length > 0 && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Lembrete configurado">
                                  <Bell className="w-4 h-4 text-yellow-500" />
                                </Button>
                              )}
                            </div>
                            <div className="w-[90px] flex justify-center">
                              {divida.status !== "quitada" && (
                                <Button
                                  onClick={() => handleAbrirModalPagamento(divida)}
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-green-600 border-green-600 hover:bg-green-600 hover:text-white"
                                  title="Registrar Pagamento"
                                >
                                  <DollarSign className="w-4 h-4 mr-1" />
                                  Pagar
                                </Button>
                              )}
                            </div>
                            <div className="w-[100px] flex justify-center">
                              {divida.status !== "quitada" && (
                                <Button
                                  onClick={() => handleAbrirModalDivipay(divida)}
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-orange-500 border-orange-500 hover:bg-orange-500 hover:text-white"
                                  title="Pagar via Divipay (baixa automática)"
                                >
                                  <Zap className="w-4 h-4 mr-1" />
                                  Divipay
                                </Button>
                              )}
                            </div>
                            <div className="w-[32px] flex justify-center">
                              <Button variant="ghost" size="sm" onClick={() => handleEditarDivida(divida.id)} className="h-8 w-8 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10">
                                <Edit className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="w-[32px] flex justify-center">
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
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Lista Mobile */}
            <div className="md:hidden">
              <ScrollArea className="h-[600px]">
                {loading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <Card key={i}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex justify-between"><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-20" /></div>
                          <Skeleton className="h-4 w-24" />
                          <div className="grid grid-cols-2 gap-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : dividasFiltradas.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 flex flex-col items-center justify-center text-muted-foreground">
                      <Wallet className="w-10 h-10 mb-2 opacity-20" />
                      <p className="text-sm">Nenhuma dívida encontrada</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {dividasFiltradas.map((divida) => (
                      <Card key={divida.id} className={dividaEditando === divida.id ? "ring-2 ring-rose-500" : ""}>
                        <CardContent className="p-4">
                          {dividaEditando === divida.id ? (
                            // Formulário de edição inline mobile
                            <div className="space-y-4">
                              <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-semibold text-rose-500">Editando</h3>
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => handleSalvarEdicao(divida.id)} className="bg-rose-500 hover:bg-rose-600 h-8">
                                    <Save className="w-3.5 h-3.5 mr-1" />Salvar
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={handleCancelarEdicao} className="h-8">
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                              
                              <div className="space-y-3">
                                <div className="space-y-1.5">
                                  <Label htmlFor="edit-descricao-mobile" className="text-xs">Descrição *</Label>
                                  <Input id="edit-descricao-mobile" value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)} className="h-9" />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor="edit-credor-mobile" className="text-xs">Credor *</Label>
                                  <Input id="edit-credor-mobile" value={editCredor} onChange={(e) => setEditCredor(e.target.value)} className="h-9" />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor="edit-documento-mobile" className="text-xs">CPF/CNPJ ou Chave Pix</Label>
                                  <Input id="edit-documento-mobile" value={editDocumentoFavorecido} onChange={(e) => setEditDocumentoFavorecido(e.target.value)} className="h-9" placeholder="Opcional — conciliação Divipay" />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor="edit-categoria-mobile" className="text-xs">Categoria *</Label>
                                  <select id="edit-categoria-mobile" value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)}
                                    className="w-full h-9 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
                                    <option value="">Selecione</option>
                                    {categoriasDespesa.map((cat) => <option key={cat.id} value={cat.nome}>{cat.nome}</option>)}
                                  </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label htmlFor="edit-valor-total-mobile" className="text-xs">Valor Total *</Label>
                                    <Input id="edit-valor-total-mobile" type="number" value={editValorTotal} onChange={(e) => setEditValorTotal(e.target.value)} className="h-9" />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label htmlFor="edit-valor-pago-mobile" className="text-xs">Valor Pago</Label>
                                    <Input id="edit-valor-pago-mobile" type="number" value={editValorPago} onChange={(e) => setEditValorPago(e.target.value)} className="h-9" />
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor="edit-vencimento-mobile" className="text-xs">Vencimento *</Label>
                                  <Input id="edit-vencimento-mobile" type="date" value={editDataVencimento} onChange={(e) => setEditDataVencimento(e.target.value)} className="h-9" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label htmlFor="edit-parcelas-mobile" className="text-xs">Total Parcelas *</Label>
                                    <Input id="edit-parcelas-mobile" type="number" value={editParcelas} onChange={(e) => setEditParcelas(e.target.value)} className="h-9" />
                                  </div>
                                  {(() => {
                                    const vt = parseFloat(editValorTotal);
                                    const np = parseInt(editParcelas);
                                    const valido = !isNaN(vt) && vt > 0 && !isNaN(np) && np > 0;
                                    if (!valido) return null;
                                    const valorParcela = vt / np;
                                    return (
                                      <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
                                        <div className="flex items-center gap-2">
                                          <CreditCard className="w-4 h-4 text-rose-500" />
                                          <span className="text-xs text-muted-foreground">Valor de cada parcela</span>
                                        </div>
                                        <span className="text-base font-bold text-rose-500">
                                          R$ {valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                  <div className="space-y-1.5">
                                    <Label htmlFor="edit-parcelas-pagas-mobile" className="text-xs">Pagas</Label>
                                    <Input id="edit-parcelas-pagas-mobile" type="number" value={editParcelasPagas} onChange={(e) => setEditParcelasPagas(e.target.value)} className="h-9" />
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor="edit-reminder-mobile" className="text-xs">Lembrete</Label>
                                  <ReminderSelector value={editReminderHours} onChange={setEditReminderHours} />
                                </div>

                                <div className="space-y-3 border rounded-lg p-3 bg-muted/20 mt-3 text-xs">
                                  <h4 className="text-xs font-semibold text-rose-500">Dados de Pagamento (Opcional)</h4>
                                  <div className="space-y-1.5">
                                    <Label htmlFor="edit-metodo-pagamento-mobile" className="text-xs">Método de Pagamento Esperado</Label>
                                    <select
                                      id="edit-metodo-pagamento-mobile"
                                      value={editMetodoPagamento}
                                      onChange={(e) => setEditMetodoPagamento(e.target.value)}
                                      className="w-full h-9 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                                    >
                                      <option value="pix">🔑 Pix</option>
                                      <option value="boleto">📄 Boleto</option>
                                      <option value="transferencia">🏦 Transferência Bancária</option>
                                      <option value="cartao_credito">💳 Cartão de Crédito</option>
                                      <option value="cartao_debito">💳 Cartão de Débito</option>
                                      <option value="dinheiro">💵 Dinheiro</option>
                                      <option value="outros">❓ Outros</option>
                                    </select>
                                  </div>

                                  {editMetodoPagamento === "pix" && (
                                    <div className="space-y-3 pt-2 border-t border-border/30">
                                      <div className="space-y-1.5">
                                        <Label htmlFor="edit-chave-pix-mobile" className="text-xs">Chave Pix</Label>
                                        <Input
                                          id="edit-chave-pix-mobile"
                                          placeholder="CPF, CNPJ, Celular, E-mail..."
                                          value={editChavePix}
                                          onChange={(e) => setEditChavePix(e.target.value)}
                                          className="h-9"
                                        />
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label htmlFor="edit-pix-copia-cola-mobile" className="text-xs">Pix Copia e Cola</Label>
                                        <textarea
                                          id="edit-pix-copia-cola-mobile"
                                          placeholder="Código QR"
                                          value={editPixCopiaCola}
                                          onChange={(e) => setEditPixCopiaCola(e.target.value)}
                                          className="w-full min-h-[40px] h-9 px-3 py-1.5 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {editMetodoPagamento === "boleto" && (
                                    <div className="space-y-3 pt-2 border-t border-border/30">
                                      <div className="space-y-1.5">
                                        <Label htmlFor="edit-codigo-barras-mobile" className="text-xs">Código de Barras</Label>
                                        <Input
                                          id="edit-codigo-barras-mobile"
                                          placeholder="Somente números"
                                          value={editCodigoBarras}
                                          onChange={(e) => setEditCodigoBarras(e.target.value)}
                                          className="h-9"
                                        />
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label htmlFor="edit-linha-digitavel-mobile" className="text-xs">Linha Digitável</Label>
                                        <Input
                                          id="edit-linha-digitavel-mobile"
                                          placeholder="Linha digitável"
                                          value={editLinhaDigitavel}
                                          onChange={(e) => setEditLinhaDigitavel(e.target.value)}
                                          className="h-9"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {editMetodoPagamento === "transferencia" && (
                                    <div className="space-y-3 pt-2 border-t border-border/30">
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1.5">
                                          <Label htmlFor="edit-banco-mobile" className="text-xs">Banco</Label>
                                          <Input
                                            id="edit-banco-mobile"
                                            placeholder="Banco"
                                            value={editBanco}
                                            onChange={(e) => setEditBanco(e.target.value)}
                                            className="h-9"
                                          />
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label htmlFor="edit-agencia-mobile" className="text-xs">Agência</Label>
                                          <Input
                                            id="edit-agencia-mobile"
                                            placeholder="Agência"
                                            value={editAgencia}
                                            onChange={(e) => setEditAgencia(e.target.value)}
                                            className="h-9"
                                          />
                                        </div>
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label htmlFor="edit-conta-bancaria-mobile" className="text-xs">Conta</Label>
                                        <Input
                                          id="edit-conta-bancaria-mobile"
                                          placeholder="Conta"
                                          value={editConta}
                                          onChange={(e) => setEditConta(e.target.value)}
                                          className="h-9"
                                        />
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label htmlFor="edit-titular-mobile" className="text-xs">Titular</Label>
                                        <Input
                                          id="edit-titular-mobile"
                                          placeholder="Titular"
                                          value={editTitular}
                                          onChange={(e) => setEditTitular(e.target.value)}
                                          className="h-9"
                                        />
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label htmlFor="edit-tipo-conta-mobile" className="text-xs">Tipo</Label>
                                        <select
                                          id="edit-tipo-conta-mobile"
                                          value={editTipoConta}
                                          onChange={(e) => setEditTipoConta(e.target.value as any)}
                                          className="w-full h-9 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                                        >
                                          <option value="corrente">Corrente</option>
                                          <option value="poupanca">Poupança</option>
                                        </select>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            // Visualização normal mobile
                            <>
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-lg ${divida.status === "vencida" ? "bg-red-500/10" : divida.status === "quitada" ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
                                    <CreditCard className={`w-4 h-4 ${divida.status === "vencida" ? "text-red-500" : divida.status === "quitada" ? "text-green-500" : "text-yellow-600"}`} />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="font-medium">{divida.descricao}</p>
                                      {getMetodoPagamentoBadge(divida.metodo_pagamento_esperado)}
                                    </div>
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
                                  <DiasVencimentoBadge dataVencimento={divida.data_vencimento} status={divida.status} />
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Categoria</p>
                                  <p className="font-medium">{divida.categorias?.nome || "Sem categoria"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Valor Restante</p>
                                  <p className="font-semibold text-rose-500">{formatCurrency(divida.valor_restante)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Valor Parcela</p>
                                  <p className="font-semibold text-foreground">{formatCurrency(divida.valor_total / divida.parcelas)}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                                <div className="flex items-center gap-2">
                                  {divida.debt_reminders && divida.debt_reminders.length > 0 && (
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Lembrete configurado">
                                      <Bell className="w-4 h-4 text-yellow-500" />
                                    </Button>
                                  )}
                                  {divida.status !== "quitada" && (
                                    <Button
                                      onClick={() => handleAbrirModalPagamento(divida)}
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-green-600 border-green-600 hover:bg-green-600 hover:text-white text-xs"
                                      title="Registrar Pagamento"
                                    >
                                      <DollarSign className="w-3.5 h-3.5 mr-1" />
                                      Pagar
                                    </Button>
                                  )}
                                  {divida.status !== "quitada" && (
                                    <Button
                                      onClick={() => handleAbrirModalDivipay(divida)}
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-orange-500 border-orange-500 hover:bg-orange-500 hover:text-white text-xs"
                                      title="Pagar via Divipay (baixa automática)"
                                    >
                                      <Zap className="w-3.5 h-3.5 mr-1" />
                                      Divipay
                                    </Button>
                                  )}
                                </div>
                                <div className="flex gap-2">
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
                            </>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
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
                      <Label htmlFor="documento-favorecido">CPF/CNPJ ou Chave Pix do Favorecido</Label>
                      <Input id="documento-favorecido" placeholder="Opcional — usado p/ conciliar pagamentos Divipay" value={novoDocumentoFavorecido} onChange={(e) => setNovoDocumentoFavorecido(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Com esse dado, pagamentos via Divipay baixam a dívida automaticamente.</p>
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
                    {(() => {
                      const vt = parseFloat(novoValorTotal);
                      const np = parseInt(novasParcelas);
                      const valido = !isNaN(vt) && vt > 0 && !isNaN(np) && np > 0;
                      if (!valido) return null;
                      const valorParcela = vt / np;
                      return (
                        <div className="md:col-span-2 flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-rose-500" />
                            <span className="text-sm text-muted-foreground">Valor de cada parcela</span>
                          </div>
                          <span className="text-lg font-bold text-rose-500">
                            R$ {valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    })()}
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
                      <Label htmlFor="conta">Conta / Cartão Vinculado (Opcional)</Label>
                      <select id="conta" value={novaContaId} onChange={(e) => setNovaContaId(e.target.value)}
                        className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500">
                        <option value="">Nenhum (Vínculo Geral)</option>
                        {contas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome} ({c.tipo === "cartao_credito" ? "Cartão de Crédito" : "Conta / Carteira"})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="reminder">Lembrete</Label>
                      <ReminderSelector value={novoReminderHours} onChange={setNovoReminderHours} />
                      <p className="text-xs text-muted-foreground">Configure um lembrete para ser notificado antes do vencimento</p>
                    </div>
                    <div className="space-y-4 md:col-span-2 border rounded-lg p-4 bg-muted/20">
                      <h4 className="text-sm font-semibold text-rose-500">Dados de Pagamento (Opcional)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="metodo-pagamento">Método de Pagamento Esperado</Label>
                          <select
                            id="metodo-pagamento"
                            value={novoMetodoPagamento}
                            onChange={(e) => setNovoMetodoPagamento(e.target.value)}
                            className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500"
                          >
                            <option value="pix">🔑 Pix</option>
                            <option value="boleto">📄 Boleto</option>
                            <option value="transferencia">🏦 Transferência Bancária</option>
                            <option value="cartao_credito">💳 Cartão de Crédito</option>
                            <option value="cartao_debito">💳 Cartão de Débito</option>
                            <option value="dinheiro">💵 Dinheiro</option>
                            <option value="outros">❓ Outros</option>
                          </select>
                        </div>
                      </div>

                      {novoMetodoPagamento === "pix" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/30">
                          <div className="space-y-2">
                            <Label htmlFor="chave-pix">Chave Pix</Label>
                            <Input
                              id="chave-pix"
                              placeholder="CPF, CNPJ, Celular, E-mail ou Chave Aleatória"
                              value={novaChavePix}
                              onChange={(e) => setNovaChavePix(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="pix-copia-cola">Pix Copia e Cola (Código QR)</Label>
                            <textarea
                              id="pix-copia-cola"
                              placeholder="Código longo para pagamento copia e cola"
                              value={novoPixCopiaCola}
                              onChange={(e) => setNovoPixCopiaCola(e.target.value)}
                              className="w-full min-h-[40px] h-10 px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500"
                            />
                          </div>
                        </div>
                      )}

                      {novoMetodoPagamento === "boleto" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/30">
                          <div className="space-y-2">
                            <Label htmlFor="codigo-barras">Código de Barras</Label>
                            <Input
                              id="codigo-barras"
                              placeholder="Somente números"
                              value={novoCodigoBarras}
                              onChange={(e) => setNovoCodigoBarras(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="linha-digitavel">Linha Digitável</Label>
                            <Input
                              id="linha-digitavel"
                              placeholder="Linha digitável do boleto"
                              value={novaLinhaDigitavel}
                              onChange={(e) => setNovaLinhaDigitavel(e.target.value)}
                            />
                          </div>
                        </div>
                      )}

                      {novoMetodoPagamento === "transferencia" && (
                        <div className="space-y-4 pt-2 border-t border-border/30">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="banco">Banco</Label>
                              <Input
                                id="banco"
                                placeholder="Nome do banco ou código"
                                value={novoBanco}
                                onChange={(e) => setNovoBanco(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="agencia">Agência</Label>
                              <Input
                                id="agencia"
                                placeholder="Ex: 0001"
                                value={novaAgencia}
                                onChange={(e) => setNovaAgencia(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="conta-bancaria">Conta</Label>
                              <Input
                                id="conta-bancaria"
                                placeholder="Ex: 12345-6"
                                value={novaConta}
                                onChange={(e) => setNovaConta(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="titular">Titular da Conta</Label>
                              <Input
                                id="titular"
                                placeholder="Nome completo / Razão Social"
                                value={novoTitular}
                                onChange={(e) => setNovoTitular(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="tipo-conta">Tipo de Conta</Label>
                              <select
                                id="tipo-conta"
                                value={novoTipoConta}
                                onChange={(e) => setNovoTipoConta(e.target.value as any)}
                                className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500"
                              >
                                <option value="corrente">Conta Corrente</option>
                                <option value="poupanca">Conta Poupança</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 md:col-span-2 border rounded-lg p-4 bg-muted/30">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="taxa-ativa" 
                          checked={isTaxaAtiva} 
                          onCheckedChange={(checked) => setIsTaxaAtiva(checked as boolean)} 
                        />
                        <Label htmlFor="taxa-ativa" className="cursor-pointer">Adicionar taxa à dívida</Label>
                      </div>
                      {isTaxaAtiva && (
                        <div className="space-y-2 mt-2">
                          <Label htmlFor="valorTaxa">Valor da Taxa *</Label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                            <Input 
                              id="valorTaxa" 
                              type="number" 
                              placeholder="0,00" 
                              value={novoValorTaxa} 
                              onChange={(e) => setNovoValorTaxa(e.target.value)} 
                              className="pl-10 max-w-xs bg-background" 
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Este valor será registrado como despesa de taxa quando a dívida for paga.
                          </p>
                        </div>
                      )}
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

          <TabsContent value="historico" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5 text-rose-500" />
                  Histórico de Pagamentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingPagamentos ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-5 w-24" />
                      </div>
                    ))}
                  </div>
                ) : pagamentos.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p>Nenhum pagamento registrado ainda.</p>
                    <p className="text-sm mt-1">Os pagamentos de dívidas aparecerão aqui.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pagamentos.map((pagamento) => {
                      const Icon = paymentMethodIcons[pagamento.metodo_pagamento];
                      return (
                        <div
                          key={pagamento.id}
                          className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {pagamento.dividas?.descricao || "Dívida"}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {pagamento.dividas?.credor}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span>{paymentMethodLabels[pagamento.metodo_pagamento]}</span>
                              <span>•</span>
                              <span>
                                {format(new Date(pagamento.data_pagamento), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                              </span>
                            </div>
                            {pagamento.observacoes && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {pagamento.observacoes}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-semibold text-green-600">
                              R$ {pagamento.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive h-8 w-8"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover Pagamento</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja remover este pagamento? Esta ação não pode ser desfeita e não reverterá a despesa criada.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deletePagamento(pagamento.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Remover
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de Pagamento */}
        <RegistrarPagamentoModal
          divida={dividaSelecionada}
          open={modalPagamentoAberto}
          onOpenChange={setModalPagamentoAberto}
          onSuccess={handlePagamentoSucesso}
        />

        {/* Modal Pagar via Divipay */}
        <PagarDividaDivipayModal
          divida={dividaDivipaySelecionada}
          open={modalDivipayAberto}
          onOpenChange={setModalDivipayAberto}
          onSuccess={refetchDividas}
        />
      </div>
    </DashboardLayout>
  );
};

export default Dividas;
