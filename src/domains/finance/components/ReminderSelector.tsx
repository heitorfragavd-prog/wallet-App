import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Label } from "@/shared/components/ui/label";
import { Bell } from "lucide-react";

interface ReminderSelectorProps {
  value?: number | null;
  onChange: (hours: number | null) => void;
  disabled?: boolean;
}

const REMINDER_OPTIONS = [
  { value: "none", label: "Sem lembrete", hours: null },
  { value: "24", label: "24 horas antes", hours: 24 },
  { value: "48", label: "48 horas antes", hours: 48 },
  { value: "72", label: "72 horas antes", hours: 72 },
  { value: "168", label: "1 semana antes", hours: 168 },
];

export const ReminderSelector = ({
  value,
  onChange,
  disabled = false,
}: ReminderSelectorProps) => {
  const selectedValue = value ? value.toString() : "none";

  const handleChange = (newValue: string) => {
    const option = REMINDER_OPTIONS.find((opt) => opt.value === newValue);
    onChange(option?.hours ?? null);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="reminder" className="flex items-center gap-2">
        <Bell className="w-4 h-4" />
        Lembrete
      </Label>
      <Select
        value={selectedValue}
        onValueChange={handleChange}
        disabled={disabled}
      >
        <SelectTrigger id="reminder" className="w-full">
          <SelectValue placeholder="Selecione um lembrete" />
        </SelectTrigger>
        <SelectContent>
          {REMINDER_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
