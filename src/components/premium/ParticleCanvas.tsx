import { useEffect, useRef, useCallback, memo } from 'react';
import { useReducedMotion } from '@/shared/hooks/animations';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
}

export interface ParticleCanvasProps {
  /** Number of particles. Default: 50 (desktop), 20 (mobile) */
  particleCount?: number;
  /** Particle colors array */
  colors?: string[];
  /** Enable mouse repulsion effect */
  mouseInteraction?: boolean;
  /** Animation speed multiplier */
  speed?: number;
  /** Additional CSS classes */
  className?: string;
  /** Whether to respect prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
}

const DEFAULT_COLORS = ['#f97316', '#ea580c', '#fbbf24', '#8b5cf6'];
const MOBILE_BREAKPOINT = 768;

/**
 * Canvas-based particle system with mouse interaction.
 * Uses requestAnimationFrame for smooth 60fps animations.
 * Automatically adapts particle count for mobile devices.
 */
export const ParticleCanvas = memo(function ParticleCanvas({
  particleCount,
  colors = DEFAULT_COLORS,
  mouseInteraction = true,
  speed = 1,
  className = '',
  respectReducedMotion = false,
}: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animationFrameRef = useRef<number>();
  const systemPrefersReducedMotion = useReducedMotion();
  const prefersReducedMotion = respectReducedMotion && systemPrefersReducedMotion;

  const getParticleCount = useCallback(() => {
    if (particleCount !== undefined) return particleCount;
    if (typeof window === 'undefined') return 50;
    return window.innerWidth < MOBILE_BREAKPOINT ? 20 : 50;
  }, [particleCount]);

  const createParticle = useCallback(
    (width: number, height: number): Particle => {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5 * speed,
        vy: (Math.random() - 0.5) * 0.5 * speed,
        radius: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.5 + 0.3,
      };
    },
    [colors, speed]
  );

  const initParticles = useCallback(
    (width: number, height: number) => {
      const count = getParticleCount();
      particlesRef.current = Array.from({ length: count }, () =>
        createParticle(width, height)
      );
    },
    [createParticle, getParticleCount]
  );


  const updateParticle = useCallback(
    (particle: Particle, width: number, height: number) => {
      // Update position
      particle.x += particle.vx;
      particle.y += particle.vy;

      // Bounce off edges
      if (particle.x < 0 || particle.x > width) {
        particle.vx *= -1;
        particle.x = Math.max(0, Math.min(width, particle.x));
      }
      if (particle.y < 0 || particle.y > height) {
        particle.vy *= -1;
        particle.y = Math.max(0, Math.min(height, particle.y));
      }

      // Mouse repulsion
      if (mouseInteraction) {
        const dx = particle.x - mouseRef.current.x;
        const dy = particle.y - mouseRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const repulsionRadius = 100;

        if (distance < repulsionRadius && distance > 0) {
          const force = (repulsionRadius - distance) / repulsionRadius;
          const angle = Math.atan2(dy, dx);
          particle.vx += Math.cos(angle) * force * 0.5;
          particle.vy += Math.sin(angle) * force * 0.5;

          // Apply friction to prevent particles from flying off
          particle.vx *= 0.98;
          particle.vy *= 0.98;
        }
      }

      // Limit velocity
      const maxVelocity = 2 * speed;
      const currentVelocity = Math.sqrt(
        particle.vx * particle.vx + particle.vy * particle.vy
      );
      if (currentVelocity > maxVelocity) {
        particle.vx = (particle.vx / currentVelocity) * maxVelocity;
        particle.vy = (particle.vy / currentVelocity) * maxVelocity;
      }
    },
    [mouseInteraction, speed]
  );

  const drawParticle = useCallback(
    (ctx: CanvasRenderingContext2D, particle: Particle) => {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = particle.alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    []
  );

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Update and draw particles
    particlesRef.current.forEach((particle) => {
      updateParticle(particle, width, height);
      drawParticle(ctx, particle);
    });

    // Draw connections between nearby particles
    const connectionDistance = 120;
    for (let i = 0; i < particlesRef.current.length; i++) {
      for (let j = i + 1; j < particlesRef.current.length; j++) {
        const p1 = particlesRef.current[i];
        const p2 = particlesRef.current[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < connectionDistance) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = p1.color;
          ctx.globalAlpha = (1 - distance / connectionDistance) * 0.2;
          ctx.lineWidth = 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [updateParticle, drawParticle]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // If user prefers reduced motion, don't animate
    if (prefersReducedMotion) {
      return;
    }

    const handleResize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        initParticles(canvas.width, canvas.height);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    // Initial setup
    handleResize();

    // Start animation
    animationFrameRef.current = requestAnimationFrame(animate);

    // Event listeners
    window.addEventListener('resize', handleResize);
    if (mouseInteraction) {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('resize', handleResize);
      if (mouseInteraction) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [animate, initParticles, mouseInteraction, prefersReducedMotion]);

  // Don't render canvas if user prefers reduced motion
  if (prefersReducedMotion) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-auto ${className}`}
      style={{ 
        willChange: 'transform',
        transform: 'translateZ(0)', // Force GPU acceleration
      }}
      aria-hidden="true"
    />
  );
});

export default ParticleCanvas;
