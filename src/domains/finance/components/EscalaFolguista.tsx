import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useFolguistaEscalas } from "../hooks/useFolguistaEscalas";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Calendar, Plus, Trash2, Award, CheckCircle2, CreditCard, QrCode, Calculator, ListPlus, Eraser } from "lucide-react";

interface DiaFolguista {
  dia: string;
  data: string;
  trabalhou: boolean;
  valorDiaria: number;
  bateuMeta: boolean;
  valorMeta: number;
}

interface EscalaFolguistaProps {
  colaboradorId: string;
  colaboradorNome: string;
  valorDiariaPadrao?: number;
  mesRef?: string;
}

const DIAS_DA_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const VALOR_DIARIA_DEFAULT = 100.00;
const VALOR_META_DEFAULT = 20.00;

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

export default function EscalaFolguista({ colaboradorId, colaboradorNome, valorDiariaPadrao = 100, mesRef }: EscalaFolguistaProps) {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const { data: escalas, addEscala, deleteEscala } = useFolguistaEscalas(colaboradorId, mesRef);

  const [abaAtiva, setAbaAtiva] = useState<"acerto" | "avulso">("acerto");
  const [loading, setLoading] = useState(false);
  const [colabInfo, setColabInfo] = useState<{ pix_chave: string | null; pix_tipo: string | null } | null>(null);

  // Buscar PIX do colaborador
  useEffect(() => {
    async function fetchPix() {
      if (!colaboradorId) return;
      const { data } = await supabase
        .from("colaboradores")
        .select("pix_chave, pix_tipo")
        .eq("id", colaboradorId)
        .maybeSingle();
      if (data) setColabInfo(data);
    }
    fetchPix();
  }, [colaboradorId]);

  // Segunda-feira da semana atual (estabilizada com useMemo para evitar render loop infinito)
  const segundaDataStr = useMemo(() => {
    const hoje = new Date();
    const diaSemana = hoje.getDay();
    const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
    const date = new Date(hoje);
    date.setDate(hoje.getDate() + diffSegunda);
    return date.toISOString().split("T")[0];
  }, []);

  const segunda = useMemo(() => new Date(segundaDataStr + "T00:00:00"), [segundaDataStr]);

  const [diasAcerto, setDiasAcerto] = useState<DiaFolguista[]>([]);

  // Carregar dados salvos do localStorage
  useEffect(() => {
    const localStorageKey = `pdv_folguista_acerto_${colaboradorId}`;
    const saved = localStorage.getItem(localStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Garantir que os dados salvos são para a mesma semana (mesmas datas)
        const datasSemanaAtual = DIAS_DA_SEMANA.map((_, i) => {
          const data = new Date(segunda);
          data.setDate(segunda.getDate() + i);
          return data.toISOString().split("T")[0];
        });
        
        const mesmoPeriodo = parsed.length === 7 && parsed.every((d: any, idx: number) => d.data === datasSemanaAtual[idx]);
        
        if (mesmoPeriodo) {
          setDiasAcerto(parsed);
          return;
        }
      } catch (e) {
        console.error("Erro ao carregar acerto semanal do localStorage:", e);
      }
    }

    // Inicialização padrão se não houver dados salvos ou se for outra semana
    setDiasAcerto(DIAS_DA_SEMANA.map((nome, i) => {
      const data = new Date(segunda);
      data.setDate(segunda.getDate() + i);
      return {
        dia: nome,
        data: data.toISOString().split("T")[0],
        trabalhou: false,
        valorDiaria: valorDiariaPadrao || VALOR_DIARIA_DEFAULT,
        bateuMeta: false,
        valorMeta: VALOR_META_DEFAULT,
      };
    }));
  }, [colaboradorId, valorDiariaPadrao, segunda]);

  // Persistir no localStorage sempre que diasAcerto mudar
  useEffect(() => {
    if (diasAcerto.length > 0) {
      const localStorageKey = `pdv_folguista_acerto_${colaboradorId}`;
      localStorage.setItem(localStorageKey, JSON.stringify(diasAcerto));
    }
  }, [diasAcerto, colaboradorId]);

  const atualizarDiaAcerto = (index: number, campo: keyof DiaFolguista, valor: any) => {
    const novos = [...diasAcerto];
    novos[index] = { ...novos[index], [campo]: valor };
    setDiasAcerto(novos);
  };

  const totaisAcerto = useMemo(() => {
    let totalDiarias = 0;
    let totalMetas = 0;
    let diasTrabalhados = 0;

    diasAcerto.forEach(d => {
      if (d.trabalhou) {
        diasTrabalhados++;
        totalDiarias += d.valorDiaria;
        if (d.bateuMeta) totalMetas += d.valorMeta;
      }
    });

    return {
      diasTrabalhados,
      totalDiarias,
      totalMetas,
      totalTransferir: totalDiarias + totalMetas,
    };
  }, [diasAcerto]);

  const handleGerarPagamentoAcerto = async () => {
    if (!activeWorkspace?.id) {
      toast({ title: "Erro", description: "Workspace não encontrado", variant: "destructive" });
      return;
    }
    if (totaisAcerto.totalTransferir <= 0) {
      toast({ title: "Aviso", description: "Selecione ao menos um dia trabalhado", variant: "default" });
      return;
    }
    setLoading(true);

    try {
      const categoriaId = await getOrCreateCategoria("Diárias / Folguistas", activeWorkspace.id, "despesa");
      const dataHoje = new Date().toISOString().split("T")[0];
      const diasTrabalhadosList = diasAcerto.filter(d => d.trabalhou);

      // 1. Inserir convocações na tabela colaborador_escalas
      for (const d of diasTrabalhadosList) {
        const valor_total = d.valorDiaria + (d.bateuMeta ? d.valorMeta : 0);
        await supabase.from("colaborador_escalas").insert({
          colaborador_id: colaboradorId,
          workspace_id: activeWorkspace.id,
          data: d.data,
          turno: "integral",
          valor_diaria: d.valorDiaria,
          bateu_meta: d.bateuMeta,
          valor_meta: d.valorMeta,
          valor_total,
          observacao: `Acerto Semanal (${d.dia})`,
        });

        // Lançar custo em colaborador_custos
        await supabase.from("colaborador_custos").insert({
          colaborador_id: colaboradorId,
          tipo: "folguista",
          valor: valor_total,
          data: d.data,
          descricao: `Diária Folguista (${d.dia})${d.bateuMeta ? " + Meta" : ""}`,
          lancado_na_despesa: true,
        });
      }

      // 2. Criar UMA ÚNICA transação consolidada no Divipay (transacoes)
      const pixInfoStr = colabInfo?.pix_chave ? ` | PIX (${colabInfo.pix_tipo || 'Chave'}): ${colabInfo.pix_chave}` : "";
      await supabase.from("transacoes").insert({
        workspace_id: activeWorkspace.id,
        tipo: "despesa",
        valor: totaisAcerto.totalTransferir,
        data: dataHoje,
        descricao: `Pagamento Folguista - ${colaboradorNome}${pixInfoStr} (${diasTrabalhadosList.length} dias: ${diasTrabalhadosList.map(d => d.dia).join(", ")})`,
        categoria_id: categoriaId,
        centro_custo_id: null,
        conta_id: null,
        metodo_pagamento: "pix",
      });

      toast({
        title: "Acerto Gerado!",
        description: `1 transação criada de ${formatCurrency(totaisAcerto.totalTransferir)} para ${colaboradorNome}${colabInfo?.pix_chave ? ` (PIX: ${colabInfo.pix_chave})` : ""}`,
      });

      // Desmarcar dias do acerto e atualizar localStorage
      const limpos = diasAcerto.map(d => ({ ...d, trabalhou: false, bateuMeta: false }));
      setDiasAcerto(limpos);
      const localStorageKey = `pdv_folguista_acerto_${colaboradorId}`;
      localStorage.setItem(localStorageKey, JSON.stringify(limpos));
    } catch (err: any) {
      toast({ title: "Erro ao gerar acerto", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLimparSelecao = () => {
    if (!confirm("Deseja redefinir e desmarcar todos os dias selecionados para esta semana?")) return;
    const limpos = diasAcerto.map(d => ({
      ...d,
      trabalhou: false,
      bateuMeta: false,
      valorDiaria: valorDiariaPadrao || VALOR_DIARIA_DEFAULT,
    }));
    setDiasAcerto(limpos);
    const localStorageKey = `pdv_folguista_acerto_${colaboradorId}`;
    localStorage.setItem(localStorageKey, JSON.stringify(limpos));
    toast({ title: "Seleção Limpa", description: "Todos os dias foram desmarcados e valores redefinidos." });
  };

  // --- ABA AVULSO / HISTÓRICO ---
  const [dataShift, setDataShift] = useState(new Date().toISOString().split("T")[0]);
  const [turno, setTurno] = useState("integral");
  const [valorDiariaAvulsa, setValorDiariaAvulsa] = useState((valorDiariaPadrao || 100).toString());
  const [bateuMetaAvulsa, setBateuMetaAvulsa] = useState(false);
  const [valorMetaAvulsa, setValorMetaAvulsa] = useState("20");
  const [observacao, setObservacao] = useState("");

  const totalCalculadoAvulso = Number(valorDiariaAvulsa) + (bateuMetaAvulsa ? Number(valorMetaAvulsa) : 0);

  const handleSalvarEscalaAvulsa = async () => {
    if (!dataShift) {
      toast({ title: "Erro", description: "Selecione a data da convocação", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await addEscala.mutateAsync({
        colaborador_id: colaboradorId,
        data: dataShift,
        turno,
        valor_diaria: Number(valorDiariaAvulsa) || 100,
        bateu_meta: bateuMetaAvulsa,
        valor_meta: Number(valorMetaAvulsa) || 20,
        observacao,
      });
      toast({ title: "Escala registrada!", description: `Diária de ${formatCurrency(totalCalculadoAvulso)} salva.` });
      setObservacao("");
      setBateuMetaAvulsa(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoverEscala = async (id: string) => {
    if (!confirm("Remover esta escala do folguista?")) return;
    try {
      await deleteEscala.mutateAsync(id);
      toast({ title: "Sucesso", description: "Escala removida." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const totalDiariasMes = (escalas ?? []).reduce((acc, e) => acc + Number(e.valor_total), 0);

  return (
    <Card className="bg-card/60 border-border/40 space-y-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-sky-400" />
            Gestão de Folguista — {colaboradorNome}
          </span>
          {colabInfo?.pix_chave && (
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full flex items-center gap-1 font-mono">
              <QrCode className="h-3.5 w-3.5" /> PIX: {colabInfo.pix_chave}
            </span>
          )}
        </CardTitle>

        {/* NAVEGAÇÃO DE ABAS INTERNAS */}
        <div className="flex gap-2 pt-2 border-b border-border/30">
          <Button
            type="button"
            variant={abaAtiva === "acerto" ? "default" : "ghost"}
            size="sm"
            onClick={() => setAbaAtiva("acerto")}
            className={abaAtiva === "acerto" ? "bg-sky-600 hover:bg-sky-500 text-white font-medium" : "text-muted-foreground"}
          >
            <Calculator className="h-4 w-4 mr-1.5" /> Acerto Semanal
          </Button>
          <Button
            type="button"
            variant={abaAtiva === "avulso" ? "default" : "ghost"}
            size="sm"
            onClick={() => setAbaAtiva("avulso")}
            className={abaAtiva === "avulso" ? "bg-sky-600 hover:bg-sky-500 text-white font-medium" : "text-muted-foreground"}
          >
            <ListPlus className="h-4 w-4 mr-1.5" /> Registrar / Histórico
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ABA 1: ACERTO SEMANAL */}
        {abaAtiva === "acerto" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Selecione os dias trabalhados na semana. O sistema calcula o valor (diárias + metas) e gera <strong>1 transferência única no Divipay</strong>.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground">
                    <th className="text-left py-2 px-2">Dia</th>
                    <th className="text-center py-2 px-2">Veio?</th>
                    <th className="text-right py-2 px-2">Diária (R$)</th>
                    <th className="text-center py-2 px-2">Meta (+ R$ 20)?</th>
                    <th className="text-right py-2 px-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {diasAcerto.map((dia, i) => {
                    const subtotal = dia.trabalhou ? (dia.valorDiaria + (dia.bateuMeta ? dia.valorMeta : 0)) : 0;
                    return (
                      <tr key={dia.data} className={`border-b border-border/20 ${!dia.trabalhou ? "opacity-40" : ""}`}>
                        <td className="py-2 px-2">
                          <div className="font-medium text-foreground">{dia.dia}</div>
                          <div className="text-xs text-muted-foreground">{dia.data.split("-")[2]}/{dia.data.split("-")[1]}</div>
                        </td>
                        <td className="text-center py-2 px-2">
                          <input
                            type="checkbox"
                            checked={dia.trabalhou}
                            onChange={e => atualizarDiaAcerto(i, "trabalhou", e.target.checked)}
                            className="h-4 w-4 rounded border-border bg-card accent-sky-400 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-2">
                          {dia.trabalhou && (
                            <Input
                              type="number"
                              step="0.01"
                              value={dia.valorDiaria !== undefined ? dia.valorDiaria : ""}
                              onChange={e => atualizarDiaAcerto(i, "valorDiaria", e.target.value === "" ? 0 : parseFloat(e.target.value))}
                              className="w-24 text-right h-8 ml-auto"
                            />
                          )}
                        </td>
                        <td className="text-center py-2 px-2">
                          {dia.trabalhou && (
                            <input
                              type="checkbox"
                              checked={dia.bateuMeta}
                              onChange={e => atualizarDiaAcerto(i, "bateuMeta", e.target.checked)}
                              className="h-4 w-4 rounded border-border bg-card accent-amber-400 cursor-pointer"
                            />
                          )}
                        </td>
                        <td className="text-right py-2 px-2 font-bold text-foreground">
                          {dia.trabalhou ? formatCurrency(subtotal) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-sky-500/10 border border-sky-500/30 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-sky-300">Total do Acerto Semanal ({totaisAcerto.diasTrabalhados} dias)</p>
                  {colabInfo?.pix_chave && (
                    <p className="text-xs text-emerald-400 font-mono mt-0.5">
                      Chave PIX: {colabInfo.pix_chave} ({colabInfo.pix_tipo || 'Chave'})
                    </p>
                  )}
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-sky-400">{formatCurrency(totaisAcerto.totalTransferir)}</p>
              </div>

              <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-sky-500/20">
                <div className="flex justify-between">
                  <span>Diárias Base ({totaisAcerto.diasTrabalhados} dias)</span>
                  <span className="text-foreground">{formatCurrency(totaisAcerto.totalDiarias)}</span>
                </div>
                {totaisAcerto.totalMetas > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Bônus Metas</span>
                    <span>+{formatCurrency(totaisAcerto.totalMetas)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 w-full">
              <Button
                onClick={handleGerarPagamentoAcerto}
                disabled={loading || totaisAcerto.totalTransferir <= 0}
                className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-extrabold"
                size="lg"
              >
                <CreditCard className="h-5 w-5 mr-2" />
                {loading ? "Gerando..." : `Gerar Pagamento Único de ${formatCurrency(totaisAcerto.totalTransferir)}`}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleLimparSelecao}
                className="border-border/60 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 text-muted-foreground px-4"
                size="lg"
                title="Limpar seleção"
              >
                <Eraser className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}

        {/* ABA 2: REGISTRAR DIAS AVULSOS & HISTÓRICO */}
        {abaAtiva === "avulso" && (
          <div className="space-y-6">
            <div className="p-4 bg-muted/20 border border-border/30 rounded-lg space-y-4">
              <h4 className="text-xs uppercase tracking-wider font-semibold text-sky-400">Nova Convocação Avulsa</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Data da Convocação</Label>
                  <Input type="date" value={dataShift} onChange={e => setDataShift(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Turno</Label>
                  <Select value={turno} onValueChange={setTurno}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="integral">Integral (Dia Todo)</SelectItem>
                      <SelectItem value="manha">Manhã</SelectItem>
                      <SelectItem value="tarde_noite">Tarde / Noite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor da Diária (R$)</Label>
                  <Input type="number" value={valorDiariaAvulsa} onChange={e => setValorDiariaAvulsa(e.target.value)} placeholder="100,00" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pt-1 border-t border-border/20">
                <div className="flex items-center gap-3 p-2 bg-card/60 rounded-lg border border-border/30">
                  <input
                    type="checkbox"
                    id="metaCheckAvulsa"
                    checked={bateuMetaAvulsa}
                    onChange={e => setBateuMetaAvulsa(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-card accent-sky-400 cursor-pointer"
                  />
                  <Label htmlFor="metaCheckAvulsa" className="text-xs cursor-pointer font-medium flex items-center gap-1.5 text-foreground">
                    <Award className="h-4 w-4 text-amber-400" />
                    Bateu Meta do Turno (+ R$ 20,00)?
                  </Label>
                </div>

                <div className="flex items-center justify-between p-2 bg-sky-500/10 border border-sky-500/30 rounded-lg">
                  <span className="text-xs text-sky-300 font-medium">Total da Diária:</span>
                  <span className="text-lg font-bold text-sky-400">{formatCurrency(totalCalculadoAvulso)}</span>
                </div>
              </div>

              <Button onClick={handleSalvarEscalaAvulsa} disabled={loading} className="w-full bg-sky-600 hover:bg-sky-500 text-white">
                <Plus className="h-4 w-4 mr-2" />
                {loading ? "Registrando..." : `Confirmar Escala de ${formatCurrency(totalCalculadoAvulso)}`}
              </Button>
            </div>

            {/* Histórico do Mês */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Escalas Registradas no Mês
                </h4>
                <span className="text-xs font-semibold text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20">
                  Total Mês: {formatCurrency(totalDiariasMes)}
                </span>
              </div>

              {(!escalas || escalas.length === 0) ? (
                <p className="text-xs text-muted-foreground italic text-center py-4 bg-muted/10 rounded-lg">
                  Nenhuma escala registrada para este folguista no mês selecionado.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {escalas.map(e => (
                    <div key={e.id} className="flex items-center justify-between p-3 bg-muted/20 border border-border/30 rounded-lg text-sm">
                      <div>
                        <div className="font-medium text-foreground">
                          {e.data.split("-").reverse().join("/")} — <span className="capitalize">{e.turno.replace("_", " ")}</span>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>Diária: {formatCurrency(e.valor_diaria)}</span>
                          {e.bateu_meta && (
                            <span className="text-amber-400 font-semibold flex items-center gap-1">
                              ★ Meta (+{formatCurrency(e.valor_meta)})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sky-400 text-base">{formatCurrency(e.valor_total)}</span>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoverEscala(e.id)} className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
