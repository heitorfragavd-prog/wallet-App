import {
  HeaderPremium,
  HeroPremium,
  FeatureShowcase,
  StatsPremium,
  PricingPremium,
  TestimonialCarousel,
  FinalCTA,
} from '@/components/premium';
import { HowItWorks } from '@/components/HowItWorks';
import { FAQ } from '@/components/FAQ';
import { Footer } from '@/components/Footer';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <HeaderPremium />
      <main className="pt-16">
        {/* Hero Section - Requirements 1.1-1.6 */}
        <HeroPremium />

        {/* Features Showcase - Requirements 2.1-2.5 */}
        <FeatureShowcase />

        {/* How It Works - Existing component */}
        <HowItWorks />

        {/* Stats Section - Requirements 3.1-3.4 */}
        <StatsPremium />

        {/* Pricing Section - Requirements 4.1-4.4 */}
        <PricingPremium />

        {/* Testimonials - Requirements 5.1-5.4 */}
        <TestimonialCarousel />

        {/* FAQ - Existing component */}
        <FAQ />

        {/* Final CTA - Requirements 9.1-9.4 */}
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;
