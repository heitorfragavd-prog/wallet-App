import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useReceitas } from "@/domains/finance/hooks/useReceitas";
import { useDespesas } from "@/domains/finance/hooks/useDespesas";
import { useCompromissos } from "@/domains/finance/hooks/useCompromissos";
import { Calendar } from "@/shared/components/ui/calendar";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { CalendarDays, TrendingUp, TrendingDown, PieChart, Clock, Plus, Trash2, MapPin } from "lucide-react";

interface Compromisso {
  id: string;
  tipo: "receita" | "despesa" | "divida" | "compromisso";
  descricao: string;
  valor?: number;
  data: string;
  hora?: string | null;
  local?: string | null;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TIPO_CONFIG = {
  receita: { label: "Receita", cor: "bg-emerald-500", text: "text-emerald-500", icon: TrendingUp },
  despesa: { label: "Despesa", cor: "bg-red-500", text: "text-red-500", icon: TrendingDown },
  divida: { label: "Dívida", cor: "bg-amber-500", text: "text-amber-500", icon: PieChart },
  compromisso: { label: "Compromisso", cor: "bg-sky-500", text: "text-sky-500", icon: Clock },
};

// Dívidas vêm direto do banco. As DESPESAS usam useDespesas (consolidação oficial:
// manuais + transações + Divipay live) e as RECEITAS usam useReceitas.
async function fetchDividas(mes: string, workspaceId: string | null): Promise<Compromisso[]> {
  const [ano, m] = mes.split("-").map(Number);
  const startDate = `${mes}-01`;
  const endDate = new Date(ano, m, 0).toISOString().split("T")[0];

  let dividasQ = supabase.from("dividas").select("id, descricao, credor, valor_restante, data_vencimento").gte("data_vencimento", startDate).lte("data_vencimento", endDate);

  if (workspaceId) {
    dividasQ = dividasQ.eq("workspace_id", workspaceId);
  }

  const v = await dividasQ;
  if (v.error) throw v.error;

  return (v.data ?? []).map((x): Compromisso => ({
    id: x.id,
    tipo: "divida",
    descricao: x.descricao || x.credor || "Dívida",
    valor: x.valor_restante,
    data: x.data_vencimento,
  }));
}

const diaISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const Agenda = () => {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id || null;
  const [dataSelecionada, setDataSelecionada] = useState<Date | undefined>(new Date());
  const [mesRef, setMesRef] = useState(new Date().toISOString().slice(0, 7));

  // ── Modal "Novo compromisso" ──────────────────────────────────────────────
  const [modalAberto, setModalAberto] = useState(false);
  const [formTitulo, setFormTitulo] = useState("");
  const [formLocal, setFormLocal] = useState("");
  const [formData, setFormData] = useState(diaISO(new Date()));
  const [formHora, setFormHora] = useState("14:00");
  const [formRepetir, setFormRepetir] = useState<"nunca" | "diario" | "semanal" | "mensal" | "anual">("nunca");
  const [formLembrete, setFormLembrete] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [ano, m] = mesRef.split("-").map(Number);
  const mesStart = `${mesRef}-01`;
  const mesEnd = new Date(ano, m, 0).toISOString().split("T")[0];

  const { data: dividas = [], isLoading: loadingDividas } = useQuery({
    queryKey: ["agenda-dividas", { mes: mesRef, workspaceId }],
    queryFn: () => fetchDividas(mesRef, workspaceId),
    staleTime: 1000 * 60 * 2,
  });

  // Mesma consolidação da tela de Receitas (manuais + PDV dinheiro + Divipay)
  const { receitas, loading: loadingReceitas } = useReceitas({ startDate: mesStart, endDate: mesEnd });

  // Mesma consolidação da tela de Despesas (manuais + transações + Divipay live)
  const { despesas, loading: loadingDespesas } = useDespesas({ startDate: mesStart, endDate: mesEnd });

  // Compromissos manuais (título, local, data, hora, repetir, lembrete)
  const { compromissos: compromissosManuais, loading: loadingCompromissos, createCompromisso, deleteCompromisso } = useCompromissos(mesRef);

  const isLoading = loadingDividas || loadingReceitas || loadingDespesas || loadingCompromissos;

  const compromissos = useMemo<Compromisso[]>(() => {
    // Receita consolidada por DIA: uma única linha com o valor total
    const receitaPorDia = new Map<string, { total: number; qtd: number }>();
    for (const r of receitas) {
      const dia = String(r.data).split("T")[0];
      const acc = receitaPorDia.get(dia) ?? { total: 0, qtd: 0 };
      acc.total += Number(r.valor);
      acc.qtd += 1;
      receitaPorDia.set(dia, acc);
    }
    const recs: Compromisso[] = [...receitaPorDia.entries()].map(([dia, { total, qtd }]) => ({
      id: `receita-dia-${dia}`,
      tipo: "receita",
      descricao: `Receita do dia (${qtd} ${qtd === 1 ? "venda" : "vendas"})`,
      valor: total,
      data: dia,
    }));

    const despList: Compromisso[] = despesas.map((d) => ({
      id: d.id,
      tipo: "despesa",
      descricao: d.descricao,
      valor: d.valor,
      data: String(d.data).split("T")[0],
    }));

    const manuais: Compromisso[] = compromissosManuais.map((c) => ({
      id: c.id,
      tipo: "compromisso",
      descricao: c.titulo,
      data: c.data,
      hora: c.hora ? String(c.hora).slice(0, 5) : null,
      local: c.local,
    }));

    return [...recs, ...despList, ...dividas, ...manuais];
  }, [receitas, despesas, dividas, compromissosManuais]);

  const porDia = useMemo(() => {
    const map = new Map<string, Compromisso[]>();
    for (const c of compromissos) {
      const lista = map.get(c.data) ?? [];
      lista.push(c);
      map.set(c.data, lista);
    }
    return map;
  }, [compromissos]);

  const diaStr = dataSelecionada ? diaISO(dataSelecionada) : null;
  const compromissosDia = diaStr ? porDia.get(diaStr) ?? [] : [];

  const abrirModalNovo = () => {
    setFormTitulo("");
    setFormLocal("");
    setFormData(diaStr ?? diaISO(new Date()));
    setFormHora("14:00");
    setFormRepetir("nunca");
    setFormLembrete(false);
    setModalAberto(true);
  };

  const salvarCompromisso = async () => {
    if (!formTitulo.trim() || !formData) return;
    setSalvando(true);
    try {
      await createCompromisso({
        titulo: formTitulo.trim(),
        local: formLocal.trim() || null,
        data: formData,
        hora: formHora || null,
        repetir: formRepetir,
        lembrete: formLembrete,
      });
      setModalAberto(false);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Agenda Financeira</h1>
              <p className="text-sm text-muted-foreground">Todos os compromissos do mês em um calendário</p>
            </div>
          </div>
          <Button onClick={abrirModalNovo} className="bg-sky-500 hover:bg-sky-600 text-white">
            <Plus className="h-4 w-4 mr-1" /> Novo compromisso
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4 flex justify-center">
              <Calendar
                mode="single"
                selected={dataSelecionada}
                onSelect={setDataSelecionada}
                onMonthChange={(d) => setMesRef(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)}
                modifiers={{
                  receita: (date) => (porDia.get(diaISO(date)) ?? []).some((c) => c.tipo === "receita"),
                  despesa: (date) => (porDia.get(diaISO(date)) ?? []).some((c) => c.tipo === "despesa"),
                  divida: (date) => (porDia.get(diaISO(date)) ?? []).some((c) => c.tipo === "divida"),
                  compromisso: (date) => (porDia.get(diaISO(date)) ?? []).some((c) => c.tipo === "compromisso"),
                }}
                modifiersClassNames={{
                  receita: "bg-emerald-500/20 font-bold",
                  despesa: "bg-red-500/20 font-bold",
                  divida: "bg-amber-500/20 font-bold",
                  compromisso: "bg-sky-500/20 font-bold",
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">
                  {dataSelecionada ? dataSelecionada.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "Selecione um dia"}
                </h3>
                <Badge variant="secondary">{compromissosDia.length} compromisso(s)</Badge>
              </div>

              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : compromissosDia.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum compromisso neste dia.</p>
              ) : (
                <div className="space-y-2">
                  {compromissosDia.map((c) => {
                    const cfg = TIPO_CONFIG[c.tipo];
                    const Icon = cfg.icon;
                    return (
                      <div key={`${c.tipo}-${c.id}`} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                        <div className={`w-2 h-8 rounded-full ${cfg.cor}`} />
                        <Icon className={`h-4 w-4 ${cfg.text}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.descricao}</p>
                          <p className="text-xs text-muted-foreground">
                            {cfg.label}
                            {c.hora ? ` • ${c.hora}` : ""}
                            {c.local ? ` • ${c.local}` : ""}
                          </p>
                        </div>
                        {c.valor !== undefined && (
                          <p className={`text-sm font-bold ${cfg.text}`}>{formatBRL(Number(c.valor))}</p>
                        )}
                        {c.tipo === "compromisso" && (
                          <button
                            type="button"
                            onClick={() => deleteCompromisso(c.id)}
                            className="text-muted-foreground hover:text-red-500 transition-colors"
                            title="Excluir compromisso"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-4 pt-2 border-t border-border text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Receita</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Despesa</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Dívida</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500" /> Compromisso</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Modal Novo Compromisso ── */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo compromisso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="comp-titulo">Título</Label>
              <Input
                id="comp-titulo"
                placeholder="Ex: Reunião presencial"
                value={formTitulo}
                onChange={(e) => setFormTitulo(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-local">Local</Label>
              <div className="relative">
                <MapPin className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="comp-local"
                  placeholder="Ex: São Paulo"
                  value={formLocal}
                  onChange={(e) => setFormLocal(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="comp-data">Data</Label>
                <Input
                  id="comp-data"
                  type="date"
                  value={formData}
                  onChange={(e) => setFormData(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="comp-hora">Hora</Label>
                <Input
                  id="comp-hora"
                  type="time"
                  value={formHora}
                  onChange={(e) => setFormHora(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Repetir</Label>
                <Select value={formRepetir} onValueChange={(v) => setFormRepetir(v as typeof formRepetir)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nunca">Nunca</SelectItem>
                    <SelectItem value="diario">Diariamente</SelectItem>
                    <SelectItem value="semanal">Semanalmente</SelectItem>
                    <SelectItem value="mensal">Mensalmente</SelectItem>
                    <SelectItem value="anual">Anualmente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 pb-2 cursor-pointer select-none">
                <Checkbox checked={formLembrete} onCheckedChange={(v) => setFormLembrete(v === true)} />
                <span className="text-sm text-foreground">Lembrete</span>
              </label>
            </div>
            <Button
              onClick={salvarCompromisso}
              disabled={!formTitulo.trim() || !formData || salvando}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Agenda;
