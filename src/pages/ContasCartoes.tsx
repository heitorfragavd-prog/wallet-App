import { useState, useEffect } from "react";
import type { ElementType } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import {
  Card,
  CardContent,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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
  Wallet,
  CreditCard,
  Building2,
  PiggyBank,
  Plus,
  Edit,
  Trash2,
  DollarSign,
  UploadCloud,
  ShieldCheck,
  TrendingUp,
  Minus,
  ArrowLeftRight,
  Link as LinkIcon,
  Lock,
} from "lucide-react";
import { useContasUsuario, ContaUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { useDividas } from "@/domains/finance/hooks/useDividas";
import { useDespesas } from "@/domains/finance/hooks/useDespesas";
import { useInvestimentos } from "@/domains/finance/hooks/useInvestimentos";
import { determinarFaturaParaData, calcularPeriodoFatura } from "@/domains/finance/hooks/useFaturasCartao";
import { format } from "date-fns";
import { BankLogoBadge } from "@/shared/components/BankLogoBadge";
import { FaturaCartaoModal } from "@/domains/finance/components/FaturaCartaoModal";
import { ImportadorExtratoModal } from "@/domains/finance/components/ImportadorExtratoModal";
import { PluggyConnectModal } from "@/domains/finance/components/PluggyConnectModal";
import { TransferenciaModal } from "@/domains/finance/components/TransferenciaModal";
import { NovaDespesaModal } from "@/domains/finance/components/NovaDespesaModal";
import { NovaReceitaModal } from "@/domains/finance/components/NovaReceitaModal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/components/ui/tabs";
import { InvestimentosView } from "@/domains/finance/components/InvestimentosView";
import { useSenhaInvestimentos } from "@/domains/finance/hooks/useSenhaInvestimentos";
import { InvestimentoSenhaModal } from "@/domains/finance/components/InvestimentoSenhaModal";

const TIPO_LABELS: Record<string, string> = {
  conta_corrente: "Conta Corrente",
  poupanca: "Poupança",
  carteira: "Carteira / Dinheiro",
  cartao_credito: "Cartão de Crédito",
  outro: "Outra Conta",
};

const TIPO_ICONS: Record<string, ElementType> = {
  conta_corrente: Building2,
  poupanca: PiggyBank,
  carteira: Wallet,
  cartao_credito: CreditCard,
  outro: DollarSign,
};

export default function ContasCartoes() {
  const { contas, loading, saldoConsolidado, cartoesCredito, createConta, updateConta, deleteConta } = useContasUsuario();
  const { dividas = [] } = useDividas();
  const { despesas = [] } = useDespesas();
  const { investimentos = [] } = useInvestimentos();
  const { isLocked, hasPassword } = useSenhaInvestimentos();

  const [modalAberto, setModalAberto] = useState(false);
  const [contaEditando, setContaEditando] = useState<ContaUsuario | null>(null);

  const [activeTab, setActiveTab] = useState("contas");
  const [openNovoAtivo, setOpenNovoAtivo] = useState(false);
  const [preSelectedContaId, setPreSelectedContaId] = useState<string | undefined>(undefined);
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  const [cartaoFatura, setCartaoFatura] = useState<ContaUsuario | null>(null);
  const [modalFaturaAberto, setModalFaturaAberto] = useState(false);

  const [modalExtratoAberto, setModalExtratoAberto] = useState(false);
  const [modalDespesaAberto, setModalDespesaAberto] = useState(false);
  const [modalReceitaAberto, setModalReceitaAberto] = useState(false);
  const [modalTransferenciaAberto, setModalTransferenciaAberto] = useState(false);

  // Modal Pluggy Open Finance com configuração limpa
  const [modalPluggyAberto, setModalPluggyAberto] = useState(false);
  const [modalPluggyProps, setModalPluggyProps] = useState<{ openWidgetDirectly?: boolean; initialConnectorId?: number }>({
    openWidgetDirectly: false,
    initialConnectorId: undefined,
  });

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<ContaUsuario["tipo"]>("conta_corrente");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [saldoAtual, setSaldoAtual] = useState("");
  const [limiteCredito, setLimiteCredito] = useState("");
  const [diaFechamento, setDiaFechamento] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("");
  const [cor, setCor] = useState("#3B82F6");

  const handleAbrirPluggy = () => {
    setModalPluggyAberto(true);
  };

  const resetForm = () => {
    setNome("");
    setTipo("conta_corrente");
    setSaldoInicial("");
    setSaldoAtual("");
    setLimiteCredito("");
    setDiaFechamento("");
    setDiaVencimento("");
    setCor("#3B82F6");
    setContaEditando(null);
  };

  const handleAbrirCriar = () => {
    resetForm();
    setModalAberto(true);
  };

  const handleAbrirEditar = (conta: ContaUsuario) => {
    setContaEditando(conta);
    setNome(conta.nome);
    setTipo(conta.tipo);
    setSaldoInicial(conta.saldo_inicial?.toString() || "");
    setSaldoAtual(conta.saldo_atual?.toString() || "");
    setLimiteCredito(conta.limite_credito?.toString() || "");
    setDiaFechamento(conta.dia_fechamento?.toString() || "");
    setDiaVencimento(conta.dia_vencimento?.toString() || "");
    setCor(conta.cor || "#3B82F6");
    setModalAberto(true);
  };

  const handleAbrirFatura = (cartao: ContaUsuario) => {
    setCartaoFatura(cartao);
    setModalFaturaAberto(true);
  };

  const handleSalvar = async () => {
    if (!nome.trim()) return;

    const payload = {
      nome,
      tipo,
      saldo_inicial: Number(saldoInicial) || 0,
      saldo_atual: Number(saldoAtual) || Number(saldoInicial) || 0,
      limite_credito: tipo === "cartao_credito" ? Number(limiteCredito) || 0 : 0,
      dia_fechamento: tipo === "cartao_credito" ? Number(diaFechamento) || undefined : undefined,
      dia_vencimento: tipo === "cartao_credito" ? Number(diaVencimento) || undefined : undefined,
      cor,
    };

    if (contaEditando) {
      await updateConta(contaEditando.id, payload);
    } else {
      await createConta(payload);
    }

    setModalAberto(false);
    resetForm();
  };

  // Cálculo consolidado de limite total, faturas/dívidas e limite disponível
  const totalLimiteMaximo = cartoesCredito.reduce((acc, c) => acc + (Number(c.limite_credito) || 0), 0);

  const totalUsadoGeralCartoes = cartoesCredito.reduce((acc, cartao) => {
    const divCartao = dividas.filter((d) => d.conta_id === cartao.id && d.status !== "quitada");
    const totDiv = divCartao.reduce((sum, d) => sum + Number(d.valor_restante || 0), 0);
    
    // Determinar o período da fatura atual baseado no dia de fechamento
    const hojeStr = format(new Date(), "yyyy-MM-dd");
    const { mes_fatura, ano_fatura } = determinarFaturaParaData(hojeStr, cartao.dia_fechamento);
    const periodo = calcularPeriodoFatura(cartao, mes_fatura, ano_fatura);

    const despCartao = despesas.filter(
      (d: any) => {
        const pertenceCartao =
          d.conta_id === cartao.id ||
          ((d.metodo_pagamento === "cartao_credito" || d.forma_pagamento === "cartao_credito") && (!d.conta_id || d.conta_id === cartao.id));
        if (!pertenceCartao) return false;
        return d.data > periodo.data_inicio && d.data <= periodo.data_fechamento;
      }
    );
    const totDesp = despCartao.reduce((sum, d) => sum + Number(d.valor || 0), 0);
    return acc + totDiv + totDesp;
  }, 0);

  const totalLimiteDisponivelGeral = Math.max(0, totalLimiteMaximo - totalUsadoGeralCartoes);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-3 shadow-lg shadow-blue-500/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Contas e Cartões</h1>
              <p className="text-muted-foreground">Gerencie saldos, faturas e limites</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleAbrirPluggy}
              className="border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10 font-semibold"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Conectar via Open Finance
            </Button>

            <Button
              variant="outline"
              onClick={() => setModalExtratoAberto(true)}
              className="border-orange-500/50 text-orange-500 hover:bg-orange-500/10 font-semibold"
            >
              <UploadCloud className="w-4 h-4 mr-2" />
              Importar Extrato (OFX/CSV)
            </Button>

            <Button onClick={handleAbrirCriar} className="bg-blue-500 hover:bg-blue-600 font-semibold">
              <Plus className="w-4 h-4 mr-2" />
              Nova Conta / Cartão
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <TabsList className="bg-[#0B132B] border border-[#1E2942] p-1 rounded-xl max-w-md">
              <TabsTrigger value="contas" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white font-semibold">
                <Building2 className="w-4 h-4 mr-2" />
                Contas & Cartões
              </TabsTrigger>
              <TabsTrigger value="investimentos" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-semibold">
                <TrendingUp className="w-4 h-4 mr-2" />
                Carteira de Investimentos
              </TabsTrigger>
            </TabsList>

            {/* Acesso rápido compacto e elegante no formato pílula */}
            <div className="flex items-center gap-1.5 bg-[#0B132B] border border-[#1E2942] p-1.5 rounded-xl shadow-inner">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2 hidden lg:inline">
                Acesso rápido
              </span>

              {/* DESPESA */}
              <button
                type="button"
                onClick={() => setModalDespesaAberto(true)}
                className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-extrabold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95 group cursor-pointer"
                title="Nova Despesa"
              >
                <div className="w-4 h-4 rounded-full border border-rose-400 flex items-center justify-center text-rose-400">
                  <Minus className="w-2.5 h-2.5 stroke-[3]" />
                </div>
                <span className="tracking-wider">DESPESA</span>
              </button>

              {/* RECEITA */}
              <button
                type="button"
                onClick={() => setModalReceitaAberto(true)}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-extrabold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95 group cursor-pointer"
                title="Nova Receita"
              >
                <div className="w-4 h-4 rounded-full border border-emerald-400 flex items-center justify-center text-emerald-400">
                  <Plus className="w-2.5 h-2.5 stroke-[3]" />
                </div>
                <span className="tracking-wider">RECEITA</span>
              </button>

              {/* TRANSF. */}
              <button
                type="button"
                onClick={() => setModalTransferenciaAberto(true)}
                className="bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/30 text-slate-300 font-extrabold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95 group cursor-pointer"
                title="Transferência entre contas"
              >
                <div className="w-4 h-4 rounded-full border border-slate-400 flex items-center justify-center text-slate-300">
                  <ArrowLeftRight className="w-2.5 h-2.5 stroke-[2.5]" />
                </div>
                <span className="tracking-wider">TRANSF.</span>
              </button>

              {/* IMPORTAR */}
              <button
                type="button"
                onClick={() => setModalExtratoAberto(true)}
                className="bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-extrabold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-95 group cursor-pointer"
                title="Importar Extrato (OFX/CSV)"
              >
                <div className="w-4 h-4 rounded-full border border-blue-400 flex items-center justify-center text-blue-400">
                  <LinkIcon className="w-2.5 h-2.5 stroke-[2.5]" />
                </div>
                <span className="tracking-wider">IMPORTAR</span>
              </button>
            </div>
          </div>

          <TabsContent value="contas" className="space-y-6 mt-0">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border border-[#1E2942] bg-[#0B132B] rounded-2xl shadow-lg">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Saldo Consolidado</p>
                      <p className="text-2xl font-black text-white tracking-tight mt-1">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(saldoConsolidado)}
                      </p>
                    </div>
                    <div className="bg-blue-600/20 border border-blue-500/30 p-2.5 rounded-xl text-blue-400">
                      <Wallet className="w-5 h-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-[#1E2942] bg-[#0B132B] rounded-2xl shadow-lg">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Limite de Crédito Total</p>
                      <p className="text-2xl font-black text-white tracking-tight mt-1">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalLimiteMaximo)}
                      </p>
                      {totalUsadoGeralCartoes > 0 && (
                        <p className="text-[11px] text-slate-400 font-medium mt-1">
                          Disponível: <span className="text-emerald-400 font-bold">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalLimiteDisponivelGeral)}</span>
                        </p>
                      )}
                    </div>
                    <div className="bg-purple-600/20 border border-purple-500/30 p-2.5 rounded-xl text-purple-400">
                      <CreditCard className="w-5 h-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-[#1E2942] bg-[#0B132B] rounded-2xl shadow-lg">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Total de Contas / Cartões</p>
                      <p className="text-2xl font-black text-white tracking-tight mt-1">{contas.length}</p>
                    </div>
                    <div className="bg-emerald-600/20 border border-emerald-500/30 p-2.5 rounded-xl text-emerald-400">
                      <Building2 className="w-5 h-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Lista de Contas */}
            {loading ? (
              <div className="py-12 text-center text-slate-400">Carregando contas...</div>
            ) : contas.length === 0 ? (
              <Card className="border-dashed border-2 border-[#1E2942] bg-[#0B132B] rounded-2xl">
                <CardContent className="py-12 text-center space-y-4">
                  <Building2 className="w-12 h-12 text-slate-400 mx-auto" />
                  <div>
                    <h3 className="font-semibold text-lg text-white">Nenhuma conta cadastrada</h3>
                    <p className="text-sm text-slate-400">
                      Adicione suas contas bancárias, cartões de crédito ou carteira para começar.
                    </p>
                  </div>
                  <div className="flex justify-center gap-3">
                    <Button onClick={handleAbrirPluggy} className="bg-emerald-500 hover:bg-emerald-600 font-semibold">
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      Conectar via Open Finance
                    </Button>
                    <Button onClick={handleAbrirCriar} variant="outline">
                      Cadastrar Manualmente
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {contas.map((conta) => {
                  const Icon = TIPO_ICONS[conta.tipo] || Building2;
                  const dividasVinculadas = dividas.filter((d) => d.conta_id === conta.id && d.status !== "quitada");
                  const totalDividas = dividasVinculadas.reduce((acc, d) => acc + Number(d.valor_restante || 0), 0);

                  let totalDespesasCartao = 0;
                  if (conta.tipo === "cartao_credito") {
                    // Determinar o período da fatura atual baseado no dia de fechamento do cartão
                    const hojeStr = format(new Date(), "yyyy-MM-dd");
                    const { mes_fatura, ano_fatura } = determinarFaturaParaData(hojeStr, conta.dia_fechamento);
                    const periodo = calcularPeriodoFatura(conta, mes_fatura, ano_fatura);

                    const despesasDoCartao = despesas.filter((d: any) => {
                      const pertenceCartao =
                        d.conta_id === conta.id ||
                        ((d.metodo_pagamento === "cartao_credito" || d.forma_pagamento === "cartao_credito") && (!d.conta_id || d.conta_id === conta.id));
                      if (!pertenceCartao) return false;
                      return d.data > periodo.data_inicio && d.data <= periodo.data_fechamento;
                    });
                    totalDespesasCartao = despesasDoCartao.reduce((acc, d) => acc + Number(d.valor || 0), 0);
                  } else {
                    const despesasDoCartao = despesas.filter(
                      (d: any) =>
                        d.conta_id === conta.id ||
                        ((d.metodo_pagamento === "cartao_credito" || d.forma_pagamento === "cartao_credito") && (!d.conta_id || d.conta_id === conta.id))
                    );
                    totalDespesasCartao = despesasDoCartao.reduce((acc, d) => acc + Number(d.valor || 0), 0);
                  }

                  const totalFaturaUsado = totalDividas + totalDespesasCartao;
                  const limiteTotal = Number(conta.limite_credito || 0);
                  const limiteDisponivel = Math.max(0, limiteTotal - totalFaturaUsado);

                  const bankColor = conta.cor || "#3B82F6";
                  const pctUsado = limiteTotal > 0 ? Math.min(100, (totalFaturaUsado / limiteTotal) * 100) : 0;

                  return (
                    <div
                      key={conta.id}
                      className="relative border border-[#1E2942] bg-[#0B132B] rounded-[24px] overflow-hidden transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-2xl group p-5 space-y-4"
                      style={{
                        boxShadow: `0 10px 30px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(30, 41, 66, 0.8), 0 0 20px -5px ${bankColor}1A`
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = bankColor + "66";
                        e.currentTarget.style.boxShadow = `0 15px 35px -8px rgba(0,0,0,0.6), 0 0 0 1px ${bankColor}40, 0 0 25px -2px ${bankColor}2B`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#1E2942";
                        e.currentTarget.style.boxShadow = `0 10px 30px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(30, 41, 66, 0.8), 0 0 20px -5px ${bankColor}1A`;
                      }}
                    >
                      {/* Decorative gradient corner */}
                      <div
                        className="absolute -right-16 -top-16 w-36 h-36 rounded-full blur-3xl opacity-[0.06] transition-opacity group-hover:opacity-[0.12] pointer-events-none"
                        style={{ backgroundColor: bankColor }}
                      />

                      <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-3">
                          <BankLogoBadge bankName={conta.nome} className="w-10 h-10 shadow-md border border-[#1E2942]/60" />
                          <div>
                            <h3 className="font-bold text-white text-base tracking-tight">{conta.nome}</h3>
                            <p className="text-xs text-slate-400 font-medium">{TIPO_LABELS[conta.tipo] || conta.tipo}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAbrirEditar(conta)}
                            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-[#1E2942]/60 rounded-lg"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-[#0B132B] border-[#1E2942] text-white rounded-[24px]">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
                                <AlertDialogDescription className="text-slate-400">
                                  Essa ação não poderá ser desfeita. A conta "{conta.nome}" será permanentemente removida.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="bg-transparent border-[#1E2942] text-white hover:bg-[#1E2942] rounded-xl">Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteConta(conta.id)}
                                  className="bg-rose-500 hover:bg-rose-600 text-white rounded-xl"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      {conta.tipo === "cartao_credito" ? (
                        <div className="space-y-3 pt-3 border-t border-[#1E2942] relative z-10">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-medium">Limite Total</span>
                            <span className="font-extrabold text-emerald-400 text-base">
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(limiteTotal)}
                            </span>
                          </div>

                          <div className="space-y-1.5 pt-1 border-t border-[#1E2942]/50">
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span>Fatura Atual / Usado</span>
                              <span className="font-bold text-rose-400 text-sm">
                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalFaturaUsado)}
                              </span>
                            </div>
                            {limiteTotal > 0 && (
                              <div className="space-y-1">
                                <div className="w-full h-2 bg-[#141E33] rounded-full overflow-hidden border border-[#1E2942]/40 p-[1px]">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${pctUsado}%`,
                                      background: pctUsado > 80
                                        ? "linear-gradient(90deg, #F43F5E, #BE123C)"
                                        : pctUsado > 50
                                          ? "linear-gradient(90deg, #EAB308, #CA8A04)"
                                          : `linear-gradient(90deg, ${bankColor}, ${bankColor}CC)`
                                    }}
                                  />
                                </div>
                                <div className="flex justify-between text-[9px] text-slate-500 font-semibold px-0.5">
                                  <span>{pctUsado.toFixed(0)}% usado</span>
                                  <span>Disp: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(limiteDisponivel)}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                            <div className="bg-[#141E33]/40 border border-[#1E2942]/60 rounded-xl p-2 text-center">
                              <p className="text-[10px] text-slate-400 font-medium">Fechamento</p>
                              <p className="font-bold text-slate-200 mt-0.5">Dia {conta.dia_fechamento || "--"}</p>
                            </div>
                            <div className="bg-[#141E33]/40 border border-[#1E2942]/60 rounded-xl p-2 text-center">
                              <p className="text-[10px] text-slate-400 font-medium">Vencimento</p>
                              <p className="font-bold text-slate-200 mt-0.5">Dia {conta.dia_vencimento || "--"}</p>
                            </div>
                          </div>

                          <Button
                            onClick={() => handleAbrirFatura(conta)}
                            className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs h-10 rounded-xl transition-all duration-300 shadow-md hover:shadow-indigo-500/10 active:scale-[0.98]"
                          >
                            Ver Fatura do Cartão
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3 pt-3 border-t border-[#1E2942] relative z-10">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-medium">Saldo Disponível</span>
                            <span className="text-xl font-black text-white tracking-tight">
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                                conta.saldo_atual || 0
                              )}
                            </span>
                          </div>

                          {dividasVinculadas.length > 0 ? (
                            <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-2.5 flex items-center justify-between text-xs mt-1.5">
                              <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
                                <CreditCard className="w-3.5 h-3.5 text-rose-400/80" />
                                {dividasVinculadas.length} dívida(s)
                              </span>
                              <span className="font-extrabold text-rose-400">
                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                                  totalDividas
                                )}
                              </span>
                            </div>
                          ) : (
                            <div className="bg-[#141E33]/30 border border-[#1E2942]/40 rounded-xl p-2.5 flex items-center gap-2 text-[11px] text-slate-400 mt-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Nenhuma dívida pendente
                            </div>
                          )}
                          {(() => {
                            const investimentosDaConta = investimentos.filter(
                              (inv) => inv.conta_id === conta.id
                            );
                            const totalInvestidoDaConta = investimentosDaConta.reduce(
                              (acc, inv) => acc + Number(inv.valor_atual || 0),
                              0
                            );

                            if (investimentosDaConta.length === 0) return null;

                            return (
                              <div className="mt-3 pt-3 border-t border-[#1E2942]/60">
                                <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center justify-between">
                                  <span className="flex items-center gap-1">💰 Investimentos vinculados</span>
                                  {isLocked && (
                                    <span 
                                      className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 cursor-pointer hover:bg-amber-500/20"
                                      onClick={() => setShowUnlockModal(true)}
                                    >
                                      <Lock className="w-2.5 h-2.5 animate-pulse" /> Bloqueado
                                    </span>
                                  )}
                                </p>
                                <div className="space-y-1">
                                  {investimentosDaConta.map((inv) => (
                                    <div key={inv.id} className="flex justify-between text-xs">
                                      <span className="text-slate-300">{inv.nome}</span>
                                      <span className="text-slate-200 font-mono">
                                        {isLocked ? (
                                          <span 
                                            className="text-slate-500 cursor-pointer hover:text-slate-300 font-sans text-[10px] bg-[#1E2942]/50 px-1.5 py-0.5 rounded border border-[#1E2942]"
                                            onClick={() => setShowUnlockModal(true)}
                                          >
                                            •••••
                                          </span>
                                        ) : (
                                          new Intl.NumberFormat("pt-BR", {
                                            style: "currency",
                                            currency: "BRL",
                                          }).format(inv.valor_atual || 0)
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-between text-xs font-bold mt-2 pt-2 border-t border-[#1E2942]/40">
                                  <span className="text-slate-400">Total investido</span>
                                  <span className="text-emerald-400 font-mono">
                                    {isLocked ? (
                                      <span 
                                        className="text-slate-500 cursor-pointer hover:text-slate-300 font-sans text-[10px] bg-[#1E2942]/50 px-1.5 py-0.5 rounded border border-[#1E2942]"
                                        onClick={() => setShowUnlockModal(true)}
                                      >
                                        •••••
                                      </span>
                                    ) : (
                                      new Intl.NumberFormat("pt-BR", {
                                        style: "currency",
                                        currency: "BRL",
                                      }).format(totalInvestidoDaConta)
                                    )}
                                  </span>
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-8 rounded-xl font-bold"
                                    onClick={() => setActiveTab("investimentos")}
                                  >
                                    Ver na Carteira
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white h-8 rounded-xl font-bold flex items-center justify-center gap-1"
                                    onClick={() => {
                                      setPreSelectedContaId(conta.id);
                                      setOpenNovoAtivo(true);
                                      setActiveTab("investimentos");
                                    }}
                                  >
                                    <Plus className="w-3.5 h-3.5" /> Novo Ativo
                                  </Button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="investimentos" className="space-y-6 mt-0">
            <InvestimentosView
              initialOpenNovoAtivo={openNovoAtivo}
              initialContaId={preSelectedContaId}
              onCloseNovoAtivo={() => {
                setOpenNovoAtivo(false);
                setPreSelectedContaId(undefined);
              }}
            />
          </TabsContent>
        </Tabs>

        {/* Modal Manual de Criar/Editar Conta */}
        <Dialog open={modalAberto} onOpenChange={setModalAberto}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{contaEditando ? "Editar Conta" : "Nova Conta / Cartão"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome da Conta / Banco</Label>
                <Input
                  id="nome"
                  placeholder="Ex: Nubank, Itaú, Carteira..."
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Conta</Label>
                <select
                  id="tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="conta_corrente">Conta Corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="carteira">Carteira / Dinheiro</option>
                  <option value="outro">Outro</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="saldoInicial">Saldo Inicial</Label>
                  <Input
                    id="saldoInicial"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={saldoInicial}
                    onChange={(e) => setSaldoInicial(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="saldoAtual">Saldo Atual</Label>
                  <Input
                    id="saldoAtual"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={saldoAtual}
                    onChange={(e) => setSaldoAtual(e.target.value)}
                  />
                </div>
              </div>

              {tipo === "cartao_credito" && (
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <div className="space-y-2">
                    <Label htmlFor="limiteCredito">Limite de Crédito</Label>
                    <Input
                      id="limiteCredito"
                      type="number"
                      step="0.01"
                      placeholder="5000,00"
                      value={limiteCredito}
                      onChange={(e) => setLimiteCredito(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="diaFechamento">Dia Fechamento</Label>
                      <Input
                        id="diaFechamento"
                        type="number"
                        min="1"
                        max="31"
                        placeholder="Ex: 1"
                        value={diaFechamento}
                        onChange={(e) => setDiaFechamento(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="diaVencimento">Dia Vencimento</Label>
                      <Input
                        id="diaVencimento"
                        type="number"
                        min="1"
                        max="31"
                        placeholder="Ex: 10"
                        value={diaVencimento}
                        onChange={(e) => setDiaVencimento(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSalvar} className="bg-blue-500 hover:bg-blue-600">
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Fatura Organizze */}
        <FaturaCartaoModal
          cartao={cartaoFatura}
          open={modalFaturaAberto}
          onOpenChange={setModalFaturaAberto}
        />

        {/* Modal Importador de Extrato OFX / CSV */}
        <ImportadorExtratoModal
          open={modalExtratoAberto}
          onOpenChange={setModalExtratoAberto}
        />

        {/* Modal Open Finance Pluggy */}
        <PluggyConnectModal
          open={modalPluggyAberto}
          onOpenChange={setModalPluggyAberto}
          openWidgetDirectly={modalPluggyProps.openWidgetDirectly}
          initialConnectorId={modalPluggyProps.initialConnectorId}
        />

        {/* Modal de Transferência Entre Contas */}
        <TransferenciaModal
          isOpen={modalTransferenciaAberto}
          onClose={() => setModalTransferenciaAberto(false)}
        />

        {/* Modal de Nova Despesa Rápida */}
        <NovaDespesaModal
          isOpen={modalDespesaAberto}
          onClose={() => setModalDespesaAberto(false)}
        />

        {/* Modal de Nova Receita Rápida */}
        <NovaReceitaModal
          isOpen={modalReceitaAberto}
          onClose={() => setModalReceitaAberto(false)}
        />

        {showUnlockModal && (
          <InvestimentoSenhaModal 
            onSuccess={() => setShowUnlockModal(false)} 
            onClose={() => setShowUnlockModal(false)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
