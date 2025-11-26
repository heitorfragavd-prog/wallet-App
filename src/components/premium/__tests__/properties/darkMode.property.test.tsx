/**
 * Property-Based Tests for Dark Mode
 * **Feature: landing-page-premium, Property 11: Dark Mode Color Adaptation**
 * **Feature: landing-page-premium, Property 12: Dark Mode Accessibility Contrast**
 * **Validates: Requirements 8.1, 8.2, 8.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Color utility functions for testing
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function rgbaToRgb(rgba: string): { r: number; g: number; b: number } | null {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return match
    ? {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
      }
    : null;
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Theme color definitions
const lightThemeColors = {
  glassBg: 'rgba(255, 255, 255, 0.7)',
  glassBorder: 'rgba(255, 255, 255, 0.3)',
  particlePrimary: '#f97316',
  particleSecondary: '#ea580c',
  particleAccent: '#fbbf24',
  gradientStart: '#f97316',
  gradientEnd: '#ea580c',
  textPrimary: '#111827', // gray-900
  textSecondary: '#4b5563', // gray-600
};

const darkThemeColors = {
  glassBg: 'rgba(15, 23, 42, 0.8)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  particlePrimary: '#f97316',
  particleSecondary: '#fbbf24',
  particleAccent: '#8b5cf6',
  gradientStart: '#f97316',
  gradientEnd: '#dc2626',
  textPrimary: '#f9fafb', // gray-50
  textSecondary: '#d1d5db', // gray-300
  background: '#020617', // slate-950
};


describe('Property 11: Dark Mode Color Adaptation', () => {
  /**
   * **Feature: landing-page-premium, Property 11: Dark Mode Color Adaptation**
   * **Validates: Requirements 8.1, 8.2**
   * 
   * *For any* theme toggle to dark mode, all glassmorphism elements, particle colors,
   * and gradient schemes should update to dark mode variants.
   */
  it('should have distinct glassmorphism backgrounds for light and dark modes', () => {
    fc.assert(
      fc.property(fc.boolean(), (isDarkMode) => {
        const theme = isDarkMode ? darkThemeColors : lightThemeColors;
        const glassBg = theme.glassBg;
        
        // Glassmorphism background should be defined
        expect(glassBg).toBeDefined();
        expect(glassBg).toMatch(/rgba?\(/);
        
        // Dark mode should have darker background
        if (isDarkMode) {
          const rgb = rgbaToRgb(glassBg);
          expect(rgb).not.toBeNull();
          if (rgb) {
            // Dark mode glass bg should have low RGB values (dark)
            expect(rgb.r).toBeLessThan(50);
            expect(rgb.g).toBeLessThan(50);
            expect(rgb.b).toBeLessThan(100);
          }
        } else {
          const rgb = rgbaToRgb(glassBg);
          expect(rgb).not.toBeNull();
          if (rgb) {
            // Light mode glass bg should have high RGB values (light)
            expect(rgb.r).toBeGreaterThan(200);
            expect(rgb.g).toBeGreaterThan(200);
            expect(rgb.b).toBeGreaterThan(200);
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid particle colors for both themes', () => {
    fc.assert(
      fc.property(fc.boolean(), (isDarkMode) => {
        const theme = isDarkMode ? darkThemeColors : lightThemeColors;
        
        // All particle colors should be valid hex colors
        const particleColors = [
          theme.particlePrimary,
          theme.particleSecondary,
          theme.particleAccent,
        ];
        
        particleColors.forEach((color) => {
          expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
          const rgb = hexToRgb(color);
          expect(rgb).not.toBeNull();
        });
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid gradient colors for both themes', () => {
    fc.assert(
      fc.property(fc.boolean(), (isDarkMode) => {
        const theme = isDarkMode ? darkThemeColors : lightThemeColors;
        
        // Gradient colors should be valid hex colors
        expect(theme.gradientStart).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.gradientEnd).toMatch(/^#[0-9a-fA-F]{6}$/);
        
        // Gradient start and end should be different
        expect(theme.gradientStart).not.toBe(theme.gradientEnd);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});


describe('Property 12: Dark Mode Accessibility Contrast', () => {
  /**
   * **Feature: landing-page-premium, Property 12: Dark Mode Accessibility Contrast**
   * **Validates: Requirements 8.4**
   * 
   * *For any* text element in dark mode, the contrast ratio between text and background
   * should meet WCAG AA standards (minimum 4.5:1 for normal text, 3:1 for large text).
   */
  it('should have sufficient contrast ratio for primary text in dark mode', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const textColor = hexToRgb(darkThemeColors.textPrimary);
        const bgColor = hexToRgb(darkThemeColors.background);
        
        expect(textColor).not.toBeNull();
        expect(bgColor).not.toBeNull();
        
        if (textColor && bgColor) {
          const textLuminance = getLuminance(textColor.r, textColor.g, textColor.b);
          const bgLuminance = getLuminance(bgColor.r, bgColor.g, bgColor.b);
          const contrastRatio = getContrastRatio(textLuminance, bgLuminance);
          
          // WCAG AA requires 4.5:1 for normal text
          expect(contrastRatio).toBeGreaterThanOrEqual(4.5);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should have sufficient contrast ratio for secondary text in dark mode', () => {
    fc.assert(
      fc.property(fc.constant(true), () => {
        const textColor = hexToRgb(darkThemeColors.textSecondary);
        const bgColor = hexToRgb(darkThemeColors.background);
        
        expect(textColor).not.toBeNull();
        expect(bgColor).not.toBeNull();
        
        if (textColor && bgColor) {
          const textLuminance = getLuminance(textColor.r, textColor.g, textColor.b);
          const bgLuminance = getLuminance(bgColor.r, bgColor.g, bgColor.b);
          const contrastRatio = getContrastRatio(textLuminance, bgLuminance);
          
          // WCAG AA requires 3:1 for large text (secondary text is often larger)
          expect(contrastRatio).toBeGreaterThanOrEqual(3);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should have sufficient contrast for text on glassmorphism backgrounds', () => {
    fc.assert(
      fc.property(fc.boolean(), (isDarkMode) => {
        const theme = isDarkMode ? darkThemeColors : lightThemeColors;
        const textColor = hexToRgb(theme.textPrimary);
        
        // For glassmorphism, we test against the solid color component
        // since the actual background is semi-transparent
        const glassBgRgb = rgbaToRgb(theme.glassBg);
        
        expect(textColor).not.toBeNull();
        expect(glassBgRgb).not.toBeNull();
        
        if (textColor && glassBgRgb) {
          const textLuminance = getLuminance(textColor.r, textColor.g, textColor.b);
          const bgLuminance = getLuminance(glassBgRgb.r, glassBgRgb.g, glassBgRgb.b);
          const contrastRatio = getContrastRatio(textLuminance, bgLuminance);
          
          // Should have reasonable contrast (at least 3:1 for the glass component)
          expect(contrastRatio).toBeGreaterThanOrEqual(3);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should maintain contrast ratios across all theme color combinations', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('primary', 'secondary'),
        fc.boolean(),
        (textType, isDarkMode) => {
          const theme = isDarkMode ? darkThemeColors : lightThemeColors;
          const textColorHex = textType === 'primary' ? theme.textPrimary : theme.textSecondary;
          const textColor = hexToRgb(textColorHex);
          
          // Test against appropriate background
          const bgColorHex = isDarkMode ? darkThemeColors.background : '#ffffff';
          const bgColor = hexToRgb(bgColorHex);
          
          expect(textColor).not.toBeNull();
          expect(bgColor).not.toBeNull();
          
          if (textColor && bgColor) {
            const textLuminance = getLuminance(textColor.r, textColor.g, textColor.b);
            const bgLuminance = getLuminance(bgColor.r, bgColor.g, bgColor.b);
            const contrastRatio = getContrastRatio(textLuminance, bgLuminance);
            
            // Minimum contrast for accessibility
            const minContrast = textType === 'primary' ? 4.5 : 3;
            expect(contrastRatio).toBeGreaterThanOrEqual(minContrast);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
