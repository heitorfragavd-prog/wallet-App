import { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/shared/components/ui/button';
import { Menu, X, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { useReducedMotion } from '@/shared/hooks/animations';
import { cn } from '@/lib/utils';

export interface HeaderPremiumProps {
  /** Scroll threshold to trigger compact mode */
  scrollThreshold?: number;
}

/**
 * Premium Header with sticky behavior and compact transformation on scroll.
 * Implements Requirements 6.4
 */
export const HeaderPremium = memo(function HeaderPremium({
  scrollThreshold = 100,
}: HeaderPremiumProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = !prefersReducedMotion;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > scrollThreshold);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => window.removeEventListener('scroll', handleScroll);
  }, [scrollThreshold]);

  const navLinks = [
    { href: '#recursos', label: 'Recursos' },
    { href: '#como-funciona', label: 'Como Funciona' },
    { href: '#precos', label: 'Preços' },
    { href: '#contato', label: 'Contato' },
  ];

  return (
    <motion.header
      initial={false}
      transition={shouldAnimate ? { duration: 0.3 } : { duration: 0 }}
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'border-b transition-all duration-300',
        isScrolled
          ? 'border-gray-200 dark:border-slate-700 backdrop-blur-lg shadow-sm bg-white/95 dark:bg-slate-900/95'
          : 'border-transparent backdrop-blur-md bg-white/80 dark:bg-slate-900/80'
      )}
    >
      <div className="container mx-auto px-4">
        <motion.div
          initial={false}
          animate={{ paddingTop: isScrolled ? 12 : 16, paddingBottom: isScrolled ? 12 : 16 }}
          transition={shouldAnimate ? { duration: 0.3 } : { duration: 0 }}
          className="flex items-center justify-between"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <motion.div
              initial={false}
              animate={{ scale: isScrolled ? 0.9 : 1 }}
              transition={shouldAnimate ? { duration: 0.3 } : { duration: 0 }}
              className="bg-gradient-to-br from-orange-500 to-red-500 rounded-lg p-2 shadow-md"
            >
              <Wallet className={cn('text-white transition-all', isScrolled ? 'h-5 w-5' : 'h-6 w-6')} />
            </motion.div>
            <motion.span
              initial={false}
              animate={{ fontSize: isScrolled ? '1.25rem' : '1.5rem' }}
              transition={shouldAnimate ? { duration: 0.3 } : { duration: 0 }}
              className="font-bold text-gray-800 dark:text-white"
            >
              Wallet
            </motion.span>
          </Link>


          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  'font-semibold transition-colors',
                  'text-gray-700 hover:text-orange-600 dark:text-gray-200 dark:hover:text-orange-400'
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center space-x-4">
            <ThemeToggle />
            <Link to="/login">
              <Button
                variant="outline"
                size={isScrolled ? 'sm' : 'default'}
                className="transition-all"
              >
                Fazer Login
              </Button>
            </Link>
            <Link to="/login">
              <motion.div
                whileHover={shouldAnimate ? { scale: 1.05 } : undefined}
                whileTap={shouldAnimate ? { scale: 0.98 } : undefined}
              >
                <Button
                  size={isScrolled ? 'sm' : 'default'}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 transition-all shadow-md"
                >
                  Começar Grátis
                </Button>
              </motion.div>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {isMenuOpen ? (
              <X className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            ) : (
              <Menu className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            )}
          </button>
        </motion.div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={shouldAnimate ? { opacity: 0, height: 0 } : undefined}
              animate={{ opacity: 1, height: 'auto' }}
              exit={shouldAnimate ? { opacity: 0, height: 0 } : undefined}
              transition={{ duration: 0.3 }}
              className="md:hidden overflow-hidden"
            >
              <nav className="flex flex-col space-y-4 py-4 border-t border-gray-100 dark:border-slate-700">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-gray-600 hover:text-orange-500 dark:text-gray-300 dark:hover:text-orange-400 transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
                <div className="flex flex-col space-y-2 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <div className="flex justify-center pb-2">
                    <ThemeToggle />
                  </div>
                  <Link to="/login" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
                      Fazer Login
                    </Button>
                  </Link>
                  <Link to="/login" onClick={() => setIsMenuOpen(false)}>
                    <Button className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 w-full">
                      Começar Grátis
                    </Button>
                  </Link>
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
});

export default HeaderPremium;
