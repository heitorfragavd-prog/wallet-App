import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useToast } from "@/shared/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Calculator, CreditCard } from "lucide-react";

interface DiaSemana {
  dia: string;
  data: string;
  foiTrabalhar: boolean;
  uberReal: number;
  passagem: number;
  meta: number;
}

interface AcertoSemanalProps {
  colaboradorId: string;
  colaboradorNome: string;
  salarioBruto: number;
}

const DIAS_DA_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const UBER_FIXO = 12.00;
const PASSAGEM_FIXA = 6.25;

async function getOrCreateCategoria(nome: string, workspaceId: string, tipo: "despesa" | "receita"): Promise<string | null> {
  const { data: existente } = await supabase
    .from("categorias")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("nome", nome)
    .eq("tipo", tipo)
    .maybeSingle();
  
  if (existente?.id) return existente.id;
  
  const { data: nova, error } = await supabase
    .from("categorias")
    .insert({ workspace_id: workspaceId, nome, tipo, cor: tipo === "despesa" ? "#ef4444" : "#22c55e" })
    .select("id")
    .single();
  
  if (error) {
    console.error("Erro ao criar categoria:", error);
    return null;
  }
  return nova?.id || null;
}

export default function AcertoSemanal({ colaboradorId, colaboradorNome, salarioBruto }: AcertoSemanalProps) {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);

  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() + diffSegunda);

  const [dias, setDias] = useState<DiaSemana[]>(() => {
    return DIAS_DA_SEMANA.map((nome, i) => {
      const data = new Date(segunda);
      data.setDate(segunda.getDate() + i);
      return {
        dia: nome,
        data: data.toISOString().split("T")[0],
        foiTrabalhar: i < 5,
        uberReal: 0,
        passagem: PASSAGEM_FIXA,
        meta: 0,
      };
    });
  });

  const atualizarDia = (index: number, campo: keyof DiaSemana, valor: any) => {
    const novos = [...dias];
    novos[index] = { ...novos[index], [campo]: valor };
    setDias(novos);
  };

  const totais = useMemo(() => {
    let totalUberReal = 0;
    let totalUberFixo = 0;
    let totalPassagem = 0;
    let totalDiferenca = 0;
    let totalMeta = 0;
    let diasTrabalhados = 0;

    dias.forEach(d => {
      if (d.foiTrabalhar) {
        diasTrabalhados++;
        totalUberReal += d.uberReal;
        totalUberFixo += UBER_FIXO;
        totalPassagem += d.passagem;
        totalDiferenca += Math.max(0, d.uberReal - UBER_FIXO);
        totalMeta += d.meta;
      }
    });

    return {
      totalUberReal,
      totalUberFixo,
      totalPassagem,
      totalDiferenca,
      totalMeta,
      diasTrabalhados,
      totalTransferir: totalDiferenca + totalPassagem + totalMeta,
    };
  }, [dias]);

  const handleGerarPagamento = async () => {
    if (!activeWorkspace?.id) {
      toast({ title: "Erro", description: "Workspace não encontrado", variant: "destructive" });
      return;
    }
    if (totais.totalTransferir <= 0) {
      toast({ title: "Aviso", description: "Nada a pagar esta semana", variant: "default" });
      return;
    }
    setLoading(true);

    // Buscar/criar categorias automáticas
    const categoriaTransporteId = await getOrCreateCategoria("Transporte Funcionário", activeWorkspace.id, "despesa");
    const categoriaMetaId = totais.totalMeta > 0 ? await getOrCreateCategoria("Meta/Bônus", activeWorkspace.id, "despesa") : null;

    // 1. Salvar acerto na colaborador_custos
    const { error: custoError } = await supabase.from("colaborador_custos").insert({
      colaborador_id: colaboradorId,
      tipo: "acerto_transporte",
      valor: totais.totalTransferir,
      data: new Date().toISOString().split("T")[0],
      descricao: `Acerto semanal transporte - ${dias.filter(d => d.foiTrabalhar).map(d => d.dia).join(", ")} (${totais.diasTrabalhados} dias)`,
      lancado_na_despesa: true,
    });

    if (custoError) {
      setLoading(false);
      toast({ title: "Erro", description: custoError.message, variant: "destructive" });
      return;
    }

    // 2. Criar transação de TRANSPORTE
    const valorTransporte = totais.totalDiferenca + totais.totalPassagem;
    if (valorTransporte > 0) {
      await supabase.from("transacoes").insert({
        workspace_id: activeWorkspace.id,
        tipo: "despesa",
        valor: valorTransporte,
        data: new Date().toISOString().split("T")[0],
        descricao: `Transporte semanal - ${colaboradorNome} (${dias[0].data} a ${dias[6].data}) | Uber: ${formatCurrency(totais.totalUberReal)} | Passagem: ${formatCurrency(totais.totalPassagem)} | Diferença: ${formatCurrency(totais.totalDiferenca)}`,
        categoria_id: categoriaTransporteId,
        centro_custo_id: null,
        conta_id: null,
        metodo_pagamento: "pix",
      });
    }

    // 3. Criar transação de META (só se houver)
    if (totais.totalMeta > 0 && categoriaMetaId) {
      await supabase.from("transacoes").insert({
        workspace_id: activeWorkspace.id,
        tipo: "despesa",
        valor: totais.totalMeta,
        data: new Date().toISOString().split("T")[0],
        descricao: `Meta semanal - ${colaboradorNome} (${dias[0].data} a ${dias[6].data})`,
        categoria_id: categoriaMetaId,
        centro_custo_id: null,
        conta_id: null,
        metodo_pagamento: "pix",
      });
    }

    setLoading(false);
    toast({ 
      title: "Acerto gerado!", 
      description: totais.totalMeta > 0 
        ? `2 transações criadas: Transporte (${formatCurrency(valorTransporte)}) + Meta (${formatCurrency(totais.totalMeta)})`
        : `Transferir ${formatCurrency(totais.totalTransferir)} na segunda-feira. Uma taxa só!`,
    });
  };

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Acerto Semanal de Transporte
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Uber fixo antecipado: R$ {UBER_FIXO.toFixed(2)}/dia | Passagem: R$ {PASSAGEM_FIXA.toFixed(2)}/volta
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 text-muted-foreground">
                <th className="text-left py-2 px-2">Dia</th>
                <th className="text-center py-2 px-2">Foi?</th>
                <th className="text-right py-2 px-2">Uber Real</th>
                <th className="text-right py-2 px-2">Passagem</th>
                <th className="text-right py-2 px-2">Diferença</th>
                <th className="text-right py-2 px-2">Meta</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((dia, i) => (
                <tr key={dia.data} className={`border-b border-border/20 ${!dia.foiTrabalhar ? "opacity-40" : ""}`}>
                  <td className="py-2 px-2">
                    <div className="font-medium text-foreground">{dia.dia}</div>
                    <div className="text-xs text-muted-foreground">{dia.data.split("-")[2]}/{dia.data.split("-")[1]}</div>
                  </td>
                  <td className="text-center py-2 px-2">
                    <input type="checkbox" checked={dia.foiTrabalhar} onChange={e => atualizarDia(i, "foiTrabalhar", e.target.checked)} className="h-4 w-4 rounded border-border bg-card accent-primary cursor-pointer" />
                  </td>
                  <td className="py-2 px-2">
                    {dia.foiTrabalhar && <Input type="number" step="0.01" value={dia.uberReal || ""} onChange={e => atualizarDia(i, "uberReal", Number(e.target.value))} placeholder={UBER_FIXO.toFixed(2)} className="w-24 text-right h-8 ml-auto" />}
                  </td>
                  <td className="text-right py-2 px-2 text-foreground">{dia.foiTrabalhar ? formatCurrency(dia.passagem) : "—"}</td>
                  <td className="text-right py-2 px-2 font-medium">
                    {dia.foiTrabalhar ? <span className={dia.uberReal > UBER_FIXO ? "text-amber-400" : "text-emerald-400"}>{formatCurrency(Math.max(0, dia.uberReal - UBER_FIXO))}</span> : "—"}
                  </td>
                  <td className="py-2 px-2">
                    {dia.foiTrabalhar && <Input type="number" step="0.01" value={dia.meta || ""} onChange={e => atualizarDia(i, "meta", Number(e.target.value))} placeholder="0,00" className="w-20 text-right h-8 ml-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border/30">
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Uber Real Total</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(totais.totalUberReal)}</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Uber Fixo (já depositado)</p>
            <p className="text-lg font-bold text-muted-foreground">{formatCurrency(totais.totalUberFixo)}</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Total Passagem</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(totais.totalPassagem)}</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Diferença + Meta</p>
            <p className="text-lg font-bold text-amber-400">{formatCurrency(totais.totalDiferenca + totais.totalMeta)}</p>
          </div>
        </div>

        <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm text-primary font-medium">Total a transferir na 2ª feira</p>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-primary shrink-0">{formatCurrency(totais.totalTransferir)}</p>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground pt-1 border-t border-primary/20">
            <div className="flex justify-between">
              <span>🚗 Transporte (Diferença + Passagem)</span>
              <span className="font-medium text-foreground">{formatCurrency(totais.totalDiferenca + totais.totalPassagem)}</span>
            </div>
            {totais.totalMeta > 0 && (
              <div className="flex justify-between">
                <span>🎯 Meta/Bônus</span>
                <span className="font-medium text-amber-400">{formatCurrency(totais.totalMeta)}</span>
              </div>
            )}
          </div>
        </div>

        <Button onClick={handleGerarPagamento} disabled={loading || totais.totalTransferir <= 0} className="w-full" size="lg">
          <CreditCard className="h-5 w-5 mr-2" />
          {loading ? "Gerando..." : `Gerar Pagamento de ${formatCurrency(totais.totalTransferir)}`}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          💡 Uma transferência só na 2ª feira = 1x taxa do Divipay (R$ 3,50). Economia de até R$ 14,00/semana em taxas!
        </p>
      </CardContent>
    </Card>
  );
}
