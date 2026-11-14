import React, { useState } from "react";
import { Calendar as CalendarIcon, Clock, Filter, User } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import type { ColaboradorFolguista, EscalaSlot } from "../../types";

interface CalendarioTabProps {
  slots: EscalaSlot[];
  colaboradores: ColaboradorFolguista[];
}

export const CalendarioTab: React.FC<CalendarioTabProps> = ({ slots, colaboradores }) => {
  const [selectedColab, setSelectedColab] = useState<string>("todos");

  const filteredSlots = slots.filter((slot) => {
    if (selectedColab === "todos") return true;
    return slot.colaboradorId === selectedColab;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border bg-card/60">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-sm font-bold">Calendário de Turnos</h3>
            <p className="text-xs text-muted-foreground">
              Visão cronológica de todos os turnos agendados e alocações de equipe.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedColab} onValueChange={setSelectedColab}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Filtrar colaborador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os colaboradores</SelectItem>
              {colaboradores.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredSlots.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <p className="text-sm text-muted-foreground">Nenhum turno agendado para o filtro selecionado.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filteredSlots.map((slot) => (
            <Card key={`${slot.data}-${slot.turno}`} className="border-border/60">
              <CardHeader className="p-3 pb-2 border-b border-border/30 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold font-mono">
                  {slot.data} ({slot.diaSemana})
                </CardTitle>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {slot.turno}
                </Badge>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {slot.horarioInicio} - {slot.horarioFim}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold">
                      {slot.colaboradorNome || "Descoberto"}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold">
                    R$ {slot.valorDiaria.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
