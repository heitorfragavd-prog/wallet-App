import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
}

interface PaymentLink {
  plan_id: string;
  payment_link: string;
  is_active: boolean;
}

export const Pricing = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlansWithLinks();
  }, []);

  const fetchPlansWithLinks = async () => {
    try {
      // Buscar planos
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .order('price', { ascending: true });

      if (plansError) throw plansError;

      // Buscar links de pagamento ativos
      const { data: linksData, error: linksError } = await supabase
        .from('payment_links')
        .select('plan_id, payment_link, is_active')
        .eq('is_active', true);

      if (linksError) throw linksError;

      // Mapear links por plan_id
      const linksMap = new Map<string, string>();
      linksData?.forEach((link: PaymentLink) => {
        linksMap.set(link.plan_id, link.payment_link);
      });

      // Configuração estática de features e descrições por plano
      const planConfigs: Record<string, any> = {
        'Essencial': {
          description: "Para quem está começando a organizar as finanças",
          notIncluded: [
            "Integração com WhatsApp",
            "Relatórios Avançados",
            "Metas Ilimitadas",
            "Consultoria IA"
          ],
          buttonText: "Começar Grátis",
          popular: false,
          color: "gray",
          defaultLink: "/login"
        },
        'Pro': {
          description: "A escolha ideal para automação total",
          notIncluded: [
            "Consultoria IA Personalizada",
            "Gestão de Investimentos"
          ],
          buttonText: "Assinar Pro",
          popular: true,
          color: "orange",
          defaultLink: "/login"
        },
        'Black': {
          description: "Para quem busca excelência e inteligência financeira",
          notIncluded: [],
          buttonText: "Ser Black",
          popular: false,
          color: "slate",
          defaultLink: "/login"
        }
      };

      // Combinar dados
      const combinedPlans = plansData?.map((plan: Plan) => {
        const config = planConfigs[plan.name] || {};
        const paymentLink = linksMap.get(plan.id) || config.defaultLink || "/login";

        return {
          name: plan.name,
          price: plan.price === 0 ? "Grátis" : `R$ ${plan.price.toFixed(2).replace('.', ',')}`,
          period: plan.price > 0 ? "/mês" : undefined,
          description: config.description || "",
          features: plan.features || [],
          notIncluded: config.notIncluded || [],
          buttonText: config.buttonText || "Assinar",
          popular: config.popular || false,
          color: config.color || "gray",
          link: paymentLink
        };
      }) || [];

      setPlans(combinedPlans);
    } catch (error) {
      console.error("Erro ao carregar planos:", error);
      // Fallback para planos estáticos em caso de erro
      setPlans([
        {
          name: "Essencial",
          price: "Grátis",
          description: "Para quem está começando a organizar as finanças",
          features: [
            "Dashboard Básico",
            "Controle de Entradas e Saídas",
            "Categorias Personalizáveis",
            "Acesso Web",
            "Suporte por Email"
          ],
          notIncluded: [
            "Integração com WhatsApp",
            "Relatórios Avançados",
            "Metas Ilimitadas",
            "Consultoria IA"
          ],
          buttonText: "Começar Grátis",
          popular: false,
          color: "gray",
          link: "/login"
        },
        {
          name: "Pro",
          price: "R$ 29,90",
          period: "/mês",
          description: "A escolha ideal para automação total",
          features: [
            "Tudo do Plano Essencial",
            "Integração com WhatsApp (Wallet IA)",
            "Relatórios Ilimitados",
            "Metas Ilimitadas",
            "Exportação de Dados",
            "Suporte Prioritário"
          ],
          notIncluded: [
            "Consultoria IA Personalizada",
            "Gestão de Investimentos"
          ],
          buttonText: "Assinar Pro",
          popular: true,
          color: "orange",
          link: "/login"
        },
        {
          name: "Black",
          price: "R$ 59,90",
          period: "/mês",
          description: "Para quem busca excelência e inteligência financeira",
          features: [
            "Tudo do Plano Pro",
            "Consultoria IA Personalizada",
            "Análise de Investimentos",
            "Gestão Multi-contas",
            "Atendimento VIP",
            "Acesso Antecipado a Novas Features"
          ],
          notIncluded: [],
          buttonText: "Ser Black",
          popular: false,
          color: "slate",
          link: "/login"
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section id="precos" className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="text-gray-600">Carregando planos...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="precos" className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">PLANOS</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Escolha o plano ideal para sua liberdade financeira
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative bg-white rounded-2xl shadow-xl overflow-hidden border-2 transition-transform hover:scale-105 duration-300 ${plan.popular ? 'border-orange-500' : 'border-transparent'
                }`}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                  MAIS POPULAR
                </div>
              )}

              <div className="p-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <div className="flex items-baseline mb-4">
                  <span className="text-4xl font-extrabold text-gray-900">{plan.price}</span>
                  {plan.period && <span className="text-gray-500 ml-1">{plan.period}</span>}
                </div>
                <p className="text-gray-600 mb-6">{plan.description}</p>

                <Button
                  className={`w-full mb-8 py-6 text-lg ${plan.popular
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : 'bg-gray-900 hover:bg-gray-800 text-white'
                    }`}
                  onClick={() => {
                    if (plan.link.startsWith('http')) {
                      window.open(plan.link, '_blank');
                    } else {
                      navigate(plan.link);
                    }
                  }}
                >
                  {plan.buttonText}
                </Button>

                <div className="space-y-4">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start">
                      <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-600 text-sm">{feature}</span>
                    </div>
                  ))}
                  {plan.notIncluded.map((feature, idx) => (
                    <div key={idx} className="flex items-start opacity-50">
                      <X className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-500 text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
