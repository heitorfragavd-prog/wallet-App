import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProfile } from '@/domains/auth/hooks/useProfile';
import { useToast } from '@/shared/hooks/use-toast';
import { isDeliveryStaffRole, RESTRICTED_FINANCIAL_ROUTES } from './delivery-permissions';

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
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (loading || !profile) return;

    if (isDeliveryStaffRole(profile.role)) {
      const isRestricted = RESTRICTED_FINANCIAL_ROUTES.some((prefix) =>
        location.pathname.startsWith(prefix)
      );

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
  }, [profile, loading, location.pathname, navigate, fallbackPath, toast]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Se o usuário for delivery_staff tentando ver página restrita, não renderiza o conteúdo
  if (profile && isDeliveryStaffRole(profile.role)) {
    const isRestricted = RESTRICTED_FINANCIAL_ROUTES.some((prefix) =>
      location.pathname.startsWith(prefix)
    );
    if (isRestricted) {
      return null;
    }
  }

  return <>{children}</>;
};

export default DeliveryRoleGuard;
