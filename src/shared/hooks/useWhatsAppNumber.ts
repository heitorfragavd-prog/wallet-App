import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface UseWhatsAppNumberReturn {
  whatsappNumber: string | null;
  whatsappUrl: string | null;
  loading: boolean;
}

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

  return {
    whatsappNumber: whatsappNumber ?? null,
    whatsappUrl,
    loading: isLoading,
  };
};
