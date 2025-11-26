import { useRef, useState, memo, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/shared/hooks/animations';

export interface GlassmorphicCardProps {
  children: ReactNode;
  className?: string;
  /** Enable 3D tilt effect on hover */
  tiltEnabled?: boolean;
  /** Glow effect color */
  glowColor?: string;
  /** Glassmorphism intensity */
  intensity?: 'subtle' | 'medium' | 'strong';
  /** Additional motion props */
  motionProps?: Record<string, unknown>;
}

const intensityStyles = {
  subtle: {
    background: 'bg-white/40 dark:bg-slate-900/40',
    blur: 'backdrop-blur-md',
    border: 'border-white/30 dark:border-white/10',
  },
  medium: {
    background: 'bg-white/60 dark:bg-slate-900/60',
    blur: 'backdrop-blur-lg',
    border: 'border-white/40 dark:border-white/15',
  },
  strong: {
    background: 'bg-white/70 dark:bg-slate-900/70',
    blur: 'backdrop-blur-xl',
    border: 'border-white/50 dark:border-white/20',
  },
};

/**
 * Card component with glassmorphism styling and optional 3D tilt effect.
 * Supports dark mode and accessibility (reduced motion).
 */
export const GlassmorphicCard = memo(function GlassmorphicCard({
  children,
  className = '',
  tiltEnabled = true,
  glowColor = 'rgba(249, 115, 22, 0.3)',
  intensity = 'medium',
  motionProps = {},
}: GlassmorphicCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tiltStyle, setTiltStyle] = useState({ rotateX: 0, rotateY: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const styles = intensityStyles[intensity];


  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tiltEnabled || prefersReducedMotion || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate rotation (max 10 degrees)
    const rotateX = ((y - centerY) / centerY) * -10;
    const rotateY = ((x - centerX) / centerX) * 10;

    setTiltStyle({ rotateX, rotateY });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTiltStyle({ rotateX: 0, rotateY: 0 });
  };

  const shouldAnimate = !prefersReducedMotion;

  return (
    <motion.div
      ref={cardRef}
      className={cn(
        'relative rounded-2xl border p-6 shadow-lg transition-shadow duration-300',
        styles.background,
        styles.blur,
        styles.border,
        isHovered && 'shadow-xl',
        className
      )}
      style={{
        transformStyle: 'preserve-3d',
        perspective: '1000px',
        ...(shouldAnimate && tiltEnabled
          ? {
              transform: `rotateX(${tiltStyle.rotateX}deg) rotateY(${tiltStyle.rotateY}deg)`,
            }
          : {}),
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      whileHover={
        shouldAnimate
          ? {
              scale: 1.02,
              transition: { duration: 0.2 },
            }
          : undefined
      }
      {...motionProps}
    >
      {/* Glow effect on hover */}
      {shouldAnimate && isHovered && (
        <motion.div
          className="absolute inset-0 -z-10 rounded-2xl opacity-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          exit={{ opacity: 0 }}
          style={{
            background: `radial-gradient(circle at center, ${glowColor}, transparent 70%)`,
            filter: 'blur(20px)',
            transform: 'translateZ(-10px)',
          }}
        />
      )}

      {/* Content */}
      <div style={{ transform: 'translateZ(20px)' }}>{children}</div>
    </motion.div>
  );
});

export default GlassmorphicCard;
