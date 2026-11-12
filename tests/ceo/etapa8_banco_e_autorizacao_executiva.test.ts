import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CeoRepository } from '@/domains/ceo/services/CeoRepository';

describe('ETAPA 08 — Gate 0 & Gate 1: Banco, RLS e Autorização Executiva Real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Gate 0: Auditoria e Validação da Migration 90', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../supabase/migrations/90_wallet_commercial_experiments_status_decision_and_rls.sql'
    );

    it('o arquivo da migration 90 existe e está localizado no diretório canônico', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('a migration 90 reconcilia as restrições CHECK de status permitindo "aprovado" e "approved"', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Verifica remoção e recriação da restrição de status
      expect(sql).toContain('wallet_commercial_experiments_status_check');
      expect(sql).toContain("'aprovado'");
      expect(sql).toContain("'approved'");
      expect(sql).toContain("'planejado'");
      expect(sql).toContain("'em_andamento'");
      expect(sql).toContain("'concluido'");
      expect(sql).toContain("'cancelado'");
    });

    it('a migration 90 reconcilia as restrições CHECK de decision permitindo decisões executivas oficiais', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Verifica restrição de decisão executiva
      expect(sql).toContain('wallet_commercial_experiments_decision_check');
      expect(sql).toContain("'pendente'");
      expect(sql).toContain("'aprovado'");
      expect(sql).toContain("'approved'");
      expect(sql).toContain("'rejeitado'");
      expect(sql).toContain("'manter'");
      expect(sql).toContain("'ampliar'");
      expect(sql).toContain("'ajustar'");
      expect(sql).toContain("'interromper'");
      expect(sql).toContain("'inconcluso'");
    });

    it('a migration 90 cria a função de segurança tem_acesso_executivo_proprietario', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.tem_acesso_executivo_proprietario');
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain("w.user_id = auth.uid()");
      expect(sql).toContain("wm.role = 'owner'");
    });

    it('a migration 90 cria o trigger de banco para garantir imutabilidade de workspace e máquina de estados', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('validar_experimento_comercial_workflow');
      expect(sql).toContain('NEW.workspace_id IS DISTINCT FROM OLD.workspace_id');
      expect(sql).toContain('não é permitido alterar o workspace_id de um experimento comercial');
      expect(sql).toContain('experimentos concluídos ou cancelados são históricos e não podem ser reabertos');
      expect(sql).toContain('o experimento precisa ser aprovado pelo proprietário antes de ser iniciado');
      expect(sql).toContain('um experimento só pode ser concluído após ter sido iniciado (em andamento)');
    });

    it('a migration 90 blinda as políticas RLS para UPDATE e DELETE exigindo prerrogativa executiva de proprietário', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('wallet_commercial_experiments_update');
      expect(sql).toContain('tem_acesso_executivo_proprietario(workspace_id)');
      expect(sql).toContain('wallet_commercial_experiments_delete');
    });
  });

  describe('Gate 1: Máquina de Estados e Validação Canônica no CeoRepository', () => {
    it('permite a transição canônica de planejado para aprovado', () => {
      const res = CeoRepository.validateTransition('planejado', 'aprovado');
      expect(res.valid).toBe(true);
    });

    it('permite a transição canônica de aprovado para em_andamento', () => {
      const res = CeoRepository.validateTransition('aprovado', 'em_andamento');
      expect(res.valid).toBe(true);
    });

    it('permite a transição canônica de em_andamento para concluido', () => {
      const res = CeoRepository.validateTransition('em_andamento', 'concluido');
      expect(res.valid).toBe(true);
    });

    it('permite cancelamento a partir de estados abertos (planejado, aprovado, em_andamento)', () => {
      expect(CeoRepository.validateTransition('planejado', 'cancelado').valid).toBe(true);
      expect(CeoRepository.validateTransition('aprovado', 'cancelado').valid).toBe(true);
      expect(CeoRepository.validateTransition('em_andamento', 'cancelado').valid).toBe(true);
    });

    it('impede pular etapa: planejado NÃO pode ir direto para em_andamento sem aprovação', () => {
      const res = CeoRepository.validateTransition('planejado', 'em_andamento');
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/aprovado formalmente pelo proprietário/i);
    });

    it('impede pular etapa: planejado NÃO pode ir direto para concluído', () => {
      const res = CeoRepository.validateTransition('planejado', 'concluido');
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/Apenas experimentos em andamento podem ser concluídos/i);
    });

    it('impede reabertura: experimentos concluídos são imutáveis e selados', () => {
      const resPlanejado = CeoRepository.validateTransition('concluido', 'planejado');
      expect(resPlanejado.valid).toBe(false);
      expect(resPlanejado.reason).toMatch(/históricos e não podem ser reabertos/i);

      const resAndamento = CeoRepository.validateTransition('concluido', 'em_andamento');
      expect(resAndamento.valid).toBe(false);
    });

    it('impede reabertura: experimentos cancelados são imutáveis e selados', () => {
      const res = CeoRepository.validateTransition('cancelado', 'em_andamento');
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/históricos e não podem ser reabertos/i);
    });

    it('CeoRepository.updateExperiment rejeita transições inválidas localmente sem poluir o banco', async () => {
      const result = await CeoRepository.updateExperiment('exp-123', {
        status: 'em_andamento',
        currentStatus: 'planejado', // Não aprovado previamente!
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/aprovado formalmente pelo proprietário/i);
    });
  });
});
