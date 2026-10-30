import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  isDeliveryStaffRole,
  canAccessFinancials,
  RESTRICTED_FINANCIAL_ROUTES,
} from './delivery-permissions';
import { DeliveryRoleGuard } from './DeliveryRoleGuard';

const mockNavigate = vi.fn();
let mockLocationPath = '/dashboard';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: mockLocationPath }),
  };
});

interface MockProfile {
  role?: string;
  id?: string;
}

let mockProfileData: MockProfile | null = { role: 'user', id: 'u-1' };
const mockLoading = false;

vi.mock('@/domains/auth/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: mockProfileData,
    loading: mockLoading,
  }),
}));

vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('DeliveryRoleGuard — Isolamento de Permissões & Segurança', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationPath = '/dashboard';
    mockProfileData = { role: 'user', id: 'u-1' };
  });

  describe('isDeliveryStaffRole & canAccessFinancials', () => {
    it('identifica corretamente perfis operacionais de cozinha e entrega', () => {
      expect(isDeliveryStaffRole('delivery_staff')).toBe(true);
      expect(isDeliveryStaffRole('delivery_operator')).toBe(true);
      expect(isDeliveryStaffRole('kds_staff')).toBe(true);
      expect(isDeliveryStaffRole('cozinha')).toBe(true);
      expect(isDeliveryStaffRole('expedicao')).toBe(true);
    });

    it('identifica perfis administrativos e de usuário comum como não-operacionais', () => {
      expect(isDeliveryStaffRole('user')).toBe(false);
      expect(isDeliveryStaffRole('admin')).toBe(false);
      expect(isDeliveryStaffRole('gestor')).toBe(false);
      expect(isDeliveryStaffRole(null)).toBe(false);
      expect(isDeliveryStaffRole(undefined)).toBe(false);
    });

    it('restringe acesso a relatórios e DRE apenas para papéis com permissão financeira', () => {
      expect(canAccessFinancials('user')).toBe(true);
      expect(canAccessFinancials('admin')).toBe(true);
      expect(canAccessFinancials('delivery_staff')).toBe(false);
      expect(canAccessFinancials('cozinha')).toBe(false);
    });

    it('garante que a lista de rotas restritas proteja DRE, fluxo de caixa, contas e CEO', () => {
      expect(RESTRICTED_FINANCIAL_ROUTES).toContain('/dre');
      expect(RESTRICTED_FINANCIAL_ROUTES).toContain('/fluxo-caixa');
      expect(RESTRICTED_FINANCIAL_ROUTES).toContain('/contas');
      expect(RESTRICTED_FINANCIAL_ROUTES).toContain('/dividas');
      expect(RESTRICTED_FINANCIAL_ROUTES).toContain('/relatorios');
      expect(RESTRICTED_FINANCIAL_ROUTES).toContain('/ceo');
    });
  });

  describe('Componente DeliveryRoleGuard', () => {
    it('renderiza o conteúdo normalmente para usuários com perfil padrão', () => {
      mockProfileData = { role: 'user', id: 'u-1' };
      mockLocationPath = '/dre';

      render(
        <MemoryRouter>
          <DeliveryRoleGuard>
            <div data-testid="protected-content">Conteúdo Financeiro Protegido</div>
          </DeliveryRoleGuard>
        </MemoryRouter>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('bloqueia e redireciona delivery_staff para /delivery/kds quando tenta acessar rota restrita (/dre)', () => {
      mockProfileData = { role: 'delivery_staff', id: 'u-kitchen' };
      mockLocationPath = '/dre';

      render(
        <MemoryRouter>
          <DeliveryRoleGuard>
            <div data-testid="protected-content">Conteúdo Financeiro Protegido</div>
          </DeliveryRoleGuard>
        </MemoryRouter>
      );

      // Não deve renderizar o conteúdo confidencial
      expect(screen.queryByTestId('protected-content')).toBeNull();
      // Deve ter redirecionado para o KDS
      expect(mockNavigate).toHaveBeenCalledWith('/delivery/kds', { replace: true });
    });

    it('permite que delivery_staff acesse livremente a tela operacional do KDS (/delivery/kds)', () => {
      mockProfileData = { role: 'delivery_staff', id: 'u-kitchen' };
      mockLocationPath = '/delivery/kds';

      render(
        <MemoryRouter>
          <DeliveryRoleGuard>
            <div data-testid="kds-content">Terminal KDS Operacional</div>
          </DeliveryRoleGuard>
        </MemoryRouter>
      );

      expect(screen.getByTestId('kds-content')).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
