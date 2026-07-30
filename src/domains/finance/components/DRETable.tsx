import React from "react";
import { useDREData } from "@/domains/finance/components/useDREData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { FileText, TrendingUp, TrendingDown, DollarSign, Building2, Store, Landmark } from "lucide-react";

export const DRETable: React.FC = () => {
  const { dre, loading, activeWorkspace } = useDREData();

  const formatarMoeda = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <div className="space-y-6">
      {/* Top summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Faturamento Bruto Total</p>
              <p className="text-xl font-bold text-foreground mt-1">{formatarMoeda(dre.faturamentoBrutoTotal)}</p>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Custo CPV + Taxas</p>
              <p className="text-xl font-bold text-rose-500 mt-1">{formatarMoeda(dre.custoTotalCPV)}</p>
            </div>
            <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500">
              <TrendingDown className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Lucro Bruto</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">{formatarMoeda(dre.lucroBruto)}</p>
              <p className="text-[10px] text-muted-foreground">Margem: {dre.margemBrutaPercentual.toFixed(1)}%</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
              <DollarSign className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Lucro Líquido</p>
              <p className={`text-xl font-bold mt-1 ${dre.lucroLiquido >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {formatarMoeda(dre.lucroLiquido)}
              </p>
              <p className="text-[10px] text-muted-foreground">Margem Líquida: {dre.margemLiquidaPercentual.toFixed(1)}%</p>
            </div>
            <div className={`p-3 rounded-xl ${dre.lucroLiquido >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DRE Table */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-orange-500" />
                Demonstrativo de Resultados do Exercício (DRE)
              </CardTitle>
              <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-200">
                {activeWorkspace?.nome || "Todas as Contas"}
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              Consolidação de receitas (Eyemobile PDV + Divipay), dedução de custos de insumos do Mercado e despesas.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando dados da DRE...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-16">Cód.</TableHead>
                  <TableHead>Descrição da Conta</TableHead>
                  <TableHead className="text-right">Valor (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dre.linhas.map((linha) => {
                  const isSubtotal = linha.tipo === "subtotal";
                  const isResultado = linha.tipo === "resultado";
                  const isDestaque = linha.destaque;

                  return (
                    <TableRow
                      key={linha.codigo}
                      className={`transition-colors ${
                        isResultado
                          ? "bg-orange-500/10 font-bold border-t-2 border-orange-500"
                          : isSubtotal
                          ? "bg-muted/30 font-semibold"
                          : ""
                      }`}
                    >
                      <TableCell className="text-xs font-mono text-muted-foreground">{linha.codigo}</TableCell>
                      <TableCell className={`text-sm ${isDestaque ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                        {linha.descricao}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm ${
                          isResultado
                            ? linha.valor >= 0
                              ? "text-emerald-600 dark:text-emerald-400 font-bold text-base"
                              : "text-rose-600 dark:text-rose-400 font-bold text-base"
                            : isSubtotal
                            ? "font-bold text-foreground"
                            : linha.tipo === "receita"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {formatarMoeda(linha.valor)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
