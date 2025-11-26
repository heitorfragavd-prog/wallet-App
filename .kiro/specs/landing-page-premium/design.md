# Design Document: Landing Page Premium

## Overview

Este documento detalha a arquitetura e design técnico para uma Landing Page de alto nível para o Wallet. A implementação utiliza React 18, TypeScript, Tailwind CSS e técnicas modernas de animação (Framer Motion, CSS 3D transforms, Canvas/WebGL para partículas) para criar uma experiência visual premium que traduz a complexidade técnica do produto em benefícios irresistíveis para conversão.

### Value Propositions Derivadas do Código

| Função Técnica | Benefício de Marketing |
|----------------|----------------------|
| WebSocket/Real-time Supabase | "Conexão Instantânea - Veja suas finanças atualizarem em tempo real" |
| Integração WhatsApp | "Controle pelo WhatsApp - Registre gastos com uma mensagem" |
| IA Analysis Hooks | "Inteligência Artificial - Insights personalizados sobre seu dinheiro" |
| React Query Cache | "Velocidade Extrema - Interface que responde instantaneamente" |
| RLS Supabase | "Segurança Bancária - Seus dados protegidos por criptografia" |
| Edge Functions | "Processamento na Nuvem - Análises complexas em milissegundos" |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Landing Page Premium                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Animation Layer                        │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │   │
│  │  │ Framer   │  │ CSS 3D   │  │ Canvas Particles     │  │   │
│  │  │ Motion   │  │ Transforms│  │ (requestAnimationFrame)│  │   │
│  │  └──────────┘  └──────────┘  └──────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Component Layer                        │   │
│  │  ┌────────┐ ┌──────────┐ ┌───────┐ ┌─────────────────┐ │   │
│  │  │ Hero   │ │ Features │ │ Stats │ │ Pricing/Testimonials│ │   │
│  │  │ Premium│ │ Showcase │ │Counter│ │ Premium Cards    │ │   │
│  │  └────────┘ └──────────┘ └───────┘ └─────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Utility Layer                          │   │
│  │  ┌──────────────┐  ┌────────────┐  ┌────────────────┐  │   │
│  │  │ useInView    │  │ useMousePos│  │ useReducedMotion│  │   │
│  │  │ (Intersection)│  │ (Parallax) │  │ (Accessibility) │  │   │
│  │  └──────────────┘  └────────────┘  └────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. ParticleCanvas Component

```typescript
interface ParticleCanvasProps {
  particleCount?: number;        // Default: 50 (desktop), 20 (mobile)
  colors?: string[];             // Particle colors array
  mouseInteraction?: boolean;    // Enable mouse repulsion
  speed?: number;                // Animation speed multiplier
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
}
```

### 2. AnimatedCounter Component

```typescript
interface AnimatedCounterProps {
  end: number;                   // Final value
  duration?: number;             // Animation duration in ms
  prefix?: string;               // e.g., "R$"
  suffix?: string;               // e.g., "+", "%"
  decimals?: number;             // Decimal places
  onComplete?: () => void;       // Callback when animation ends
}
```

### 3. GlassmorphicCard Component

```typescript
interface GlassmorphicCardProps {
  children: React.ReactNode;
  className?: string;
  tiltEnabled?: boolean;         // 3D tilt on hover
  glowColor?: string;            // Glow effect color
  intensity?: 'subtle' | 'medium' | 'strong';
}
```

### 4. HeroPremium Component

```typescript
interface HeroPremiumProps {
  headline: string;
  subheadline: string;
  ctaPrimary: CTAConfig;
  ctaSecondary?: CTAConfig;
  trustBadges: TrustBadge[];
  heroImage?: string;
}

interface CTAConfig {
  text: string;
  href: string;
  variant: 'primary' | 'secondary' | 'ghost';
}

interface TrustBadge {
  icon: LucideIcon;
  text: string;
}
```

### 5. FeatureShowcase Component

