
import { FeatureCard } from "./FeatureCard";
import { BarChart3, Target, Tag, FileText, MessageCircle, ShieldCheck } from "lucide-react";

export const Features = () => {
  const features = [
    {
      icon: MessageCircle,
      title: "WhatsApp Inteligente",
      description: "Esqueça os apps complicados. Envie um áudio ou texto para o Wallet e ele categoriza e registra tudo instantaneamente.",
      color: "green"
    },
    {
      icon: BarChart3,
      title: "Clareza Total",
      description: "Veja para onde seu dinheiro vai em tempo real. Gráficos intuitivos que transformam números confusos em decisões inteligentes.",
      color: "blue"
    },
    {
      icon: Target,
      title: "Conquiste seus Sonhos",
      description: "Defina metas de economia para aquela viagem ou carro novo. O Wallet te ajuda a manter o foco e celebrar cada conquista.",
      color: "purple"
    },
    {
      icon: ShieldCheck,
      title: "Segurança Máxima",
      description: "Seus dados são criptografados e protegidos. Tenha a tranquilidade de saber que suas informações financeiras estão seguras.",
      color: "indigo"
    },
    {
      icon: Tag,
      title: "Organização Automática",
      description: "O sistema aprende com seus hábitos e sugere categorias automaticamente, poupando seu tempo para o que realmente importa.",
      color: "yellow"
    },
    {
      icon: FileText,
      title: "Relatórios de Evolução",
      description: "Receba insights semanais sobre sua saúde financeira. Entenda seus padrões e melhore seus hábitos mês a mês.",
      color: "orange"
    }
  ];

  return (
    <section id="recursos" className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">POR QUE O WALLET?</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Mais que um app financeiro, seu parceiro de prosperidade
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              color={feature.color}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
