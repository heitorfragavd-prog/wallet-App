import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AdminStatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  gradient: 'green' | 'blue' | 'purple' | 'orange' | 'red';
  loading?: boolean;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const GRADIENT_CLASSES = {
  green: {
    card: 'from-green-500/10 to-green-500/5',
    icon: 'bg-green-500/20 text-green-500',
    darkCard: 'dark:from-green-500/20 dark:to-green-500/10'
  },
  blue: {
    card: 'from-blue-500/10 to-blue-500/5',
    icon: 'bg-blue-500/20 text-blue-500',
    darkCard: 'dark:from-blue-500/20 dark:to-blue-500/10'
  },
  purple: {
    card: 'from-purple-500/10 to-purple-500/5',
    icon: 'bg-purple-500/20 text-purple-500',
    darkCard: 'dark:from-purple-500/20 dark:to-purple-500/10'
  },
  orange: {
    card: 'from-orange-500/10 to-orange-500/5',
    icon: 'bg-orange-500/20 text-orange-500',
    darkCard: 'dark:from-orange-500/20 dark:to-orange-500/10'
  },
  red: {
    card: 'from-red-500/10 to-red-500/5',
    icon: 'bg-red-500/20 text-red-500',
    darkCard: 'dark:from-red-500/20 dark:to-red-500/10'
  }
};

export const AdminStatsCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient,
  loading = false,
  trend
}: AdminStatsCardProps) => {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            {subtitle && <Skeleton className="h-3 w-20" />}
          </div>
          <Skeleton className="h-12 w-12 rounded-xl" />
        </div>
      </Card>
    );
  }

  const gradientConfig = GRADIENT_CLASSES[gradient];

  return (
    <Card 
      className={cn(
        "p-6 bg-gradient-to-br border-0 shadow-sm",
        gradientConfig.card,
        gradientConfig.darkCard
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold tracking-tight">
              {value}
            </h3>
            {trend && (
              <div className={cn(
                "flex items-center gap-1 text-sm font-medium",
                trend.isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              )}>
                {trend.isPositive ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>{Math.abs(trend.value)}%</span>
              </div>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">
              {subtitle}
            </p>
          )}
        </div>
        <div className={cn(
          "h-12 w-12 rounded-xl flex items-center justify-center",
          gradientConfig.icon
        )}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </Card>
  );
};
