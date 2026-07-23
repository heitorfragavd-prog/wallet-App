import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
  DialogTrigger,
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
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { useContasUsuario, ContaUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { useDividas } from "@/domains/finance/hooks/useDividas";
import { BankLogoBadge, BANCOS_BRASIL_LIST } from "@/shared/components/BankLogoBadge";

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
  const { dividas } = useDividas();

  const [modalAberto, setModalAberto] = useState(false);
  const [contaEditando, setContaEditando] = useState<ContaUsuario | null>(null);

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

  const handleAbrirEditar = (c: ContaUsuario) => {
    setContaEditando(c);
    setNome(c.nome);
    setTipo(c.tipo);
    setSaldoInicial(c.saldo_inicial !== undefined ? String(c.saldo_inicial) : "");
    setSaldoAtual(c.saldo_atual !== undefined ? String(c.saldo_atual) : "");
    setLimiteCredito(c.limite_credito !== undefined ? String(c.limite_credito) : "");
    setDiaFechamento(c.dia_fechamento !== undefined ? String(c.dia_fechamento) : "");
    setDiaVencimento(c.dia_vencimento !== undefined ? String(c.dia_vencimento) : "");
    setCor(c.cor || "#3B82F6");
    setModalAberto(true);
  };

  const handleSalvar = async () => {
    if (!nome) return;

    const payload = {
      nome,
      tipo,
      saldo_inicial: parseFloat(saldoInicial) || 0,
      saldo_atual: parseFloat(saldoAtual || saldoInicial) || 0,
      limite_credito: tipo === "cartao_credito" ? parseFloat(limiteCredito) || 0 : 0,
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

          <Button onClick={handleAbrirCriar} className="bg-blue-500 hover:bg-blue-600">
            <Plus className="w-4 h-4 mr-2" />
            Nova Conta / Cartão
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo Consolidado</p>
                  <p className="text-2xl font-bold text-foreground">
                    R$ {saldoConsolidado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/20">
                  <Wallet className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-purple-500/10 to-purple-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Cartões de Crédito</p>
                  <p className="text-2xl font-bold text-purple-500">{cartoesCredito.length} cartão(ões)</p>
                </div>
                <div className="p-3 rounded-xl bg-purple-500/20">
                  <CreditCard className="w-5 h-5 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Limite Crédito Total</p>
                  <p className="text-2xl font-bold text-emerald-500">
                    R$ {totalLimiteCredito.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/20">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Contas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              Carregando contas...
            </div>
          ) : contas.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              Nenhuma conta ou cartão cadastrado. Clique no botão acima para adicionar.
            </div>
          ) : (
            contas.map((c) => {
              const IconComp = TIPO_ICONS[c.tipo] || Building2;
              const isCartao = c.tipo === "cartao_credito";

              return (
                <Card key={c.id} className="border border-border bg-card hover:border-border/80 transition-all">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-3">
                      <BankLogoBadge nomeOuId={c.nome} size="md" />
                      <div>
                        <CardTitle className="text-base font-semibold">{c.nome}</CardTitle>
                        <CardDescription className="text-xs">
                          {TIPO_LABELS[c.tipo]}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAbrirEditar(c)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir Conta</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir a conta "{c.nome}"? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteConta(c.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-2 space-y-3">
                    {!isCartao ? (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Saldo Atual</span>
                        <span className="font-bold text-foreground text-lg">
                          R$ {(Number(c.saldo_atual) || Number(c.saldo_inicial) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Limite Total</span>
                          <span className="font-bold text-emerald-500">
                            R$ {(Number(c.limite_credito) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border">
                          <div>
                            <span className="text-muted-foreground">Fechamento</span>
                            <p className="font-medium text-foreground">Dia {c.dia_fechamento || "—"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Vencimento</span>
                            <p className="font-medium text-foreground">Dia {c.dia_vencimento || "—"}</p>
                          </div>
                        </div>
                      </>
                    )}

                    {(() => {
                      const dividasVinculadas = dividas.filter((d) => d.conta_id === c.id && d.status !== "quitada");
                      const totalRestante = dividasVinculadas.reduce((sum, d) => sum + Number(d.valor_restante), 0);
                      if (dividasVinculadas.length === 0) return null;

                      return (
                        <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <CreditCard className="w-3 h-3 text-rose-500" />
                            {dividasVinculadas.length} dívida(s) vinculada(s)
                          </span>
                          <span className="font-semibold text-rose-500">
                            R$ {totalRestante.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Modal de Cadastro / Edição */}
        <Dialog open={modalAberto} onOpenChange={setModalAberto}>
          <DialogContent className="w-[95vw] max-w-lg sm:max-w-lg overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                {contaEditando ? "Editar Conta / Cartão" : "Nova Conta / Cartão"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2 w-full min-w-0">
              <div className="space-y-1.5 w-full min-w-0">
                <Label className="text-xs text-muted-foreground">Selecione o Banco / Instituição</Label>
                <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-border/60 bg-muted/20 max-h-32 overflow-y-auto">
                  {BANCOS_BRASIL_LIST.map((b) => (
                    <button
                      key={b.slug}
                      type="button"
                      onClick={() => {
                        setNome(b.nome);
                        setCor(b.corBg);
                      }}
                      className="shrink-0 transition-transform hover:scale-110 focus:outline-none"
                      title={b.nome}
                    >
                      <BankLogoBadge slug={b.slug} size="sm" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome da Conta / Cartão *</Label>
                <Input
                  id="nome"
                  placeholder="Ex: Nubank, Itaú, Carteira..."
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tipo">Tipo *</Label>
                <select
                  id="tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as any)}
                  className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="conta_corrente">Conta Corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="carteira">Carteira / Dinheiro</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="outro">Outro</option>
                </select>
              </div>

              {tipo !== "cartao_credito" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="saldoInicial">Saldo Inicial (R$)</Label>
                  <Input
                    id="saldoInicial"
                    type="number"
                    placeholder="0,00"
                    value={saldoInicial}
                    onChange={(e) => setSaldoInicial(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="limite">Limite do Cartão (R$)</Label>
                    <Input
                      id="limite"
                      type="number"
                      placeholder="0,00"
                      value={limiteCredito}
                      onChange={(e) => setLimiteCredito(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="fechamento">Dia Fechamento</Label>
                      <Input
                        id="fechamento"
                        type="number"
                        min="1"
                        max="31"
                        placeholder="Ex: 5"
                        value={diaFechamento}
                        onChange={(e) => setDiaFechamento(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vencimento">Dia Vencimento</Label>
                      <Input
                        id="vencimento"
                        type="number"
                        min="1"
                        max="31"
                        placeholder="Ex: 12"
                        value={diaVencimento}
                        onChange={(e) => setDiaVencimento(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Cor de Identificação</Label>
                <div className="flex items-center gap-2">
                  {["#3B82F6", "#8B5CF6", "#EC4899", "#10B981", "#F97316", "#EF4444"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        cor === c ? "scale-125 ring-2 ring-white" : ""
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
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
      </div>
    </DashboardLayout>
  );
}
