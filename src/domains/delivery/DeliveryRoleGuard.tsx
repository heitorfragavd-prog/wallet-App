import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProfile } from '@/domains/auth/hooks/useProfile';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/shared/hooks/use-toast';
import {
  isDeliveryStaffRole,
  isRouteAllowedForDeliveryStaff,
  RESTRICTED_FINANCIAL_ROUTES,
} from './delivery-permissions';

interface DeliveryRoleGuardProps {
  children: React.ReactNode;
  fallbackPath?: string;
}

/**
 * Componente de proteção de rota:
 * Impede que operadores de delivery e cozinha acessem DRE, saldos ou margens confidenciais,
 * redirecionando-os de forma amigável para a Central KDS.
 */
export const DeliveryRoleGuard: React.FC<DeliveryRoleGuardProps> = ({
  children,
  fallbackPath = '/delivery/kds',
}) => {
  const { profile, loading } = useProfile();
  const { activeWorkspaceRole } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (loading || !profile) return;

    const isStaff = isDeliveryStaffRole(profile?.role) || isDeliveryStaffRole(activeWorkspaceRole);
    if (isStaff) {
      const isRestricted =
        !isRouteAllowedForDeliveryStaff(location.pathname) &&
        (RESTRICTED_FINANCIAL_ROUTES.some((prefix) => location.pathname.startsWith(prefix)) ||
          location.pathname === '/delivery');

      if (isRestricted) {
        toast({
          title: 'Acesso Restrito ao KDS',
          description:
            'Seu perfil operacional tem acesso direcionado ao terminal de pedidos e expedição.',
          variant: 'default',
        });
        navigate(fallbackPath, { replace: true });
      }
    }
  }, [profile, loading, activeWorkspaceRole, location.pathname, navigate, fallbackPath, toast]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Se o usuário for delivery_staff tentando ver página restrita, não renderiza o conteúdo
  const isStaff = isDeliveryStaffRole(profile?.role) || isDeliveryStaffRole(activeWorkspaceRole);
  if (isStaff) {
    const isRestricted =
      !isRouteAllowedForDeliveryStaff(location.pathname) &&
      (RESTRICTED_FINANCIAL_ROUTES.some((prefix) => location.pathname.startsWith(prefix)) ||
        location.pathname === '/delivery');
    if (isRestricted) {
      return null;
    }
  }

  return <>{children}</>;
};

export default DeliveryRoleGuard;
