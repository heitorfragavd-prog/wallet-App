import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Progress } from "@/shared/components/ui/progress";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Target, Plus, Trash2 } from "lucide-react";
import { useOrcamentosCategorias } from "@/domains/finance/hooks/useOrcamentosCategorias";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { useDespesas } from "@/domains/finance/hooks/useDespesas";
import { usePrivacy } from "@/contexts/PrivacyContext";

export const TetoGastosCard: React.FC = () => {
  const mesAtual = new Date().toISOString().substring(0, 7);
  const { orcamentos, loading, upsertOrcamento, deleteOrcamento } = useOrcamentosCategorias(mesAtual);
  const { categoriasDespesa } = useCategorias();
  const { despesas } = useDespesas();
  const { formatCurrency } = usePrivacy();

  const [modalAberto, setModalAberto] = useState(false);
  const [categoriaId, setCategoriaId] = useState("");
  const [valorLimite, setValorLimite] = useState("");

  // Calcula gasto mensal real por categoria
  const gastosPorCategoria = despesas
    .filter((d) => d.data && d.data.startsWith(mesAtual))
    .reduce((acc, d) => {
      if (d.categoria_id) {
        acc[d.categoria_id] = (acc[d.categoria_id] || 0) + Number(d.valor);
      }
      return acc;
    }, {} as Record<string, number>);

  const handleSalvar = async () => {
    if (!categoriaId || !valorLimite || Number(valorLimite) <= 0) return;
    await upsertOrcamento({
      categoria_id: categoriaId,
      valor_limite: parseFloat(valorLimite),
      mes_referencia: mesAtual,
    });
    setModalAberto(false);
    setCategoriaId("");
    setValorLimite("");
  };

  if (loading) {
    return (
      <Card className="border border-border bg-card p-6">
        <div className="text-center py-6 text-muted-foreground">
          Carregando Teto de Gastos...
        </div>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-emerald-500" />
          <div>
            <CardTitle className="text-lg font-bold text-foreground">
              Teto de Gastos (Orçamentos)
            </CardTitle>
            <CardDescription className="text-xs">
              Limite mensal por categoria de despesa
            </CardDescription>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => setModalAberto(true)}
          className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Definir Limite
        </Button>
      </CardHeader>

      <CardContent className="pt-2 space-y-4">
        {orcamentos.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm space-y-2">
            <Target className="w-8 h-8 mx-auto opacity-30 text-emerald-500" />
            <p>Nenhum teto de gastos configurado para este mês.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalAberto(true)}
              className="text-xs text-emerald-500 border-emerald-500/30"
            >
              Definir meu primeiro teto
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {orcamentos.map((o) => {
              const catNome = o.categorias?.nome || "Categoria";
              const catCor = o.categorias?.cor || "#10B981";
              const gastoReal = gastosPorCategoria[o.categoria_id] || 0;
              const percentual = Math.min((gastoReal / o.valor_limite) * 100, 100);
              const excedido = gastoReal >= o.valor_limite;
              const alerta = percentual >= 80 && !excedido;

              return (
                <div key={o.id} className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: catCor }} />
                      <span className="font-semibold text-foreground">{catNome}</span>
                      {excedido && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          Excedido!
                        </Badge>
                      )}
                      {alerta && (
                        <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 px-1.5 py-0">
                          Atenção (80%+)
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(gastoReal)} de {formatCurrency(Number(o.valor_limite))}
                      </span>
                      <button
                        onClick={() => deleteOrcamento(o.id)}
                        className="text-muted-foreground hover:text-red-400 text-xs p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <Progress
                    value={percentual}
                    className={`h-2 ${excedido ? "bg-red-500/20" : alerta ? "bg-amber-500/20" : "bg-emerald-500/20"}`}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Modal para Definir Teto */}
        <Dialog open={modalAberto} onOpenChange={setModalAberto}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Definir Teto de Gastos</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Categoria *</label>
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className="w-full h-10 px-3 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="">Selecione uma categoria de despesa</option>
                  {categoriasDespesa.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Limite Máximo Mensal (R$) *</label>
                <Input
                  type="number"
                  placeholder="Ex: 500,00"
                  value={valorLimite}
                  onChange={(e) => setValorLimite(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSalvar} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                Salvar Limite
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
