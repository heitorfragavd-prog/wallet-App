import { memo } from 'react';
import { motion } from 'framer-motion';
import { GlassmorphicCard } from './GlassmorphicCard';
import { useInView, useReducedMotion } from '@/shared/hooks/animations';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Target,
  Tag,
  FileText,
  MessageCircle,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  highlight?: boolean;
}

export interface FeatureShowcaseProps {
  features?: FeatureItem[];
  layout?: 'grid' | 'bento';
  title?: string;
  subtitle?: string;
}

const defaultFeatures: FeatureItem[] = [
  {
    icon: MessageCircle,
    title: 'WhatsApp Inteligente',
    description:
      'Esqueça os apps complicados. Envie um áudio ou texto para o Wallet e ele categoriza e registra tudo instantaneamente.',
    color: 'green',
    highlight: true,
  },
  {
    icon: BarChart3,
    title: 'Clareza Total',
    description:
      'Veja para onde seu dinheiro vai em tempo real. Gráficos intuitivos que transformam números confusos em decisões inteligentes.',
    color: 'blue',
  },
  {
    icon: Target,
    title: 'Conquiste seus Sonhos',
    description:
      'Defina metas de economia para aquela viagem ou carro novo. O Wallet te ajuda a manter o foco e celebrar cada conquista.',
    color: 'purple',
  },
  {
    icon: ShieldCheck,
    title: 'Segurança Máxima',
    description:
      'Seus dados são criptografados e protegidos. Tenha a tranquilidade de saber que suas informações financeiras estão seguras.',
    color: 'indigo',
  },
  {
    icon: Tag,
    title: 'Organização Automática',
    description:
      'O sistema aprende com seus hábitos e sugere categorias automaticamente, poupando seu tempo para o que realmente importa.',
    color: 'yellow',
  },
  {
    icon: FileText,
    title: 'Relatórios de Evolução',
    description:
      'Receba insights semanais sobre sua saúde financeira. Entenda seus padrões e melhore seus hábitos mês a mês.',
    color: 'orange',
  },
];


const colorMap: Record<string, { bg: string; text: string; glow: string }> = {
  green: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
    glow: 'rgba(34, 197, 94, 0.3)',
  },
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
    glow: 'rgba(59, 130, 246, 0.3)',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-600 dark:text-purple-400',
    glow: 'rgba(139, 92, 246, 0.3)',
  },
  indigo: {
    bg: 'bg-indigo-100 dark:bg-indigo-900/30',
    text: 'text-indigo-600 dark:text-indigo-400',
    glow: 'rgba(99, 102, 241, 0.3)',
  },
  yellow: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-600 dark:text-yellow-400',
    glow: 'rgba(234, 179, 8, 0.3)',
  },
  orange: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-600 dark:text-orange-400',
    glow: 'rgba(249, 115, 22, 0.3)',
  },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const iconVariants = {
  initial: { scale: 1, rotate: 0 },
  animate: {
    scale: [1, 1.1, 1],
    rotate: [0, 5, -5, 0],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};


/**
 * Premium Features Showcase with glassmorphic cards and staggered animations.
 * Implements Requirements 2.1-2.5
 */
export const FeatureShowcase = memo(function FeatureShowcase({
  features = defaultFeatures,
  layout = 'grid',
  title = 'POR QUE O WALLET?',
  subtitle = 'Mais que um app financeiro, seu parceiro de prosperidade',
}: FeatureShowcaseProps) {
  const { ref, inView } = useInView<HTMLElement>({ triggerOnce: true, threshold: 0.1 });
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = !prefersReducedMotion;

  return (
    <section
      ref={ref}
      id="recursos"
      className="py-20 bg-gradient-to-b from-white to-gray-50 dark:from-slate-950 dark:to-slate-900"
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

        {/* Features Grid */}
        <motion.div
          variants={shouldAnimate ? containerVariants : undefined}
          initial={shouldAnimate ? 'hidden' : undefined}
          animate={inView && shouldAnimate ? 'visible' : undefined}
          className={cn(
            'grid gap-8',
            layout === 'grid'
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          )}
        >
          {features.map((feature, index) => {
            const colors = colorMap[feature.color] || colorMap.orange;
            const Icon = feature.icon;

            return (
              <motion.div
                key={index}
                variants={shouldAnimate ? itemVariants : undefined}
                className={cn(feature.highlight && 'md:col-span-1')}
              >
                <GlassmorphicCard
                  tiltEnabled={true}
                  glowColor={colors.glow}
                  intensity="medium"
                  className={cn(
                    'h-full',
                    feature.highlight &&
                      'ring-2 ring-orange-500/30 dark:ring-orange-400/30'
                  )}
                >
                  {/* Animated Icon */}
                  <motion.div
                    variants={shouldAnimate ? iconVariants : undefined}
                    initial="initial"
                    animate={inView && shouldAnimate ? 'animate' : 'initial'}
                    className={cn(
                      'w-14 h-14 rounded-xl flex items-center justify-center mb-4',
                      colors.bg
                    )}
                  >
                    <Icon className={cn('w-7 h-7', colors.text)} />
                  </motion.div>

                  {/* Content */}
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    {feature.description}
                  </p>

                  {/* Highlight Badge */}
                  {feature.highlight && (
                    <div className="mt-4 inline-flex items-center px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-sm font-medium">
                      ⭐ Mais Popular
                    </div>
                  )}
                </GlassmorphicCard>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
});

export default FeatureShowcase;
