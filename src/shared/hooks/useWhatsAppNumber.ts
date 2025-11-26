import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface UseWhatsAppNumberReturn {
  whatsappNumber: string | null;
  whatsappUrl: string | null;
  formattedNumber: string | null;
  loading: boolean;
}

const formatWhatsAppNumber = (number: string): string => {
  // Remove all non-digit characters
  const digits = number.replace(/\D/g, '');
  
  // Format Brazilian numbers: +55 (11) 99999-9999
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.substring(2, 4);
    const firstPart = digits.substring(4, digits.length - 4);
    const lastPart = digits.substring(digits.length - 4);
    return `+55 (${ddd}) ${firstPart}-${lastPart}`;
  }
  
  return number;
};

export const useWhatsAppNumber = (): UseWhatsAppNumberReturn => {
  const { data: whatsappNumber, isLoading } = useQuery({
    queryKey: ["whatsapp-number"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "whatsapp_number")
        .single();

      if (error) {
        console.error("Error fetching WhatsApp number:", error);
        return null;
      }

      return data?.value || null;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}`
    : null;

  const formattedNumber = whatsappNumber
    ? formatWhatsAppNumber(whatsappNumber)
    : null;

  return {
    whatsappNumber: whatsappNumber ?? null,
    whatsappUrl,
    formattedNumber,
    loading: isLoading,
  };
};
