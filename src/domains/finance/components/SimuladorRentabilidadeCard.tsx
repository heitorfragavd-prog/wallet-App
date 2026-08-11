import { useSimuladorRentabilidade } from "@/domains/finance/hooks/useSimuladorRentabilidade";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { TrendingUp, Clock } from "lucide-react";

const PERIODOS = [
  { label: "1 mês", meses: 1 },
  { label: "3 meses", meses: 3 },
  { label: "6 meses", meses: 6 },
  { label: "1 ano", meses: 12 },
  { label: "5 anos", meses: 60 },
];

interface SimuladorRentabilidadeCardProps {
  selectedAssetIds?: string[];
  simulatedValues?: Record<string, number>;
}

export function SimuladorRentabilidadeCard({
  selectedAssetIds,
  simulatedValues,
}: SimuladorRentabilidadeCardProps) {
  const { periodoMeses, setPeriodoMeses, resultado } = useSimuladorRentabilidade(
    selectedAssetIds,
    simulatedValues
  );

  if (!resultado) return null;

  return (
    <Card className="bg-[#0B132B]/50 border-[#1E2942] rounded-3xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-100">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          Simulador de Rentabilidade
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <Button
              key={p.meses}
              size="sm"
              variant={periodoMeses === p.meses ? "default" : "outline"}
              className={`text-xs rounded-full ${
                periodoMeses === p.meses
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "border-[#1E2942] text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30"
              }`}
              onClick={() => setPeriodoMeses(p.meses)}
            >
              <Clock className="w-3.5 h-3.5 mr-1" />
              {p.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1E2942]/40 rounded-2xl p-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Patrimônio Atual</p>
            <p className="text-lg font-bold text-slate-200">
              {resultado.totalAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>

          <div className="bg-[#1E2942]/40 rounded-2xl p-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Projetado ({periodoMeses}m)</p>
            <p className="text-lg font-bold text-emerald-400">
              {resultado.valorLiquido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>

          <div className="bg-[#1E2942]/40 rounded-2xl p-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Rendimento Bruto</p>
            <p className="text-sm font-semibold text-slate-200">
              {resultado.rendimento.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>

          <div className="bg-[#1E2942]/40 rounded-2xl p-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">IR ({resultado.aliquotaIR.toFixed(1)}%)</p>
            <p className="text-sm font-semibold text-red-400">
              -{resultado.ir.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>

          <div className="bg-[#1E2942]/40 rounded-2xl p-3 col-span-2">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Taxa Média Ponderada / Ano</p>
            <p className="text-sm font-semibold text-emerald-400">
              {resultado.taxaMediaAnual.toFixed(2)}% a.a.
            </p>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 text-center">
          Projeção baseada na taxa média ponderada dos ativos atuais. Não garante retorno futuro.
        </p>
      </CardContent>
    </Card>
  );
}
