import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";
import { useProfile } from "@/domains/auth/hooks/useProfile";

interface LogDetails {
  [key: string]: unknown;
}

export const useAuditLog = () => {
  const { profile } = useProfile();

  const logAction = async (
    action: string,
    entityType: string,
    entityId?: string,
    details?: LogDetails
  ) => {
    try {
      if (!profile) return;

      await supabase.from('admin_logs').insert({
        admin_id: profile.id,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details: details || {},
      });
    } catch (error) {
      logger.error('useAuditLog', 'Erro', { detail: 'Error logging action:', error });
    }
  };

  return { logAction };
};
