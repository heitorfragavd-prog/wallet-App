import { useState, memo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/shared/components/ui/button';
import { ArrowRight, CheckCircle2, Shield, Sparkles, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DemoVideoModal } from '@/components/DemoVideoModal';
import { ParticleCanvas } from './ParticleCanvas';
import { useInView, useReducedMotion } from '@/shared/hooks/animations';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface TrustBadge {
  icon: LucideIcon;
  text: string;
}

interface CTAConfig {
  text: string;
  href?: string;
  variant: 'primary' | 'secondary' | 'ghost';
  onClick?: () => void;
}

export interface HeroPremiumProps {
  headline?: string;
  highlightedText?: string;
  subheadline?: string;
  ctaPrimary?: CTAConfig;
  ctaSecondary?: CTAConfig;
  trustBadges?: TrustBadge[];
  heroImage?: string;
}

const defaultTrustBadges: TrustBadge[] = [
  { icon: CheckCircle2, text: 'Sem cartão de crédito' },
  { icon: Sparkles, text: 'Plano Gratuito disponível' },
  { icon: Shield, text: 'Segurança de nível bancário' },
];

// Animation variants
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
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};


const wordVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

/**
 * Premium Hero Section with mesh gradients, particles, and staggered animations.
 * Implements Requirements 1.1-1.6
 */
