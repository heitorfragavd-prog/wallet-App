import { logger } from "@/core/logging/LoggerService";
import { useEffect, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, X, Sparkles } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { GlassmorphicCard } from './GlassmorphicCard';
import { useInView, useReducedMotion } from '@/shared/hooks/animations';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
}

interface PlanLimit {
  plan_id: string;
  feature_key: string;
  limit_value: number | null;
}

interface PaymentLink {
  plan_id: string;
  payment_link: string;
  is_active: boolean;
}

interface PlanDisplay {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  notIncluded: string[];
  buttonText: string;
  popular: boolean;
  color: string;
  link: string;
}

export interface PricingPremiumProps {
  title?: string;
  subtitle?: string;
}

// Mapeamento de feature_key para texto legível em português
const featureKeyLabels: Record<string, string> = {
  'transactions_this_month': 'transações por mês',
  'max_transactions': 'transações por mês',
  'transactions_per_month': 'transações por mês',
  'vehicles_count': 'veículos',
  'max_vehicles': 'veículos',
  'vehicles': 'veículos',
  'goals_count': 'metas financeiras',
  'max_goals': 'metas financeiras',
  'goals': 'metas financeiras',
  'ai_queries_this_month': 'consultas IA por mês',
  'ai_queries_per_month': 'consultas IA por mês',
  'ai_analysis_per_month': 'análises IA por mês',
  'categories_count': 'categorias personalizadas',
  'max_categories': 'categorias personalizadas',
  'custom_categories': 'categorias personalizadas',
  'debts_count': 'dívidas',
  'max_debts': 'dívidas',
  'debts': 'dívidas',
  'reports_count': 'relatórios',
  'max_reports': 'relatórios',
  'file_uploads_per_month': 'uploads de arquivos por mês',
  'market_items': 'itens de mercado',
};

// Features base que não dependem de limites
const baseFeatures: Record<string, string[]> = {
  'Essencial': [
    'Gestão básica de receitas e despesas',
    'Relatórios mensais básicos',
  ],
  'Pro': [
    'Gestão ilimitada de receitas e despesas',
    'Relatórios avançados',
    'Gestão de dívidas',
    'Controle de estoque (mercado)',
    'Gestão de veículos',
    'Suporte prioritário',
  ],
  'Black': [
    'Todos os recursos do Pro',
    'Análise com IA de documentos',
    'Upload ilimitado de comprovantes',
    'Insights financeiros com IA',
    'Categorização automática',
    'Previsões financeiras',
    'Suporte VIP 24/7',
    'Consultoria financeira mensal',
  ],
};

const planConfigs: Record<string, {
  description: string;
  notIncluded: string[];
  buttonText: string;
  popular: boolean;
  color: string;
  defaultLink: string;
  glowColor: string;
}> = {
  'Essencial': {
    description: 'Para quem está começando a organizar as finanças',
    notIncluded: ['Integração com WhatsApp', 'Relatórios Avançados', 'Metas Ilimitadas', 'Consultoria IA'],
    buttonText: 'Começar Grátis',
    popular: false,
    color: 'gray',
    defaultLink: '/login',
    glowColor: 'rgba(107, 114, 128, 0.3)',
  },
  'Pro': {
    description: 'A escolha ideal para automação total',
    notIncluded: ['Consultoria IA Personalizada', 'Gestão de Investimentos'],
    buttonText: 'Assinar Pro',
    popular: true,
    color: 'orange',
    defaultLink: '/login',
    glowColor: 'rgba(249, 115, 22, 0.4)',
  },
  'Black': {
    description: 'Para quem busca excelência e inteligência financeira',
    notIncluded: [],
    buttonText: 'Ser Black',
    popular: false,
    color: 'slate',
    defaultLink: '/login',
    glowColor: 'rgba(71, 85, 105, 0.3)',
  },
};


