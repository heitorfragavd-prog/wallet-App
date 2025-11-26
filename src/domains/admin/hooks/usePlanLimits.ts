import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/domains/auth/hooks/useProfile";
import { useToast } from "@/shared/hooks/use-toast";

interface PlanLimit {
  feature_key: string;
  limit_value: number | null; // null = ilimitado
}

interface UsageStats {
  transactions_this_month: number;
  custom_categories: number;
  ai_analysis_this_month: number;
  file_uploads_this_month: number;
  vehicles: number;
  goals: number;
  market_items: number;
}

export const usePlanLimits = () => {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [limits, setLimits] = useState<Record<string, number | null>>({});
  const [usage, setUsage] = useState<UsageStats>({
    transactions_this_month: 0,
    custom_categories: 0,
    ai_analysis_this_month: 0,
    file_uploads_this_month: 0,
    vehicles: 0,
    goals: 0,
    market_items: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchLimitsAndUsage();
    }
  }, [profile]);

  const fetchLimitsAndUsage = async () => {
    try {
      // Buscar assinatura do usuário
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('plan_id, plans(name)')
        .eq('user_id', profile!.id)
        .eq('status', 'active')
        .single();

      if (!subscription?.plan_id) {
        // Usuário sem plano ativo, usar limites do Essencial
        const { data: essentialPlan } = await supabase
          .from('plans')
          .select('id')
          .eq('name', 'Essencial')
          .single();

        if (essentialPlan) {
          await fetchPlanLimits(essentialPlan.id);
        }
      } else {
        await fetchPlanLimits(subscription.plan_id);
      }

      // Buscar uso atual
      await fetchCurrentUsage();
    } catch (error) {
      console.error('Error fetching limits:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlanLimits = async (planId: string) => {
    const { data: planLimits } = await supabase
      .from('plan_limits')
      .select('feature_key, limit_value')
      .eq('plan_id', planId);

    if (planLimits) {
      const limitsMap: Record<string, number | null> = {};
      planLimits.forEach((limit: PlanLimit) => {
        limitsMap[limit.feature_key] = limit.limit_value;
      });
      setLimits(limitsMap);
    }
  };

  const fetchCurrentUsage = async () => {
    const userId = profile!.user_id;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Contar transações do mês
    const { count: transactionsCount } = await supabase
      .from('transacoes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    // Contar categorias personalizadas
    const { count: categoriesCount } = await supabase
      .from('categorias')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Contar análises de IA do mês
    const { count: aiAnalysisCount } = await supabase
      .from('ia_analysis_results')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    // Contar uploads do mês
    const { count: uploadsCount } = await supabase
      .from('ia_uploads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    // Contar veículos
    const { count: vehiclesCount } = await supabase
      .from('veiculos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Contar metas
    const { count: goalsCount } = await supabase
      .from('metas')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Contar itens de mercado
    const { count: marketItemsCount } = await supabase
      .from('itens_mercado')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    setUsage({
      transactions_this_month: transactionsCount || 0,
      custom_categories: categoriesCount || 0,
      ai_analysis_this_month: aiAnalysisCount || 0,
      file_uploads_this_month: uploadsCount || 0,
      vehicles: vehiclesCount || 0,
      goals: goalsCount || 0,
      market_items: marketItemsCount || 0,
    });
  };

  const checkLimit = (featureKey: keyof UsageStats): boolean => {
    const limit = limits[featureKey];
    const currentUsage = usage[featureKey];

    // null = ilimitado
    if (limit === null) return true;

    // Verificar se está dentro do limite
    return currentUsage < limit;
  };

  const canUseFeature = (featureKey: keyof UsageStats): boolean => {
    const hasLimit = checkLimit(featureKey);
    
    if (!hasLimit) {
      const limit = limits[featureKey];
      toast({
        title: "Limite atingido",
        description: `Você atingiu o limite de ${limit} ${getFeatureName(featureKey)} do seu plano. Faça upgrade para continuar.`,
        variant: "destructive",
      });
    }

    return hasLimit;
  };

  const getFeatureName = (featureKey: string): string => {
    const names: Record<string, string> = {
      transactions_this_month: "transações por mês",
      custom_categories: "categorias personalizadas",
      ai_analysis_this_month: "análises de IA por mês",
      file_uploads_this_month: "uploads por mês",
      vehicles: "veículos",
      goals: "metas",
      market_items: "itens de mercado",
    };
    return names[featureKey] || featureKey;
  };

  const getRemainingUsage = (featureKey: keyof UsageStats): number | null => {
    const limit = limits[featureKey];
    if (limit === null) return null; // ilimitado
    
    const currentUsage = usage[featureKey];
    return Math.max(0, limit - currentUsage);
  };

  return {
    limits,
    usage,
    loading,
    checkLimit,
    canUseFeature,
    getRemainingUsage,
    refetch: fetchLimitsAndUsage,
  };
};
