import { cn } from "@/lib/utils";
import * as ProgressPrimitive from "@radix-ui/react-progress";

interface UsageProgressBarProps {
  current: number;
  limit: number | null;
  label: string;
}

export const UsageProgressBar = ({ current, limit, label }: UsageProgressBarProps) => {
  // Se o limite é null, significa ilimitado
  if (limit === null) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-sm text-muted-foreground">Ilimitado</span>
        </div>
      </div>
    );
  }

  // Calcular percentual: Math.min(100, (current / limit) * 100)
  const percentage = Math.min(100, (current / limit) * 100);

  // Determinar cor baseada nos thresholds
  const getColorClass = (percent: number): string => {
    if (percent >= 100) {
      // Danger: >= 100%
      return "bg-destructive";
    } else if (percent >= 80) {
      // Warning: 80-99%
      return "bg-yellow-500 dark:bg-yellow-600";
    } else {
      // Default: < 80%
      return "bg-primary";
    }
  };

  const colorClass = getColorClass(percentage);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">
          {current} / {limit}
        </span>
      </div>
      <ProgressPrimitive.Root
        className="relative h-2 w-full overflow-hidden rounded-full bg-secondary"
        value={percentage}
      >
        <ProgressPrimitive.Indicator
          className={cn("h-full w-full flex-1 transition-all", colorClass)}
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
};
