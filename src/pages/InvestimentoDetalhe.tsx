import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  TrendingUp,
  ArrowLeft,
  Calendar,
  Layers,
  Percent,
  Trash2,
  Download,
  AlertCircle,
  FileText,
  DollarSign,
  Briefcase,
  Sparkles,
} from "lucide-react";
import { useInvestimentos, calcularIR, calcularPrecoMedio, calcularRentabilidadeReal } from "../domains/finance/hooks/useInvestimentos";
import { useDepositosInvestimento } from "../domains/finance/hooks/useDepositosInvestimento";
import { useProjecaoInvestimentos } from "../domains/finance/hooks/useProjecaoInvestimentos";
import { useProventosEsperados } from "../domains/finance/hooks/useProventosEsperados";
import { useMetasInvestimento } from "../domains/finance/hooks/useMetasInvestimento";
import { format } from "date-fns";

export default function InvestimentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { investimentos, updateInvestimento, deleteInvestimento } = useInvestimentos();
  const { depositos, deleteDeposito, createDeposito } = useDepositosInvestimento(id);
  const { proventos, createProvento, deleteProvento } = useProventosEsperados();
  const { metas } = useMetasInvestimento();
  const { projetar } = useProjecaoInvestimentos();

  // Find current investment
  const inv = investimentos.find((i) => i.id === id);

  // Form edit states
  const [nome, setNome] = useState(inv?.nome || "");
  const [instituicao, setInstituicao] = useState(inv?.instituicao || "");
  const [taxaRendimento, setTaxaRendimento] = useState(inv?.taxa_rendimento_anual ? String(inv.taxa_rendimento_anual) : "");
  const [taxaRef, setTaxaRef] = useState(inv?.taxa_referencia || "CDI");
  const [codigoB3, setCodigoB3] = useState(inv?.codigo_b3 || "");
  const [metaId, setMetaId] = useState(inv?.meta_id || "nenhuma");

  // State for new expectation provento form
  const [novoProv, setNovoProv] = useState({
    data_pagamento: new Date().toISOString().split("T")[0],
    valor_estimado: "",
    tipo: "dividendo" as any,
  });

  if (!inv) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <AlertCircle className="w-12 h-12 text-slate-500" />
          <h2 className="text-xl font-bold">Investimento não encontrado</h2>
          <Button onClick={() => navigate("/contas")}>Voltar para Contas & Cartões</Button>
        </div>
      </DashboardLayout>
    );
  }

  // Preço Médio e Métricas
  const totalValorInvestido = inv.valor_investido || 0;
  const totalValorAtual = inv.valor_atual || 0;
  const rentabilidadeAbsoluta = totalValorAtual - totalValorInvestido;
  const rentabilidadePercentual = totalValorInvestido > 0 ? (rentabilidadeAbsoluta / totalValorInvestido) * 100 : 0;
  const isProfit = totalValorAtual >= totalValorInvestido;

  const precoMedio = calcularPrecoMedio(depositos);

  // Projeção Rápida
  const ipcaDefault = 4.5;
  const projecoes1m = projetar(totalValorAtual, inv.taxa_rendimento_anual, 1, 0, true, true, ipcaDefault)[0];
  const projecoes3m = projetar(totalValorAtual, inv.taxa_rendimento_anual, 3, 0, true, true, ipcaDefault)[2];
  const projecoes6m = projetar(totalValorAtual, inv.taxa_rendimento_anual, 6, 0, true, true, ipcaDefault)[5];
  const projecoes1a = projetar(totalValorAtual, inv.taxa_rendimento_anual, 12, 0, true, true, ipcaDefault)[11];
  const projecoes5a = projetar(totalValorAtual, inv.taxa_rendimento_anual, 60, 0, true, true, ipcaDefault)[59];

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateInvestimento.mutateAsync({
      id: inv.id,
      nome,
      instituicao: instituicao || undefined,
      taxa_rendimento_anual: Number(taxaRendimento),
      taxa_referencia: taxaRef,
      codigo_b3: codigoB3 || undefined,
      meta_id: metaId === "nenhuma" ? undefined : metaId,
    });
  };

  const handleAddProvento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoProv.valor_estimado) return;

    await createProvento.mutateAsync({
      investimento_id: inv.id,
      data_pagamento: novoProv.data_pagamento,
      valor_estimado: Number(novoProv.valor_estimado),
      tipo: novoProv.tipo,
      status: "previsto",
    });

    setNovoProv((prev) => ({ ...prev, valor_estimado: "" }));
  };

  const handleDeletarAtivo = async () => {
    if (confirm("Deseja realmente excluir este investimento? Todos os aportes associados serão deletados.")) {
      await deleteInvestimento.mutateAsync(inv.id);
      navigate("/contas");
    }
  };

  // Filtrar proventos deste ativo
  const proventosAtivo = proventos.filter((p) => p.investimento_id === inv.id);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back and Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="border-[#1E2942] hover:bg-slate-800" onClick={() => navigate("/contas")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-2">
              {inv.nome}
              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] h-5 uppercase">
                {inv.tipo.replace("_", " ")}
              </Badge>
            </h1>
            <p className="text-xs text-slate-400">{inv.instituicao || "Instituição não especificada"}</p>
          </div>
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-0 bg-[#0B132B]/60 border border-[#1E2942]">
            <CardContent className="p-4">
              <span className="text-[10px] text-slate-400 block font-semibold">Valor Atual</span>
              <span className="text-lg font-extrabold text-slate-100">{formatCurrency(totalValorAtual)}</span>
            </CardContent>
          </Card>

          <Card className="border-0 bg-[#0B132B]/60 border border-[#1E2942]">
            <CardContent className="p-4">
              <span className="text-[10px] text-slate-400 block font-semibold">Preço de Aquisição</span>
              <span className="text-lg font-extrabold text-slate-100">{formatCurrency(totalValorInvestido)}</span>
            </CardContent>
          </Card>

          <Card className="border-0 bg-[#0B132B]/60 border border-[#1E2942]">
            <CardContent className="p-4">
              <span className="text-[10px] text-slate-400 block font-semibold">Preço Médio Unitário</span>
              <span className="text-lg font-extrabold text-slate-100">{formatCurrency(precoMedio)}</span>
            </CardContent>
          </Card>

          <Card className={`border-0 border ${isProfit ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"}`}>
            <CardContent className="p-4">
              <span className="text-[10px] text-slate-400 block font-semibold">Lucro / Prejuízo</span>
              <span className={`text-lg font-extrabold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                {isProfit ? "+" : ""}
                {formatCurrency(rentabilidadeAbsoluta)} ({rentabilidadePercentual.toFixed(2)}%)
              </span>
            </CardContent>
          </Card>
        </div>

        {/* DETAILS TABS */}
        <Tabs defaultValue="geral" className="w-full space-y-6">
          <TabsList className="bg-[#0B132B] border border-[#1E2942] p-1 rounded-xl w-full sm:w-auto flex overflow-x-auto">
            <TabsTrigger value="geral" className="text-xs font-bold data-[state=active]:bg-emerald-600">
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="projecoes" className="text-xs font-bold data-[state=active]:bg-emerald-600">
              Projeções Futuras
            </TabsTrigger>
            <TabsTrigger value="depositos" className="text-xs font-bold data-[state=active]:bg-emerald-600">
              Histórico de Aportes
            </TabsTrigger>
            <TabsTrigger value="proventos" className="text-xs font-bold data-[state=active]:bg-emerald-600">
              Proventos / Dividendos
            </TabsTrigger>
            <TabsTrigger value="config" className="text-xs font-bold data-[state=active]:bg-emerald-600">
              Configurações
            </TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="geral" className="space-y-4">
            <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
              <CardHeader className="p-4">
                <CardTitle className="text-sm font-extrabold flex items-center gap-1">
                  <Percent className="w-4 h-4 text-emerald-400" />
                  Informações de Rentabilidade contratada
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-[#1E2942]/60">
                  <span className="text-slate-400">Indexador contratado</span>
                  <span className="font-bold text-slate-200">{inv.taxa_referencia || "Prefixado"}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#1E2942]/60">
                  <span className="text-slate-400">Rendimento Anual Contratado</span>
                  <span className="font-bold text-slate-200">{inv.taxa_rendimento_anual}% a.a.</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#1E2942]/60">
                  <span className="text-slate-400">Data de Início</span>
                  <span className="font-bold text-slate-200">{inv.data_inicio}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-400">Data de Vencimento</span>
                  <span className="font-bold text-slate-200">{inv.data_vencimento || "Sem vencimento (Liquidez Diária)"}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Projeções */}
          <TabsContent value="projecoes" className="space-y-4">
            <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
              <CardHeader className="p-4">
                <CardTitle className="text-sm font-extrabold">Simulação de Juros Compostos</CardTitle>
                <CardDescription className="text-xs">Valores simulados a partir do saldo atual aplicando a taxa contratada.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead>
                    <tr className="border-b border-[#1E2942] text-slate-400">
                      <th className="py-2">Período</th>
                      <th className="py-2 text-right">Valor Bruto</th>
                      <th className="py-2 text-right">Líquido de IR</th>
                      <th className="py-2 text-right">Descontada Inflação (Real)</th>
                      <th className="py-2 text-right">I.R. Devido</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#1E2942]/40">
                      <td className="py-2 font-semibold">1 mês</td>
                      <td className="py-2 text-right text-slate-100 font-bold">{projecoes1m ? formatCurrency(projecoes1m.valorBruto) : "-"}</td>
                      <td className="py-2 text-right text-emerald-400 font-bold">{projecoes1m ? formatCurrency(projecoes1m.valorLiquido) : "-"}</td>
                      <td className="py-2 text-right text-purple-400 font-bold">{projecoes1m ? formatCurrency(projecoes1m.valorReal) : "-"}</td>
                      <td className="py-2 text-right text-rose-400">{projecoes1m ? formatCurrency(projecoes1m.irDevido) : "-"}</td>
                    </tr>
                    <tr className="border-b border-[#1E2942]/40">
                      <td className="py-2 font-semibold">3 meses</td>
                      <td className="py-2 text-right text-slate-100 font-bold">{projecoes3m ? formatCurrency(projecoes3m.valorBruto) : "-"}</td>
                      <td className="py-2 text-right text-emerald-400 font-bold">{projecoes3m ? formatCurrency(projecoes3m.valorLiquido) : "-"}</td>
                      <td className="py-2 text-right text-purple-400 font-bold">{projecoes3m ? formatCurrency(projecoes3m.valorReal) : "-"}</td>
                      <td className="py-2 text-right text-rose-400">{projecoes3m ? formatCurrency(projecoes3m.irDevido) : "-"}</td>
                    </tr>
                    <tr className="border-b border-[#1E2942]/40">
                      <td className="py-2 font-semibold">6 meses</td>
                      <td className="py-2 text-right text-slate-100 font-bold">{projecoes6m ? formatCurrency(projecoes6m.valorBruto) : "-"}</td>
                      <td className="py-2 text-right text-emerald-400 font-bold">{projecoes6m ? formatCurrency(projecoes6m.valorLiquido) : "-"}</td>
                      <td className="py-2 text-right text-purple-400 font-bold">{projecoes6m ? formatCurrency(projecoes6m.valorReal) : "-"}</td>
                      <td className="py-2 text-right text-rose-400">{projecoes6m ? formatCurrency(projecoes6m.irDevido) : "-"}</td>
                    </tr>
                    <tr className="border-b border-[#1E2942]/40">
                      <td className="py-2 font-semibold">1 ano</td>
                      <td className="py-2 text-right text-slate-100 font-bold">{projecoes1a ? formatCurrency(projecoes1a.valorBruto) : "-"}</td>
                      <td className="py-2 text-right text-emerald-400 font-bold">{projecoes1a ? formatCurrency(projecoes1a.valorLiquido) : "-"}</td>
                      <td className="py-2 text-right text-purple-400 font-bold">{projecoes1a ? formatCurrency(projecoes1a.valorReal) : "-"}</td>
                      <td className="py-2 text-right text-rose-400">{projecoes1a ? formatCurrency(projecoes1a.irDevido) : "-"}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-semibold">5 anos</td>
                      <td className="py-2 text-right text-slate-100 font-bold">{projecoes5a ? formatCurrency(projecoes5a.valorBruto) : "-"}</td>
                      <td className="py-2 text-right text-emerald-400 font-bold">{projecoes5a ? formatCurrency(projecoes5a.valorLiquido) : "-"}</td>
                      <td className="py-2 text-right text-purple-400 font-bold">{projecoes5a ? formatCurrency(projecoes5a.valorReal) : "-"}</td>
                      <td className="py-2 text-right text-rose-400">{projecoes5a ? formatCurrency(projecoes5a.irDevido) : "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Histórico de Aportes */}
          <TabsContent value="depositos" className="space-y-4">
            <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
              <CardHeader className="p-4">
                <CardTitle className="text-sm font-extrabold flex items-center justify-between">
                  Aportes Efetuados
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                {depositos.length > 0 ? (
                  <div className="space-y-2">
                    {depositos.map((dep) => (
                      <div key={dep.id} className="flex justify-between items-center p-3 bg-[#1C2541]/30 rounded-2xl border border-[#1E2942]/40">
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-slate-200 block">
                            {formatCurrency(Number(dep.valor))}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Qtd: {dep.quantidade || 1} | Data: {dep.data}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {dep.comprovante_url && (
                            <a
                              href={dep.comprovante_url}
                              target="_blank"
                              rel="noreferrer"
                              className="bg-slate-800 hover:bg-slate-700 text-[10px] text-emerald-400 font-semibold px-2.5 py-1.5 rounded-xl border border-emerald-500/20 inline-flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              Comprovante
                            </a>
                          )}
                          <Button
                            size="icon"
                            variant="destructive"
                            className="w-7 h-7 rounded-lg"
                            onClick={() => deleteDeposito.mutate(dep.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-slate-400">Sem depósitos registrados neste ativo.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Proventos / Dividendos */}
          <TabsContent value="proventos" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Formulário Novo Provento */}
              <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-bold text-slate-200">Adicionar Dividendos Futuros</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <form onSubmit={handleAddProvento} className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-300">Valor Estimado (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Ex: 50.00"
                        className="bg-[#1C2541]/50 border-[#1E2942] h-9"
                        value={novoProv.valor_estimado}
                        onChange={(e) => setNovoProv({ ...novoProv, valor_estimado: e.target.value })}
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-300">Data de Pagamento</Label>
                      <Input
                        type="date"
                        className="bg-[#1C2541]/50 border-[#1E2942] h-9"
                        value={novoProv.data_pagamento}
                        onChange={(e) => setNovoProv({ ...novoProv, data_pagamento: e.target.value })}
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-300">Tipo de Rendimento</Label>
                      <Select
                        value={novoProv.tipo}
                        onValueChange={(val: any) => setNovoProv({ ...novoProv, tipo: val })}
                      >
                        <SelectTrigger className="bg-[#1C2541]/50 border-[#1E2942] h-9">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0B132B] border-[#1E2942]">
                          <SelectItem value="dividendo">Dividendo</SelectItem>
                          <SelectItem value="jcp">Juros sobre Capital Próprio (JCP)</SelectItem>
                          <SelectItem value="rendimento_fii">Rendimento FII</SelectItem>
                          <SelectItem value="outro">Outro Rendimento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold h-9">
                      Adicionar Provento
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Lista Proventos do Ativo */}
              <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl md:col-span-2">
                <CardHeader className="p-4">
                  <CardTitle className="text-sm font-extrabold">Histórico de Proventos</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {proventosAtivo.length > 0 ? (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto">
                      {proventosAtivo.map((prov) => (
                        <div key={prov.id} className="flex justify-between items-center p-2.5 bg-[#1C2541]/30 rounded-2xl border border-[#1E2942]/40">
                          <div className="space-y-0.5">
                            <span className="text-xs font-bold text-slate-200 block">
                              {formatCurrency(prov.valor_estimado)} ({prov.tipo.replace("_", " ")})
                            </span>
                            <span className="text-[10px] text-slate-400">Data: {prov.data_pagamento} | Status: {prov.status}</span>
                          </div>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="w-7 h-7 rounded-lg"
                            onClick={() => deleteProvento.mutate(prov.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-xs text-slate-400">Sem proventos cadastrados para este ativo.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Configurações */}
          <TabsContent value="config" className="space-y-4">
            <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
              <CardHeader className="p-4">
                <CardTitle className="text-sm font-extrabold">Configurações do Ativo</CardTitle>
                <CardDescription className="text-xs">Edite as informações básicas do investimento.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <form onSubmit={handleUpdateConfig} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-slate-300">Nome do Ativo</Label>
                      <Input
                        placeholder="Nome do ativo"
                        className="bg-[#1C2541]/50 border-[#1E2942] h-9"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-slate-300">Instituição Financeira</Label>
                      <Input
                        placeholder="XP, Inter, Itaú..."
                        className="bg-[#1C2541]/50 border-[#1E2942] h-9"
                        value={instituicao}
                        onChange={(e) => setInstituicao(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-slate-300">Rendimento Contratado (% a.a.)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="10"
                        className="bg-[#1C2541]/50 border-[#1E2942] h-9"
                        value={taxaRendimento}
                        onChange={(e) => setTaxaRendimento(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-slate-300">Indexador</Label>
                      <Input
                        placeholder="CDI, IPCA..."
                        className="bg-[#1C2541]/50 border-[#1E2942] h-9"
                        value={taxaRef}
                        onChange={(e) => setTaxaRef(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-slate-300">Código B3 / Ticker</Label>
                      <Input
                        placeholder="PETR4, MXRF11..."
                        className="bg-[#1C2541]/50 border-[#1E2942] h-9"
                        value={codigoB3}
                        onChange={(e) => setCodigoB3(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-slate-300">Meta Vinculada</Label>
                      <Select value={metaId} onValueChange={setMetaId}>
                        <SelectTrigger className="bg-[#1C2541]/50 border-[#1E2942] h-9">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0B132B] border-[#1E2942]">
                          <SelectItem value="nenhuma">Sem meta associada</SelectItem>
                          {metas.map((m) => (
                            <SelectItem key={m.id} value={m.id} className="text-foreground">
                              {m.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-[#1E2942]/60">
                    <Button type="button" variant="destructive" className="font-bold h-9" onClick={handleDeletarAtivo}>
                      Deletar Investimento
                    </Button>
                    <Button type="submit" className="bg-emerald-600 hover:bg-emerald-500 font-bold h-9">
                      Salvar Alterações
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