```typescript
interface FeatureShowcaseProps {
  features: FeatureItem[];
  layout?: 'grid' | 'bento';     // Grid or Bento box layout
}

interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  highlight?: boolean;           // Featured item
}
```

### 6. TestimonialCarousel Component

```typescript
interface TestimonialCarouselProps {
  testimonials: Testimonial[];
  autoPlayInterval?: number;     // ms between slides
  pauseOnHover?: boolean;
}

interface Testimonial {
  name: string;
  role: string;
  content: string;
  rating: number;
  avatar: string;
}
```

## Data Models

### Animation Configuration

```typescript
interface AnimationConfig {
  // Framer Motion variants
  variants: {
    hidden: MotionProps;
    visible: MotionProps;
    hover?: MotionProps;
  };
  // Timing
  duration: number;
  delay?: number;
  staggerChildren?: number;
  // Easing
  ease: string | number[];
}

// Predefined animation presets
const ANIMATION_PRESETS = {
  fadeInUp: {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0 },
    duration: 0.6,
    ease: [0.25, 0.46, 0.45, 0.94]
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1 },
    duration: 0.5,
    ease: 'easeOut'
  },
  slideInLeft: {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0 },
    duration: 0.6,
    ease: [0.25, 0.46, 0.45, 0.94]
  }
};
```

### Theme Configuration

