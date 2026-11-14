import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveTurnoOperacionalDetalhado,
  buildFolguistaConfirmationMessage,
} from "../../supabase/functions/_shared/ai/folguista-fechamento-engine";
import {
  vincularTelegramColaboradorSeguro,
  desvincularTelegramColaboradorSeguro,
} from "../../src/domains/conversas/services/folguistasIdentidadeService";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;

describe("Etapa 3E-A — Resolução de Turnos Operacionais e Identidade Segura", () => {
  describe("Gate 3 — Resolução de Turnos Operacionais (Janela de Sobreposição e Madrugada)", () => {
    it("deve priorizar a escala ativa do colaborador sobre qualquer horário ou legenda", () => {
      // Sábado 13h15 (janela de sobreposição), mas colaborador tem escala da manhã
      const dateSabado1315 = new Date("2026-11-21T13:15:00-03:00");
      const res = resolveTurnoOperacionalDetalhado({
        escala: { id: "esc-1", data: "2026-11-21", turno: "manha" },
        horaEnvio: dateSabado1315,
        captionOuTexto: "fechamento noite", // legenda tenta forçar noite, mas escala manda
      });

      expect(res.turno).toBe("manha");
      expect(res.isAmbiguo).toBe(false);
      expect(res.origemDecisao).toBe("escala");
      expect(res.dataOperacionalEfetiva).toBe("2026-11-21");
    });

    it("deve identificar o turno por menção explícita na legenda/relatório na ausência de escala", () => {
      const dateSabado1340 = new Date("2026-11-21T13:40:00-03:00");
      const res = resolveTurnoOperacionalDetalhado({
        horaEnvio: dateSabado1340,
        captionOuTexto: "Fechamento 1º turno - Abertura da loja",
      });

      expect(res.turno).toBe("manha");
      expect(res.isAmbiguo).toBe(false);
      expect(res.origemDecisao).toBe("legenda_ou_relatorio");
    });

    it("deve classificar como 'ambiguo_transicao' no fim de semana entre 13h00 e 14h30 sem escala nem indicação explícita", () => {
      const dateSabado1330 = new Date("2026-11-21T13:30:00-03:00");
      const res = resolveTurnoOperacionalDetalhado({
        horaEnvio: dateSabado1330,
        captionOuTexto: "Segue foto do caixa",
      });

      expect(res.turno).toBe("ambiguo_transicao");
      expect(res.isAmbiguo).toBe(true);
      expect(res.origemDecisao).toBe("horario_operacional");
      expect(res.motivoAmbiguidade).toContain("janela de sobreposição 13h00 às 14h30");
    });

    it("deve classificar como 'manha' no fim de semana antes das 13h00", () => {
      const dateSabado1100 = new Date("2026-11-21T11:00:00-03:00");
      const res = resolveTurnoOperacionalDetalhado({
        horaEnvio: dateSabado1100,
      });

      expect(res.turno).toBe("manha");
      expect(res.isAmbiguo).toBe(false);
      expect(res.origemDecisao).toBe("horario_operacional");
    });

    it("deve classificar como 'noite' no fim de semana após as 14h30", () => {
      const dateSabado1500 = new Date("2026-11-21T15:00:00-03:00");
      const res = resolveTurnoOperacionalDetalhado({
        horaEnvio: dateSabado1500,
      });

      expect(res.turno).toBe("noite");
      expect(res.isAmbiguo).toBe(false);
      expect(res.origemDecisao).toBe("horario_operacional");
    });

    it("deve classificar como 'noite' na madrugada (00h00 às 04h59) retroagindo a data operacional para o dia anterior", () => {
      // Domingo 01h30 da manhã (expediente de Sábado à noite)
      const dateDomingo0130 = new Date("2026-11-22T01:30:00-03:00");
      const res = resolveTurnoOperacionalDetalhado({
        horaEnvio: dateDomingo0130,
      });

      expect(res.turno).toBe("noite");
      expect(res.isAmbiguo).toBe(false);
      expect(res.origemDecisao).toBe("madrugada_expediente_anterior");
      expect(res.dataOperacionalEfetiva).toBe("2026-11-21"); // Sábado
    });

    it("deve respeitar a regra padrão de corte às 13h30 em dias úteis", () => {
      const dateQuarta1100 = new Date("2026-11-18T11:00:00-03:00");
      const dateQuarta1600 = new Date("2026-11-18T16:00:00-03:00");

      const resManha = resolveTurnoOperacionalDetalhado({ horaEnvio: dateQuarta1100 });
      const resNoite = resolveTurnoOperacionalDetalhado({ horaEnvio: dateQuarta1600 });

      expect(resManha.turno).toBe("manha");
      expect(resNoite.turno).toBe("noite");
    });
  });

  describe("Mensagem de Confirmação do Folguista e Ambiguidade", () => {
    it("deve adicionar o alerta pedagógico se o envio for na janela ambígua de sobreposição", () => {
      const msg = buildFolguistaConfirmationMessage({
        nomeColaborador: "João Folguista",
        dataFechamento: "21/11/2026",
        turno: "ambiguo_transicao",
        totalFotos: 2,
        isAmbiguo: true,
      });

      expect(msg).toContain("sobreposição de turnos (13h00 às 14h30)");
      expect(msg).toContain('confirmar respondendo com "Manhã" ou "Noite"');
      expect(msg).not.toContain("R$"); // Preserva sigilo financeiro
    });
  });

  describe("Gate 4 — Procedimento Administrativo Seguro de Vinculação do Telegram", () => {
    const mockWorkspaceId = "ws-test-123";
    const mockAdminUserId = "usr-admin-999";
    const mockColabId = "colab-001";
    const mockTelegramUserId = 123456789;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("deve rejeitar se o solicitante não for administrador do workspace", async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { role: "member", active: true },
          error: null,
        }),
      });

      await expect(
        vincularTelegramColaboradorSeguro({
          workspaceId: mockWorkspaceId,
          colaboradorId: mockColabId,
          telegramUserId: mockTelegramUserId,
          adminUserId: mockAdminUserId,
        })
      ).rejects.toThrow("apenas administradores podem vincular identificadores de Telegram");
    });

    it("deve impedir vincular um telegram_user_id se ele já pertencer a outro colaborador no mesmo workspace", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "workspace_members") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: "owner", active: true },
              error: null,
            }),
          };
        }
        if (table === "colaboradores") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "outro-colab-456", nome: "Maria Silva" },
              error: null,
            }),
          };
        }
        return {};
      });

      await expect(
        vincularTelegramColaboradorSeguro({
          workspaceId: mockWorkspaceId,
          colaboradorId: mockColabId,
          telegramUserId: mockTelegramUserId,
          adminUserId: mockAdminUserId,
        })
      ).rejects.toThrow('já está vinculado ao colaborador "Maria Silva"');
    });

    it("deve vincular com sucesso e reconciliar fechamentos anteriores com identidade pendente", async () => {
      const updateColabSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const updateFechSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "workspace_members") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: "admin", active: true },
              error: null,
            }),
          };
        }
        if (table === "colaboradores") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null, // sem colisão
              error: null,
            }),
            update: updateColabSpy,
          };
        }
        if (table === "fechamentos_caixa") {
          const fakeQuery: Record<string, unknown> = {};
          fakeQuery.select = vi.fn().mockReturnValue(fakeQuery);
          fakeQuery.eq = vi.fn().mockImplementation((col: string) => {
            if (col === "identidade_pendente") {
              return Promise.resolve({
                data: [
                  {
                    id: "fech-1",
                    chave_operacional: `ws_2026-11-21_pendente_${mockTelegramUserId}_noite`,
                    data_fechamento: "21/11/2026",
                    turno: "noite",
                  },
                ],
                error: null,
              });
            }
            return fakeQuery;
          });
          fakeQuery.update = updateFechSpy;
          return fakeQuery;
        }
        return {};
      });

      const res = await vincularTelegramColaboradorSeguro({
        workspaceId: mockWorkspaceId,
        colaboradorId: mockColabId,
        telegramUserId: mockTelegramUserId,
        telegramUsername: "@joaofolguista",
        adminUserId: mockAdminUserId,
      });

      expect(res.success).toBe(true);
      expect(res.fechamentosReconciliados).toBe(1);
      expect(res.message).toContain("1 fechamento(s) pendente(s) reconciliado(s)");
      expect(updateColabSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          telegram_user_id: mockTelegramUserId,
          telegram_username: "joaofolguista",
        })
      );
    });

    it("deve desvincular o Telegram do colaborador com sucesso", async () => {
      const updateSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "workspace_members") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: "admin", active: true },
              error: null,
            }),
          };
        }
        if (table === "colaboradores") {
          return {
            update: updateSpy,
          };
        }
        return {};
      });

      const res = await desvincularTelegramColaboradorSeguro({
        workspaceId: mockWorkspaceId,
        colaboradorId: mockColabId,
        adminUserId: mockAdminUserId,
      });

      expect(res.success).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          telegram_user_id: null,
          telegram_username: null,
        })
      );
    });
  });
});
