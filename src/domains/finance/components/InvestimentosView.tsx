import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { TrendingUp, DollarSign, PieChart, ShieldCheck, RefreshCw, Layers } from "lucide-react";

export interface InvestmentItem {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  balance: number;
  currencyCode?: string;
  value?: number;
  quantity?: number;
  amount?: number;
  rate?: number;
  rateType?: string;
  fixedAnnualRate?: number;
  code?: string;
  isin?: string;
}

export const InvestimentosView: React.FC = () => {
  const [investments, setInvestments] = useState<InvestmentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Exemplo de investimentos pré-carregados ou buscados via Open Finance
  const MOCK_SANDBOX_INVESTMENTS: InvestmentItem[] = [
    {
      id: "inv-1",
      name: "Tesouro IPCA+ 2035",
      type: "MUTUAL_FUND",
      subtype: "RENDA_FIXA",
      balance: 14500.00,
      rate: 6.15,
      rateType: "IPCA",
      code: "NTN-B"
    },
    {
      id: "inv-2",
      name: "CDB Banco Inter 102% CDI",
      type: "FIXED_INCOME",
      subtype: "CDB",
      balance: 8250.50,
      rate: 102,
      rateType: "CDI",
      code: "CDB-INTER"
    },
    {
      id: "inv-3",
      name: "Fundo XP Macro FIC FIM",
      type: "MUTUAL_FUND",
      subtype: "MULTIMERCADO",
      balance: 12000.00,
      rate: 11.2,
      rateType: "ANNUAL",
      code: "XP-MACRO"
    },
    {
      id: "inv-4",
      name: "FII HGLG11 - CSHG Logística",
      type: "EQUITY",
      subtype: "FUNDO_IMOBILIARIO",
      balance: 5400.00,
      quantity: 34,
      value: 158.82,
      code: "HGLG11"
    }
  ];

  useEffect(() => {
    setInvestments(MOCK_SANDBOX_INVESTMENTS);
  }, []);

  const totalInvestido = investments.reduce((acc, inv) => acc + (inv.balance || 0), 0);

  const getSubtypeBadge = (subtype?: string) => {
    switch (subtype) {
      case "RENDA_FIXA":
      case "CDB":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Renda Fixa</Badge>;
      case "MULTIMERCADO":
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Multimercado</Badge>;
      case "FUNDO_IMOBILIARIO":
      case "EQUITY":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">FII / Ações</Badge>;
      default:
        return <Badge variant="outline">Outros</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Resumo de Investimentos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Investido (Open Finance)</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalInvestido)}
                </p>
              </div>
              <div className="bg-emerald-500/20 p-2.5 rounded-xl text-emerald-400">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Quantidade de Ativos</p>
                <p className="text-2xl font-bold text-foreground">{investments.length} Ativos</p>
              </div>
              <div className="bg-blue-500/20 p-2.5 rounded-xl text-blue-400">
                <Layers className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-purple-500/10 to-purple-500/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rentabilidade Média</p>
                <p className="text-2xl font-bold text-purple-400">CDI + 1.8% a.a.</p>
              </div>
              <div className="bg-purple-500/20 p-2.5 rounded-xl text-purple-400">
                <PieChart className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Ativos */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            Carteira Consolidada de Investimentos
          </h2>
          <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-400">
            Sincronizado via Pluggy Open Finance
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {investments.map((inv) => (
            <Card key={inv.id} className="bg-[#0B132B] border border-[#1E2942] hover:border-emerald-500/40 transition-all rounded-2xl">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-bold text-foreground">{inv.name}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono">{inv.code || "OPEN-FINANCE"}</p>
                  </div>
                  {getSubtypeBadge(inv.subtype)}
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-3">
                <div className="flex items-center justify-between pt-2 border-t border-border/20">
                  <span className="text-xs text-muted-foreground">Valor Aplicado / Saldo</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(inv.balance)}
                  </span>
                </div>

                {inv.rate && (
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span>Taxa / Indexador</span>
                    <span className="font-semibold text-slate-200">
                      {inv.rate}% {inv.rateType || "CDI"}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
