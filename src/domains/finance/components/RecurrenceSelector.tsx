import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Input } from "@/shared/components/ui/input";
import { Calendar, Repeat } from "lucide-react";
import { RecurrenceType } from "../types";

export interface RecurrenceConfig {
  tipo: RecurrenceType;
  data_fim?: string;
}

interface RecurrenceSelectorProps {
  value: RecurrenceConfig | null;
  onChange: (config: RecurrenceConfig | null) => void;
  disabled?: boolean;
  className?: string;
}

const recurrenceOptions = [
  { value: 'unica' as const, label: 'Única (não repetir)' },
  { value: 'diaria' as const, label: 'Diária' },
  { value: 'semanal' as const, label: 'Semanal' },
  { value: 'mensal' as const, label: 'Mensal' },
  { value: 'anual' as const, label: 'Anual' },
];

export function RecurrenceSelector({
  value,
  onChange,
  disabled = false,
  className,
}: RecurrenceSelectorProps) {
  const handleTipoChange = (tipo: RecurrenceType) => {
    if (tipo === 'unica') {
      onChange(null);
    } else {
      onChange({
        tipo,
        data_fim: value?.data_fim
      });
    }
  };

  const handleDataFimChange = (data_fim: string) => {
    if (value && value.tipo !== 'unica') {
      onChange({
        ...value,
        data_fim: data_fim || undefined
      });
    }
  };

  const currentTipo = value?.tipo || 'unica';
  const showDataFim = currentTipo !== 'unica';

  return (
    <div className={className}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="recorrencia">Recorrência</Label>
          <Select
            value={currentTipo}
            onValueChange={(val) => handleTipoChange(val as RecurrenceType)}
            disabled={disabled}
          >
            <SelectTrigger id="recorrencia">
              <SelectValue>
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4" />
                  <span>
                    {recurrenceOptions.find(opt => opt.value === currentTipo)?.label}
                  </span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {recurrenceOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4" />
                    <span>{option.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showDataFim && (
          <div className="space-y-2">
            <Label htmlFor="data_fim">
              Data de Término (opcional)
            </Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="data_fim"
                type="date"
                value={value?.data_fim || ''}
                onChange={(e) => handleDataFimChange(e.target.value)}
                disabled={disabled}
                className="pl-10"
                placeholder="Deixe em branco para repetir indefinidamente"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Deixe em branco para repetir indefinidamente
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
