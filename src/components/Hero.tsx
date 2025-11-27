
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { ArrowRight, MessageCircle, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { DemoVideoModal } from "@/components/DemoVideoModal";

export const Hero = () => {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-white to-white pt-32 pb-20 lg:pt-40 lg:pb-32">
      {/* Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full z-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-20 right-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      <div className="container relative z-10 mx-auto px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center bg-white border border-orange-100 shadow-sm rounded-full px-4 py-1.5 mb-8 transition-transform hover:scale-105 cursor-default">
            <span className="flex h-2 w-2 rounded-full bg-green-500 mr-2"></span>
            <span className="text-sm font-medium text-gray-600">O Futuro das Finanças Pessoais</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 mb-8 tracking-tight leading-tight">
            Sua Liberdade Financeira <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-600">
              Começa com uma Conversa
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed">
            O primeiro assistente que organiza sua vida financeira direto pelo WhatsApp.
            Diga adeus às planilhas complicadas e assuma o controle total do seu dinheiro.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link to="/login" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 text-white text-lg px-8 py-6 h-auto rounded-xl shadow-lg shadow-orange-200 transition-all hover:shadow-orange-300 hover:-translate-y-1">
                Começar Agora (Grátis)
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto text-lg px-8 py-6 h-auto rounded-xl border-2 hover:bg-gray-50 transition-all"
              onClick={() => setIsDemoModalOpen(true)}
            >
              Ver Como Funciona
            </Button>
          </div>

          <div className="flex flex-wrap justify-center gap-8 mb-16 text-sm font-medium text-gray-500">
            <div className="flex items-center">
              <CheckCircle2 className="w-5 h-5 text-green-500 mr-2" />
              Sem cartão de crédito
            </div>
            <div className="flex items-center">
              <CheckCircle2 className="w-5 h-5 text-green-500 mr-2" />
              Plano Gratuito disponível
            </div>
            <div className="flex items-center">
              <CheckCircle2 className="w-5 h-5 text-green-500 mr-2" />
              Segurança de nível bancário
            </div>
          </div>

          <div className="relative mx-auto max-w-5xl">
            <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-purple-600 rounded-2xl blur opacity-20"></div>
            <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
              <img
                src="https://seuspuloflix.pro/wp-content/uploads/2025/11/walletai.png"
                alt="Dashboard do Wallet com integração WhatsApp"
                className="w-full h-auto"
              />

              {/* Floating Badge */}
              <div className="absolute bottom-8 right-8 bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-white/50 hidden md:block animate-bounce-slow">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-full">
                    <MessageCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Nova despesa registrada</p>
                    <p className="font-bold text-gray-900">- R$ 45,90 (Uber)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DemoVideoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </section>
  );
};