const fallbackPlans: PlanDisplay[] = [
  {
    name: 'Essencial',
    price: 'Grátis',
    description: 'Para quem está começando a organizar as finanças',
    features: ['Gestão básica de receitas e despesas', 'Até 50 transações por mês', '1 categoria personalizada', 'Relatórios mensais básicos'],
    notIncluded: ['Integração com WhatsApp', 'Relatórios Avançados', 'Metas Ilimitadas', 'Consultoria IA'],
    buttonText: 'Começar Grátis',
    popular: false,
    color: 'gray',
    link: '/login',
  },
  {
    name: 'Pro',
    price: 'R$ 29,90',
    period: '/mês',
    description: 'A escolha ideal para automação total',
    features: ['Gestão ilimitada de receitas e despesas', 'Transações ilimitadas', 'Categorias ilimitadas', 'Relatórios avançados', 'Gestão de dívidas', 'Metas financeiras', 'Controle de estoque (mercado)', 'Gestão de veículos', 'Suporte prioritário'],
    notIncluded: ['Consultoria IA Personalizada', 'Gestão de Investimentos'],
    buttonText: 'Assinar Pro',
    popular: true,
    color: 'orange',
    link: '/login',
  },
  {
    name: 'Black',
    price: 'R$ 59,90',
    period: '/mês',
    description: 'Para quem busca excelência e inteligência financeira',
    features: ['Todos os recursos do Pro', 'Análise com IA de documentos', 'Upload ilimitado de comprovantes', 'Insights financeiros com IA', 'Categorização automática', 'Previsões financeiras', 'Suporte VIP 24/7', 'Consultoria financeira mensal'],
    notIncluded: [],
    buttonText: 'Ser Black',
    popular: false,
    color: 'slate',
    link: '/login',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

/**
 * Premium Pricing Section with glassmorphic cards and animations.
 * Implements Requirements 4.1-4.4
 */
export const PricingPremium = memo(function PricingPremium({
  title = 'PLANOS',
  subtitle = 'Escolha o plano ideal para sua liberdade financeira',
}: PricingPremiumProps) {
  const navigate = useNavigate();
  const { ref, inView } = useInView<HTMLElement>({ triggerOnce: true, threshold: 0.1 });
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = !prefersReducedMotion;
  const [plans, setPlans] = useState<PlanDisplay[]>(fallbackPlans);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlansWithLinks();
  }, []);

  const formatLimitFeature = (featureKey: string, limitValue: number | null): string | null => {
    const label = featureKeyLabels[featureKey] || featureKey.replace(/_/g, ' ');
    
    // Se o limite é 0, não mostrar essa feature (não disponível)
    if (limitValue === 0) {
      return null;
    }
    
    if (limitValue === null || limitValue === -1) {
      // Capitaliza a primeira letra
      const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
      return `${capitalizedLabel} ilimitadas`;
    }
    
    return `Até ${limitValue} ${label}`;
  };

  const fetchPlansWithLinks = async () => {
    try {
      // Buscar planos
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .order('price', { ascending: true });

      if (plansError) throw plansError;

      // Buscar limites de todos os planos
      const { data: limitsData, error: limitsError } = await supabase
        .from('plan_limits')
        .select('plan_id, feature_key, limit_value');

      if (limitsError) throw limitsError;

      // Buscar links de pagamento
      const { data: linksData, error: linksError } = await supabase
        .from('payment_links')
        .select('plan_id, payment_link, is_active')
        .eq('is_active', true);

      if (linksError) throw linksError;

      // Mapear links por plan_id
      const linksMap = new Map<string, string>();
      linksData?.forEach((link: PaymentLink) => {
        linksMap.set(link.plan_id, link.payment_link);
      });

      // Mapear limites por plan_id
      const limitsMap = new Map<string, PlanLimit[]>();
      limitsData?.forEach((limit: PlanLimit) => {
        const existing = limitsMap.get(limit.plan_id) || [];
        existing.push(limit);
        limitsMap.set(limit.plan_id, existing);
      });

      const combinedPlans = plansData?.map((plan: Plan) => {
        const config = planConfigs[plan.name] || planConfigs['Essencial'];
        const paymentLink = linksMap.get(plan.id) || config.defaultLink;
        const planLimits = limitsMap.get(plan.id) || [];

        // Construir features a partir dos limites do sistema
        const limitFeatures: string[] = [];
        
        // Ordenar limites para exibição consistente
        const orderedKeys = ['max_transactions', 'transactions_this_month', 'max_categories', 'categories_count', 'max_goals', 'goals_count', 'max_vehicles', 'vehicles_count', 'ai_queries_per_month', 'ai_queries_this_month'];
        
        const processedKeys = new Set<string>();
        
        orderedKeys.forEach(key => {
          const limit = planLimits.find(l => l.feature_key === key);
          if (limit && !processedKeys.has(key)) {
            const formatted = formatLimitFeature(limit.feature_key, limit.limit_value);
            if (formatted) {
              limitFeatures.push(formatted);
            }
            // Marcar variantes como processadas
            if (key.startsWith('max_')) {
              processedKeys.add(key.replace('max_', '') + '_count');
              processedKeys.add(key.replace('max_', '') + '_this_month');
            }
            processedKeys.add(key);
          }
        });

        // Adicionar limites não ordenados
        planLimits.forEach(limit => {
          if (!processedKeys.has(limit.feature_key)) {
            const formatted = formatLimitFeature(limit.feature_key, limit.limit_value);
            if (formatted) {
              limitFeatures.push(formatted);
            }
            processedKeys.add(limit.feature_key);
          }
        });

        // Combinar features base com limites
        const base = baseFeatures[plan.name] || [];
        const allFeatures = [...base, ...limitFeatures];

        // Se não houver limites do sistema, usar features do plano ou fallback
        const finalFeatures = allFeatures.length > 0 
          ? allFeatures 
          : (plan.features && plan.features.length > 0 ? plan.features : fallbackPlans.find(f => f.name === plan.name)?.features || []);

        return {
          name: plan.name,
          price: plan.price === 0 ? 'Grátis' : `R$ ${plan.price.toFixed(2).replace('.', ',')}`,
          period: plan.price > 0 ? '/mês' : undefined,
          description: config.description,
          features: finalFeatures,
          notIncluded: config.notIncluded,
          buttonText: config.buttonText,
          popular: config.popular,
          color: config.color,
          link: paymentLink,
        };
      }) || [];

      if (combinedPlans.length > 0) {
        setPlans(combinedPlans);
      }
    } catch (error) {
      logger.error('PricingPremium', 'Erro', { detail: String('Erro ao carregar planos:', error) });
    } finally {
      setLoading(false);
    }
  };


  const handlePlanClick = (link: string) => {
    if (link.startsWith('http')) {
      window.open(link, '_blank');
    } else {
      navigate(link);
    }
  };

  return (
    <section
      ref={ref}
      id="precos"
      className="py-20 bg-gradient-to-b from-gray-50 to-white dark:from-slate-900 dark:to-slate-950"
    >
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={shouldAnimate ? { opacity: 0, y: 20 } : undefined}
          animate={inView && shouldAnimate ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            {title}
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            {subtitle}
          </p>
        </motion.div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full mx-auto" />
            <p className="text-gray-600 dark:text-gray-400 mt-4">Carregando planos...</p>
          </div>
        )}

        {/* Pricing Cards */}
        {!loading && (
          <motion.div
            variants={shouldAnimate ? containerVariants : undefined}
            initial={shouldAnimate ? 'hidden' : undefined}
            animate={inView && shouldAnimate ? 'visible' : undefined}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto"
          >
            {plans.map((plan, index) => {
              const config = planConfigs[plan.name] || planConfigs['Essencial'];

              return (
                <motion.div
                  key={index}
                  variants={shouldAnimate ? itemVariants : undefined}
                  className="relative"
                >
                  {/* Popular Badge */}
                  {plan.popular && (
                    <motion.div
                      initial={shouldAnimate ? { opacity: 0, y: -10 } : undefined}
                      animate={inView && shouldAnimate ? { opacity: 1, y: 0 } : undefined}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      className="absolute -top-4 left-1/2 -translate-x-1/2 z-10"
                    >
                      <div className="flex items-center gap-1 bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-lg">
                        <Sparkles className="w-4 h-4" />
                        MAIS POPULAR
                      </div>
                    </motion.div>
                  )}

                  <GlassmorphicCard
                    tiltEnabled={true}
                    glowColor={config.glowColor}
                    intensity={plan.popular ? 'strong' : 'medium'}
                    className={cn(
                      'h-full p-8',
                      plan.popular && 'ring-2 ring-orange-500 dark:ring-orange-400'
                    )}
                  >
                    {/* Plan Name */}
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      {plan.name}
                    </h3>

                    {/* Price */}
                    <div className="flex items-baseline mb-4">
                      <span className="text-4xl font-extrabold text-gray-900 dark:text-white">
                        {plan.price}
                      </span>
                      {plan.period && (
                        <span className="text-gray-500 dark:text-gray-400 ml-1">{plan.period}</span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-gray-600 dark:text-gray-300 mb-6">{plan.description}</p>

                    {/* CTA Button */}
                    <motion.div
                      whileHover={shouldAnimate ? { scale: 1.02 } : undefined}
                      whileTap={shouldAnimate ? { scale: 0.98 } : undefined}
                    >
                      <Button
                        className={cn(
                          'w-full mb-8 py-6 text-lg transition-all',
                          plan.popular
                            ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg shadow-orange-200 dark:shadow-orange-900/30'
                            : 'bg-gray-900 hover:bg-gray-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white'
                        )}
                        onClick={() => handlePlanClick(plan.link)}
                      >
                        {plan.buttonText}
                      </Button>
                    </motion.div>

                    {/* Features */}
                    <div className="space-y-4">
                      {plan.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start">
                          <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-600 dark:text-gray-300 text-sm">{feature}</span>
                        </div>
                      ))}
                      {plan.notIncluded.map((feature, idx) => (
                        <div key={idx} className="flex items-start opacity-50">
                          <X className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-500 dark:text-gray-500 text-sm">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </GlassmorphicCard>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </section>
  );
});

export default PricingPremium;
