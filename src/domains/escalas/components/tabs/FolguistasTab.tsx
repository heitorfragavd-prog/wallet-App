import React, { useState } from "react";
import { Star, Phone, DollarSign } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import type { ColaboradorFolguista } from "../../types";

interface FolguistasTabProps {
  colaboradores: ColaboradorFolguista[];
  onOpenNovoFolguista?: () => void;
}

export const FolguistasTab: React.FC<FolguistasTabProps> = ({ colaboradores }) => {
  const [filterTipo, setFilterTipo] = useState<"todos" | "folguista" | "funcionario">("todos");

  const filtered = colaboradores.filter((c) => {
    if (filterTipo === "todos") return true;
    return c.tipo === filterTipo;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border bg-card/60">
        <div>
          <h3 className="text-sm font-bold">Quadro de Folguistas & Equipe Operacional</h3>
          <p className="text-xs text-muted-foreground">
            Cadastro completo, chave Pix, valor de diária, turnos preferidos e notas de pontualidade.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={filterTipo === "todos" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterTipo("todos")}
            className="text-xs h-8"
          >
            Todos ({colaboradores.length})
          </Button>
          <Button
            type="button"
            variant={filterTipo === "folguista" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterTipo("folguista")}
            className="text-xs h-8"
          >
            Folguistas ({colaboradores.filter((c) => c.tipo === "folguista").length})
          </Button>
          <Button
            type="button"
            variant={filterTipo === "funcionario" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterTipo("funcionario")}
            className="text-xs h-8"
          >
            Fixos ({colaboradores.filter((c) => c.tipo === "funcionario").length})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <Card key={c.id} className="border-border/60 hover:border-primary/40 transition-all">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                    {c.nome}
                  </CardTitle>
                  <CardDescription className="text-xs capitalize">
                    {c.cargo || c.tipo}
                  </CardDescription>
                </div>
                <Badge
                  variant={c.tipo === "funcionario" ? "secondary" : "outline"}
                  className="text-[10px] uppercase font-mono"
                >
                  {c.tipo}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-4 pt-2 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  Diária Padrão:
                </span>
                <span className="font-mono font-bold text-foreground">
                  R$ {c.valor_diaria.toFixed(2)}
                </span>
              </div>

              {c.telefone && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    Telefone:
                  </span>
                  <span className="font-mono">{c.telefone}</span>
                </div>
              )}

              {c.pix_chave && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Pix:</span>
                  <span className="font-mono text-[11px] truncate max-w-[140px]">{c.pix_chave}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  Avaliação:
                </span>
                <span className="font-bold text-amber-400">{c.avaliacao_nota.toFixed(1)} / 5.0</span>
              </div>

              {c.turnos_preferidos && c.turnos_preferidos.length > 0 && (
                <div className="pt-1">
                  <span className="text-[10px] text-muted-foreground block mb-1">
                    Turnos Preferidos:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {c.turnos_preferidos.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[9px] uppercase">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
