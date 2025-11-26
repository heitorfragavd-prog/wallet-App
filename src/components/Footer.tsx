import { MessageCircle, Mail, Phone, Wallet } from "lucide-react";
import { useWhatsAppNumber } from "@/shared/hooks/useWhatsAppNumber";
import { useContactSettings } from "@/shared/hooks/useContactSettings";

const formatPhoneNumber = (phone: string): string => {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Format: (11) 3333-3333
  if (digits.length === 10) {
    return `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
  }
  
  // Format: (11) 99999-9999
  if (digits.length === 11) {
    return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}`;
  }
  
  return phone;
};

export const Footer = () => {
  const { whatsappNumber, formattedNumber } = useWhatsAppNumber();
  const { email, phone } = useContactSettings();

  return <footer className="bg-gray-900 text-white py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-2 mb-6">
              <div className="bg-orange-500 rounded-lg p-2">
                <Wallet className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-bold">Wallet</span>
            </div>
            <p className="text-gray-400 leading-relaxed">Consultoria financeira inteligente integrada ao WhatsApp para gerenciar suas finanças pessoais.</p>
          </div>

          <div>
            <h4 className="font-bold text-lg mb-4">Produto</h4>
            <ul className="space-y-2 text-gray-400">
              <li><a href="#" className="hover:text-white transition-colors">Recursos</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Preços</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Segurança</a></li>
              <li><a href="#" className="hover:text-white transition-colors">API</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-lg mb-4">Empresa</h4>
            <ul className="space-y-2 text-gray-400">
              <li><a href="#" className="hover:text-white transition-colors">Sobre nós</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Carreiras</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contato</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-lg mb-4">Contato</h4>
            <div className="space-y-4 text-gray-400">
              {whatsappNumber && (
                <div className="flex items-center space-x-3">
                  <MessageCircle className="w-5 h-5" />
                  <span>WhatsApp: {formattedNumber}</span>
                </div>
              )}
              {email && (
                <div className="flex items-center space-x-3">
                  <Mail className="w-5 h-5" />
                  <span>{email}</span>
                </div>
              )}
              {phone && (
                <div className="flex items-center space-x-3">
                  <Phone className="w-5 h-5" />
                  <span>{formatPhoneNumber(phone)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
          <p>&copy; 2025 Wallet - Cortexx. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>;
};