export const HeroPremium = memo(function HeroPremium({
  headline = 'Sua Liberdade Financeira',
  highlightedText = 'Começa com uma Conversa',
  subheadline = 'O primeiro assistente que organiza sua vida financeira direto pelo WhatsApp. Diga adeus às planilhas complicadas e assuma o controle total do seu dinheiro.',
  ctaPrimary = { text: 'Começar Agora (Grátis)', href: '/login', variant: 'primary' },
  ctaSecondary,
  trustBadges = defaultTrustBadges,
  heroImage = 'https://seuspuloflix.pro/wp-content/uploads/2025/11/walletai.png',
}: HeroPremiumProps) {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const { ref, inView } = useInView<HTMLElement>({ triggerOnce: true, threshold: 0.1 });
  const prefersReducedMotion = useReducedMotion();

  const headlineWords = headline.split(' ');
  const highlightedWords = highlightedText.split(' ');

  const shouldAnimate = !prefersReducedMotion;

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-white to-white dark:from-slate-900 dark:via-slate-950 dark:to-slate-950 pt-32 pb-20 lg:pt-40 lg:pb-32 min-h-screen"
    >
      {/* Animated Mesh Gradient Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div
          className={cn(
            'absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full',
            'bg-gradient-to-br from-orange-400/30 to-red-500/20 dark:from-orange-500/20 dark:to-red-600/10',
            'filter blur-[100px]',
            shouldAnimate && 'animate-pulse'
          )}
          style={{ animationDuration: '4s' }}
        />
        <div
          className={cn(
            'absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full',
            'bg-gradient-to-br from-purple-400/25 to-pink-500/15 dark:from-purple-500/15 dark:to-pink-600/10',
            'filter blur-[100px]',
            shouldAnimate && 'animate-pulse'
          )}
          style={{ animationDuration: '5s', animationDelay: '1s' }}
        />
        <div
          className={cn(
            'absolute bottom-0 left-1/2 w-[700px] h-[400px] rounded-full',
            'bg-gradient-to-br from-yellow-400/20 to-orange-500/15 dark:from-yellow-500/10 dark:to-orange-600/10',
            'filter blur-[120px]',
            shouldAnimate && 'animate-pulse'
          )}
          style={{ animationDuration: '6s', animationDelay: '2s' }}
        />
      </div>

      {/* Particle Canvas Overlay */}
      <div className="absolute inset-0 z-[1]">
        <ParticleCanvas
          colors={['#f97316', '#ea580c', '#fbbf24', '#8b5cf6']}
          mouseInteraction={true}
          speed={0.8}
        />
      </div>


      {/* Content */}
      <motion.div
        className="container relative z-10 mx-auto px-4"
        variants={shouldAnimate ? containerVariants : undefined}
        initial={shouldAnimate ? 'hidden' : undefined}
        animate={inView && shouldAnimate ? 'visible' : undefined}
      >
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            variants={shouldAnimate ? itemVariants : undefined}
            className="inline-flex items-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-orange-100 dark:border-orange-900/30 shadow-sm rounded-full px-4 py-1.5 mb-8"
          >
            <span className="flex h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse" />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              O Futuro das Finanças Pessoais
            </span>
          </motion.div>

          {/* Headline with word-by-word animation */}
          <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 dark:text-white mb-8 tracking-tight leading-tight">
            <span className="block">
              {headlineWords.map((word, i) => (
                <motion.span
                  key={i}
                  custom={i}
                  variants={shouldAnimate ? wordVariants : undefined}
                  initial={shouldAnimate ? 'hidden' : undefined}
                  animate={inView && shouldAnimate ? 'visible' : undefined}
                  className="inline-block mr-3"
                >
                  {word}
                </motion.span>
              ))}
            </span>
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-600 dark:from-orange-500 dark:to-red-500">
              {highlightedWords.map((word, i) => (
                <motion.span
                  key={i}
                  custom={i + headlineWords.length}
                  variants={shouldAnimate ? wordVariants : undefined}
                  initial={shouldAnimate ? 'hidden' : undefined}
                  animate={inView && shouldAnimate ? 'visible' : undefined}
                  className="inline-block mr-3"
                >
                  {word}
                </motion.span>
              ))}
            </span>
          </h1>

          {/* Subheadline */}
          <motion.p
            variants={shouldAnimate ? itemVariants : undefined}
            className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-10 max-w-3xl mx-auto leading-relaxed"
          >
            {subheadline}
          </motion.p>

          {/* CTAs */}
          <motion.div
            variants={shouldAnimate ? itemVariants : undefined}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            {ctaPrimary.href ? (
              <Link to={ctaPrimary.href} className="w-full sm:w-auto">
                <motion.div
                  whileHover={shouldAnimate ? { scale: 1.05 } : undefined}
                  whileTap={shouldAnimate ? { scale: 0.98 } : undefined}
                >
                  <Button
                    size="lg"
                    className={cn(
                      'w-full sm:w-auto text-lg px-8 py-6 h-auto rounded-xl',
                      'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700',
                      'text-white shadow-lg shadow-orange-200 dark:shadow-orange-900/30',
                      'transition-all hover:shadow-orange-300 dark:hover:shadow-orange-800/40',
                      shouldAnimate && 'animate-pulse'
                    )}
                    style={{ animationDuration: '3s' }}
                  >
                    {ctaPrimary.text}
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </motion.div>
              </Link>
            ) : (
              <motion.div
                whileHover={shouldAnimate ? { scale: 1.05 } : undefined}
                whileTap={shouldAnimate ? { scale: 0.98 } : undefined}
              >
                <Button
                  size="lg"
                  onClick={ctaPrimary.onClick}
                  className={cn(
                    'w-full sm:w-auto text-lg px-8 py-6 h-auto rounded-xl',
                    'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700',
                    'text-white shadow-lg shadow-orange-200 dark:shadow-orange-900/30'
                  )}
                >
                  {ctaPrimary.text}
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </motion.div>
            )}

            {ctaSecondary ? (
              <motion.div
                whileHover={shouldAnimate ? { scale: 1.02 } : undefined}
                whileTap={shouldAnimate ? { scale: 0.98 } : undefined}
              >
                <Button
                  size="lg"
                  variant="outline"
                  onClick={ctaSecondary.onClick || (() => setIsDemoModalOpen(true))}
                  className="w-full sm:w-auto text-lg px-8 py-6 h-auto rounded-xl border-2 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
                >
                  {ctaSecondary.text}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                whileHover={shouldAnimate ? { scale: 1.02 } : undefined}
                whileTap={shouldAnimate ? { scale: 0.98 } : undefined}
              >
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setIsDemoModalOpen(true)}
                  className="w-full sm:w-auto text-lg px-8 py-6 h-auto rounded-xl border-2 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
                >
                  Ver Como Funciona
                </Button>
              </motion.div>
            )}
          </motion.div>


          {/* Trust Badges with fade-in animation */}
          <motion.div
            variants={shouldAnimate ? itemVariants : undefined}
            className="flex flex-wrap justify-center gap-8 mb-16 text-sm font-medium text-gray-500 dark:text-gray-400"
          >
            {trustBadges.map((badge, index) => (
              <motion.div
                key={index}
                initial={shouldAnimate ? { opacity: 0, y: 10 } : undefined}
                animate={inView && shouldAnimate ? { opacity: 1, y: 0 } : undefined}
                transition={{ delay: 0.8 + index * 0.1, duration: 0.4 }}
                className="flex items-center"
              >
                <badge.icon className="w-5 h-5 text-green-500 mr-2" />
                {badge.text}
              </motion.div>
            ))}
          </motion.div>

          {/* Hero Image */}
          <motion.div
            variants={shouldAnimate ? itemVariants : undefined}
            className="relative mx-auto max-w-5xl"
          >
            {/* Glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-purple-600 rounded-2xl blur opacity-20 dark:opacity-30" />
            
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-slate-800">
              <img
                src={heroImage}
                alt="Dashboard do Wallet com integração WhatsApp"
                className="w-full h-auto"
                loading="eager"
              />

              {/* Floating Badge */}
              <motion.div
                initial={shouldAnimate ? { opacity: 0, x: 20 } : undefined}
                animate={inView && shouldAnimate ? { opacity: 1, x: 0 } : undefined}
                transition={{ delay: 1.2, duration: 0.5 }}
                className={cn(
                  'absolute bottom-8 right-8 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm',
                  'p-4 rounded-xl shadow-lg border border-white/50 dark:border-slate-700/50',
                  'hidden md:block'
                )}
              >
                <motion.div
                  animate={shouldAnimate ? { y: [0, -5, 0] } : undefined}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex items-center gap-3"
                >
                  <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-full">
                    <MessageCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Nova despesa registrada</p>
                    <p className="font-bold text-gray-900 dark:text-white">- R$ 45,90 (Uber)</p>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <DemoVideoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </section>
  );
});

export default HeroPremium;
