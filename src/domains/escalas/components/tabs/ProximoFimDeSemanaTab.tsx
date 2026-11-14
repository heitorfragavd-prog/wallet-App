import React from "react";
import {
  AlertTriangle,
  Calendar,
  Clock,
  Sparkles,
  UserCheck,
  UserX,
  Save,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import type { EscalaSlot, ScheduleGenerationResult } from "../../types";

interface ProximoFimDeSemanaTabProps {
  selectedWeekend: { sabado: string; domingo: string };
  slots: EscalaSlot[];
  generatedPreview: ScheduleGenerationResult | null;
  isGenerating: boolean;
  isSaving: boolean;
  onGenerate: () => void;
  onSave: (slots: EscalaSlot[]) => void;
  onDiscardPreview: () => void;
}

export const ProximoFimDeSemanaTab: React.FC<ProximoFimDeSemanaTabProps> = ({
  selectedWeekend,
  slots,
  generatedPreview,
  isGenerating,
  isSaving,
  onGenerate,
  onSave,
  onDiscardPreview,
}) => {
  const displaySlots = generatedPreview ? generatedPreview.slots : slots;

  const sabadoSlots = displaySlots.filter((s) => s.data === selectedWeekend.sabado);
  const domingoSlots = displaySlots.filter((s) => s.data === selectedWeekend.domingo);

  const totalSlots = displaySlots.length;
  const filledSlots = displaySlots.filter((s) => Boolean(s.colaboradorId)).length;
  const uncoveredCount = totalSlots - filledSlots;

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border bg-card/60 backdrop-blur-sm shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">
              Escala de Fim de Semana: {selectedWeekend.sabado} & {selectedWeekend.domingo}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Motor inteligente com respeito estrito a descanso legal CLT (11h), bloqueio de sexta noite para sábado de manhã e Suellen domingo à noite.
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {generatedPreview ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDiscardPreview}
                disabled={isSaving}
                className="text-xs h-9 gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Descartar Prévia
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onSave(generatedPreview.slots)}
                disabled={isSaving}
                className="text-xs h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? "Salvando..." : "Gravar Escala"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={onGenerate}
              disabled={isGenerating}
              className="text-xs h-9 gap-1.5 bg-primary text-primary-foreground font-semibold shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              {isGenerating ? "Calculando..." : "Gerar Escala Automática"}
            </Button>
          )}
        </div>
      </div>

      {/* Alerta de Prévia não salva */}
      {generatedPreview && (
        <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Prévia Gerada:</strong> Esta é uma simulação calculada pelo motor. Clique em <strong>"Gravar Escala"</strong> para confirmar no banco.
            </span>
          </div>
          {generatedPreview.violacoes.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {generatedPreview.violacoes.length} alerta(s)
            </Badge>
          )}
        </div>
      )}

      {/* Indicadores Rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border bg-card/40">
          <span className="text-[11px] text-muted-foreground">Total de Turnos</span>
          <p className="text-xl font-bold">{totalSlots}</p>
        </div>
        <div className="p-3 rounded-lg border bg-card/40">
          <span className="text-[11px] text-muted-foreground">Turnos Cobertos</span>
          <p className="text-xl font-bold text-emerald-400">{filledSlots}</p>
        </div>
        <div className="p-3 rounded-lg border bg-card/40">
          <span className="text-[11px] text-muted-foreground">Turnos Descobertos</span>
          <p className={`text-xl font-bold ${uncoveredCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {uncoveredCount}
          </p>
        </div>
        <div className="p-3 rounded-lg border bg-card/40">
          <span className="text-[11px] text-muted-foreground">Cobertura</span>
          <p className="text-xl font-bold text-primary">
            {totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Grid de Turnos: Sábado vs Domingo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SÁBADO */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <span>Sábado</span>
                  <Badge variant="outline" className="text-xs font-mono">
                    {selectedWeekend.sabado}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Turnos de atendimento e fechamento
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            {sabadoSlots.map((slot) => (
              <div
                key={`${slot.data}-${slot.turno}`}
                className={`p-3 rounded-xl border transition-all ${
                  slot.colaboradorId
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary">
                        Turno {slot.turno}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {slot.horarioInicio} - {slot.horarioFim}
                      </span>
                    </div>

                    {slot.colaboradorId ? (
                      <div className="flex items-center gap-1.5 pt-1">
                        <UserCheck className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-semibold">{slot.colaboradorNome}</span>
                        {slot.colaboradorTipo && (
                          <Badge variant="secondary" className="text-[9px] uppercase">
                            {slot.colaboradorTipo}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 pt-1 text-destructive">
                        <UserX className="w-4 h-4" />
                        <span className="text-xs font-medium">Turno Descoberto</span>
                      </div>
                    )}
                  </div>

                  <div className="text-right space-y-1">
                    <span className="text-xs font-mono font-bold text-foreground">
                      R$ {slot.valorDiaria.toFixed(2)}
                    </span>
                    <div>
                      {slot.colaboradorId ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                          Alocado
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">
                          Pendente
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {slot.observacao && (
                  <p className="text-[10px] text-muted-foreground mt-2 border-t border-border/30 pt-1.5">
                    {slot.observacao}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* DOMINGO */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <span>Domingo</span>
                  <Badge variant="outline" className="text-xs font-mono">
                    {selectedWeekend.domingo}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Turnos de atendimento e fechamento
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            {domingoSlots.map((slot) => (
              <div
                key={`${slot.data}-${slot.turno}`}
                className={`p-3 rounded-xl border transition-all ${
                  slot.colaboradorId
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary">
                        Turno {slot.turno}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {slot.horarioInicio} - {slot.horarioFim}
                      </span>
                    </div>

                    {slot.colaboradorId ? (
                      <div className="flex items-center gap-1.5 pt-1">
                        <UserCheck className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-semibold">{slot.colaboradorNome}</span>
                        {slot.colaboradorTipo && (
                          <Badge variant="secondary" className="text-[9px] uppercase">
                            {slot.colaboradorTipo}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 pt-1 text-destructive">
                        <UserX className="w-4 h-4" />
                        <span className="text-xs font-medium">Turno Descoberto</span>
                      </div>
                    )}
                  </div>

                  <div className="text-right space-y-1">
                    <span className="text-xs font-mono font-bold text-foreground">
                      R$ {slot.valorDiaria.toFixed(2)}
                    </span>
                    <div>
                      {slot.colaboradorId ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                          Alocado
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">
                          Pendente
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {slot.observacao && (
                  <p className="text-[10px] text-muted-foreground mt-2 border-t border-border/30 pt-1.5">
                    {slot.observacao}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Lista de Alertas / Sugestões do Motor */}
      {generatedPreview && generatedPreview.violacoes.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              Inconsistências Identificadas ({generatedPreview.violacoes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {generatedPreview.violacoes.map((v, i) => (
              <div key={i} className="flex items-start gap-2 text-muted-foreground">
                <span className="text-destructive font-mono font-bold">•</span>
                <span>{v.mensagem}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