```typescript
interface PremiumTheme {
  gradients: {
    mesh: string[];              // Mesh gradient colors
    primary: string;             // Primary gradient
    accent: string;              // Accent gradient
  };
  glassmorphism: {
    background: string;          // rgba with transparency
    blur: string;                // backdrop-blur value
    border: string;              // Border color
  };
  particles: {
    colors: string[];
    count: { desktop: number; mobile: number };
  };
}

const LIGHT_THEME: PremiumTheme = {
  gradients: {
    mesh: ['#ff6b35', '#f7931e', '#ffd23f', '#ee4266'],
    primary: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%)',
    accent: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
  },
  glassmorphism: {
    background: 'rgba(255, 255, 255, 0.7)',
    blur: 'blur(20px)',
    border: 'rgba(255, 255, 255, 0.3)'
  },
  particles: {
    colors: ['#f97316', '#ea580c', '#fbbf24', '#8b5cf6'],
    count: { desktop: 50, mobile: 20 }
  }
};

const DARK_THEME: PremiumTheme = {
  gradients: {
    mesh: ['#f97316', '#dc2626', '#7c3aed', '#2563eb'],
    primary: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)',
    accent: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)'
  },
  glassmorphism: {
    background: 'rgba(15, 23, 42, 0.8)',
    blur: 'blur(20px)',
    border: 'rgba(255, 255, 255, 0.1)'
  },
  particles: {
    colors: ['#f97316', '#fbbf24', '#8b5cf6', '#3b82f6'],
    count: { desktop: 40, mobile: 15 }
  }
};
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the acceptance criteria analysis, the following correctness properties must be validated:

### Property 1: Hero Load Performance
*For any* page load event, the Hero Section should render with all visual elements (gradients, particles, text, CTAs) within 2 seconds of initial load.
**Validates: Requirements 1.1**

### Property 2: Glassmorphism Consistency
*For any* card component (feature cards, pricing cards, testimonial cards), the component should have glassmorphism styling applied including backdrop-filter blur, semi-transparent background, and border styling.
**Validates: Requirements 2.4, 4.3**

### Property 3: Animated Counter Behavior
*For any* stat value displayed in the Stats section, when the section enters the viewport, the counter should animate from 0 to the final value over the specified duration.
**Validates: Requirements 3.1**

### Property 4: Popular Plan Highlighting
*For any* set of pricing plans, exactly one plan marked as "popular" should have distinct visual styling including a glowing border and "Most Popular" badge.
**Validates: Requirements 4.1**

### Property 5: Carousel Auto-scroll with Pause
*For any* testimonial carousel, the carousel should auto-scroll at the specified interval, and when a user hovers over the carousel, auto-scrolling should pause.
**Validates: Requirements 5.1, 5.4**

### Property 6: Testimonial Card Structure
*For any* testimonial displayed, the card should contain: avatar image, name, role, content text, and star rating elements.
**Validates: Requirements 5.3**

### Property 7: Viewport-triggered Animations
*For any* section or card component, when the element enters the viewport (via Intersection Observer), the entrance animation should trigger exactly once.
**Validates: Requirements 6.2, 2.1**

### Property 8: Sticky Header Transformation
*For any* scroll position past the hero section, the header should transform to a compact sticky version with backdrop blur applied.
**Validates: Requirements 6.4**

### Property 9: Mobile Animation Adaptation
*For any* mobile viewport (width < 768px), animations should be reduced (fewer particles, simplified effects) while maintaining visual hierarchy and touch-friendly interaction areas (minimum 44px touch targets).
**Validates: Requirements 7.1, 7.2**

### Property 10: GPU-accelerated Animations
*For any* animation in the system, only GPU-accelerated CSS properties (transform, opacity) should be animated, avoiding layout-triggering properties (width, height, top, left).
**Validates: Requirements 7.4**

### Property 11: Dark Mode Color Adaptation
*For any* theme toggle to dark mode, all glassmorphism elements, particle colors, and gradient schemes should update to dark mode variants.
**Validates: Requirements 8.1, 8.2**

### Property 12: Dark Mode Accessibility Contrast
*For any* text element in dark mode, the contrast ratio between text and background should meet WCAG AA standards (minimum 4.5:1 for normal text, 3:1 for large text).
**Validates: Requirements 8.4**

## Error Handling

### Animation Errors
- If Framer Motion fails to load, fallback to CSS-only animations
- If Canvas API is unavailable, hide particle system gracefully
- If Intersection Observer is unsupported, show all content without animations

### Performance Degradation
- If device has `prefers-reduced-motion`, disable all non-essential animations
- If frame rate drops below 30fps, reduce particle count dynamically
- If memory usage exceeds threshold, disable particle system

### Theme Errors
- If theme preference cannot be detected, default to light mode
- If CSS variables fail to load, use hardcoded fallback colors

## Testing Strategy

### Unit Testing Framework
- **Vitest** for unit tests
- **React Testing Library** for component testing
- **@testing-library/user-event** for interaction testing

### Property-Based Testing Framework
- **fast-check** for property-based testing in TypeScript/JavaScript
- Minimum 100 iterations per property test
- Each property test must be tagged with: `**Feature: landing-page-premium, Property {number}: {property_text}**`

### Test Categories

#### 1. Component Unit Tests
- Test each component renders correctly with various props
- Test hover states and interactions
- Test responsive breakpoint behavior

#### 2. Animation Property Tests
- Verify GPU-accelerated properties are used (Property 10)
- Verify viewport-triggered animations fire once (Property 7)
- Verify mobile adaptation reduces complexity (Property 9)

#### 3. Visual Regression Tests
- Snapshot tests for glassmorphism styling consistency (Property 2)
- Snapshot tests for dark mode color schemes (Property 11)

#### 4. Accessibility Tests
- Contrast ratio validation for dark mode (Property 12)
- Touch target size validation for mobile (Property 9)

#### 5. Integration Tests
- Test carousel auto-scroll and pause behavior (Property 5)
- Test sticky header transformation on scroll (Property 8)
- Test animated counter completion (Property 3)

### Test File Structure
```
src/components/__tests__/
├── ParticleCanvas.test.tsx
├── AnimatedCounter.test.tsx
├── GlassmorphicCard.test.tsx
├── HeroPremium.test.tsx
├── FeatureShowcase.test.tsx
├── TestimonialCarousel.test.tsx
├── PricingPremium.test.tsx
└── properties/
    ├── glassmorphism.property.test.tsx
    ├── animations.property.test.tsx
    ├── darkMode.property.test.tsx
    └── accessibility.property.test.tsx
```
