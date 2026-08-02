import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useReceitas } from "@/domains/finance/hooks/useReceitas";
import { Calendar } from "@/shared/components/ui/calendar";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { CalendarDays, TrendingUp, TrendingDown, PieChart } from "lucide-react";

interface Compromisso {
  id: string;
  tipo: "receita" | "despesa" | "divida";
  descricao: string;
  valor: number;
  data: string;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TIPO_CONFIG = {
  receita: { label: "Receita", cor: "bg-emerald-500", text: "text-emerald-500", icon: TrendingUp },
  despesa: { label: "Despesa", cor: "bg-red-500", text: "text-red-500", icon: TrendingDown },
  divida: { label: "Dívida", cor: "bg-amber-500", text: "text-amber-500", icon: PieChart },
};

// Despesas e dívidas vêm direto das tabelas. As RECEITAS usam o hook
// useReceitas (consolidação oficial: manuais + PDV dinheiro + Divipay
// líquido) — a Agenda mostra exatamente o mesmo que a tela de Receitas.
async function fetchDespesasEDividas(mes: string, workspaceId: string | null): Promise<Compromisso[]> {
  const [ano, m] = mes.split("-").map(Number);
  const startDate = `${mes}-01`;
  const endDate = new Date(ano, m, 0).toISOString().split("T")[0];

  let despesasQ = supabase.from("despesas").select("id, descricao, valor, data").gte("data", startDate).lte("data", endDate);
  let dividasQ = supabase.from("dividas").select("id, descricao, credor, valor_restante, data_vencimento").gte("data_vencimento", startDate).lte("data_vencimento", endDate);

  if (workspaceId) {
    despesasQ = despesasQ.eq("workspace_id", workspaceId);
    dividasQ = dividasQ.eq("workspace_id", workspaceId);
  }

  const [d, v] = await Promise.all([despesasQ, dividasQ]);
  if (d.error) throw d.error;
  if (v.error) throw v.error;

  return [
    ...(d.data ?? []).map((x): Compromisso => ({ id: x.id, tipo: "despesa", descricao: x.descricao, valor: x.valor, data: x.data })),
    ...(v.data ?? []).map((x): Compromisso => ({
      id: x.id,
      tipo: "divida",
      descricao: x.descricao || x.credor || "Dívida",
      valor: x.valor_restante,
      data: x.data_vencimento,
    })),
  ];
}

const Agenda = () => {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id || null;
  const [dataSelecionada, setDataSelecionada] = useState<Date | undefined>(new Date());
  const [mesRef, setMesRef] = useState(new Date().toISOString().slice(0, 7));

  const { data: saidas = [], isLoading: loadingSaidas } = useQuery({
    queryKey: ["agenda-financeira", { mes: mesRef, workspaceId }],
    queryFn: () => fetchDespesasEDividas(mesRef, workspaceId),
    staleTime: 1000 * 60 * 2,
  });

  // Mesma consolidação da tela de Receitas (manuais + PDV dinheiro + Divipay)
  const [ano, m] = mesRef.split("-").map(Number);
  const mesStart = `${mesRef}-01`;
  const mesEnd = new Date(ano, m, 0).toISOString().split("T")[0];
  const { receitas, loading: loadingReceitas } = useReceitas({ startDate: mesStart, endDate: mesEnd });

  const isLoading = loadingSaidas || loadingReceitas;

  const compromissos = useMemo<Compromisso[]>(() => {
    // Receita consolidada por DIA: uma única linha com o valor total,
    // em vez de listar cada venda individual do PDV/Divipay.
    const receitaPorDia = new Map<string, { total: number; qtd: number }>();
    for (const r of receitas) {
      const dia = String(r.data).split("T")[0];
      const acc = receitaPorDia.get(dia) ?? { total: 0, qtd: 0 };
      acc.total += Number(r.valor);
      acc.qtd += 1;
      receitaPorDia.set(dia, acc);
    }
    const recs: Compromisso[] = [...receitaPorDia.entries()].map(([dia, { total, qtd }]) => ({
      id: `receita-dia-${dia}`,
      tipo: "receita",
      descricao: `Receita do dia (${qtd} ${qtd === 1 ? "venda" : "vendas"})`,
      valor: total,
      data: dia,
    }));
    return [...recs, ...saidas];
  }, [receitas, saidas]);

  const porDia = useMemo(() => {
    const map = new Map<string, Compromisso[]>();
    for (const c of compromissos) {
      const lista = map.get(c.data) ?? [];
      lista.push(c);
      map.set(c.data, lista);
    }
    return map;
  }, [compromissos]);

  const diaStr = dataSelecionada
    ? `${dataSelecionada.getFullYear()}-${String(dataSelecionada.getMonth() + 1).padStart(2, "0")}-${String(dataSelecionada.getDate()).padStart(2, "0")}`
    : null;
  const compromissosDia = diaStr ? porDia.get(diaStr) ?? [] : [];

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Agenda Financeira</h1>
            <p className="text-sm text-muted-foreground">Todos os compromissos do mês em um calendário</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4 flex justify-center">
              <Calendar
                mode="single"
                selected={dataSelecionada}
                onSelect={setDataSelecionada}
                onMonthChange={(d) => setMesRef(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)}
                modifiers={{
                  receita: (date) => {
                    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                    return (porDia.get(key) ?? []).some((c) => c.tipo === "receita");
                  },
                  despesa: (date) => {
                    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                    return (porDia.get(key) ?? []).some((c) => c.tipo === "despesa");
                  },
                  divida: (date) => {
                    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                    return (porDia.get(key) ?? []).some((c) => c.tipo === "divida");
                  },
                }}
                modifiersClassNames={{
                  receita: "bg-emerald-500/20 font-bold",
                  despesa: "bg-red-500/20 font-bold",
                  divida: "bg-amber-500/20 font-bold",
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">
                  {dataSelecionada ? dataSelecionada.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "Selecione um dia"}
                </h3>
                <Badge variant="secondary">{compromissosDia.length} compromisso(s)</Badge>
              </div>

              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : compromissosDia.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum compromisso neste dia.</p>
              ) : (
                <div className="space-y-2">
                  {compromissosDia.map((c) => {
                    const cfg = TIPO_CONFIG[c.tipo];
                    const Icon = cfg.icon;
                    return (
                      <div key={`${c.tipo}-${c.id}`} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                        <div className={`w-2 h-8 rounded-full ${cfg.cor}`} />
                        <Icon className={`h-4 w-4 ${cfg.text}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.descricao}</p>
                          <p className="text-xs text-muted-foreground">{cfg.label}</p>
                        </div>
                        <p className={`text-sm font-bold ${cfg.text}`}>{formatBRL(Number(c.valor))}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Receita</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Despesa</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Dívida</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Agenda;
