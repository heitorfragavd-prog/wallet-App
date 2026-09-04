import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Filter } from "lucide-react";

export interface SaquesFilterValues {
  searchQuery: string;
  status: string;
  startDate: string;
  endDate: string;
}

interface SaquesFiltrosSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SaquesFilterValues;
  onApplyFilters: (newFilters: SaquesFilterValues) => void;
  onClearFilters: () => void;
}

export function SaquesFiltrosSheet({
  open,
  onOpenChange,
  filters,
  onApplyFilters,
  onClearFilters,
}: SaquesFiltrosSheetProps) {
  const handleChange = (field: keyof SaquesFilterValues, value: string) => {
    onApplyFilters({
      ...filters,
      [field]: value,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xs p-6 bg-card border-l border-border/60 flex flex-col justify-between">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <SheetTitle className="text-base font-bold text-foreground">
              Realizar filtros
            </SheetTitle>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {/* FILTRAR por palavras chaves */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                FILTRAR
              </label>
              <Input
                placeholder="Filtrar por palavras chaves..."
                value={filters.searchQuery}
                onChange={(e) => handleChange("searchQuery", e.target.value)}
                className="h-9 text-xs rounded-xl bg-background border-border/60"
              />
            </div>

            {/* STATUS */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                STATUS
              </label>
              <Select
                value={filters.status}
                onValueChange={(val) => handleChange("status", val)}
              >
                <SelectTrigger className="h-9 text-xs rounded-xl bg-background border-border/60">
                  <SelectValue placeholder="Filtrar por Status..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os Status</SelectItem>
                  <SelectItem value="FINALIZADO">FINALIZADO</SelectItem>
                  <SelectItem value="PENDENTE">PENDENTE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* DATA INICIAL */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                DATA INICIAL
              </label>
              <Input
                type="datetime-local"
                value={filters.startDate}
                onChange={(e) => handleChange("startDate", e.target.value)}
                className="h-9 text-xs rounded-xl bg-background border-border/60"
              />
            </div>

            {/* DATA FINAL */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                DATA FINAL
              </label>
              <Input
                type="datetime-local"
                value={filters.endDate}
                onChange={(e) => handleChange("endDate", e.target.value)}
                className="h-9 text-xs rounded-xl bg-background border-border/60"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions (Botão Fechar & Botão Limpar Filtros) */}
        <div className="pt-6 border-t border-border/40 space-y-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full h-9 text-xs font-semibold rounded-xl border-amber-500/60 text-amber-500 hover:bg-amber-500/10"
          >
            Fechar
          </Button>

          <Button
            onClick={() => {
              onClearFilters();
              onOpenChange(false);
            }}
            className="w-full h-9 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white gap-2"
          >
            <Filter className="w-3.5 h-3.5" /> Limpar Filtros
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
