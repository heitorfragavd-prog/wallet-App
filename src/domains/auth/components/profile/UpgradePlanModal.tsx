import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Check, ArrowRight, Crown } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Plan = Tables<"plans">;

interface UpgradePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlanId: string | null;
  currentPlanPrice: number;
}

export const UpgradePlanModal = ({
  isOpen,
  onClose,
  currentPlanId,
  currentPlanPrice,
}: UpgradePlanModalProps) => {
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchAvailablePlans();
    }
  }, [isOpen, currentPlanPrice]);

  const fetchAvailablePlans = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar planos com preço maior que o plano atual
      const { data: plans, error: plansError } = await supabase
        .from("plans")
        .select("*")
        .gt("price", currentPlanPrice)
        .order("price", { ascending: true });

      if (plansError) {
        throw new Error(plansError.message);
      }

      setAvailablePlans(plans || []);
    } catch (err) {
      console.error("Error fetching plans:", err);
      setError(err instanceof Error ? err.message : "Erro ao carregar planos");
    } finally {
      setLoading(false);
    }
  };

  const calculatePriceDifference = (targetPrice: number): number => {
    return targetPrice - currentPlanPrice;
  };

  const handleUpgrade = (planId: string) => {
    // Aqui você pode implementar a lógica de upgrade
    // Por exemplo, redirecionar para página de pagamento ou abrir outro modal
    console.log("Upgrading to plan:", planId);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-orange-500" />
            Fazer Upgrade do Plano
          </DialogTitle>
          <DialogDescription>
            Escolha um plano superior para desbloquear mais recursos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                onClick={fetchAvailablePlans}
                className="mt-4"
              >
                Tentar novamente
              </Button>
            </div>
          ) : availablePlans.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                Você já está no plano mais alto disponível!
              </p>
            </div>
          ) : (
            availablePlans.map((plan) => {
              const priceDifference = calculatePriceDifference(plan.price);

              return (
                <div
                  key={plan.id}
                  className="border rounded-lg p-4 hover:border-orange-500 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-bold">
                          R$ {plan.price.toFixed(2)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          /mês
                        </span>
                      </div>
                      <Badge variant="secondary" className="mt-2">
                        +R$ {priceDifference.toFixed(2)} por mês
                      </Badge>
                    </div>
                    <Button
                      onClick={() => handleUpgrade(plan.id)}
                      className="gap-2"
                    >
                      Escolher
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Features list */}
                  {plan.features && plan.features.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-2">
                        Recursos adicionais:
                      </h4>
                      <ul className="space-y-1">
                        {plan.features.map((feature, index) => (
                          <li
                            key={index}
                            className="flex items-start gap-2 text-sm"
                          >
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
