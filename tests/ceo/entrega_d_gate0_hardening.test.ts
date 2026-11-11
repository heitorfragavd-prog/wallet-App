import { describe, it, expect, vi } from "vitest";
import {
  fetchAndExecuteInventorySpecialist,
  fetchAndExecuteRhSpecialist,
} from "../../supabase/functions/_shared/ai/specialist-router";
import { createFinancialRepository } from "../../supabase/functions/_shared/ai/financial-repository";
import { executeExecutiveReportWorkflow } from "../../supabase/functions/cron-relatorio-executivo/index";
import type { FinancialQueryRepository } from "../../supabase/functions/_shared/ai/query-tools";
import type { AiExecutionContext } from "../../supabase/functions/_shared/ai/auth";

describe("Etapa 07 — Entrega D — Gate 0 & Gate 6: Hardening de Estoque, CMV, RH e Cron", () => {
  const wsId = "11111111-1111-4111-8111-111111111111";
  const ownerCtx: AiExecutionContext = {
    userId: "owner-uuid",
    workspaceId: wsId,
    role: "owner",
    isOwner: true,
  };

  function createBaseRepo(overrides: Partial<FinancialQueryRepository> = {}): FinancialQueryRepository {
    return {
      listRevenues: vi.fn().mockResolvedValue([]),
      listExpenses: vi.fn().mockResolvedValue([]),
      listTransactions: vi.fn().mockResolvedValue([]),
      listBalances: vi.fn().mockResolvedValue([]),
      listDebts: vi.fn().mockResolvedValue([]),
      listSalesPDV: vi.fn().mockResolvedValue([]),
      listInventoryItems: vi.fn().mockResolvedValue([]),
      listRecipeCards: vi.fn().mockResolvedValue([]),
      listSalesPdvDetails: vi.fn().mockResolvedValue([]),
      listEmployees: vi.fn().mockResolvedValue([]),
      listEmployeeSchedules: vi.fn().mockResolvedValue([]),
      listEmployeePayments: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
  }

  describe("Gate 0.1 — Referências reais de Estoque e Fornecedores", () => {
    it("não deve inventar estoque ideal (10) nem 'Distribuidor Padrão' quando faltam referências", async () => {
      const repo = createBaseRepo({
        listInventoryItems: vi.fn().mockResolvedValue([
          {
            id: "prod-1",
            workspaceId: wsId,
            codigo: "P01",
            descricao: "Suco Natural Laranja 300ml",
            categoria: "Bebidas",
            precoVenda: 9,
            custoAtual: 0,
            estoqueAtual: 0,
            estoqueMinimo: 0,
            estoqueIdeal: 0,
            unidadeMedida: "UN",
            multiploCompra: 1,
            fornecedorPadrao: null,
            margemRealPercentual: 0,
            ativo: true,
            estoqueInformado: true,
            custoInformado: false,
            estoqueMinimoInformado: false,
            estoqueIdealInformado: false,
          },
        ]),
      });

      const res = await fetchAndExecuteInventorySpecialist(
        "Quais produtos preciso comprar hoje?",
        ownerCtx,
        repo,
        new Date("2026-11-11T15:00:00Z")
      );

      expect(res.handled).toBe(true);
      expect(res.answer).not.toContain("Distribuidor Padrão");
      expect(res.answer).not.toContain("Comprar *10 UN*");
      expect(res.answer).toContain("Produtos sem Referência Suficiente");
      expect(res.answer).toContain("estoque mínimo não cadastrado");
      expect(res.answer).toContain("fornecedor não cadastrado");
    });

    it("deve calcular apenas reposição estimada para o mínimo quando ideal não está cadastrado", async () => {
      const repo = createBaseRepo({
        listInventoryItems: vi.fn().mockResolvedValue([
          {
            id: "prod-2",
            workspaceId: wsId,
            codigo: "P02",
            descricao: "Água com Gás 500ml",
            categoria: "Bebidas",
            precoVenda: 5,
            custoAtual: 1.5,
            estoqueAtual: 4,
            estoqueMinimo: 12,
            estoqueIdeal: 0,
            unidadeMedida: "UN",
            multiploCompra: 6,
            fornecedorPadrao: null,
            margemRealPercentual: 70,
            ativo: true,
            estoqueInformado: true,
            custoInformado: true,
            estoqueMinimoInformado: true,
            estoqueIdealInformado: false,
          },
        ]),
      });

      const res = await fetchAndExecuteInventorySpecialist(
        "Quais produtos preciso comprar hoje?",
        ownerCtx,
        repo,
        new Date("2026-11-11T15:00:00Z")
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Fornecedor: Fornecedor não cadastrado");
      expect(res.answer).toContain("Reposição estimada: *12 UN*"); // ceil((12-4)/6)*6 = 12, não inventa 24 (12*2)
      expect(res.answer).toContain("Ideal não cadastrado");
      expect(res.answer).not.toContain("Distribuidor Padrão");
    });

    it("deve distinguir estoque não informado de estoque zerado no repositório real", async () => {
      const repo = createFinancialRepository(async ({ table }) => {
        if (table === "produtos_eyemobile") {
          return [
            {
              id: "prod-null",
              workspace_id: wsId,
              codigo: "PN1",
              descricao: "Produto Sem Inventário",
              categoria: "Geral",
              preco_venda: 10,
              custo_atual: null,
              estoque_atual: null,
              estoque_minimo: null,
              estoque_ideal: null,
              unidade_medida: null,
              multiplo_compra: null,
              fornecedor_padrao: null,
              margem_real_percentual: null,
              ativo: true,
            },
          ];
        }
        return [];
      });

      const items = await repo.listInventoryItems!(ownerCtx);
      expect(items[0].estoqueInformado).toBe(false);
      expect(items[0].estoqueMinimoInformado).toBe(false);
      expect(items[0].estoqueIdealInformado).toBe(false);

      const res = await fetchAndExecuteInventorySpecialist(
        "Quais itens estão abaixo do estoque mínimo?",
        ownerCtx,
        repo,
        new Date("2026-11-11T15:00:00Z")
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("estoque atual não informado");
      expect(res.answer).not.toContain("ESTOQUE ZERADO");
    });
  });

  describe("Gate 0.2 — Separação estrita entre Custo Teórico de Ficha e CMV Efetivo", () => {
    it("nunca deve afirmar CMV efetivo confirmado apenas a partir de fichas técnicas de catálogo", async () => {
      const repo = createBaseRepo({
        listRecipeCards: vi.fn().mockResolvedValue([
          {
            id: "rec-1",
            workspaceId: wsId,
            nome: "Expresso Duplo",
            precoVenda: 10,
            custoTotal: 3,
            margemPercentual: 70,
            statusMargem: "saudavel",
            statusFicha: "comprovada",
            qtdInsumos: 2,
            qtdInsumosSemCusto: 0,
            ativo: true,
          },
          {
            id: "rec-2",
            workspaceId: wsId,
            nome: "Misto Quente",
            precoVenda: 15,
            custoTotal: 5,
            margemPercentual: 66.7,
            statusMargem: "saudavel",
            statusFicha: "comprovada",
            qtdInsumos: 3,
            qtdInsumosSemCusto: 0,
            ativo: true,
          },
        ]),
      });

      const res = await fetchAndExecuteInventorySpecialist(
        "Qual é meu CMV?",
        ownerCtx,
        repo,
        new Date("2026-11-11T15:00:00Z")
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Custo Teórico por Fichas Técnicas (CMV Efetivo Indisponível)");
      expect(res.answer).toContain("Custo Teórico de Catálogo (Fichas Técnicas):* *32.0%*");
      expect(res.answer).toContain("CMV Real / Efetivo Contábil:* *Indisponível para confirmação*");
      expect(res.answer).not.toContain("Apurado a partir do custo total das mercadorias vendidas e compras escrituradas");
    });
  });

  describe("Gate 0.3 — Auditoria criteriosa de duplicidade de pagamentos no RH", () => {
    const fixedNow = new Date("2026-11-11T15:00:00Z");

    it("não deve gerar falso positivo para colaboradores distintos recebendo o mesmo valor sem acertoId", async () => {
      const repo = createBaseRepo({
        listEmployees: vi.fn().mockResolvedValue([
          {
            id: "emp-1",
            workspaceId: wsId,
            nome: "Ana Paula",
            cargo: "Atendente",
            tipo: "clt",
            status: "ativo",
            salarioBruto: 2000,
            valeTransporte: 200,
            valeRefeicao: 300,
            diaPagamento: 5,
            valorDiaria: 0,
            dataAdmissao: "2026-01-10",
          },
          {
            id: "emp-2",
            workspaceId: wsId,
            nome: "Bruno Lima",
            cargo: "Atendente",
            tipo: "clt",
            status: "ativo",
            salarioBruto: 2000,
            valeTransporte: 200,
            valeRefeicao: 300,
            diaPagamento: 5,
            valorDiaria: 0,
            dataAdmissao: "2026-02-01",
          },
        ]),
        listEmployeePayments: vi.fn().mockResolvedValue([
          {
            id: "pay-ana",
            workspaceId: wsId,
            acertoId: null,
            colaboradorId: "emp-1",
            valor: 150,
            status: "pago",
            origem: "Adiantamento",
            paidAt: "2026-11-05T14:00:00Z",
            createdAt: "2026-11-05T14:00:00Z",
          },
          {
            id: "pay-bruno",
            workspaceId: wsId,
            acertoId: null,
            colaboradorId: "emp-2",
            valor: 150,
            status: "pago",
            origem: "Adiantamento",
            paidAt: "2026-11-05T14:05:00Z",
            createdAt: "2026-11-05T14:05:00Z",
          },
        ]),
      });

      const res = await fetchAndExecuteRhSpecialist(
        "Existem pagamentos duplicados de colaboradores?",
        ownerCtx,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Nenhum pagamento duplicado ou inconsistente identificado");
    });

    it("não deve confundir pagamentos do mesmo colaborador em competências/datas diferentes com duplicidade", async () => {
      const repo = createBaseRepo({
        listEmployees: vi.fn().mockResolvedValue([
          {
            id: "emp-1",
            workspaceId: wsId,
            nome: "Ana Paula",
            cargo: "Barista",
            tipo: "freelancer",
            status: "ativo",
            salarioBruto: 0,
            valeTransporte: 0,
            valeRefeicao: 0,
            diaPagamento: null,
            valorDiaria: 180,
            dataAdmissao: "2026-01-10",
          },
        ]),
        listEmployeePayments: vi.fn().mockResolvedValue([
          {
            id: "pay-sem1",
            workspaceId: wsId,
            acertoId: "acerto-sem1",
            colaboradorId: "emp-1",
            competenciaInicio: "2026-10-26",
            competenciaFim: "2026-11-01",
            valor: 540,
            status: "pago",
            origem: "Acerto semanal",
            paidAt: "2026-11-02T12:00:00Z",
            createdAt: "2026-11-02T12:00:00Z",
          },
          {
            id: "pay-sem2",
            workspaceId: wsId,
            acertoId: "acerto-sem2",
            colaboradorId: "emp-1",
            competenciaInicio: "2026-11-02",
            competenciaFim: "2026-11-08",
            valor: 540,
            status: "pago",
            origem: "Acerto semanal",
            paidAt: "2026-11-09T12:00:00Z",
            createdAt: "2026-11-09T12:00:00Z",
          },
        ]),
      });

      const res = await fetchAndExecuteRhSpecialist(
        "Existem pagamentos duplicados de colaboradores?",
        ownerCtx,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("Nenhum pagamento duplicado ou inconsistente identificado");
    });

    it("deve ignorar pagamentos cancelados/estornados e distinguir possível duplicidade do mesmo colaborador no mesmo dia", async () => {
      const repo = createBaseRepo({
        listEmployees: vi.fn().mockResolvedValue([
          {
            id: "emp-1",
            workspaceId: wsId,
            nome: "Carlos Silva",
            cargo: "Chapeiro",
            tipo: "clt",
            status: "ativo",
            salarioBruto: 2200,
            valeTransporte: 200,
            valeRefeicao: 300,
            diaPagamento: 5,
            valorDiaria: 0,
            dataAdmissao: "2026-01-10",
          },
        ]),
        listEmployeePayments: vi.fn().mockResolvedValue([
          {
            id: "pay-dup-a",
            workspaceId: wsId,
            acertoId: "acerto-a",
            colaboradorId: "emp-1",
            valor: 250,
            status: "pago",
            origem: "Bonificação",
            paidAt: "2026-11-08T10:00:00Z",
            createdAt: "2026-11-08T10:00:00Z",
          },
          {
            id: "pay-dup-b",
            workspaceId: wsId,
            acertoId: "acerto-b",
            colaboradorId: "emp-1",
            valor: 250,
            status: "pago",
            origem: "Bonificação",
            paidAt: "2026-11-08T10:03:00Z",
            createdAt: "2026-11-08T10:03:00Z",
          },
          {
            id: "pay-canceled",
            workspaceId: wsId,
            acertoId: "acerto-a",
            colaboradorId: "emp-1",
            valor: 250,
            status: "cancelado",
            origem: "Bonificação",
            paidAt: null,
            createdAt: "2026-11-08T09:58:00Z",
          },
        ]),
      });

      const res = await fetchAndExecuteRhSpecialist(
        "Existem pagamentos duplicados de colaboradores?",
        ownerCtx,
        repo,
        fixedNow
      );

      expect(res.handled).toBe(true);
      expect(res.answer).toContain("[Possível Duplicidade p/ Conferência]");
      expect(res.answer).toContain("Carlos Silva");
      expect(res.answer).toContain("2 lançamentos de R$ 250.00");
    });
  });

  describe("Gate 6 — Cron 10h: fallback seguro para telegram_usuarios", () => {
    it("deve reconhecer chat Telegram vinculado em telegram_usuarios quando telegram_config estiver ausente", async () => {
      const dispatchSpy = vi.fn().mockResolvedValue({
        data: { entregas: [{ channel: "app", delivered: true }, { channel: "telegram", delivered: true }] },
        error: null,
      });

      const buildChain = (table: string) => {
        const state: { filters: Record<string, unknown> } = { filters: {} };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn((col: string, val: unknown) => {
          state.filters[col] = val;
          return chain;
        });
        chain.gte = vi.fn().mockReturnValue(chain);
        chain.lte = vi.fn().mockReturnValue(chain);
        chain.gt = vi.fn().mockReturnValue(chain);
        chain.lt = vi.fn().mockReturnValue(chain);
        chain.neq = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.is = vi.fn().mockReturnValue(chain);
        chain.not = vi.fn().mockReturnValue(chain);
        chain.like = vi.fn().mockReturnValue(chain);
        chain.ilike = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.insert = vi.fn().mockReturnValue(chain);
        chain.upsert = vi.fn().mockReturnValue(chain);
        chain.update = vi.fn().mockReturnValue(chain);
        chain.maybeSingle = vi.fn(async () => {
          if (table === "telegram_config") {
            return { data: null, error: { message: "relation telegram_config does not exist" } };
          }
          if (table === "telegram_usuarios") {
            return { data: { telegram_chat_id: "5646529285" }, error: null };
          }
          if (table === "ceo_executive_reports") {
            return { data: null, error: null };
          }
          return { data: null, error: null };
        });
        chain.single = vi.fn(async () => ({ data: { id: "rep-123" }, error: null }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chain.then = (resolve: (val: any) => void) => {
          if (table === "user_notification_preferences") {
            resolve({ data: [], error: null });
            return;
          }
          resolve({ data: [], error: null });
        };
        return chain;
      };

      const supabaseAdminMock = {
        from: vi.fn((table: string) => buildChain(table)),
        functions: { invoke: dispatchSpy },
      };

      const res = await executeExecutiveReportWorkflow(supabaseAdminMock, {
        workspaceId: wsId,
        ownerId: "owner-uuid",
        ownerName: "Heitor",
        referenceDate: "2026-11-11",
      });

      expect(res.notified).toBe(true);
      expect(res.dispatchDetails?.telegram).toBe(true);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
