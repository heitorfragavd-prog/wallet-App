import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/lib/utils";

interface ObservationsFieldProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
  rows?: number;
}

export function ObservationsField({
  value,
  onChange,
  maxLength = 500,
  placeholder = "Adicione observações...",
  label = "Observações",
  id = "observacoes",
  className,
  rows = 3,
}: ObservationsFieldProps) {
  const remaining = maxLength - value.length;
  const isNearLimit = remaining <= 50;
  const isAtLimit = remaining === 0;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= maxLength) {
      onChange(newValue);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          isAtLimit && "border-destructive focus-visible:ring-destructive"
        )}
      />
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground">
          {value.length > 0 && "Pressione Enter para nova linha"}
        </span>
        <span
          className={cn(
            "font-medium transition-colors",
            isAtLimit && "text-destructive",
            isNearLimit && !isAtLimit && "text-orange-500",
            !isNearLimit && "text-muted-foreground"
          )}
        >
          {value.length}/{maxLength} caracteres
        </span>
      </div>
    </div>
  );
}
