import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { ComparativoDiarioView } from "./ComparativoDiarioView";
import { ComparativoMensalView } from "./ComparativoMensalView";
import { getComparativosLocation, parseComparativosView, type ComparativosViewMode } from "./comparativosNavigation";

const choices: Array<[ComparativosViewMode, string]> = [["completa", "Painel completo"], ["diaria", "Somente diário"], ["mensal", "Somente mensal"]];

export function ComparativosView() {
  const [params, setParams] = useSearchParams();
  const mode = parseComparativosView(params);
  useEffect(() => {
    if (params.get("visao") !== mode || params.get("aba") !== "comparativos") setParams(getComparativosLocation(params, mode), { replace: true });
  }, [mode, params, setParams]);
  return <div data-testid="comparativos-view" className="space-y-5 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/10 via-background to-background p-3 sm:p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[10px] uppercase tracking-[0.2em] text-blue-400">Relatórios / Comparativos</p><h2 className="text-xl font-bold">Central de desempenho financeiro</h2><p className="text-xs text-muted-foreground">Ritmo atual e evolução histórica com dados reais do workspace</p></div><div className="flex flex-wrap rounded-xl border bg-card p-1">{choices.map(([value, label]) => <Button key={value} size="sm" variant={mode === value ? "default" : "ghost"} data-state={mode === value ? "active" : "inactive"} onClick={() => setParams(getComparativosLocation(params, value))}>{label}</Button>)}</div></div>
    {mode === "completa" ? <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.15fr_0.85fr]"><ComparativoDiarioView compact /><ComparativoMensalView compact /></div> : mode === "diaria" ? <ComparativoDiarioView /> : <ComparativoMensalView />}
  </div>;
}
