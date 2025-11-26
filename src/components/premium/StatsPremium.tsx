import { useState, memo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, DollarSign, Clock, type LucideIcon } from 'lucide-react';
import { AnimatedCounter } from './AnimatedCounter';
import { useInView, useReducedMotion } from '@/shared/hooks/animations';
import { cn } from '@/lib/utils';

interface StatItem {
  icon: LucideIcon;
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
  color: string;
}

export interface StatsPremiumProps {
  stats?: StatItem[];
  title?: string;
  subtitle?: string;
}

const defaultStats: StatItem[] = [
  {
    icon: Users,
    value: 50000,
    suffix: '+',
    label: 'Usuários Ativos',
    color: 'blue',
  },
  {
    icon: DollarSign,
    value: 500,
    prefix: 'R$ ',
    suffix: 'M+',
    label: 'Valor Gerenciado',
    color: 'green',
  },
  {
    icon: TrendingUp,
    value: 98,
    suffix: '%',
    label: 'Satisfação',
    color: 'orange',
  },
  {
    icon: Clock,
    value: 2,
    suffix: ' min',
    label: 'Tempo de Setup',
    color: 'purple',
  },
];

const colorMap: Record<string, { icon: string; bg: string }> = {
  blue: {
    icon: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  green: {
    icon: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-100 dark:bg-green-900/30',
  },
  orange: {
    icon: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-100 dark:bg-orange-900/30',
  },
  purple: {
    icon: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-100 dark:bg-purple-900/30',
  },
};


const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.9 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const iconFloatVariants = {
  initial: { y: 0 },
  animate: {
    y: [-3, 3, -3],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/**
 * Premium Stats Section with animated counters and floating icons.
 * Implements Requirements 3.1-3.4
 */
export const StatsPremium = memo(function StatsPremium({
  stats = defaultStats,
  title = 'NÚMEROS QUE FALAM POR SI',
  subtitle = 'Confiado por milhares de pessoas e empresas',
}: StatsPremiumProps) {
  const { ref, inView } = useInView<HTMLElement>({ triggerOnce: true, threshold: 0.2 });
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = !prefersReducedMotion;
  const [completedCounters, setCompletedCounters] = useState<Set<number>>(new Set());

  const handleCounterComplete = (index: number) => {
    setCompletedCounters((prev) => new Set([...prev, index]));
  };

  return (
    <section
      ref={ref}
      className="relative py-20 overflow-hidden"
    >
      {/* Animated Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 dark:from-orange-600 dark:via-red-600 dark:to-purple-700">
        {/* Animated pattern overlay */}
        <div
          className={cn(
            'absolute inset-0 opacity-10',
            shouldAnimate && 'animate-pulse'
          )}
          style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
                             radial-gradient(circle at 75% 75%, white 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
            animationDuration: '4s',
          }}
        />
      </div>

      <div className="container relative z-10 mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={shouldAnimate ? { opacity: 0, y: 20 } : undefined}
          animate={inView && shouldAnimate ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">{title}</h2>
          <p className="text-xl text-orange-100 max-w-3xl mx-auto">{subtitle}</p>
        </motion.div>


        {/* Stats Grid */}
        <motion.div
          variants={shouldAnimate ? containerVariants : undefined}
          initial={shouldAnimate ? 'hidden' : undefined}
          animate={inView && shouldAnimate ? 'visible' : undefined}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {stats.map((stat, index) => {
            const colors = colorMap[stat.color] || colorMap.orange;
            const Icon = stat.icon;
            const isCompleted = completedCounters.has(index);

            return (
              <motion.div
                key={index}
                variants={shouldAnimate ? itemVariants : undefined}
                className="text-center"
              >
                {/* Floating Icon */}
                <motion.div
                  variants={shouldAnimate ? iconFloatVariants : undefined}
                  initial="initial"
                  animate={inView && shouldAnimate ? 'animate' : 'initial'}
                  className="relative mx-auto mb-4"
                >
                  <div
                    className={cn(
                      'w-20 h-20 rounded-full flex items-center justify-center mx-auto',
                      'bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm',
                      'shadow-lg transition-transform duration-300',
                      isCompleted && shouldAnimate && 'scale-110'
                    )}
                  >
                    <Icon className={cn('w-10 h-10', colors.icon)} />
                  </div>

                  {/* Particle burst effect on completion */}
                  {isCompleted && shouldAnimate && (
                    <motion.div
                      initial={{ scale: 0.5, opacity: 1 }}
                      animate={{ scale: 2, opacity: 0 }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="absolute inset-0 rounded-full bg-white/30"
                    />
                  )}
                </motion.div>

                {/* Animated Counter */}
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">
                  <AnimatedCounter
                    end={stat.value}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                    duration={2000}
                    onComplete={() => handleCounterComplete(index)}
                  />
                </div>

                {/* Label */}
                <div className="text-orange-100 text-lg font-medium">{stat.label}</div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
});

export default StatsPremium;
