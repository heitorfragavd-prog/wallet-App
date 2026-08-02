import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useConciliacao } from "@/domains/finance/hooks/useConciliacao";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { CheckCircle, TrendingUp, TrendingDown, Zap } from "lucide-react";

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FONTE_LABEL: Record<string, string> = {
  receitas: "Receitas",
  despesas: "Despesas",
  transacoes: "Extrato/Transações",
};

const Conciliacao = () => {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const { pendentes, conciliados, loading, marcarConciliado, conciliarAutomaticamente, conciliandoAuto } = useConciliacao(mes);

  const renderTabela = (lista: typeof pendentes, titulo: string, vazio: string) => (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="font-semibold text-foreground">{titulo} ({lista.length})</h3>
        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{vazio}</p>
        ) : (
          <div className="space-y-2">
            {lista.map((l) => (
              <div key={`${l.fonte}-${l.id}`} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                <Checkbox
                  checked={l.conciliado}
                  onCheckedChange={(checked) =>
                    marcarConciliado({ id: l.id, fonte: l.fonte, conciliado: checked === true })
                  }
                />
                <div className={`p-1.5 rounded ${l.tipo === "receita" ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                  {l.tipo === "receita" ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{l.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(`${l.data}T12:00:00`).toLocaleDateString("pt-BR")} • {FONTE_LABEL[l.fonte]}
                  </p>
                </div>
                <p className={`text-sm font-bold ${l.tipo === "receita" ? "text-emerald-500" : "text-red-500"}`}>
                  {formatBRL(Number(l.valor))}
                </p>
                <Badge variant={l.conciliado ? "default" : "secondary"}>
                  {l.conciliado ? "Conciliado" : "Pendente"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Conciliação Bancária</h1>
              <p className="text-sm text-muted-foreground">Confira se os lançamentos batem com o extrato</p>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Mês</Label>
              <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-40" />
            </div>
            <Button onClick={() => conciliarAutomaticamente()} disabled={conciliandoAuto || pendentes.length === 0} className="gap-2">
              <Zap className="h-4 w-4" />
              {conciliandoAuto ? "Conciliando..." : "Conciliar automaticamente"}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {renderTabela(pendentes, "Pendentes", "Nada pendente — tudo conciliado! 🎉")}
            {renderTabela(conciliados, "Conciliados", "Nenhum lançamento conciliado ainda.")}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Conciliacao;
