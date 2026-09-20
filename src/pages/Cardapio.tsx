import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useProdutosCardapio } from "@/domains/finance/hooks/useProdutosCardapio";
import { useFoodCost } from "@/domains/finance/hooks/useFoodCost";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Plus, Search, ChefHat } from "lucide-react";
import type { CategoriaCardapio, StatusMargem } from "@/domains/finance/types/foodCost";

const CATEGORIAS_LABEL: Record<CategoriaCardapio, string> = {
  lanches: "Lanches",
  bebidas: "Bebidas",
  sobremesas: "Sobremesas",
  cafes: "Cafés",
  porcoes: "Porções",
  outros: "Outros",
};

const STATUS_MARGEM_CONFIG: Record<StatusMargem, { label: string; className: string }> = {
  excelente: { label: "Excelente", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  boa: { label: "Boa", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  atencao: { label: "Atenção", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  perigoso: { label: "Crítica", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  sem_ficha: { label: "Sem Ficha", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  sem_preco: { label: "Sem Preço", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CardapioPage: React.FC = () => {
  const { produtos, loading } = useProdutosCardapio();
  const { produtos: produtosFoodCost, summary } = useFoodCost();
  const [search, setSearch] = useState("");
  const [catFiltro, setCatFiltro] = useState<CategoriaCardapio | "todos">("todos");

  const filtrados = produtos.filter((p) => {
    const matchSearch = p.nome.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFiltro === "todos" || p.categoria === catFiltro;
    return matchSearch && matchCat;
  });

  const ranking = useMemo(() => {
    const comFicha = produtosFoodCost.filter((p) => p.qtd_insumos > 0);
    const sorted = [...comFicha].sort(
      (a, b) => (b.preco_venda - b.custo_total) - (a.preco_venda - a.custo_total)
    );
    const totalContribuicao = sorted.reduce(
      (s, p) => s + (p.preco_venda - p.custo_total),
      0
    );
    let acumulado = 0;

    return sorted.map((p) => {
      const contrib = p.preco_venda - p.custo_total;
      acumulado += contrib;
      const pct = totalContribuicao > 0 ? (contrib / totalContribuicao) * 100 : 0;
      const acumPct = totalContribuicao > 0 ? (acumulado / totalContribuicao) * 100 : 0;
      const curva = acumPct <= 80 ? "A" : acumPct <= 95 ? "B" : "C";
      return { ...p, contribuicao: contrib, percentual: pct, curva };
    });
  }, [produtosFoodCost]);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/15">
              <ChefHat className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Cardápio</h1>
              <p className="text-sm text-muted-foreground">Gestão de produtos e fichas técnicas</p>
            </div>
          </div>
          <Button asChild className="bg-amber-500 hover:bg-amber-600 text-white gap-2">
            <Link to="/cardapio/novo">
              <Plus className="h-4 w-4" /> Novo Produto
            </Link>
          </Button>
        </div>

        {/* KPIs Food Cost */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Produtos</p>
              <p className="text-2xl font-bold">{summary.totalProdutos}</p>
              <p className="text-xs text-muted-foreground">{summary.produtosComFicha} com ficha técnica</p>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Margem Média</p>
              <p className="text-2xl font-bold text-emerald-400">{summary.mediaMargemGeral.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">sobre receita bruta</p>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">CMV Total</p>
              <p className="text-2xl font-bold text-red-400">{formatCurrency(summary.cmvTotal)}</p>
              <p className="text-xs text-muted-foreground">custo de mercadoria</p>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Food Cost %</p>
              <p className={`text-2xl font-bold ${summary.foodCostPercent > 35 ? "text-red-400" : "text-emerald-400"}`}>
                {summary.foodCostPercent.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">meta: até 35%</p>
            </CardContent>
          </Card>
        </div>

        {/* Abas */}
        <Tabs defaultValue="produtos" className="space-y-4">
          <TabsList className="w-auto inline-flex">
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="ranking">Ranking de Contribuição</TabsTrigger>
          </TabsList>

          <TabsContent value="produtos" className="space-y-4">
            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {(["todos", "lanches", "bebidas", "sobremesas", "cafes", "porcoes", "outros"] as const).map((cat) => (
                  <Button
                    key={cat}
                    size="sm"
                    variant={catFiltro === cat ? "default" : "outline"}
                    onClick={() => setCatFiltro(cat)}
                    className="text-xs"
                  >
                    {cat === "todos" ? "Todos" : CATEGORIAS_LABEL[cat]}
                  </Button>
                ))}
              </div>
            </div>

            {/* Grid de produtos */}
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
              </div>
            ) : filtrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <ChefHat className="h-12 w-12 opacity-30" />
                <p className="text-lg">Nenhum produto encontrado</p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/cardapio/novo"><Plus className="h-4 w-4 mr-2" /> Adicionar primeiro produto</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtrados.map((produto) => {
                  const statusConfig = STATUS_MARGEM_CONFIG["sem_ficha"];
                  return (
                    <Link
                      key={produto.id}
                      to={`/cardapio/${produto.id}`}
                      className="group"
                    >
                      <Card className="border-border/40 bg-card/60 backdrop-blur-sm hover:border-amber-500/50 hover:bg-card/80 transition-all duration-200 h-full">
                        {produto.imagem_url && (
                          <div className="aspect-video overflow-hidden rounded-t-lg">
                            <img
                              src={produto.imagem_url}
                              alt={produto.nome}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        )}
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-foreground group-hover:text-amber-400 transition-colors leading-tight">
                                {produto.nome}
                              </p>
                              <Badge variant="outline" className="text-xs mt-1">
                                {CATEGORIAS_LABEL[produto.categoria]}
                              </Badge>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusConfig.className}`}>
                              {statusConfig.label}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border/30">
                            <span className="text-xs text-muted-foreground">Preço de venda</span>
                            <span className="font-bold text-foreground">
                              {formatCurrency(produto.preco_venda)}
                            </span>
                          </div>
                          {!produto.ativo && (
                            <Badge variant="outline" className="text-xs text-red-400 border-red-500/30 bg-red-500/10">
                              Inativo
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ranking" className="space-y-4">
            <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">Ranking de Contribuição por Produto</CardTitle>
                <p className="text-sm text-muted-foreground">
                  (Preço de Venda - Custo da Ficha) — ordenado por contribuição
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Preço Venda</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead className="text-right">Contribuição</TableHead>
                      <TableHead className="text-right">Margem %</TableHead>
                      <TableHead className="text-center">Curva</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ranking.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.nome}</TableCell>
                        <TableCell className="text-right">R$ {item.preco_venda.toFixed(2)}</TableCell>
                        <TableCell className="text-right">R$ {item.custo_total.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-emerald-400 font-semibold">
                          R$ {item.contribuicao.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">{item.margem_percentual.toFixed(1)}%</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={
                              item.curva === "A"
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                : item.curva === "B"
                                ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                : "bg-slate-500/20 text-slate-400 border-slate-500/30"
                            }
                          >
                            Curva {item.curva}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {ranking.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhum produto com ficha técnica cadastrada para o ranking.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default CardapioPage;
