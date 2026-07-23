import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  RotateCcw,
  Save,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  PieChart as PieChartIcon,
  Sliders,
  AlertTriangle,
} from "lucide-react";
import {
  useOrcamentoControle,
  TemaOrcamento,
  TEMAS_PADRAO,
} from "@/domains/finance/hooks/useOrcamentoControle";

const PALETA_CORES = [
  "#8B5CF6", // Purple
  "#3B82F6", // Blue
  "#EC4899", // Pink
  "#A855F7", // Violet
  "#F97316", // Orange
  "#EAB308", // Yellow
  "#10B981", // Emerald
  "#EF4444", // Red
  "#06B6D4", // Cyan
  "#6366F1", // Indigo
];

interface ControleOrcamentoCardProps {
  compact?: boolean;
}

export const ControleOrcamentoCard: React.FC<ControleOrcamentoCardProps> = ({
  compact = false,
}) => {
  const { temas: temasSalvos, loading, salvarTemas, isSalvando } = useOrcamentoControle();
  const [temasLocais, setTemasLocais] = useState<TemaOrcamento[]>(TEMAS_PADRAO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEdit, setNomeEdit] = useState("");
  const [corEdit, setCorEdit] = useState("#8B5CF6");

  useEffect(() => {
    if (temasSalvos && temasSalvos.length > 0) {
      setTemasLocais(temasSalvos);
    }
  }, [temasSalvos]);

  const totalPercentual = temasLocais.reduce((acc, t) => acc + (t.percentual || 0), 0);

  const handleSliderChange = (id: string, novoValor: number) => {
    setTemasLocais((prev) =>
      prev.map((t) => (t.id === id ? { ...t, percentual: novoValor } : t))
    );
  };

  const handleSalvar = async () => {
    await salvarTemas(temasLocais);
  };

  const handleResetar = () => {
    setTemasLocais(TEMAS_PADRAO);
  };

  const inovarInverter = (id: string) => {
    const tema = temasLocais.find((t) => t.id === id);
    if (tema) {
      setEditandoId(id);
      setNomeEdit(tema.nome);
      setCorEdit(tema.cor);
    }
  };

  const handleSalvarEdicaoTema = (id: string) => {
    setTemasLocais((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, nome: nomeEdit || t.nome, cor: corEdit } : t
      )
    );
    setEditandoId(null);
  };

  const handleRemoverTema = (id: string) => {
    if (temasLocais.length <= 1) return;
    setTemasLocais((prev) => prev.filter((t) => t.id !== id));
    if (editandoId === id) setEditandoId(null);
  };

  const handleAdicionarTema = () => {
    const proximaCor = PALETA_CORES[temasLocais.length % PALETA_CORES.length];
    const novoTema: TemaOrcamento = {
      id: `custom_${Date.now()}`,
      nome: `Novo Tema ${temasLocais.length + 1}`,
      percentual: 5,
      cor: proximaCor,
    };
    setTemasLocais((prev) => [...prev, novoTema]);
  };

  if (loading) {
    return (
      <Card className="border border-border bg-card p-6">
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Carregando Controle de Orçamento...
        </div>
      </Card>
    );
  }

  // Dados para o Recharts Pie Chart
  const pieData = temasLocais.map((t) => ({
    name: t.nome,
    value: t.percentual,
    color: t.cor,
  }));

  if (compact) {
    return (
      <Card className="border border-border bg-card/60 backdrop-blur shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-amber-500" />
            <CardTitle className="text-lg font-bold text-foreground">
              Controle de Orçamento
            </CardTitle>
          </div>
          <Badge variant={totalPercentual === 100 ? "secondary" : "destructive"}>
            {totalPercentual}% Total
          </Badge>
        </CardHeader>
        <CardContent className="pt-2 space-y-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="w-full md:w-1/2 h-[180px] relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number) => [`${value}%`, "Alocação"]}
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      borderColor: "#374151",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold text-foreground">{totalPercentual}%</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Alocado
                </span>
              </div>
            </div>

            <div className="w-full md:w-1/2 grid grid-cols-2 gap-2 text-xs">
              {temasLocais.map((t) => (
                <div key={t.id} className="flex items-center gap-2 p-1.5 rounded-md bg-muted/30">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: t.cor }}
                  />
                  <span className="truncate text-foreground font-medium flex-1">
                    {t.nome}
                  </span>
                  <span className="text-muted-foreground font-bold">{t.percentual}%</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {totalPercentual !== 100 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            A soma atual das porcentagens é de <strong>{totalPercentual}%</strong>. Para um planejamento equilibrado, ajuste os sliders para totalizar 100%.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel Esquerdo: Visualização de Uso (Donut Chart) */}
        <Card className="lg:col-span-5 border border-border bg-card flex flex-col justify-between shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-purple-400" />
              Visualização de uso
            </CardTitle>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-between space-y-6 pt-2">
            <div className="relative w-full h-[220px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number) => [`${value}%`, "Alocação"]}
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderColor: "#27272a",
                      borderRadius: "10px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-extrabold text-foreground">{totalPercentual}%</span>
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Total
                </span>
              </div>
            </div>

            {/* Legendas dos temas */}
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              {temasLocais.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: t.cor }}
                  />
                  <span className="truncate font-medium text-foreground flex-1">
                    {t.nome}
                  </span>
                  <span className="font-bold text-muted-foreground">{t.percentual}%</span>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={handleResetar}
              className="w-full mt-4 bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Resetar Valores
            </Button>
          </CardContent>
        </Card>

        {/* Painel Direito: Controle de Orçamento (Sliders e Edição) */}
        <Card className="lg:col-span-7 border border-border bg-card flex flex-col justify-between shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-500" />
              Controle de Orçamento
            </CardTitle>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleAdicionarTema}
              className="text-xs text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Novo Tema
            </Button>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col justify-between space-y-6 pt-2">
            <div className="space-y-5 overflow-y-auto max-h-[440px] pr-1">
              {temasLocais.map((t) => {
                const isEditing = editandoId === t.id;

                return (
                  <div key={t.id} className="space-y-2 group">
                    <div className="flex items-center justify-between text-sm">
                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-1 mr-4">
                          <Input
                            value={nomeEdit}
                            onChange={(e) => setNomeEdit(e.target.value)}
                            className="h-8 text-xs bg-background"
                            placeholder="Nome do tema"
                          />
                          <div className="flex items-center gap-1">
                            {PALETA_CORES.slice(0, 5).map((cor) => (
                              <button
                                key={cor}
                                type="button"
                                onClick={() => setCorEdit(cor)}
                                className={`w-5 h-5 rounded-full transition-transform ${
                                  corEdit === cor ? "scale-125 ring-2 ring-white" : ""
                                }`}
                                style={{ backgroundColor: cor }}
                              />
                            ))}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-green-500"
                            onClick={() => handleSalvarEdicaoTema(t.id)}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground"
                            onClick={() => setEditandoId(null)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: t.cor }}
                          />
                          <span className="font-semibold text-foreground">{t.nome}</span>
                          <button
                            type="button"
                            onClick={() => inovarInverter(t.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">{t.percentual}%</span>
                        {temasLocais.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoverTema(t.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Custom Styled Slider */}
                    <div className="relative flex items-center select-none touch-none w-full h-5">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={t.percentual}
                        onChange={(e) => handleSliderChange(t.id, Number(e.target.value))}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted/60 focus:outline-none"
                        style={{
                          background: `linear-gradient(to right, ${t.cor} 0%, ${t.cor} ${t.percentual}%, rgba(255,255,255,0.1) ${t.percentual}%, rgba(255,255,255,0.1) 100%)`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={handleSalvar}
              disabled={isSalvando}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold h-11 text-base shadow-lg shadow-amber-500/20"
            >
              <Save className="w-5 h-5 mr-2" />
              {isSalvando ? "Salvando..." : "Salvar"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
