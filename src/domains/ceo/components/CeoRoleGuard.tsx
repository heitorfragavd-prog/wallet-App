import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/domains/auth/hooks/useAuth';
import { useProfile } from '@/domains/auth/hooks/useProfile';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/shared/hooks/use-toast';
import { isDeliveryStaffRole } from '@/domains/delivery/delivery-permissions';
import { logger } from '@/core/logging/LoggerService';

interface CeoRoleGuardProps {
  children: React.ReactNode;
}

/**
 * CeoRoleGuard (Gate 4 - RBAC dos Dois Cérebros)
 *
 * Garante que a rota executiva /ceo seja restrita exclusivamente ao Proprietário (Owner)
 * e perfis com prerrogativa executiva/admin.
 * Usuários operacionais e sócias sem papel executivo são direcionados para o Wallet IA (/ia).
 * Perfis de equipe (ex: delivery) são mantidos estritamente no seu escopo operacional (/delivery/kds).
 */
export const CeoRoleGuard: React.FC<CeoRoleGuardProps> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { activeWorkspace, activeWorkspaceRole } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();

  const isLoading = authLoading || profileLoading;

  // Prerrogativa executiva: Role de owner/admin no perfil, ou no workspace ativo, ou ser o criador do workspace
  const isOwnerOrAdmin =
    profile?.role === 'owner' ||
    profile?.role === 'admin' ||
    activeWorkspaceRole === 'owner' ||
    activeWorkspaceRole === 'admin' ||
    Boolean(user?.id && activeWorkspace?.owner_id && user.id === activeWorkspace.owner_id);

  const isStaff = isDeliveryStaffRole(profile?.role) || isDeliveryStaffRole(activeWorkspaceRole);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (isStaff) {
      logger.warn('CeoRoleGuard', 'Delivery staff tentou acessar /ceo, redirecionando para /delivery/kds');
      navigate('/delivery/kds', { replace: true });
      return;
    }

    if (!isOwnerOrAdmin) {
      logger.info('CeoRoleGuard', 'Usuário não executivo acessando /ceo, redirecionando para /ia');
      toast({
        title: 'Área Executiva Restrita',
        description: 'O Wallet CEO é reservado ao proprietário. Redirecionando para o Wallet IA Operacional.',
      });
      navigate('/ia', { replace: true });
    }
  }, [isLoading, user, isStaff, isOwnerOrAdmin, navigate, toast]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isOwnerOrAdmin) {
    return null;
  }

  return <>{children}</>;
};
