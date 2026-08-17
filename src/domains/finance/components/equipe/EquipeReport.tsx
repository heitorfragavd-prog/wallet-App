import { useQuery } from "@tanstack/react-query";
import { Banknote, Bus, HandCoins, ReceiptText, Target, Users } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

type Natureza = "transporte" | "meta" | "diaria" | "salario" | "pro_labore" | "ajuste";
interface Item { natureza: Natureza | string; valor: number | string }
interface Pagamento { taxa: number | string; status: string }

export function aggregateEquipeReport(items: Item[], payments: Pagamento[]) {
  const totals = { transporte: 0, meta: 0, diaria: 0, salario: 0, pro_labore: 0, ajuste: 0 };
  items.forEach((item) => {
    if (item.natureza in totals) totals[item.natureza as Natureza] += Number(item.valor) || 0;
  });
  const taxas = payments.filter((payment) => payment.status === "pago").reduce((sum, payment) => sum + (Number(payment.taxa) || 0), 0);
  const totalEquipe = Object.values(totals).reduce((sum, value) => sum + value, 0);
  return { ...totals, taxas, totalEquipe, totalFinanceiro: totalEquipe + taxas };
}

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function EquipeReport({ startDate, endDate }: { startDate?: string | null; endDate?: string | null }) {
  const { activeWorkspace } = useWorkspace();
  const query = useQuery({
    queryKey: ["equipe-relatorio", activeWorkspace?.id, startDate, endDate],
    enabled: !!activeWorkspace?.id,
    queryFn: async () => {
      const client = supabase as any;
      let acertosQuery = client.from("colaborador_acertos").select("id").eq("workspace_id", activeWorkspace!.id).neq("status", "cancelado");
      if (startDate) acertosQuery = acertosQuery.gte("periodo_fim", startDate);
      if (endDate) acertosQuery = acertosQuery.lte("periodo_inicio", endDate);
      const { data: acertos, error: acertosError } = await acertosQuery;
      if (acertosError) throw acertosError;
      const ids = (acertos ?? []).map((item: { id: string }) => item.id);
      if (!ids.length) return aggregateEquipeReport([], []);
      const [{ data: items, error: itemsError }, { data: payments, error: paymentsError }] = await Promise.all([
        client.from("colaborador_acerto_itens").select("natureza,valor").eq("workspace_id", activeWorkspace!.id).in("acerto_id", ids),
        client.from("colaborador_pagamentos").select("taxa,status").eq("workspace_id", activeWorkspace!.id).in("acerto_id", ids),
      ]);
      if (itemsError) throw itemsError;
      if (paymentsError) throw paymentsError;
      return aggregateEquipeReport(items ?? [], payments ?? []);
    },
  });

  const cards = query.data ? [
    ["Transporte", query.data.transporte, Bus, "text-sky-400"],
    ["Metas", query.data.meta, Target, "text-emerald-400"],
    ["Diárias", query.data.diaria, Users, "text-violet-400"],
    ["Salários", query.data.salario, Banknote, "text-blue-400"],
    ["Pró-labore", query.data.pro_labore, HandCoins, "text-amber-400"],
    ["Taxas Divipay", query.data.taxas, ReceiptText, "text-rose-400"],
  ] as const : [];

  return <div className="space-y-5">
    <div><h2 className="text-xl font-bold">Custos da equipe</h2><p className="text-sm text-muted-foreground">A transferência pode ser única, mas cada valor continua classificado corretamente.</p></div>
    {query.isError && <Card className="border-destructive/40"><CardContent className="p-6 text-sm text-destructive">Não foi possível carregar os custos da equipe.</CardContent></Card>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {query.isLoading ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28" />) : cards.map(([label, value, Icon, color]) => <Card key={label} className="border-border/60 bg-card/70"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle><Icon className={`h-4 w-4 ${color}`} /></CardHeader><CardContent><p className="text-2xl font-bold">{money(value)}</p></CardContent></Card>)}
    </div>
    {query.data && <Card className="border-primary/30 bg-primary/5"><CardContent className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center"><div><p className="font-semibold">Total financeiro da equipe</p><p className="text-xs text-muted-foreground">Itens dos acertos + taxas efetivamente pagas</p></div><p className="text-2xl font-bold text-primary">{money(query.data.totalFinanceiro)}</p></CardContent></Card>}
  </div>;
}
