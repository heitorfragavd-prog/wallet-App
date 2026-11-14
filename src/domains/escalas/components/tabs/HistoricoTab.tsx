import React from "react";
import { History } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent } from "@/shared/components/ui/card";
import type { EscalaSlot } from "../../types";

interface HistoricoTabProps {
  slots: EscalaSlot[];
}

export const HistoricoTab: React.FC<HistoricoTabProps> = ({ slots }) => {
  const completedSlots = slots.filter((s) => s.status === "concluida" || s.status === "confirmada");

  const totalPagoOuAPagar = completedSlots.reduce((acc, s) => acc + s.valorDiaria, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border bg-card/60">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-sm font-bold">Histórico de Escalas Realizadas & Acertos</h3>
            <p className="text-xs text-muted-foreground">
              Turnos cumpridos, metas batidas e pagamentos consolidados para folguistas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground uppercase">Total Acertos</span>
            <p className="text-sm font-bold font-mono text-emerald-400">
              R$ {totalPagoOuAPagar.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {slots.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <p className="text-sm text-muted-foreground">Nenhum registro histórico de turnos encontrado.</p>
        </Card>
      ) : (
        <Card className="border-border/60">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="p-3 text-left font-semibold">Data</th>
                  <th className="p-3 text-left font-semibold">Turno</th>
                  <th className="p-3 text-left font-semibold">Colaborador</th>
                  <th className="p-3 text-center font-semibold">Horário</th>
                  <th className="p-3 text-right font-semibold">Valor Diária</th>
                  <th className="p-3 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {slots.map((s, idx) => (
                  <tr key={s.id || idx} className="hover:bg-muted/20">
                    <td className="p-3 font-mono">{s.data}</td>
                    <td className="p-3 uppercase font-semibold">{s.turno}</td>
                    <td className="p-3 font-medium">{s.colaboradorNome || "—"}</td>
                    <td className="p-3 text-center font-mono text-muted-foreground">
                      {s.horarioInicio} - {s.horarioFim}
                    </td>
                    <td className="p-3 text-right font-mono font-bold">
                      R$ {s.valorDiaria.toFixed(2)}
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        variant={s.status === "concluida" ? "secondary" : "outline"}
                        className="text-[10px] capitalize"
                      >
                        {s.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
