import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserPreferencesTab } from "../../src/domains/notifications/components/UserPreferencesTab";
import { TeamPermissionsTab } from "../../src/domains/notifications/components/TeamPermissionsTab";
import * as useNotifHook from "../../src/domains/notifications/hooks/useNotificationPreferences";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

vi.mock("@/shared/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [{ id: "m1", user_id: "user-team-1", role: "member", status: "active" }], error: null })),
        })),
      })),
    })),
  },
}));

describe("Entrega D: Central de Notificações e Painel da Equipe", () => {
  describe("1. UserPreferencesTab (Preferências Individuais)", () => {
    it("deve ocultar/bloquear controles de ceo_executivo para usuários normais (não donos)", () => {
      vi.spyOn(useNotifHook, "useNotificationPreferences").mockReturnValue({
        preferences: [],
        loading: false,
        savePreference: vi.fn(),
        updateMemberAuthorization: vi.fn(),
        refetch: vi.fn(),
      });

      render(
        <UserPreferencesTab
          workspaceId="ws-123"
          userId="user-normal"
          isOwner={false}
        />
      );

      expect(screen.getByText("Horário de Silêncio (Quiet Hours)")).toBeInTheDocument();
      expect(
        screen.getByText("Esta categoria é restrita exclusivamente ao proprietário do workspace.")
      ).toBeInTheDocument();
    });

    it("deve habilitar controles de ceo_executivo para o proprietário legítimo", () => {
      vi.spyOn(useNotifHook, "useNotificationPreferences").mockReturnValue({
        preferences: [],
        loading: false,
        savePreference: vi.fn(),
        updateMemberAuthorization: vi.fn(),
        refetch: vi.fn(),
      });

      render(
        <UserPreferencesTab
          workspaceId="ws-123"
          userId="user-owner"
          isOwner={true}
        />
      );

      expect(
        screen.queryByText("Esta categoria é restrita exclusivamente ao proprietário do workspace.")
      ).not.toBeInTheDocument();
      expect(screen.getByText("Inteligência Estratégica CEO")).toBeInTheDocument();
    });

    it("deve indicar bloqueio visual quando o gestor desautoriza um canal (autorizado = false)", () => {
      vi.spyOn(useNotifHook, "useNotificationPreferences").mockReturnValue({
        preferences: [
          {
            id: "p1",
            workspace_id: "ws-123",
            user_id: "user-normal",
            categoria: "financeiro",
            canal: "telegram",
            habilitado: true,
            autorizado: false, // Bloqueado pelo gestor
            prioridade_minima: "normal",
            horario_silencio_inicio: "22:00",
            horario_silencio_fim: "07:00",
            fuso_horario: "America/Sao_Paulo",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        loading: false,
        savePreference: vi.fn(),
        updateMemberAuthorization: vi.fn(),
        refetch: vi.fn(),
      });

      render(
        <UserPreferencesTab
          workspaceId="ws-123"
          userId="user-normal"
          isOwner={false}
        />
      );

      expect(screen.getByText("Bloqueado pelo Gestor")).toBeInTheDocument();
    });
  });

  describe("2. TeamPermissionsTab (Painel Administrativo da Equipe)", () => {
    it("deve impedir concessão de ceo_executivo para qualquer membro da equipe", async () => {
      vi.spyOn(useNotifHook, "useNotificationPreferences").mockReturnValue({
        preferences: [],
        loading: false,
        savePreference: vi.fn(),
        updateMemberAuthorization: vi.fn(),
        refetch: vi.fn(),
      });

      renderWithProviders(
        <TeamPermissionsTab
          workspaceId="ws-123"
          ownerUserId="user-owner-real"
        />
      );

      // Membro não dono selecionado
      const blockedMessage = await screen.findByText(
        "Membros da equipe não podem receber notificações estratégicas do Wallet CEO."
      );
      expect(blockedMessage).toBeInTheDocument();
    });
  });
});
