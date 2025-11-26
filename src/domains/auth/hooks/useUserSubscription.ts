import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/domains/auth/hooks/useAuth";
import { useToast } from "@/shared/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Plan = Tables<"plans">;
type Subscription = Tables<"subscriptions">;

export interface UserSubscription extends Subscription {
  plan: Plan;
}

export interface UseUserSubscriptionReturn {
  subscription: UserSubscription | null;
  plan: Plan | null;
  loading: boolean;
  error: Error | null;
  isHighestTier: boolean;
  refetch: () => void;
}

export const useUserSubscription = (): UseUserSubscriptionReturn => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isHighestTier, setIsHighestTier] = useState(false);

  const fetchSubscription = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      // First, get the user's profile to get the profile ID
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (profileError) {
        throw new Error(profileError.message);
      }

      if (!profile) {
        throw new Error("Profile not found");
      }

      // Fetch user's active subscription with plan data
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from("subscriptions")
        .select(`
          *,
          plan:plans(*)
        `)
        .eq("user_id", profile.id)
        .eq("status", "active")
        .maybeSingle();

      if (subscriptionError) {
        throw new Error(subscriptionError.message);
      }

      // If no active subscription, default to "Essencial" plan
      if (!subscriptionData || !subscriptionData.plan_id) {
        const { data: essentialPlan, error: essentialError } = await supabase
          .from("plans")
          .select("*")
          .eq("name", "Essencial")
          .single();

        if (essentialError) {
          throw new Error(essentialError.message);
        }

        setPlan(essentialPlan);
        setSubscription(null);
        setIsHighestTier(false);
      } else {
        // Type assertion since we know plan exists from the query
        const planData = Array.isArray(subscriptionData.plan) 
          ? subscriptionData.plan[0] 
          : subscriptionData.plan;
        
        const userSub: UserSubscription = {
          ...subscriptionData,
          plan: planData as Plan,
        };

        setSubscription(userSub);
        setPlan(planData as Plan);

        // Determine if user is on highest tier by checking all plans
        const { data: allPlans, error: plansError } = await supabase
          .from("plans")
          .select("price")
          .order("price", { ascending: false });

        if (!plansError && allPlans && allPlans.length > 0) {
          const highestPrice = allPlans[0].price;
          setIsHighestTier(planData.price === highestPrice);
        }
      }
    } catch (err) {
      console.error("Error fetching subscription:", err);
      const errorObj = err instanceof Error ? err : new Error("Erro inesperado");
      setError(errorObj);
      toast({
        title: "Erro",
        description: `Erro ao carregar dados da assinatura: ${errorObj.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, [user]);

  return {
    subscription,
    plan,
    loading,
    error,
    isHighestTier,
    refetch: fetchSubscription,
  };
};
