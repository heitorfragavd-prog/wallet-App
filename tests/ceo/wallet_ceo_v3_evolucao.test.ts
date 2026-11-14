// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  parseDateToNoonUtc,
  calculateGoalPacing,
  computeRealizedValueFromRecords,
} from '../../src/domains/ceo/services/CeoGoalsEngine';
import { buildWalletCeoPrompt } from '../../supabase/functions/_shared/ai/orchestrator-core';
import { BusinessGoal } from '../../src/domains/ceo/types';

describe('👑 Wallet CEO 3.0 — Missão de Evolução (Gates 1 a 5)', () => {
  describe('Gate 1: Resiliência e Blindagem de Metas e Desempenho', () => {
    it('deve lidar seguramente com parâmetros nulos, vazios ou indefinidos em parseDateToNoonUtc', () => {
      // @ts-expect-error teste de robustez contra valores nulos em tempo de execução
      expect(parseDateToNoonUtc(null)).toBeInstanceOf(Date);
      // @ts-expect-error teste de robustez contra valores indefinidos em tempo de execução
      expect(parseDateToNoonUtc(undefined)).toBeInstanceOf(Date);
      expect(parseDateToNoonUtc('')).toBeInstanceOf(Date);
      expect(parseDateToNoonUtc('invalid-date')).toBeInstanceOf(Date);
      expect(parseDateToNoonUtc('2026-11-14').getUTCDate()).toBe(14);
    });

    it('deve calcular o ritmo da meta sem quebrar por divisão por zero ou alvos zerados', () => {
      const mockGoal: BusinessGoal = {
        id: 'meta-teste-1',
        workspace_id: 'ws-rodo-point',
        periodo_tipo: 'mensal',
        indicador: 'faturamento',
        data_inicio: '2026-11-01',
        data_fim: '2026-11-30',
        valor_alvo: 0,
        status: 'ativa',
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-01T00:00:00Z',
      };

      const pacingZeroTarget = calculateGoalPacing({
        goal: mockGoal,
        currentValue: 1500,
        referenceDate: new Date('2026-11-15T12:00:00Z'),
      });

      expect(pacingZeroTarget.percentual_atingido).toBe(0);
      expect(Number.isFinite(pacingZeroTarget.projecao_linear)).toBe(true);
      expect(Number.isFinite(pacingZeroTarget.valor_restante)).toBe(true);
    });

    it('deve suportar chamadas com coleções nulas ou vazias em computeRealizedValueFromRecords', () => {
      const mockGoal: BusinessGoal = {
        id: 'meta-teste-2',
        workspace_id: 'ws-rodo-point',
        periodo_tipo: 'mensal',
        indicador: 'faturamento',
        data_inicio: '2026-11-01',
        data_fim: '2026-11-30',
        valor_alvo: 100000,
        status: 'ativa',
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-01T00:00:00Z',
      };

      const res = computeRealizedValueFromRecords({
        goal: mockGoal,
        sales: undefined,
        expenses: null,
      });

      expect(res).toBe(0);

      const mockGoalLucro: BusinessGoal = {
        ...mockGoal,
        indicador: 'resultado_operacional',
      };

      const resLucro = computeRealizedValueFromRecords({
        goal: mockGoalLucro,
        sales: [],
        expenses: null,
      });

      expect(resLucro).toBe(0);
    });
  });

  describe('Gate 3 & Gate 5: Prompt do Parceiro CEO e Conciliação Caixa vs Competência', () => {
    it('deve conter as instruções de parceiro de gestão próximo, acessível e sem jargões corporativos', () => {
      const prompt = buildWalletCeoPrompt({
        workspaceId: 'ws-rodo-point',
        workspaceName: 'Rodo Point',
        userRole: 'owner',
        userName: 'Heitor',
        conversationHistory: '',
      });

      // Verifica elementos da nova persona de parceiro de gestão
      expect(prompt).toContain('PARCEIRO DE GESTÃO');
      expect(prompt).toContain('Fala meu amigo!');
      expect(prompt).toContain('Como estamos hoje?');
      expect(prompt).toContain('Evite tom robótico ou excessivamente burocrático');
      expect(prompt).toContain('amigável, direto ao ponto, próximo');
    });

    it('deve conter as regras canônicas de reconciliação entre Caixa Realizado e DRE de Competência', () => {
      const prompt = buildWalletCeoPrompt({
        workspaceId: 'ws-rodo-point',
        workspaceName: 'Rodo Point',
        userRole: 'owner',
        userName: 'Heitor',
        conversationHistory: '',
      });

      // Verifica que o prompt instrui a IA a explicar a diferença de R$ 3.047,18 vs -R$ 28.088,64
      expect(prompt).toContain('RESULTADO DE CAIXA REALIZADO');
      expect(prompt).toContain('LUCRO LÍQUIDO / DRE POR COMPETÊNCIA');
      expect(prompt).toContain('3.047,18');
      expect(prompt).toContain('28.088,64');
      expect(prompt).toContain('NUNCA considere isso um erro ou contradição');
    });
  });

  describe('Gate 2 & Gate 4: Identidade Canônica do Wallet CEO', () => {
    it('deve preservar a coordenação executiva e o cérebro estratégico', () => {
      const prompt = buildWalletCeoPrompt({
        workspaceId: 'ws-rodo-point',
        workspaceName: 'Rodo Point',
        userRole: 'owner',
        userName: 'Heitor',
        conversationHistory: '',
      });

      expect(prompt).toContain('WALLET CEO 3.0 — Cérebro Executivo e Estratégico');
      expect(prompt).toContain('Comercial & Crescimento');
    });
  });
});
