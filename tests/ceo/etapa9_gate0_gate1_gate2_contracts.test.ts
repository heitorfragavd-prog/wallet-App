import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CeoIntelligenceEngine } from '@/domains/ceo/services/CeoIntelligenceEngine';
import { CeoRepository } from '@/domains/ceo/services/CeoRepository';
import { CommercialExperiment } from '@/domains/ceo/types';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

describe('ETAPA 09 — PR A: Auditoria e Contratos de Metas Empresariais (Gates 0, 1 e 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Gate 0: Verificações Financeiras e Integridade de Vendas', () => {
    it('1. CeoIntelligenceEngine não trata custos desconhecidos como zero na medição de margem', () => {
      const exp: CommercialExperiment = {
        id: 'exp-margin-test',
        workspace_id: 'ws-1',
        hypothesis: 'Aumento de margem',
        start_date: '2026-11-01',
        status: 'em_andamento',
        target_kpi: 'Margem Operacional',
        baseline_value: 40.0,
      };

      // Vendas com receita mas SEM custo cadastrado
      const salesWithoutCost = [
        { valor: 100.0, data: '2026-11-01T10:00:00Z', tipo: 'receita' },
        { valor: 150.0, data: '2026-11-02T10:00:00Z', tipo: 'receita' },
        { valor: 200.0, data: '2026-11-03T10:00:00Z', tipo: 'receita' },
      ];

      const res = CeoIntelligenceEngine.measureExperimentFromSales({
        experiment: exp,
        sales: salesWithoutCost,
        baselineDailyAverage: 40.0,
      });

      // Não pode inventar 100% de margem!
      expect(res.measurement.currentValue).toBe(0);
      expect(res.classification).toBe('dados_indisponiveis');
      expect(res.notes).toContain('sem fichas técnicas ou custos de mercadorias confirmados');
    });

    it('2. fetchSalesForExperiment exclui vendas canceladas e deduplica por deduplication_key e sale #ID', async () => {
      const mockRows = [
        {
          id: 'tx-1',
          valor: 100,
          data: '2026-11-01',
          status: 'concluida',
          cancelada: false,
          tipo: 'receita',
          deduplication_key: 'eyemobile:1001',
          descricao: 'Venda #1001',
        },
        {
          id: 'tx-2',
          valor: 100,
          data: '2026-11-01',
          status: 'concluida',
          cancelada: false,
          tipo: 'receita',
          deduplication_key: 'eyemobile:1001', // DUPLICADA!
          descricao: 'Venda #1001',
        },
        {
          id: 'tx-3',
          valor: 50,
          data: '2026-11-02',
          status: 'cancelada', // CANCELADA!
          cancelada: true,
          tipo: 'receita',
          descricao: 'Venda #1002',
        },
        {
          id: 'tx-4',
          valor: 80,
          data: '2026-11-03',
          status: 'concluida',
          cancelada: false,
          tipo: 'receita',
          descricao: 'Venda #1003',
        },
      ];

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      };

      (supabase.from as any).mockReturnValue(mockQueryBuilder);

      const sales = await CeoRepository.fetchSalesForExperiment('ws-1', '2026-11-01', '2026-11-03');

      // tx-2 (duplicada) e tx-3 (cancelada) devem ser ignoradas. Apenas tx-1 e tx-4 retornam!
      expect(sales.length).toBe(2);
      expect(sales[0].valor).toBe(100);
      expect(sales[1].valor).toBe(80);
    });
  });

  describe('Gate 1: Auditoria do Módulo de Metas Existente', () => {
    const migration5Path = path.resolve(__dirname, '../../supabase/migrations/5.metas.sql');
    const useMetasPath = path.resolve(__dirname, '../../src/domains/finance/hooks/useMetas.ts');

    it('preserva a migration 5.metas.sql e identifica escopo pessoal', () => {
      expect(fs.existsSync(migration5Path)).toBe(true);
      const sql = fs.readFileSync(migration5Path, 'utf8');

      // Tabela de metas pessoais vinculada diretamente a user_id
      expect(sql).toContain('CREATE TABLE public.metas');
      expect(sql).toContain('user_id UUID NOT NULL');
      expect(sql).toContain("tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('economia', 'receita', 'despesa', 'investimento'))");
      // Não possui workspace_id nas metas pessoais
      expect(sql).not.toContain('workspace_id UUID');
    });

    it('o hook useMetas opera sobre finanças pessoais sem misturar workspaces', () => {
      expect(fs.existsSync(useMetasPath)).toBe(true);
      const code = fs.readFileSync(useMetasPath, 'utf8');

      expect(code).toContain('export interface Meta');
      expect(code).toContain('economia');
      expect(code).toContain('investimento');
    });
  });

  describe('Gate 2: Contratos e Schema de Metas Empresariais (Migration 92)', () => {
    const migration92Path = path.resolve(
      __dirname,
      '../../supabase/migrations/92_wallet_business_goals_schema.sql'
    );
    const rollback92Path = path.resolve(
      __dirname,
      '../../supabase/migrations/rollback/92_wallet_business_goals_schema.down.sql'
    );

    it('os arquivos de migration e rollback 92 existem', () => {
      expect(fs.existsSync(migration92Path)).toBe(true);
      expect(fs.existsSync(rollback92Path)).toBe(true);
    });

    it('a migration 92 cria a tabela wallet_business_goals com os 8 indicadores oficiais', () => {
      const sql = fs.readFileSync(migration92Path, 'utf8');

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.wallet_business_goals');
      expect(sql).toContain('workspace_id UUID NOT NULL REFERENCES public.workspaces');
      expect(sql).toContain("'faturamento'");
      expect(sql).toContain("'pedidos'");
      expect(sql).toContain("'ticket_medio'");
      expect(sql).toContain("'despesas'");
      expect(sql).toContain("'resultado_operacional'");
      expect(sql).toContain("'margem'");
      expect(sql).toContain("'produto_categoria'");
      expect(sql).toContain("'combos'");
    });

    it('a migration 92 suporta periodicidade semanal e mensal com integridade de datas', () => {
      const sql = fs.readFileSync(migration92Path, 'utf8');

      expect(sql).toContain("CHECK (periodo_tipo IN ('semanal', 'mensal'))");
      expect(sql).toContain('wallet_business_goals_dates_check CHECK (data_fim >= data_inicio)');
      expect(sql).toContain("CHECK (unidade IN ('BRL', 'quantidade', 'percentual'))");
    });

    it('a migration 92 blinda a governança com trigger e RLS exigindo prerrogativa executiva', () => {
      const sql = fs.readFileSync(migration92Path, 'utf8');

      expect(sql).toContain('validar_wallet_business_goals_governance');
      expect(sql).toContain('public.tem_acesso_executivo_proprietario(NEW.workspace_id)');
      expect(sql).toContain('não é permitido alterar o workspace_id de uma meta empresarial');
      expect(sql).toContain('wallet_business_goals_select');
      expect(sql).toContain('wallet_business_goals_insert');
      expect(sql).toContain('wallet_business_goals_update');
      expect(sql).toContain('wallet_business_goals_delete');
    });
  });
});
