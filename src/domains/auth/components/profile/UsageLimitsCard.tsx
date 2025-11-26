import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { usePlanLimits } from "@/domains/admin/hooks/usePlanLimits";
import { UsageProgressBar } from "./UsageProgressBar";

// Mapeamento de feature keys para labels em português
const FEATURE_LABELS: Record<string, string> = {
  transactions_this_month: "Transações por mês",
  custom_categories: "Categorias personalizadas",
  ai_analysis_this_month: "Análises de IA por mês",
  file_uploads_this_month: "Uploads por mês",
  vehicles: "Veículos",
  goals: "Metas",
  market_items: "Itens de mercado",
};

export const UsageLimitsCard = () => {
  const { limits, usage, loading } = usePlanLimits();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Uso do Plano</CardTitle>
          <CardDescription>Acompanhe seu consumo em relação aos limites</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Obter todas as feature keys dos limites
  const featureKeys = Object.keys(limits);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uso do Plano</CardTitle>
        <CardDescription>Acompanhe seu consumo em relação aos limites</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {featureKeys.map((featureKey) => {
          const limit = limits[featureKey];
          const current = usage[featureKey as keyof typeof usage] || 0;
          const label = FEATURE_LABELS[featureKey] || featureKey;

          return (
            <UsageProgressBar
              key={featureKey}
              current={current}
              limit={limit}
              label={label}
            />
          );
        })}
      </CardContent>
    </Card>
  );
};
