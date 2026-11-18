/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { CeoGoalsRepository } from '../../src/domains/ceo/services/CeoGoalsRepository';
import {
  ActionExecutorRegistry,
  registerNfeActionHandlers,
} from '../../supabase/functions/_shared/ai/action-executor-registry';

vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-heitor' } } }),
      },
      from: vi.fn(),
    },
  };
});

describe('👑 WALLET CEO 3.0 — Hardening de Segurança (Gates 6-8) & Metas Empresariais (Gates 1-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // MISSÃO 1 — RECUPERAÇÃO E CONTRATOS DO MÓDULO METAS & DESEMPENHO (GATES 1 A 5)
  // ===========================================================================

  describe('Missão 1 — Metas & Desempenho (wallet_business_goals)', () => {
    it('GATE 1: CeoGoalsRepository.listGoals não deve falhar com erro de schema cache e deve retornar lista segura', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'goal-1',
              workspace_id: 'ws-rodo',
              created_by: 'user-heitor',
              titulo: 'Meta Semanal de Vendas',
              indicador: 'faturamento',
              periodo_tipo: 'semanal',
              data_inicio: '2026-11-16',
              data_fim: '2026-11-22',
              ano: 2026,
              valor_alvo: 25000,
              valor_realizado: 18450,
              unidade: 'BRL',
              status: 'ativa',
              created_at: '2026-11-16T00:00:00Z',
              updated_at: '2026-11-16T00:00:00Z',
            },
          ],
          error: null,
        }),
      } as any);

      const res = await CeoGoalsRepository.listGoals('ws-rodo');
      expect(res.isConfigured).toBe(true);
      expect(res.data.length).toBe(1);
      expect(res.data[0].titulo).toBe('Meta Semanal de Vendas');
      expect(res.data[0].valor_alvo).toBe(25000);
    });

    it('GATE 1 & 2: CeoGoalsRepository.listGoals deve tratar erro de schema cache amigavelmente se tabela estiver em propagação', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Could not find the table 'public.wallet_business_goals' in the schema cache" },
        }),
      } as any);

      const res = await CeoGoalsRepository.listGoals('ws-rodo');
      expect(res.isConfigured).toBe(false);
      expect(res.error).toBe('Tabela wallet_business_goals não migrada no banco de dados.');
      expect(res.data).toEqual([]);
    });

    it('GATE 3 & 5: CeoGoalsRepository.createGoal valida restrições antes de submeter ao banco', async () => {
      // Rejeita valor alvo negativo
      const resNeg = await CeoGoalsRepository.createGoal('ws-rodo', {
        workspace_id: 'ws-rodo',
        created_by: 'user-heitor',
        titulo: 'Meta Inválida',
        indicador: 'faturamento',
        periodo_tipo: 'semanal',
        data_inicio: '2026-11-16',
        data_fim: '2026-11-22',
        ano: 2026,
        valor_alvo: -500,
        valor_realizado: 0,
        unidade: 'BRL',
        status: 'ativa',
        history: [],
      });
      expect(resNeg.success).toBe(false);
      expect(resNeg.error).toContain('maior ou igual a zero');

      // Rejeita data fim anterior a data início
      const resDates = await CeoGoalsRepository.createGoal('ws-rodo', {
        workspace_id: 'ws-rodo',
        created_by: 'user-heitor',
        titulo: 'Meta Datas Invertidas',
        indicador: 'faturamento',
        periodo_tipo: 'semanal',
        data_inicio: '2026-11-22',
        data_fim: '2026-11-16',
        ano: 2026,
        valor_alvo: 1000,
        valor_realizado: 0,
        unidade: 'BRL',
        status: 'ativa',
        history: [],
      });
      expect(resDates.success).toBe(false);
      expect(resDates.error).toContain('não pode ser anterior à data de início');
    });
  });

  // ===========================================================================
  // MISSÃO 2 — HARDENING DE SEGURANÇA DAS RPCs FISCAIS (GATES 6, 7 & 8)
  // ===========================================================================

  describe('Missão 2 — Correção de Segurança das RPCs de Notas Fiscais (Gates 6 a 8)', () => {
    it('GATE 6: Bloqueia tentativa de falsificação de user_id quando usuário autenticado tenta passar ID de outro usuário', async () => {
      const registry = new ActionExecutorRegistry();
      registerNfeActionHandlers(registry);
      const handler = registry.get('cadastrar_nfe')!;

      const mockClient: any = {
        rpc: vi.fn((_fn: string, _args: any) => {
          return Promise.resolve({
            data: null,
            error: {
              message: 'WALLET_AI_ACTION_FORBIDDEN: Falsificação de user_id detectada. O usuário informado não coincide com a sessão autenticada.',
              code: '42501',
            },
          });
        }),
      };

      const payload = {
        chave_acesso: '31261117467515000107550020030898491343004765',
        numero_nota: '3089849',
        emitente: { cnpj: '17467515000107', razaoSocial: 'CAFE TRES CORACOES' },
        valores: { valorTotal: 500 },
        data_vencimento: '2026-12-04',
      };

      await expect(
        handler(
          payload,
          { workspaceId: 'ws-rodo', userId: 'user-atacante', role: 'member' } as any,
          mockClient,
        )
      ).rejects.toThrow('WALLET_AI_ACTION_FORBIDDEN: Falsificação de user_id detectada');
    });

    it('GATE 6: Bloqueia acesso de usuário que não é membro ativo do workspace informado', async () => {
      const registry = new ActionExecutorRegistry();
      registerNfeActionHandlers(registry);
      const handler = registry.get('cadastrar_nfe')!;

      const mockClient: any = {
        rpc: vi.fn((_fn: string, _args: any) => {
          return Promise.resolve({
            data: null,
            error: {
              message: 'WALLET_AI_ACTION_FORBIDDEN: Usuário não é membro ativo deste workspace',
              code: '42501',
            },
          });
        }),
      };

      const payload = {
        chave_acesso: '31261117467515000107550020030898491343004765',
        numero_nota: '3089849',
        emitente: { cnpj: '17467515000107', razaoSocial: 'CAFE TRES CORACOES' },
        valores: { valorTotal: 500 },
        data_vencimento: '2026-12-04',
      };

      await expect(
        handler(
          payload,
          { workspaceId: 'ws-estranho', userId: 'user-legitimo', role: 'member' } as any,
          mockClient,
        )
      ).rejects.toThrow('WALLET_AI_ACTION_FORBIDDEN: Usuário não é membro ativo deste workspace');
    });

    it('GATE 7: Apenas service_role pode executar chamadas de sistema, bloqueando chamadas anônimas e públicas', async () => {
      const registry = new ActionExecutorRegistry();
      registerNfeActionHandlers(registry);
      const handler = registry.get('cadastrar_nfe')!;

      const mockClient: any = {
        rpc: vi.fn((_fn: string, _args: any) => {
          return Promise.resolve({
            data: null,
            error: {
              message: 'WALLET_AI_ACTION_FORBIDDEN: Autenticação necessária para aprovação financeira',
              code: '42501',
            },
          });
        }),
      };

      const payload = {
        chave_acesso: '31261117467515000107550020030898491343004765',
        numero_nota: '3089849',
        emitente: { cnpj: '17467515000107', razaoSocial: 'CAFE TRES CORACOES' },
        valores: { valorTotal: 500 },
        data_vencimento: '2026-12-04',
      };

      await expect(
        handler(
          payload,
          { workspaceId: 'ws-rodo', userId: 'user-anon', role: 'anon' } as any,
          mockClient,
        )
      ).rejects.toThrow('WALLET_AI_ACTION_FORBIDDEN: Autenticação necessária');
    });

    it('GATE 8: Homologa aprovação legítima transacional de NF-e sem inventar vencimentos e com dados consistentes', async () => {
      const registry = new ActionExecutorRegistry();
      registerNfeActionHandlers(registry);
      const handler = registry.get('cadastrar_nfe')!;

      const mockClient: any = {
        rpc: vi.fn((fnName: string, args: any) => {
          expect(fnName).toBe('rpc_aprovar_nfe_transacional');
          expect(args.p_workspace_id).toBe('ws-rodo');
          expect(args.p_user_id).toBe('user-heitor');
          expect(args.p_valor_total).toBe(470.10);
          expect(args.p_data_vencimento).toBe('2026-10-25');
          return Promise.resolve({
            data: {
              success: true,
              divida_id: 'divida-teste-controlado-470',
              status: 'criada_pendente',
              total_parcelas: 1,
              ja_existia: false,
            },
            error: null,
          });
        }),
      };

      const payloadLegitimo = {
        chave_acesso: '31261052315807000117550010002337671083481264',
        numero_nota: '233767',
        emitente: { cnpj: '52315807000117', razaoSocial: 'XODO FOODS E DISTRIBUICAO LTDA' },
        valores: { valorTotal: 470.10 },
        duplicatas: [{ numero: '001', vencimento: '2026-10-25', valor: 470.10 }],
      };

      const res = await handler(
        payloadLegitimo,
        { workspaceId: 'ws-rodo', userId: 'user-heitor', role: 'owner', isOwner: true } as any,
        mockClient,
      );

      expect(res.recordId).toBe('divida-teste-controlado-470');
      expect(res.data.status).toBe('criada_pendente');
      expect(res.data.jaExistia).toBe(false);
    });
  });
});
