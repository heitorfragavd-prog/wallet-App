import { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { GlassmorphicCard } from './GlassmorphicCard';
import { useInView, useReducedMotion } from '@/shared/hooks/animations';
import { cn } from '@/lib/utils';

export interface Testimonial {
  name: string;
  role: string;
  content: string;
  rating: number;
  avatar: string;
}

export interface TestimonialCarouselProps {
  testimonials?: Testimonial[];
  autoPlayInterval?: number;
  pauseOnHover?: boolean;
  title?: string;
  subtitle?: string;
}

const defaultTestimonials: Testimonial[] = [
  {
    name: 'Maria Silva',
    role: 'Empresária',
    content: 'O Wallet transformou como eu gerencio minhas finanças. Agora tenho controle total sobre meus gastos e receitas.',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b75c?w=150&h=150&fit=crop&crop=face',
  },
  {
    name: 'João Santos',
    role: 'Freelancer',
    content: 'A integração com WhatsApp é fantástica! Posso registrar transações rapidamente, onde quer que eu esteja.',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
  },
  {
    name: 'Ana Costa',
    role: 'Consultora',
    content: 'Os relatórios são muito detalhados e me ajudam a tomar decisões financeiras mais inteligentes.',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
  },
  {
    name: 'Carlos Oliveira',
    role: 'Desenvolvedor',
    content: 'Finalmente um app que entende minhas necessidades. A IA do Wallet me ajuda a economizar todos os meses.',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
  },
  {
    name: 'Fernanda Lima',
    role: 'Designer',
    content: 'Interface linda e intuitiva. Nunca foi tão fácil acompanhar minhas metas financeiras.',
    rating: 5,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
  },
];


const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

/**
 * Premium Testimonial Carousel with auto-scroll and pause on hover.
 * Implements Requirements 5.1-5.4
 */
export const TestimonialCarousel = memo(function TestimonialCarousel({
  testimonials = defaultTestimonials,
  autoPlayInterval = 5000,
  pauseOnHover = true,
  title = 'O QUE DIZEM NOSSOS USUÁRIOS',
  subtitle = 'Milhares de pessoas já transformaram suas finanças com o Wallet',
}: TestimonialCarouselProps) {
  const { ref, inView } = useInView<HTMLElement>({ triggerOnce: true, threshold: 0.1 });
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = !prefersReducedMotion;

  const [[currentIndex, direction], setCurrentIndex] = useState([0, 0]);
  const [isPaused, setIsPaused] = useState(false);

  const paginate = useCallback(
    (newDirection: number) => {
      const newIndex = currentIndex + newDirection;
      if (newIndex < 0) {
        setCurrentIndex([testimonials.length - 1, newDirection]);
      } else if (newIndex >= testimonials.length) {
        setCurrentIndex([0, newDirection]);
      } else {
        setCurrentIndex([newIndex, newDirection]);
      }
    },
    [currentIndex, testimonials.length]
  );

  const goToSlide = useCallback((index: number) => {
    const newDirection = index > currentIndex ? 1 : -1;
    setCurrentIndex([index, newDirection]);
  }, [currentIndex]);

  // Auto-scroll
  useEffect(() => {
    if (!inView || isPaused || prefersReducedMotion) return;

    const interval = setInterval(() => {
      paginate(1);
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [inView, isPaused, autoPlayInterval, paginate, prefersReducedMotion]);

  const currentTestimonial = testimonials[currentIndex];

  return (
    <section
      ref={ref}
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


        {/* Carousel Container */}
        <div
          className="relative max-w-4xl mx-auto"
          onMouseEnter={() => pauseOnHover && setIsPaused(true)}
          onMouseLeave={() => pauseOnHover && setIsPaused(false)}
        >
          {/* Navigation Arrows */}
          <button
            onClick={() => paginate(-1)}
            className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 md:-translate-x-12 z-10',
              'w-10 h-10 md:w-12 md:h-12 rounded-full',
              'bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm',
              'shadow-lg border border-gray-200 dark:border-slate-700',
              'flex items-center justify-center',
              'hover:bg-white dark:hover:bg-slate-700 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-orange-500'
            )}
            aria-label="Anterior"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-gray-700 dark:text-gray-300" />
          </button>

          <button
            onClick={() => paginate(1)}
            className={cn(
              'absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 md:translate-x-12 z-10',
              'w-10 h-10 md:w-12 md:h-12 rounded-full',
              'bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm',
              'shadow-lg border border-gray-200 dark:border-slate-700',
              'flex items-center justify-center',
              'hover:bg-white dark:hover:bg-slate-700 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-orange-500'
            )}
            aria-label="Próximo"
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-gray-700 dark:text-gray-300" />
          </button>

          {/* Testimonial Card */}
          <div className="px-4 py-8">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={shouldAnimate ? slideVariants : undefined}
                initial={shouldAnimate ? 'enter' : undefined}
                animate="center"
                exit={shouldAnimate ? 'exit' : undefined}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <GlassmorphicCard
                  tiltEnabled={false}
                  intensity="strong"
                  glowColor="rgba(249, 115, 22, 0.2)"
                  className="p-8 md:p-12 shadow-2xl"
                >
                  {/* Rating Stars */}
                  <div className="flex items-center justify-center mb-6">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          'w-6 h-6',
                          i < currentTestimonial.rating
                            ? 'text-yellow-400 fill-current'
                            : 'text-gray-300 dark:text-gray-600'
                        )}
                      />
                    ))}
                  </div>

                  {/* Content */}
                  <blockquote className="text-xl md:text-2xl text-gray-700 dark:text-gray-200 text-center mb-8 leading-relaxed">
                    "{currentTestimonial.content}"
                  </blockquote>

                  {/* Author */}
                  <div className="flex items-center justify-center">
                    <img
                      src={currentTestimonial.avatar}
                      alt={currentTestimonial.name}
                      className="w-14 h-14 rounded-full mr-4 object-cover border-2 border-white dark:border-slate-700 shadow-md"
                    />
                    <div className="text-left">
                      <h4 className="font-bold text-gray-900 dark:text-white text-lg">
                        {currentTestimonial.name}
                      </h4>
                      <p className="text-gray-500 dark:text-gray-400">
                        {currentTestimonial.role}
                      </p>
                    </div>
                  </div>
                </GlassmorphicCard>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dots Navigation */}
          <div className="flex items-center justify-center gap-2 mt-8">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={cn(
                  'w-3 h-3 rounded-full transition-all duration-300',
                  'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2',
                  index === currentIndex
                    ? 'bg-orange-500 w-8'
                    : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                )}
                aria-label={`Ir para depoimento ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});

export default TestimonialCarousel;
