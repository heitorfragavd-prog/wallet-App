import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useUserSubscription } from "@/domains/auth/hooks/useUserSubscription";
import { Check, Crown, ArrowUpCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UpgradePlanModal } from "./UpgradePlanModal";

export const PlanInfoCard = () => {
  const { subscription, plan, loading, error, isHighestTier } = useUserSubscription();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleUpgrade = () => {
    setShowUpgradeModal(true);
  };

  const formatExpirationDate = (dateString: string | null): string => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return format(date, "MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Plano Atual</CardTitle>
          <CardDescription>Informações sobre sua assinatura</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Plano Atual</CardTitle>
          <CardDescription>Informações sobre sua assinatura</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Erro ao carregar informações do plano. Tente novamente.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!plan) {
    return null;
  }

  const isPremium = plan.price > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Plano Atual</CardTitle>
            <CardDescription>Informações sobre sua assinatura</CardDescription>
          </div>
          {isPremium && (
            <Badge variant="default" className="gap-1">
              <Crown className="h-3 w-3" />
              Premium
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Nome do plano e status */}
        <div>
          <h3 className="text-2xl font-bold">{plan.name}</h3>
          {subscription && (
            <p className="text-sm text-muted-foreground">
              Status: <span className="text-green-600 dark:text-green-400 font-medium">{subscription.status}</span>
            </p>
          )}
          {subscription?.expires_at && (
            <p className="text-sm text-muted-foreground">
              Expira em: {formatExpirationDate(subscription.expires_at)}
            </p>
          )}
        </div>

        {/* Features list */}
        {plan.features && plan.features.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Recursos incluídos:</h4>
            <ul className="space-y-2">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Upgrade button ou badge de plano máximo */}
        {isHighestTier ? (
          <Badge variant="secondary" className="w-full justify-center py-2">
            <Crown className="h-4 w-4 mr-1" />
            Plano Máximo
          </Badge>
        ) : (
          <Button onClick={handleUpgrade} className="w-full gap-2">
            <ArrowUpCircle className="h-4 w-4" />
            Fazer Upgrade
          </Button>
        )}
      </CardContent>

      {/* Modal de Upgrade */}
      <UpgradePlanModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentPlanId={plan.id}
        currentPlanPrice={plan.price}
      />
    </Card>
  );
};
