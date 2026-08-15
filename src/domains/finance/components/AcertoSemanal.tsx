import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useToast } from "@/shared/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Calculator, CreditCard, QrCode } from "lucide-react";

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
  const [colabInfo, setColabInfo] = useState<{ valor_passagem: number | null; pix_chave: string | null; pix_tipo: string | null } | null>(null);

  useEffect(() => {
    async function fetchInfo() {
      if (!colaboradorId) return;
      const { data } = await supabase
        .from("colaboradores")
        .select("valor_passagem, pix_chave, pix_tipo")
        .eq("id", colaboradorId)
        .maybeSingle();
      if (data) {
        setColabInfo({
          valor_passagem: data.valor_passagem !== null ? Number(data.valor_passagem) : null,
          pix_chave: data.pix_chave || null,
          pix_tipo: data.pix_tipo || null,
        });
      }
    }
    fetchInfo();
  }, [colaboradorId]);

  const passagemFixa = colabInfo?.valor_passagem && colabInfo.valor_passagem > 0 ? colabInfo.valor_passagem : 6.25;

  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() + diffSegunda);

  const [dias, setDias] = useState<DiaSemana[]>([]);

  useEffect(() => {
    setDias(DIAS_DA_SEMANA.map((nome, i) => {
      const data = new Date(segunda);
      data.setDate(segunda.getDate() + i);
      return {
        dia: nome,
        data: data.toISOString().split("T")[0],
        foiTrabalhar: i < 6, // Segunda a Sábado (6 dias)
        uberReal: UBER_FIXO, // Padrão R$ 12,00
        passagem: passagemFixa,
        meta: 0,
      };
    }));
  }, [passagemFixa]);

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
      totalTransferir: totalUberFixo + totalPassagem + totalDiferenca + totalMeta,
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
    const dataHoje = new Date().toISOString().split("T")[0];
    const pixInfoStr = colabInfo?.pix_chave ? ` | PIX (${colabInfo.pix_tipo || 'Chave'}): ${colabInfo.pix_chave}` : "";

    // 1. Inserções em colaborador_custos
    const custosInserts = [];

    if (totais.totalPassagem > 0) {
      custosInserts.push({
        colaborador_id: colaboradorId,
        tipo: "acerto_transporte",
        valor: totais.totalPassagem,
        data: dataHoje,
        descricao: `Passagem de ônibus (${totais.diasTrabalhados} dias × ${formatCurrency(passagemFixa)})`,
        lancado_na_despesa: true,
      });
    }

    if (totais.totalUberFixo > 0) {
      custosInserts.push({
        colaborador_id: colaboradorId,
        tipo: "uber_semanal",
        valor: totais.totalUberFixo,
        data: dataHoje,
        descricao: `Uber Fixo Base (${totais.diasTrabalhados} dias × R$ ${UBER_FIXO.toFixed(2)})`,
        lancado_na_despesa: true,
      });
    }

    if (totais.totalDiferenca > 0) {
      custosInserts.push({
        colaborador_id: colaboradorId,
        tipo: "transporte_diferenca",
        valor: totais.totalDiferenca,
        data: dataHoje,
        descricao: `Diferença Uber (${totais.diasTrabalhados} dias)`,
        lancado_na_despesa: true,
      });
    }

    if (totais.totalMeta > 0) {
      custosInserts.push({
        colaborador_id: colaboradorId,
        tipo: "premio",
        valor: totais.totalMeta,
        data: dataHoje,
        descricao: `Meta/Bônus semanal`,
        lancado_na_despesa: true,
      });
    }

    if (custosInserts.length > 0) {
      const { error: custoError } = await supabase.from("colaborador_custos").insert(custosInserts);
      if (custoError) {
        setLoading(false);
        toast({ title: "Erro", description: custoError.message, variant: "destructive" });
        return;
      }
    }

    // 2. Criar transação de TRANSPORTE na tabela transacoes
    const valorTransporte = totais.totalUberFixo + totais.totalPassagem + totais.totalDiferenca;
    if (valorTransporte > 0) {
      await supabase.from("transacoes").insert({
        workspace_id: activeWorkspace.id,
        tipo: "despesa",
        valor: valorTransporte,
        data: dataHoje,
        descricao: `Transporte semanal - ${colaboradorNome}${pixInfoStr} (${dias[0]?.data} a ${dias[5]?.data}) | Uber: ${formatCurrency(totais.totalUberReal)} | Passagem: ${formatCurrency(totais.totalPassagem)} | Diferença: ${formatCurrency(totais.totalDiferenca)}`,
        categoria_id: categoriaTransporteId,
        centro_custo_id: null,
        conta_id: null,
        metodo_pagamento: "pix",
      });
    }

    // 3. Criar transação de META na tabela transacoes (se houver)
    if (totais.totalMeta > 0 && categoriaMetaId) {
      await supabase.from("transacoes").insert({
        workspace_id: activeWorkspace.id,
        tipo: "despesa",
        valor: totais.totalMeta,
        data: dataHoje,
        descricao: `Meta semanal - ${colaboradorNome}${pixInfoStr} (${dias[0]?.data} a ${dias[5]?.data})`,
        categoria_id: categoriaMetaId,
        centro_custo_id: null,
        conta_id: null,
        metodo_pagamento: "pix",
      });
    }

    setLoading(false);
    toast({ 
      title: "Acerto gerado!", 
      description: `Transferir ${formatCurrency(totais.totalTransferir)} para ${colaboradorNome}${colabInfo?.pix_chave ? ` (PIX: ${colabInfo.pix_chave})` : ""}`,
    });
  };

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Acerto Semanal de Transporte
          </span>
          {colabInfo?.pix_chave && (
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full flex items-center gap-1 font-mono">
              <QrCode className="h-3.5 w-3.5" /> PIX: {colabInfo.pix_chave}
            </span>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Uber fixo: R$ {UBER_FIXO.toFixed(2)}/dia | Passagem: R$ {passagemFixa.toFixed(2)}/volta | Total dia: R$ {(UBER_FIXO + passagemFixa).toFixed(2)}
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
            <p className="text-xs text-muted-foreground">Uber Fixo (base)</p>
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
              <p className="text-sm text-primary font-medium">Total a transferir na 2ª feira (semana anterior)</p>
              {colabInfo?.pix_chave && (
                <p className="text-xs text-emerald-400 font-mono mt-0.5">
                  Chave PIX: {colabInfo.pix_chave} ({colabInfo.pix_tipo || 'Chave'})
                </p>
              )}
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-primary shrink-0">{formatCurrency(totais.totalTransferir)}</p>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground pt-1 border-t border-primary/20">
            <div className="flex justify-between">
              <span>🚗 Uber Fixo ({totais.diasTrabalhados} dias × R$ {UBER_FIXO.toFixed(2)})</span>
              <span className="font-medium text-foreground">{formatCurrency(totais.totalUberFixo)}</span>
            </div>
            <div className="flex justify-between">
              <span>🚌 Passagem ({totais.diasTrabalhados} dias × {formatCurrency(passagemFixa)})</span>
              <span className="font-medium text-foreground">{formatCurrency(totais.totalPassagem)}</span>
            </div>
            {totais.totalDiferenca > 0 && (
              <div className="flex justify-between">
                <span>📈 Diferença Uber (extra)</span>
                <span className="font-medium text-amber-400">{formatCurrency(totais.totalDiferenca)}</span>
              </div>
            )}
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
