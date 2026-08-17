import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

type Props = {
  label: string;
  value: string | null | undefined;
  maskedValue: string;
};

export function SensitiveValue({ label, value, maskedValue }: Props) {
  const [revealed, setRevealed] = useState(false);
  const available = Boolean(value?.trim());

  return (
    <div className="rounded-xl border border-border/50 bg-muted/10 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex min-h-8 items-center justify-between gap-3">
        <p className="min-w-0 truncate font-mono text-sm text-foreground">{available ? (revealed ? value : maskedValue) : "Não informado"}</p>
        {available && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={`${revealed ? "Ocultar" : "Revelar"} ${label.toLowerCase()}`}
            onClick={() => setRevealed((current) => !current)}
          >{revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
        )}
      </div>
    </div>
  );
}
