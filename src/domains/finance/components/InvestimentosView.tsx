import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  TrendingUp,
  Plus,
  RefreshCw,
  Layers,
  PieChart as PieIcon,
  Target,
  Download,
  Calendar,
  Lock,
  ArrowRight,
  ShieldCheck,
  Eye,
  FileSpreadsheet,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Cell,
  Pie,
} from "recharts";
import { useInvestimentos, calcularIR, calcularRentabilidadeReal } from "../hooks/useInvestimentos";
import { useDepositosInvestimento } from "../hooks/useDepositosInvestimento";
import { useProjecaoInvestimentos, obterTaxaRealAnual } from "../hooks/useProjecaoInvestimentos";
import { useMetasInvestimento } from "../hooks/useMetasInvestimento";
import { useProventosEsperados } from "../hooks/useProventosEsperados";
import { useRebalanceamento } from "../hooks/useRebalanceamento";
import { useSenhaInvestimentos } from "../hooks/useSenhaInvestimentos";
import { useConfiguracoesInvestimentos } from "../hooks/useConfiguracoesInvestimentos";
import { useToast } from "@/shared/hooks/use-toast";
import { InvestimentoSenhaModal } from "./InvestimentoSenhaModal";
import { NovoDepositoIAModal } from "./NovoDepositoIAModal";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/shared/components/ui/accordion";
import { useContasUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { SimuladorRentabilidadeCard } from "./SimuladorRentabilidadeCard";
import { SimuladorJurosCompostosCard } from "./SimuladorJurosCompostosCard";
import * as XLSX from "xlsx";

const COLORS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#6B7280"];

interface InvestimentosViewProps {
  initialOpenNovoAtivo?: boolean;
  initialContaId?: string;
  onCloseNovoAtivo?: () => void;
}

export const InvestimentosView: React.FC<InvestimentosViewProps> = ({
  initialOpenNovoAtivo = false,
  initialContaId,
  onCloseNovoAtivo
}) => {
  const navigate = useNavigate();

  // Hooks do Módulo de Investimento
  const { isLocked, hasPassword, logoutInvestimentos } = useSenhaInvestimentos();
  const { investimentos, isLoading: loadInvs, createInvestimento, deleteInvestimento } = useInvestimentos();
  const { metas, createMeta } = useMetasInvestimento();
  const { proventos, proximosProventos, totalProventosMes } = useProventosEsperados();
  const { calcularAlocacaoAtual, sugerirAporte } = useRebalanceamento();
  const { projetarPatrimonioTotal } = useProjecaoInvestimentos();
  const { configuracoes, saveConfiguracao, atualizarCotacoes } = useConfiguracoesInvestimentos();
  const { contas } = useContasUsuario();
  const { toast } = useToast();

  // Modais State
  const [modalNovoAtivo, setModalNovoAtivo] = useState(initialOpenNovoAtivo);
  const [modalNovaMeta, setModalNovaMeta] = useState(false);
  const [modalAporte, setModalAporte] = useState(false);
  const [preSelectedId, setPreSelectedId] = useState<string | undefined>(undefined);

  // Estado para seleção de ativos no simulador
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [simulatedValues, setSimulatedValues] = useState<Record<string, number>>({});

  // Efeito para carregar e sincronizar investimentos inicialmente no simulador
  React.useEffect(() => {
    if (investimentos && investimentos.length > 0) {
      setSimulatedValues((prev) => {
        const next = { ...prev };
        let updated = false;
        investimentos.forEach((i) => {
          if (next[i.id] === undefined) {
            next[i.id] = i.valor_atual || 0;
            updated = true;
          }
        });
        return updated ? next : prev;
      });

      setSelectedAssetIds((prev) => {
        const next = [...prev];
        let updated = false;
        investimentos.forEach((i) => {
          if (!next.includes(i.id)) {
            next.push(i.id);
            updated = true;
          }
        });
        return updated ? next : prev;
      });
    }
  }, [investimentos]);

  const handleCheckboxChange = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedAssetIds((prev) => [...prev, id]);
      if (simulatedValues[id] === undefined) {
        const inv = investimentos.find((i) => i.id === id);
        setSimulatedValues((prev) => ({ ...prev, [id]: inv?.valor_atual || 0 }));
      }
    } else {
      setSelectedAssetIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleValChange = (id: string, value: number) => {
    setSimulatedValues((prev) => ({ ...prev, [id]: value }));
  };

  const investimentosAgrupados = useMemo(() => {
    const grupos: Record<string, { nome: string; itens: typeof investimentos }> = {};
    investimentos.forEach((inv) => {
      const chave = inv.conta_id || "sem_conta";
      if (!grupos[chave]) {
        grupos[chave] = { 
          nome: inv.contas_usuario?.nome || "Sem conta vinculada", 
          itens: [] 
        };
      }
      grupos[chave].itens.push(inv);
    });
    return Object.values(grupos);
  }, [investimentos]);

  React.useEffect(() => {
    if (initialOpenNovoAtivo) {
      setModalNovoAtivo(true);
      if (initialContaId) {
        setNovoAtivo((prev) => ({ ...prev, conta_id: initialContaId }));
      }
    }
  }, [initialOpenNovoAtivo, initialContaId]);

  // Form State Novo Ativo
  const [novoAtivo, setNovoAtivo] = useState({
    nome: "",
    tipo: "renda_fixa" as any,
    instituicao: "",
    taxa_rendimento_anual: "",
    taxa_referencia: "CDI",
    data_inicio: new Date().toISOString().split("T")[0],
    data_vencimento: "",
    codigo_b3: "",
    cnpj_instituicao: "",
    conta_id: "" as string | undefined,
  });

  // Form State Nova Meta
  const [novaMeta, setNovaMeta] = useState({
    nome: "",
    descricao: "",
    valor_meta: "",
    tipo: "reserva_emergencia" as any,
    alocacao_fixa: "60",
    alocacao_variavel: "40",
  });

  // Rebalanceamento Simulation State
  const [simulacaoValor, setSimulacaoValor] = useState("");
  const [sugestoesRebal, setSugestoesRebal] = useState<any[]>([]);

  // Se a tela estiver bloqueada por senha, renderiza o modal de autenticação
  if (isLocked) {
    return <InvestimentoSenhaModal onSuccess={() => window.location.reload()} />;
  }

  // Cálculos de Resumo
  const totalBruto = investimentos.reduce((acc, inv) => acc + Number(inv.valor_atual || 0), 0);

  // Calcula valores líquidos e reais usando as configurações ativas ou individuais
  const totalLiquido = investimentos.reduce((acc, inv) => {
    const rendimento = Math.max(0, Number(inv.valor_atual || 0) - Number(inv.valor_investido || 0));
    // Simula tempo de aplicação como 365 dias padrão para fins de IR consolidado rápido
    const { liquido } = calcularIR(rendimento, 365);
    return acc + Number(inv.valor_investido || 0) + liquido;
  }, 0);

  const totalReal = investimentos.reduce((acc, inv) => {
    const real = calcularRentabilidadeReal(Number(inv.valor_atual || 0), 12, configuracoes?.taxa_ipca_anual || 4.5);
    return acc + real;
  }, 0);

  // Escolha do valor a ser exibido baseado nas configurações salvas no banco
  const valorExibido = configuracoes?.mostrar_liquido_ir
    ? totalLiquido
    : configuracoes?.mostrar_real_ipca
    ? totalReal
    : totalBruto;

  const labelValorExibido = configuracoes?.mostrar_liquido_ir
    ? "Patrimônio Líquido IR"
    : configuracoes?.mostrar_real_ipca
    ? "Patrimônio Real (IPCA)"
    : "Patrimônio Bruto";

  // Alocação de Ativos
  const alocacao = calcularAlocacaoAtual(investimentos);



  // Cópia para o gráfico de pizza
  const pieData = [
    { name: "Renda Fixa", value: alocacao.valorFixa },
    { name: "Renda Variável", value: alocacao.valorVariavel },
  ].filter((d) => d.value > 0);

  // Projeção a 12 meses
  const dadosProjecao = projetarPatrimonioTotal(
    investimentos,
    12,
    0,
    configuracoes?.taxa_ipca_anual || 4.5
  );

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const handleExportarIR = () => {
    if (investimentos.length === 0) return;

    // Cabeçalho da Receita Federal
    const dataExport = investimentos.map((inv) => ({
      Codigo: inv.codigo_b3 || "N/A",
      Descricao: `Investimento em ${inv.nome} via ${inv.instituicao || "Carteira"}.`,
      CNPJ_Custodiante: inv.cnpj_instituicao || "00.000.000/0001-00",
      Quantidade: inv.tipo === "renda_fixa" ? 1 : 100, // Estimado ou unitário
      PM: formatCurrency(Number(inv.valor_investido)),
      Valor_Total_Aquisicao: formatCurrency(Number(inv.valor_investido)),
      Valor_Atual: formatCurrency(Number(inv.valor_atual)),
    }));

    const ws = XLSX.utils.json_to_sheet(dataExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bens e Direitos");
    XLSX.writeFile(wb, `Declaracao_IR_Bens_${new Date().getFullYear()}.xlsx`);
  };

  const handleCadastrarAtivo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoAtivo.nome || !novoAtivo.taxa_rendimento_anual) return;

    await createInvestimento.mutateAsync({
      nome: novoAtivo.nome,
      tipo: novoAtivo.tipo,
      instituicao: novoAtivo.instituicao || undefined,
      taxa_rendimento_anual: Number(novoAtivo.taxa_rendimento_anual),
      taxa_referencia: novoAtivo.taxa_referencia || undefined,
      data_inicio: novoAtivo.data_inicio,
      data_vencimento: novoAtivo.data_vencimento || undefined,
      ativo: true,
      valor_investido: 0,
      valor_atual: 0,
      codigo_b3: novoAtivo.codigo_b3 || undefined,
      cnpj_instituicao: novoAtivo.cnpj_instituicao || undefined,
      conta_id: novoAtivo.conta_id || undefined,
    });

    setModalNovoAtivo(false);
    setNovoAtivo({
      nome: "",
      tipo: "renda_fixa",
      instituicao: "",
      taxa_rendimento_anual: "",
      taxa_referencia: "CDI",
      data_inicio: new Date().toISOString().split("T")[0],
      data_vencimento: "",
      codigo_b3: "",
      cnpj_instituicao: "",
      conta_id: undefined,
    });
  };

  const handleCadastrarMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMeta.nome || !novaMeta.valor_meta) return;

    const fixa = Number(novaMeta.alocacao_fixa);
    const variavel = Number(novaMeta.alocacao_variavel);
    if (fixa + variavel !== 100) {
      toast({
        variant: "destructive",
        title: "Alocação inválida",
        description: `A soma deve ser 100%. Atual: ${fixa + variavel}%`,
      });
      return;
    }

    await createMeta.mutateAsync({
      nome: novaMeta.nome,
      descricao: novaMeta.descricao || undefined,
      valor_meta: Number(novaMeta.valor_meta),
      valor_atual: 0,
      tipo: novaMeta.tipo,
      alocacao_fixa: fixa,
      alocacao_variavel: variavel,
      ativo: true,
    });

    setModalNovaMeta(false);
    setNovaMeta({
      nome: "",
      descricao: "",
      valor_meta: "",
      tipo: "reserva_emergencia",
      alocacao_fixa: "60",
      alocacao_variavel: "40",
    });
  };

  const handleSimularRebalanceamento = () => {
    if (!simulacaoValor || metas.length === 0) return;
    const sugestoes = sugerirAporte(investimentos, metas[0], Number(simulacaoValor));
    setSugestoesRebal(sugestoes);
  };

  return (
    <div className="space-y-6">
      {/* HEADER E CONTROLES */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0B132B]/60 p-4 border border-[#1E2942] rounded-3xl backdrop-blur-md">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            Central de Investimentos
          </h2>
          <p className="text-xs text-slate-400">
            Painel consolidado e segurança reforçada por senha.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="border-[#1E2942] hover:bg-slate-800 flex items-center gap-1.5"
            onClick={() => atualizarCotacoes()}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar Cotações
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="border-[#1E2942] hover:bg-slate-800 flex items-center gap-1.5 text-emerald-400"
            onClick={handleExportarIR}
            disabled={investimentos.length === 0}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Exportar I.R.
          </Button>

          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 font-bold flex items-center gap-1.5"
            onClick={() => setModalNovoAtivo(true)}
          >
            <Plus className="w-4 h-4" />
            Novo Ativo
          </Button>

          <Button
            size="sm"
            variant="destructive"
            className="font-bold flex items-center gap-1.5"
            onClick={logoutInvestimentos}
          >
            <Lock className="w-3.5 h-3.5" />
            Bloquear
          </Button>
        </div>
      </div>

      {/* METRICAS E SWITCHES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card Principal de Patrimonio */}
        <Card className="border-0 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 relative overflow-hidden rounded-3xl border border-emerald-500/10">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-300">{labelValorExibido}</p>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-3xl font-extrabold text-emerald-400 tracking-tight">
              {formatCurrency(valorExibido)}
            </p>
            <div className="flex items-center gap-4 text-xs text-slate-400 pt-2 border-t border-emerald-500/10">
              <div>
                <span className="block font-bold text-slate-200">{formatCurrency(totalBruto)}</span>
                Bruto
              </div>
              <div>
                <span className="block font-bold text-slate-200">{formatCurrency(totalLiquido)}</span>
                Líq. IR
              </div>
              <div>
                <span className="block font-bold text-slate-200">{formatCurrency(totalReal)}</span>
                Real (IPCA)
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Simulador de Rentabilidade */}
        <SimuladorRentabilidadeCard selectedAssetIds={selectedAssetIds} simulatedValues={simulatedValues} />

        {/* Configurações Rápidas de Exibição */}
        <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold text-slate-200">Preferências de Exibição</CardTitle>
            <CardDescription className="text-xs">Altere a forma como os rendimentos são calculados na tela.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-2.5 bg-[#1C2541]/30 rounded-2xl border border-[#1E2942]/40">
              <div className="space-y-0.5">
                <span className="text-xs font-bold block text-slate-200">Exibir Líquido de IR</span>
                <span className="text-[10px] text-slate-400">Aplica tabela regressiva no saldo.</span>
              </div>
              <Switch
                checked={configuracoes?.mostrar_liquido_ir || false}
                onCheckedChange={(checked) =>
                  saveConfiguracao.mutate({ mostrar_liquido_ir: checked, mostrar_real_ipca: false })
                }
              />
            </div>

            <div className="flex items-center justify-between p-2.5 bg-[#1C2541]/30 rounded-2xl border border-[#1E2942]/40">
              <div className="space-y-0.5">
                <span className="text-xs font-bold block text-slate-200">Descontar Inflação (Real IPCA)</span>
                <span className="text-[10px] text-slate-400">Deduz a taxa do IPCA acumulado.</span>
              </div>
              <Switch
                checked={configuracoes?.mostrar_real_ipca || false}
                onCheckedChange={(checked) =>
                  saveConfiguracao.mutate({ mostrar_real_ipca: checked, mostrar_liquido_ir: false })
                }
              />
            </div>

            <div className="flex flex-col gap-1.5 p-2.5 bg-[#1C2541]/30 rounded-2xl border border-[#1E2942]/40 col-span-1 sm:col-span-2">
              <Label className="text-xs font-bold text-slate-200">Valor mínimo para Sweep de Caixa (R$)</Label>
              <Input
                type="number"
                placeholder="2000"
                className="bg-[#1C2541]/50 border-[#1E2942] h-9 text-xs"
                value={configuracoes?.sweep_caixa_minimo ?? 2000}
                onChange={(e) => saveConfiguracao.mutate({ sweep_caixa_minimo: Number(e.target.value) })}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* GRAFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Simulador de Juros Compostos — ocupa 2/3 */}
        <div className="lg:col-span-2">
          <SimuladorJurosCompostosCard />
        </div>

        {/* Gráfico de Distribuição */}
        <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-1.5">
              <PieIcon className="w-5 h-5 text-purple-400" />
              Distribuição da Carteira
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex flex-col items-center justify-center">
            {pieData.length > 0 ? (
              <>
                <div className="h-[160px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value">
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0B132B", borderColor: "#1E2942" }}
                        formatter={(val: number) => [formatCurrency(val), "Alocado"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-4 text-xs mt-2 justify-center">
                  {pieData.map((item, idx) => (
                    <div key={item.name} className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-slate-300 font-medium">
                        {item.name}: {((item.value / alocacao.total) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-[180px] items-center justify-center text-xs text-slate-400">
                Sem dados de alocação de ativos.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CARDS DE INVESTIMENTOS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Meus Ativos
          </h3>
        </div>

        {investimentos.length > 0 ? (
          <Accordion type="multiple" defaultValue={investimentosAgrupados.map((_, i) => String(i))} className="w-full space-y-4">
            {investimentosAgrupados.map((grupo, idx) => (
              <AccordionItem key={idx} value={String(idx)} className="border-0 bg-[#141E33]/30 px-5 py-1 rounded-3xl border border-[#1E2942]/60">
                <AccordionTrigger className="text-sm font-bold text-slate-200 hover:text-emerald-400 py-3 flex items-center justify-between w-full">
                  <div className="flex items-center justify-between w-full pr-4">
                    <span className="flex items-center gap-2">
                      📁 {grupo.nome} ({grupo.itens.length} ativo{grupo.itens.length > 1 ? "s" : ""})
                    </span>
                    <span className="text-emerald-400 font-mono">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(grupo.itens.reduce((sum, item) => sum + (item.valor_atual || 0), 0))}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {grupo.itens.map((inv) => {
                      const totalAporte = inv.valor_investido || 0;
                      const rent = inv.valor_investido > 0 ? ((inv.valor_atual - inv.valor_investido) / inv.valor_investido) * 100 : 0;
                      const isProfit = inv.valor_atual >= inv.valor_investido;

                      const isSelected = selectedAssetIds.includes(inv.id);
                      const simulatedVal = simulatedValues[inv.id] !== undefined ? simulatedValues[inv.id] : (inv.valor_atual || 0);

                      return (
                        <Card
                          key={inv.id}
                          className="bg-[#0B132B]/60 border border-[#1E2942] hover:border-emerald-500/40 transition-all rounded-3xl"
                        >
                          <CardHeader className="p-4 pb-2">
                            <div className="flex justify-between items-start">
                              <div className="space-y-0.5">
                                <CardTitle className="text-sm font-extrabold text-foreground">{inv.nome}</CardTitle>
                                <span className="text-[10px] text-slate-400 font-mono tracking-wider block uppercase">
                                  {inv.codigo_b3 || "Manual"}
                                </span>
                              </div>
                              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] uppercase">
                                {inv.tipo.replace("_", " ")}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4 pt-1 space-y-3">
                            <div className="flex justify-between items-end border-b border-[#1E2942]/60 pb-2">
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-400 block">Valor Atual</span>
                                <span className="text-base font-extrabold text-slate-100">{formatCurrency(inv.valor_atual)}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 block">Rentabilidade</span>
                                <span className={`text-xs font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                                  {isProfit ? "+" : ""}
                                  {rent.toFixed(2)}%
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 text-[10px] text-slate-400 pt-0.5 gap-2 border-b border-[#1E2942]/40 pb-2">
                              <div>
                                Preço de Aquisição:
                                <span className="block text-slate-200 font-bold">{formatCurrency(totalAporte)}</span>
                              </div>
                              <div className="text-right">
                                Rendimento Anual:
                                <span className="block text-slate-200 font-bold">
                                  {inv.taxa_referencia === "CDI" ? `${inv.taxa_rendimento_anual}% CDI` : `${inv.taxa_rendimento_anual}% ${inv.taxa_referencia || "a.a."}`}
                                </span>
                              </div>
                            </div>

                            {/* Rendimento Diário */}
                            <div className="flex justify-between items-center text-[10px] text-slate-400">
                              <span>Rendimento Diário Est.:</span>
                              <span className="text-emerald-400 font-bold font-mono">
                                {(() => {
                                  const taxaRealAnual = obterTaxaRealAnual(inv.taxa_rendimento_anual || 0, inv.taxa_referencia, 4.5);
                                  // Converter taxa anual para taxa diária (252 dias úteis)
                                  const taxaDiaria = Math.pow(1 + taxaRealAnual / 100, 1 / 252) - 1;
                                  const diario = (inv.valor_atual || 0) * taxaDiaria;
                                  return formatCurrency(diario);
                                })()}
                              </span>
                            </div>

                            {/* Simulador de Ativo */}
                            <div className="pt-2 border-t border-[#1E2942]/40 space-y-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id={`sim-check-${inv.id}`}
                                  checked={isSelected}
                                  onChange={(e) => handleCheckboxChange(inv.id, e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-[#1E2942] text-emerald-500 focus:ring-emerald-500/20 accent-emerald-500 bg-[#0B132B] cursor-pointer"
                                />
                                <label htmlFor={`sim-check-${inv.id}`} className="text-[10px] text-slate-300 font-semibold cursor-pointer select-none">
                                  Simular no Painel
                                </label>
                              </div>
                              {isSelected && (
                                <div className="space-y-1">
                                  <span className="text-[9px] text-slate-400 block">Valor Simulado (R$)</span>
                                  <Input
                                    type="number"
                                    value={simulatedVal === 0 ? "" : simulatedVal}
                                    onChange={(e) => handleValChange(inv.id, parseFloat(e.target.value) || 0)}
                                    className="h-7 text-xs bg-[#0B132B]/85 border-[#1E2942] text-slate-200 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50 rounded-xl"
                                    placeholder="Valor para simulação"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2 pt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 border-[#1E2942] hover:bg-slate-800 text-[10px]"
                                onClick={() => {
                                  setPreSelectedId(inv.id);
                                  setModalAporte(true);
                                }}
                              >
                                Depositar
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 bg-slate-800 hover:bg-slate-700 text-[10px]"
                                onClick={() => navigate(`/investimento/${inv.id}`)}
                              >
                                Ver Detalhes
                                <ArrowRight className="w-3 h-3 ml-1" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="text-center bg-[#0B132B]/30 border border-[#1E2942] rounded-3xl p-8">
            <Layers className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">Nenhum ativo cadastrado</p>
            <p className="text-xs text-slate-400 mt-0.5 mb-4">Cadastre seu primeiro investimento para acompanhar seu patrimônio.</p>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 font-bold" onClick={() => setModalNovoAtivo(true)}>
              <Plus className="w-4 h-4 mr-1" /> Cadastrar Primeiro Ativo
            </Button>
          </div>
        )}
      </div>

      {/* SEÇÃO PROVENTOS E METAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximos Proventos */}
        <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-1.5">
              <Calendar className="w-5 h-5 text-emerald-400" />
              Proventos & Dividendos (Mês Atual)
            </CardTitle>
            <Badge className="bg-emerald-500/20 text-emerald-400">
              Total: {formatCurrency(totalProventosMes(new Date().getMonth() + 1, new Date().getFullYear()))}
            </Badge>
          </CardHeader>
          <CardContent className="p-4">
            {proventos.length > 0 ? (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {proventos.map((prov) => (
                  <div key={prov.id} className="flex justify-between items-center p-2.5 bg-[#1C2541]/30 rounded-2xl border border-[#1E2942]/40">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-200 block">{prov.investimentos?.nome}</span>
                      <span className="text-[10px] text-slate-400">Status: {prov.status}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-emerald-400 block">{formatCurrency(prov.valor_estimado)}</span>
                      <span className="text-[10px] text-slate-400">Pago em: {prov.data_pagamento}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-400">Nenhum dividendo previsto para este mês.</div>
            )}
          </CardContent>
        </Card>

        {/* Metas de Investimento */}
        <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-1.5">
              <Target className="w-5 h-5 text-amber-400" />
              Metas de Investimento
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="border-[#1E2942] hover:bg-slate-800 text-[10px] h-7"
              onClick={() => setModalNovaMeta(true)}
            >
              Criar Meta
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            {metas.length > 0 ? (
              <div className="space-y-3">
                {metas.map((meta) => {
                  const progress = Math.min(100, (Number(meta.valor_atual || 0) / Number(meta.valor_meta || 1)) * 100);
                  return (
                    <div key={meta.id} className="p-3 bg-[#1C2541]/30 rounded-2xl border border-[#1E2942]/40 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-200">{meta.nome}</span>
                        <span className="text-xs font-bold text-slate-300">
                          {formatCurrency(meta.valor_atual)} / {formatCurrency(meta.valor_meta)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-amber-400 h-full rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 pt-0.5">
                        <span>Progresso: {progress.toFixed(0)}%</span>
                        <Link to={`/meta-investimento/${meta.id}`} className="text-amber-400 hover:underline flex items-center gap-0.5">
                          Simular & Detalhes
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-400">Nenhuma meta cadastrada.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SEÇÃO REBALANCEAMENTO */}
      <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-bold flex items-center gap-1.5">
            <PieIcon className="w-5 h-5 text-emerald-400" />
            Rebalanceamento Inteligente de Carteira
          </CardTitle>
          <CardDescription className="text-xs">
            Insira o valor que pretende investir e o sistema indicará o melhor ativo para manter a alocação de carteira ideal baseado nas suas metas.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex gap-2 max-w-sm">
            <Input
              type="number"
              placeholder="Ex: R$ 500"
              className="bg-[#1C2541]/50 border-[#1E2942]"
              value={simulacaoValor}
              onChange={(e) => setSimulacaoValor(e.target.value)}
            />
            <Button className="bg-emerald-600 hover:bg-emerald-500 font-bold" onClick={handleSimularRebalanceamento}>
              Calcular
            </Button>
          </div>

          {sugestoesRebal.length > 0 && (
            <div className="space-y-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
              {sugestoesRebal.map((sug, idx) => (
                <div key={idx} className="space-y-1">
                  <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    Sugestão de Alocação: {sug.tipo_sugerido === "renda_fixa" ? "Renda Fixa" : "Renda Variável"}
                  </h4>
                  <p className="text-[11px] text-slate-200">{sug.motivo}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL NOVO ATIVO */}
      <Dialog open={modalNovoAtivo} onOpenChange={(open) => {
        setModalNovoAtivo(open);
        if (!open) onCloseNovoAtivo?.();
      }}>
        <DialogContent className="sm:max-w-[420px] bg-[#0B132B]/95 backdrop-blur-xl border border-[#1E2942] text-foreground rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Cadastrar Novo Ativo
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCadastrarAtivo} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-300">Nome do Ativo</Label>
              <Input
                placeholder="Ex: CDB Banco Inter, FII HGLG11..."
                className="bg-[#1C2541]/50 border-[#1E2942]"
                value={novoAtivo.nome}
                onChange={(e) => setNovoAtivo({ ...novoAtivo, nome: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Tipo de Investimento</Label>
                <Select value={novoAtivo.tipo} onValueChange={(val: any) => setNovoAtivo({ ...novoAtivo, tipo: val })}>
                  <SelectTrigger className="bg-[#1C2541]/50 border-[#1E2942]">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0B132B] border-[#1E2942]">
                    <SelectItem value="renda_fixa">Renda Fixa</SelectItem>
                    <SelectItem value="renda_variavel">Renda Variável</SelectItem>
                    <SelectItem value="fundo">Fundos</SelectItem>
                    <SelectItem value="cripto">Criptoativos</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="outro">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Instituição Financeira</Label>
                <Input
                  placeholder="XP, Inter, Itaú..."
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={novoAtivo.instituicao}
                  onChange={(e) => setNovoAtivo({ ...novoAtivo, instituicao: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">
                  Taxa de Rendimento {(novoAtivo.taxa_referencia || "").trim().toUpperCase() === "CDI" ? "(% do CDI)" : "(% a.a.)"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder={(novoAtivo.taxa_referencia || "").trim().toUpperCase() === "CDI" ? "Ex: 120" : "Ex: 12.5"}
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={novoAtivo.taxa_rendimento_anual}
                  onChange={(e) => setNovoAtivo({ ...novoAtivo, taxa_rendimento_anual: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Indexador / Referência</Label>
                <Input
                  placeholder="Ex: CDI, IPCA, PREFIXADO"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={novoAtivo.taxa_referencia}
                  onChange={(e) => setNovoAtivo({ ...novoAtivo, taxa_referencia: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Data de Início</Label>
                <Input
                  type="date"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={novoAtivo.data_inicio}
                  onChange={(e) => setNovoAtivo({ ...novoAtivo, data_inicio: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Vencimento (opcional)</Label>
                <Input
                  type="date"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={novoAtivo.data_vencimento}
                  onChange={(e) => setNovoAtivo({ ...novoAtivo, data_vencimento: e.target.value })}
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Código B3 / Ticker (opcional)</Label>
                <Input
                  placeholder="Ex: PETR4, MXRF11, BTC"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={novoAtivo.codigo_b3}
                  onChange={(e) => setNovoAtivo({ ...novoAtivo, codigo_b3: e.target.value })}
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">CNPJ da Instituição (para IR)</Label>
                <Input
                  placeholder="00.000.000/0001-00"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={novoAtivo.cnpj_instituicao || ""}
                  onChange={(e) => setNovoAtivo({ ...novoAtivo, cnpj_instituicao: e.target.value })}
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Conta Bancária Vinculada</Label>
                <Select value={novoAtivo.conta_id || "nenhuma"} onValueChange={(val) => setNovoAtivo({ ...novoAtivo, conta_id: val === "nenhuma" ? undefined : val })}>
                  <SelectTrigger className="bg-[#1C2541]/50 border-[#1E2942]">
                    <SelectValue placeholder="Selecione uma conta..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0B132B] border-[#1E2942]">
                    <SelectItem value="nenhuma">Sem conta vinculada</SelectItem>
                    {contas?.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-foreground">{c.nome} ({c.banco})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold mt-2">
              Salvar Ativo
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL NOVA META */}
      <Dialog open={modalNovaMeta} onOpenChange={setModalNovaMeta}>
        <DialogContent className="sm:max-w-[420px] bg-[#0B132B]/95 backdrop-blur-xl border border-[#1E2942] text-foreground rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-400" />
              Criar Nova Meta de Investimento
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCadastrarMeta} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-300">Nome da Meta</Label>
              <Input
                placeholder="Ex: Minha Aposentadoria, Carro Novo..."
                className="bg-[#1C2541]/50 border-[#1E2942]"
                value={novaMeta.nome}
                onChange={(e) => setNovaMeta({ ...novaMeta, nome: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-300">Descrição</Label>
              <Input
                placeholder="Qual o objetivo dessa meta?"
                className="bg-[#1C2541]/50 border-[#1E2942]"
                value={novaMeta.descricao}
                onChange={(e) => setNovaMeta({ ...novaMeta, descricao: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Valor Alvo (R$)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 50000"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={novaMeta.valor_meta}
                  onChange={(e) => setNovaMeta({ ...novaMeta, valor_meta: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Tipo de Meta</Label>
                <Select value={novaMeta.tipo} onValueChange={(val: any) => setNovaMeta({ ...novaMeta, tipo: val })}>
                  <SelectTrigger className="bg-[#1C2541]/50 border-[#1E2942]">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0B132B] border-[#1E2942]">
                    <SelectItem value="reserva_emergencia">Reserva de Emergência</SelectItem>
                    <SelectItem value="aposentadoria">Aposentadoria</SelectItem>
                    <SelectItem value="compra">Compra planejada</SelectItem>
                    <SelectItem value="viagem">Viagem</SelectItem>
                    <SelectItem value="educacao">Educação</SelectItem>
                    <SelectItem value="outro">Outro Objetivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Alocação Fixa Ideal (%)</Label>
                <Input
                  type="number"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={novaMeta.alocacao_fixa}
                  onChange={(e) => setNovaMeta({ ...novaMeta, alocacao_fixa: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Alocação Variável Ideal (%)</Label>
                <Input
                  type="number"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={novaMeta.alocacao_variavel}
                  onChange={(e) => setNovaMeta({ ...novaMeta, alocacao_variavel: e.target.value })}
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold mt-2">
              Criar Meta
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL NOVO DEPOSITO / APORTE COM IA */}
      {modalAporte && (
        <NovoDepositoIAModal
          open={modalAporte}
          onOpenChange={setModalAporte}
          investimentos={investimentos}
          preSelectedInvestimentoId={preSelectedId}
          onSuccess={() => {
            setModalAporte(false);
          }}
        />
      )}
    </div>
  );
};
