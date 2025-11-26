import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';
import { ParticleCanvas } from './ParticleCanvas';
import { useInView, useReducedMotion } from '@/shared/hooks/animations';
import { cn } from '@/lib/utils';

export interface FinalCTAProps {
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonHref?: string;
}

/**
 * Final CTA Section with dramatic entrance animation and particle effects.
 * Implements Requirements 9.1-9.4
 */
export const FinalCTA = memo(function FinalCTA({
  title = 'Pronto para Transformar suas Finanças?',
  subtitle = 'Junte-se a milhares de pessoas que já conquistaram sua liberdade financeira com o Wallet.',
  buttonText = 'Começar Agora - É Grátis!',
  buttonHref = '/login',
}: FinalCTAProps) {
  const { ref, inView } = useInView<HTMLElement>({ triggerOnce: true, threshold: 0.2 });
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = !prefersReducedMotion;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section
      ref={ref}
      id="contato"
      className="relative py-24 md:py-32 overflow-hidden"
    >
      {/* Animated Mesh Gradient Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-red-500 to-purple-600 dark:from-orange-600 dark:via-red-600 dark:to-purple-700" />
        
        {/* Animated mesh overlay */}
        <motion.div
          initial={shouldAnimate ? { opacity: 0 } : undefined}
          animate={inView && shouldAnimate ? { opacity: 1 } : undefined}
          transition={{ duration: 1 }}
          className="absolute inset-0"
        >
          <div
            className={cn(
              'absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full',
              'bg-gradient-to-br from-yellow-400/30 to-orange-500/20',
              'filter blur-[100px]',
              shouldAnimate && 'animate-pulse'
            )}
            style={{ animationDuration: '4s' }}
          />
          <div
            className={cn(
              'absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full',
              'bg-gradient-to-br from-pink-500/25 to-purple-600/20',
              'filter blur-[100px]',
              shouldAnimate && 'animate-pulse'
            )}
            style={{ animationDuration: '5s', animationDelay: '1s' }}
          />
        </motion.div>
      </div>

      {/* Particle Canvas */}
      <div className="absolute inset-0 z-[1]">
        <ParticleCanvas
          colors={['#ffffff', '#fbbf24', '#f97316', '#ec4899']}
          particleCount={30}
          mouseInteraction={true}
          speed={0.6}
        />
      </div>


      {/* Content */}
      <div className="container relative z-10 mx-auto px-4">
        <motion.div
          initial={shouldAnimate ? { opacity: 0, y: 50, scale: 0.95 } : undefined}
          animate={inView && shouldAnimate ? { opacity: 1, y: 0, scale: 1 } : undefined}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="max-w-4xl mx-auto text-center"
        >
          {/* Badge */}
          <motion.div
            initial={shouldAnimate ? { opacity: 0, y: 20 } : undefined}
            animate={inView && shouldAnimate ? { opacity: 1, y: 0 } : undefined}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 mb-8"
          >
            <Sparkles className="w-5 h-5 text-yellow-300" />
            <span className="text-white font-medium">Oferta Especial</span>
          </motion.div>

          {/* Title */}
          <motion.h2
            initial={shouldAnimate ? { opacity: 0, y: 30 } : undefined}
            animate={inView && shouldAnimate ? { opacity: 1, y: 0 } : undefined}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight"
          >
            {title}
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            initial={shouldAnimate ? { opacity: 0, y: 20 } : undefined}
            animate={inView && shouldAnimate ? { opacity: 1, y: 0 } : undefined}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-xl md:text-2xl text-white/90 mb-10 max-w-2xl mx-auto"
          >
            {subtitle}
          </motion.p>

          {/* CTA Button */}
          <motion.div
            initial={shouldAnimate ? { opacity: 0, y: 20 } : undefined}
            animate={inView && shouldAnimate ? { opacity: 1, y: 0 } : undefined}
            transition={{ delay: 0.5, duration: 0.5 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="relative inline-block"
          >
            {/* Glow effect */}
            <motion.div
              animate={
                shouldAnimate
                  ? {
                      scale: isHovered ? 1.1 : [1, 1.05, 1],
                      opacity: isHovered ? 0.8 : [0.5, 0.7, 0.5],
                    }
                  : undefined
              }
              transition={{
                duration: isHovered ? 0.3 : 2,
                repeat: isHovered ? 0 : Infinity,
                ease: 'easeInOut',
              }}
              className="absolute inset-0 bg-white rounded-2xl blur-xl"
            />

            <Link to={buttonHref}>
              <motion.div
                whileHover={shouldAnimate ? { scale: 1.05 } : undefined}
                whileTap={shouldAnimate ? { scale: 0.98 } : undefined}
              >
                <Button
                  size="lg"
                  className={cn(
                    'relative text-lg md:text-xl px-10 py-7 h-auto rounded-2xl',
                    'bg-white text-orange-600 hover:bg-gray-50',
                    'shadow-2xl shadow-black/20',
                    'font-bold transition-all'
                  )}
                >
                  {buttonText}
                  <ArrowRight className="ml-2 w-6 h-6" />
                </Button>
              </motion.div>
            </Link>

            {/* Particle burst on hover */}
            {isHovered && shouldAnimate && (
              <>
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{
                      scale: 2,
                      opacity: 0,
                      x: Math.cos((i * Math.PI * 2) / 6) * 60,
                      y: Math.sin((i * Math.PI * 2) / 6) * 60,
                    }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="absolute top-1/2 left-1/2 w-3 h-3 rounded-full bg-yellow-300"
                    style={{ transform: 'translate(-50%, -50%)' }}
                  />
                ))}
              </>
            )}
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={shouldAnimate ? { opacity: 0 } : undefined}
            animate={inView && shouldAnimate ? { opacity: 1 } : undefined}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="mt-10 flex flex-wrap justify-center gap-6 text-white/80 text-sm"
          >
            <span>✓ Sem cartão de crédito</span>
            <span>✓ Cancele quando quiser</span>
            <span>✓ Suporte 24/7</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
});

export default FinalCTA;
