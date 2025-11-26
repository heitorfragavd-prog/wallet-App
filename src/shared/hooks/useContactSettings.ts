import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ContactSettings {
  email: string | null;
  phone: string | null;
}

interface UseContactSettingsReturn extends ContactSettings {
  loading: boolean;
}

export const useContactSettings = (): UseContactSettingsReturn => {
  const { data, isLoading } = useQuery({
    queryKey: ["contact-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["contact_email", "contact_phone"]);

      if (error) {
        console.error("Error fetching contact settings:", error);
        return { email: null, phone: null };
      }

      const settings: ContactSettings = {
        email: null,
        phone: null,
      };

      data?.forEach((setting) => {
        if (setting.key === "contact_email") {
          settings.email = setting.value;
        } else if (setting.key === "contact_phone") {
          settings.phone = setting.value;
        }
      });

      return settings;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  return {
    email: data?.email ?? null,
    phone: data?.phone ?? null,
    loading: isLoading,
  };
};
