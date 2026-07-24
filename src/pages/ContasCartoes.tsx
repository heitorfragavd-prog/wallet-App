import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
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
  Calendar,
  UploadCloud,
  ShieldCheck,
} from "lucide-react";
import { useContasUsuario, ContaUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { BankLogoBadge } from "@/shared/components/BankLogoBadge";
import { FaturaCartaoModal } from "@/domains/finance/components/FaturaCartaoModal";
import { ImportadorExtratoModal } from "@/domains/finance/components/ImportadorExtratoModal";
import { PluggyConnectModal } from "@/domains/finance/components/PluggyConnectModal";

const TIPO_LABELS: Record<string, string> = {
  conta_corrente: "Conta Corrente",
  poupanca: "Poupança",
  carteira: "Carteira / Dinheiro",
  cartao_credito: "Cartão de Crédito",
  outro: "Outra Conta",
};

const TIPO_ICONS: Record<string, any> = {
  conta_corrente: Building2,
  poupanca: PiggyBank,
  carteira: Wallet,
  cartao_credito: CreditCard,
  outro: DollarSign,
};

export default function ContasCartoes() {
  const { contas, loading, saldoConsolidado, cartoesCredito, createConta, updateConta, deleteConta } = useContasUsuario();

  const [modalAberto, setModalAberto] = useState(false);
  const [contaEditando, setContaEditando] = useState<ContaUsuario | null>(null);

  const [cartaoFatura, setCartaoFatura] = useState<ContaUsuario | null>(null);
  const [modalFaturaAberto, setModalFaturaAberto] = useState(false);

  const [modalExtratoAberto, setModalExtratoAberto] = useState(false);
  const [modalPluggyAberto, setModalPluggyAberto] = useState(false);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<ContaUsuario["tipo"]>("conta_corrente");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [saldoAtual, setSaldoAtual] = useState("");
  const [limiteCredito, setLimiteCredito] = useState("");
  const [diaFechamento, setDiaFechamento] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("");
  const [cor, setCor] = useState("#3B82F6");

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
    setSaldoInicial(conta.saldo_inicial.toString());
    setSaldoAtual(conta.saldo_atual.toString());
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
      saldo_inicial: parseFloat(saldoInicial) || 0,
      saldo_atual: parseFloat(saldoAtual) || 0,
      limite_credito: tipo === "cartao_credito" ? parseFloat(limiteCredito) || undefined : undefined,
      dia_fechamento: tipo === "cartao_credito" ? parseInt(diaFechamento) || undefined : undefined,
      dia_vencimento: tipo === "cartao_credito" ? parseInt(diaVencimento) || undefined : undefined,
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

  const totalLimiteCredito = cartoesCredito.reduce((acc, c) => acc + (Number(c.limite_credito) || 0), 0);

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
              onClick={() => setModalPluggyAberto(true)}
              className="border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10 font-semibold"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Open Finance (Pluggy)
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo Consolidado</p>
                  <p className="text-2xl font-bold text-foreground">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(saldoConsolidado)}
                  </p>
                </div>
                <div className="bg-blue-500/20 p-2.5 rounded-xl text-blue-500">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-purple-500/10 to-purple-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Limite de Crédito Total</p>
                  <p className="text-2xl font-bold text-foreground">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalLimiteCredito)}
                  </p>
                </div>
                <div className="bg-purple-500/20 p-2.5 rounded-xl text-purple-500">
                  <CreditCard className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total de Contas / Cartões</p>
                  <p className="text-2xl font-bold text-foreground">{contas.length}</p>
                </div>
                <div className="bg-emerald-500/20 p-2.5 rounded-xl text-emerald-500">
                  <Building2 className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Contas */}
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Carregando contas...</div>
        ) : contas.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="py-12 text-center space-y-4">
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto" />
              <div>
                <h3 className="font-semibold text-lg">Nenhuma conta cadastrada</h3>
                <p className="text-sm text-muted-foreground">
                  Adicione suas contas bancárias, cartões de crédito ou carteira para começar.
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <Button onClick={() => setModalPluggyAberto(true)} className="bg-emerald-500 hover:bg-emerald-600 font-semibold">
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
              const isCartao = conta.tipo === "cartao_credito";

              return (
                <Card key={conta.id} className="group hover:border-blue-500/50 transition-all shadow-sm">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <BankLogoBadge nomeOuId={conta.nome} size="md" />
                        <div>
                          <CardTitle className="text-base font-semibold">{conta.nome}</CardTitle>
                          <Badge variant="secondary" className="text-[10px] mt-0.5">
                            {TIPO_LABELS[conta.tipo] || conta.tipo}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleAbrirEditar(conta)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-600">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não poderá ser desfeita. Isso excluirá permanentemente a conta{" "}
                                <strong>{conta.nome}</strong>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteConta(conta.id)}
                                className="bg-rose-500 hover:bg-rose-600"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 pt-2 space-y-3">
                    <div className="pt-2 border-t border-border/50">
                      <p className="text-xs text-muted-foreground">
                        {isCartao ? "Fatura / Limite Usado" : "Saldo Atual"}
                      </p>
                      <p
                        className={`text-xl font-bold ${
                          isCartao
                            ? "text-purple-500"
                            : conta.saldo_atual >= 0
                            ? "text-emerald-500"
                            : "text-rose-500"
                        }`}
                      >
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                          conta.saldo_atual
                        )}
                      </p>
                    </div>

                    {isCartao && (
                      <div className="space-y-2 pt-2 border-t border-border/50 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Limite total:</span>
                          <span className="font-semibold">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                              conta.limite_credito || 0
                            )}
                          </span>
                        </div>
                        {conta.dia_fechamento && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Fechamento:</span>
                            <span>Dia {conta.dia_fechamento}</span>
                          </div>
                        )}
                        {conta.dia_vencimento && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Vencimento:</span>
                            <span>Dia {conta.dia_vencimento}</span>
                          </div>
                        )}

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleAbrirFatura(conta)}
                          className="w-full mt-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 font-semibold"
                        >
                          <Calendar className="w-3.5 h-3.5 mr-1.5" /> Ver Fatura do Cartão
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

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

        {/* Modal Open Finance Pluggy (Seleção Direta de Bancos em Dark Mode) */}
        <PluggyConnectModal
          open={modalPluggyAberto}
          onOpenChange={setModalPluggyAberto}
        />
      </div>
    </DashboardLayout>
  );
}
