import type { ReactNode } from "react";

import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import { cn } from "@/lib/utils";
import { formatShortDate, type WeekDay } from "./weeklyUtils";

type WeekGridProps = {
  days: WeekDay[];
  worked: boolean[];
  onWorkedChange: (index: number, value: boolean) => void;
  renderFields: (day: WeekDay, index: number, disabled: boolean) => ReactNode;
};

export function WeekGrid({ days, worked, onWorkedChange, renderFields }: WeekGridProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60" role="table" aria-label="Dias da semana">
      {days.map((day, index) => {
        const active = worked[index];
        const checkboxId = `worked-${day.date}`;
        return (
          <div
            key={day.date}
            role="row"
            className={cn(
              "grid min-w-[680px] grid-cols-[120px_92px_1fr] items-center gap-3 border-b border-border/40 px-3 py-3 last:border-b-0",
              !active && "bg-muted/10 text-muted-foreground",
            )}
          >
            <div role="cell">
              <p className="text-sm font-semibold">{day.label}</p>
              <p className="text-xs text-muted-foreground">{formatShortDate(day.date)}</p>
            </div>
            <div className="flex items-center gap-2" role="cell">
              <Checkbox
                id={checkboxId}
                aria-label={`Trabalhou na ${day.label}`}
                checked={active}
                onCheckedChange={(value) => onWorkedChange(index, value === true)}
              />
              <Label htmlFor={checkboxId} className="text-xs">Foi?</Label>
            </div>
            <div role="cell">{renderFields(day, index, !active)}</div>
          </div>
        );
      })}
    </div>
  );
}
