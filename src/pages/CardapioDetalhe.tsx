import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useProdutosCardapio } from "@/domains/finance/hooks/useProdutosCardapio";
import { useFichaTecnica } from "@/domains/finance/hooks/useFichaTecnica";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ArrowLeft, ChefHat, Plus, Trash2, Package } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CardapioDetalhePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { produtos, deleteProduto } = useProdutosCardapio();
  const { fichas, loading: loadingFicha, custoTotal, addInsumo, removeInsumo } = useFichaTecnica(id);

  const produto = produtos.find((p) => p.id === id);

  const [novoInsumo, setNovoInsumo] = useState({
    insumo_nome: "",
    quantidade: "",
    unidade_medida: "un",
    custo_unitario: "",
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleAddInsumo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !novoInsumo.insumo_nome) return;
    setSaving(true);
    try {
      await addInsumo({
        produto_id: id,
        insumo_nome: novoInsumo.insumo_nome,
        quantidade: parseFloat(novoInsumo.quantidade.replace(",", ".")) || 1,
        unidade_medida: novoInsumo.unidade_medida,
        custo_unitario: parseFloat(novoInsumo.custo_unitario.replace(",", ".")) || 0,
      });
      setNovoInsumo({ insumo_nome: "", quantidade: "", unidade_medida: "un", custo_unitario: "" });
      setDialogOpen(false);
    } catch {
      /* toast já exibido */
    } finally {
      setSaving(false);
    }
  };

  const margem = produto && produto.preco_venda > 0
    ? ((produto.preco_venda - custoTotal) / produto.preco_venda) * 100
    : 0;

  if (!produto) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <ChefHat className="h-10 w-10 mb-3 opacity-30" />
          <p>Produto não encontrado</p>
          <Button variant="link" onClick={() => navigate("/cardapio")}>Voltar ao cardápio</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cardapio")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/15 shrink-0">
              <ChefHat className="h-6 w-6 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate">{produto.nome}</h1>
              <p className="text-sm text-muted-foreground capitalize">{produto.categoria}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Info do produto */}
          <div className="space-y-4">
            <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground">Análise de Margem</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Preço de venda</span>
                  <span className="font-semibold">{formatCurrency(produto.preco_venda)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Custo (CMV)</span>
                  <span className="font-semibold text-red-400">{formatCurrency(custoTotal)}</span>
                </div>
                <div className="border-t border-border/30 pt-3 flex justify-between">
                  <span className="text-sm font-medium">Lucro bruto</span>
                  <span className="font-bold text-emerald-400">
                    {formatCurrency(produto.preco_venda - custoTotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Margem</span>
                  <span className={`font-bold text-lg ${margem >= 50 ? "text-emerald-400" : margem >= 30 ? "text-amber-400" : "text-red-400"}`}>
                    {margem.toFixed(1)}%
                  </span>
                </div>
              </CardContent>
            </Card>

            {produto.descricao && (
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Descrição</p>
                  <p className="text-sm">{produto.descricao}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Ficha técnica */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Package className="h-5 w-5 text-amber-400" /> Ficha Técnica
              </h2>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white gap-1">
                    <Plus className="h-4 w-4" /> Adicionar insumo
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar insumo à ficha técnica</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddInsumo} className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>Nome do insumo *</Label>
                      <Input
                        placeholder="Ex: Pão brioche"
                        value={novoInsumo.insumo_nome}
                        onChange={(e) => setNovoInsumo((f) => ({ ...f, insumo_nome: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Quantidade</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="1"
                          value={novoInsumo.quantidade}
                          onChange={(e) => setNovoInsumo((f) => ({ ...f, quantidade: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unidade</Label>
                        <Input
                          placeholder="un"
                          value={novoInsumo.unidade_medida}
                          onChange={(e) => setNovoInsumo((f) => ({ ...f, unidade_medida: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Custo unit. (R$)</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={novoInsumo.custo_unitario}
                          onChange={(e) => setNovoInsumo((f) => ({ ...f, custo_unitario: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white">
                        {saving ? "Salvando..." : "Adicionar"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {loadingFicha ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
              </div>
            ) : fichas.length === 0 ? (
              <Card className="border-dashed border-border/40">
                <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                  <Package className="h-8 w-8 opacity-30" />
                  <p className="text-sm">Nenhum insumo cadastrado</p>
                  <p className="text-xs">Adicione ingredientes para calcular o custo do produto</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
                <div className="divide-y divide-border/30">
                  {fichas.map((ficha) => (
                    <div key={ficha.id} className="flex items-center gap-3 p-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{ficha.insumo_nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {ficha.quantidade} {ficha.unidade_medida} × {formatCurrency(ficha.custo_unitario)}
                        </p>
                      </div>
                      <span className="font-semibold text-sm shrink-0">
                        {formatCurrency(ficha.quantidade * ficha.custo_unitario)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-red-400 shrink-0"
                        onClick={() => removeInsumo(ficha.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-4 bg-muted/30">
                    <span className="font-semibold">Total do custo</span>
                    <span className="font-bold text-lg">{formatCurrency(custoTotal)}</span>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CardapioDetalhePage;
