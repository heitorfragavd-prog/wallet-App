import React from "react";
import { Check, X, HelpCircle } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { ColaboradorFolguista, DisponibilidadeFolguista, TurnoId } from "../../types";

interface DisponibilidadesTabProps {
  selectedWeekend: { sabado: string; domingo: string };
  folguistas: ColaboradorFolguista[];
  disponibilidades: DisponibilidadeFolguista[];
  onToggleDisponibilidade: (input: {
    colaboradorId: string;
    dataReferencia: string;
    turno: TurnoId;
    disponivel: boolean;
  }) => void;
}

const TURNOS: Array<{ id: TurnoId; label: string; horario: string }> = [
  { id: "manha", label: "Manhã", horario: "05:00 - 13:30" },
  { id: "intermediario", label: "Intermediário", horario: "12:00 - 20:30" },
  { id: "noite", label: "Noite", horario: "15:00 - 23:30" },
];

export const DisponibilidadesTab: React.FC<DisponibilidadesTabProps> = ({
  selectedWeekend,
  folguistas,
  disponibilidades,
  onToggleDisponibilidade,
}) => {
  const getStatus = (colaboradorId: string, data: string, turno: TurnoId) => {
    const disp = disponibilidades.find(
      (d) =>
        d.colaborador_id === colaboradorId &&
        d.data_referencia === data &&
        (d.turno === turno || d.turno === "qualquer"),
    );
    if (!disp) return "pendente";
    return disp.disponivel ? "disponivel" : "indisponivel";
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border bg-card/60">
        <h3 className="text-sm font-bold">Matriz Semanal de Disponibilidade</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Respostas coletadas via grupo Telegram e registradas manualmente para o fim de semana ({selectedWeekend.sabado} & {selectedWeekend.domingo}).
        </p>
      </div>

      <div className="space-y-6">
        {/* SÁBADO */}
        <Card className="border-border/60">
          <CardHeader className="p-4 pb-2 border-b border-border/40">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span>Sábado — {selectedWeekend.sabado}</span>
              <Badge variant="outline" className="text-xs">
                Abertura / Turnos / Fechamento
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="p-3 text-left font-semibold">Folguista</th>
                  {TURNOS.map((t) => (
                    <th key={t.id} className="p-3 text-center font-semibold">
                      {t.label} ({t.horario})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {folguistas.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/20">
                    <td className="p-3 font-medium">{f.nome}</td>
                    {TURNOS.map((t) => {
                      const st = getStatus(f.id, selectedWeekend.sabado, t.id);
                      return (
                        <td key={t.id} className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              onToggleDisponibilidade({
                                colaboradorId: f.id,
                                dataReferencia: selectedWeekend.sabado,
                                turno: t.id,
                                disponivel: st !== "disponivel",
                              })
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                              st === "disponivel"
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                : st === "indisponivel"
                                ? "bg-destructive/15 text-destructive border border-destructive/30"
                                : "bg-muted text-muted-foreground border border-border/40"
                            }`}
                          >
                            {st === "disponivel" && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                            {st === "indisponivel" && <X className="w-3.5 h-3.5 text-destructive" />}
                            {st === "pendente" && <HelpCircle className="w-3.5 h-3.5" />}
                            <span className="capitalize">{st}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* DOMINGO */}
        <Card className="border-border/60">
          <CardHeader className="p-4 pb-2 border-b border-border/40">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span>Domingo — {selectedWeekend.domingo}</span>
              <Badge variant="outline" className="text-xs">
                Abertura / Turnos / Fechamento
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="p-3 text-left font-semibold">Folguista</th>
                  {TURNOS.map((t) => (
                    <th key={t.id} className="p-3 text-center font-semibold">
                      {t.label} ({t.horario})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {folguistas.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/20">
                    <td className="p-3 font-medium">{f.nome}</td>
                    {TURNOS.map((t) => {
                      const st = getStatus(f.id, selectedWeekend.domingo, t.id);
                      return (
                        <td key={t.id} className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              onToggleDisponibilidade({
                                colaboradorId: f.id,
                                dataReferencia: selectedWeekend.domingo,
                                turno: t.id,
                                disponivel: st !== "disponivel",
                              })
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                              st === "disponivel"
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                : st === "indisponivel"
                                ? "bg-destructive/15 text-destructive border border-destructive/30"
                                : "bg-muted text-muted-foreground border border-border/40"
                            }`}
                          >
                            {st === "disponivel" && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                            {st === "indisponivel" && <X className="w-3.5 h-3.5 text-destructive" />}
                            {st === "pendente" && <HelpCircle className="w-3.5 h-3.5" />}
                            <span className="capitalize">{st}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
