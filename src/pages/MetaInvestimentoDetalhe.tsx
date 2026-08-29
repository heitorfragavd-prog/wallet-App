import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import {
  ArrowLeft,
  
  
  TrendingUp,
  Layers,
  Calendar,
  AlertCircle,
  HelpCircle,
  PieChart as PieIcon,
  Trash2,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { useMetasInvestimento, calcularTempoAteMeta } from "../domains/finance/hooks/useMetasInvestimento";
import { useInvestimentos } from "../domains/finance/hooks/useInvestimentos";
import { useRebalanceamento } from "../domains/finance/hooks/useRebalanceamento";

export default function MetaInvestimentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { metas, updateMeta, deleteMeta } = useMetasInvestimento();
  const { investimentos } = useInvestimentos();
  const { calcularAlocacaoAtual, sugerirAporte } = useRebalanceamento();

  // Find meta
  const meta = metas.find((m) => m.id === id);

  // Simulator state
  const [simAporteMensal, setSimAporteMensal] = useState("");
  const [simMesesAlvo, setSimMesesAlvo] = useState("");

  if (!meta) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <AlertCircle className="w-12 h-12 text-slate-500" />
          <h2 className="text-xl font-bold">Meta não encontrada</h2>
          <Button onClick={() => navigate("/contas")}>Voltar para Contas & Cartões</Button>
        </div>
      </DashboardLayout>
    );
  }

  // Linked investments
  const linkedInvs = investimentos.filter((inv) => inv.meta_id === meta.id);
  const totalAtualMeta = linkedInvs.reduce((sum, inv) => sum + Number(inv.valor_atual || 0), 0);

  // Sync / update meta current balance in database if it differs
  useEffect(() => {
    if (meta && meta.valor_atual !== totalAtualMeta) {
      updateMeta.mutate({ id: meta.id, valor_atual: totalAtualMeta });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.id, totalAtualMeta]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const progress = Math.min(100, (totalAtualMeta / Number(meta.valor_meta || 1)) * 100);

  // Simulações
  const taxaAnualSim = 8; // Taxa de rendimento estimada padrão
  const tempoSemAporte = calcularTempoAteMeta(meta, taxaAnualSim, 0);
  const tempoComAporte = simAporteMensal ? calcularTempoAteMeta(meta, taxaAnualSim, Number(simAporteMensal)) : null;

  // Cálculo de aporte necessário para atingir em Z meses
  // Formula: target = current * (1+r)^z + W * (((1+r)^z - 1) / r)
  // => W = (target - current * (1+r)^z) / (((1+r)^z - 1) / r)
  let aporteNecessarioSim: number | null = null;
  if (simMesesAlvo && Number(simMesesAlvo) > 0) {
    const target = Number(meta.valor_meta || 0);
    const current = Number(totalAtualMeta || 0);
    const z = Number(simMesesAlvo);
    const r = Math.pow(1 + taxaAnualSim / 100, 1 / 12) - 1;

    if (z > 0) {
      const comp = Math.pow(1 + r, z);
      const factor = (comp - 1) / r;
      aporteNecessarioSim = Math.max(0, (target - current * comp) / factor);
    }
  }

  // Alocação ideal vs real da meta
  const { pctFixa, pctVariavel } = calcularAlocacaoAtual(linkedInvs);

  const allocationData = [
    {
      name: "Renda Fixa",
      Ideal: meta.alocacao_fixa,
      Atual: Math.round(pctFixa),
    },
    {
      name: "Renda Variável",
      Ideal: meta.alocacao_variavel,
      Atual: Math.round(pctVariavel),
    },
  ];

  const handleDeletarMeta = async () => {
    if (confirm("Deseja realmente excluir esta meta de investimentos?")) {
      await deleteMeta.mutateAsync(meta.id);
      navigate("/contas");
    }
  };

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
              Meta: {meta.nome}
              <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] h-5 uppercase">
                {meta.tipo.replace("_", " ")}
              </Badge>
            </h1>
            <p className="text-xs text-slate-400">{meta.descricao || "Objetivo sem descrição"}</p>
          </div>
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-0 bg-[#0B132B]/60 border border-[#1E2942]">
            <CardContent className="p-5 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 block font-semibold">Valor Acumulado</span>
              <span className="text-xl font-extrabold text-slate-100">{formatCurrency(totalAtualMeta)}</span>
            </CardContent>
          </Card>

          <Card className="border-0 bg-[#0B132B]/60 border border-[#1E2942]">
            <CardContent className="p-5 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 block font-semibold">Valor da Meta</span>
              <span className="text-xl font-extrabold text-slate-100">{formatCurrency(meta.valor_meta)}</span>
            </CardContent>
          </Card>

          <Card className="border-0 bg-[#0B132B]/60 border border-[#1E2942]">
            <CardContent className="p-5 flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 block font-semibold">Prazo de Resgate</span>
              <span className="text-xl font-extrabold text-slate-100">{meta.data_objetivo || "Não definido"}</span>
            </CardContent>
          </Card>
        </div>

        {/* PROGRESS BAR */}
        <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl p-5 space-y-3">
          <div className="flex justify-between text-xs font-bold">
            <span>Progresso Geral</span>
            <span>{progress.toFixed(1)}% completo</span>
          </div>
          <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
            <div className="bg-amber-400 h-full rounded-full" style={{ width: `${progress}%` }} />
          </div>
        </Card>

        {/* GRID ACTIONS & ATIVOS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Simulador de Aportes */}
          <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-extrabold flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Simulador de Aportes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="p-3 bg-[#1C2541]/40 border border-[#1E2942]/60 rounded-2xl text-xs space-y-1">
                <span className="text-slate-400 block">Tempo sem novos aportes (somente juros a 8% a.a.):</span>
                <span className="font-bold text-slate-100 text-sm">
                  {tempoSemAporte >= 999 ? "Infinito (sem rendimento e sem aporte)" : `${tempoSemAporte} meses`}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-slate-300">Simular Aporte Mensal (R$)</Label>
                  <Input
                    type="number"
                    placeholder="Ex: R$ 200"
                    className="bg-[#1C2541]/50 border-[#1E2942] h-9 text-xs"
                    value={simAporteMensal}
                    onChange={(e) => setSimAporteMensal(e.target.value)}
                  />
                  {tempoComAporte !== null && (
                    <span className="text-[10px] text-emerald-400 block mt-1 font-bold">
                      Atingirá em {tempoComAporte} meses!
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-slate-300">Atingir em (meses)</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 12"
                    className="bg-[#1C2541]/50 border-[#1E2942] h-9 text-xs"
                    value={simMesesAlvo}
                    onChange={(e) => setSimMesesAlvo(e.target.value)}
                  />
                  {aporteNecessarioSim !== null && (
                    <span className="text-[10px] text-amber-400 block mt-1 font-bold">
                      Aporte necessário: {formatCurrency(aporteNecessarioSim)} / mês
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Comparativo de Alocação */}
          <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-extrabold flex items-center gap-1.5">
                <PieIcon className="w-4 h-4 text-purple-400" />
                Alocação Ideal vs Real
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex items-center justify-center">
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={allocationData}>
                    <XAxis dataKey="name" stroke="#64748B" fontSize={10} />
                    <YAxis stroke="#64748B" fontSize={10} unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: "#0B132B", borderColor: "#1E2942" }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Ideal" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Atual" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* LINKED INVESTMENTS CARD */}
        <Card className="border-[#1E2942] bg-[#0B132B]/60 rounded-3xl">
          <CardHeader className="p-4">
            <CardTitle className="text-sm font-extrabold flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              Ativos Vinculados a esta Meta
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            {linkedInvs.length > 0 ? (
              <div className="space-y-2">
                {linkedInvs.map((inv) => (
                  <div key={inv.id} className="flex justify-between items-center p-3 bg-[#1C2541]/30 rounded-2xl border border-[#1E2942]/40">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-200 block">{inv.nome}</span>
                      <span className="text-[10px] text-slate-400">Tipo: {inv.tipo.replace("_", " ")}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-200 block">{formatCurrency(inv.valor_atual)}</span>
                      <span className="text-[10px] text-slate-400">Rendimento: {inv.taxa_rendimento_anual}% {inv.taxa_referencia}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-400">Nenhum ativo vinculado a esta meta.</div>
            )}
          </CardContent>
        </Card>

        {/* DANGER AREA FOR DELETION */}
        <div className="flex justify-end pt-4">
          <Button variant="destructive" className="font-bold flex items-center gap-1.5 rounded-2xl" onClick={handleDeletarMeta}>
            <Trash2 className="w-4 h-4" />
            Excluir Meta
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
