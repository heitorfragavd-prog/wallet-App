import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('ETAPA 08 — Gate 2: Hardening do Banco, Workflow e Autorização Executiva Real', () => {
  const migration91Path = path.resolve(
    __dirname,
    '../../supabase/migrations/91_wallet_commercial_experiments_hardening.sql'
  );
  const rollback91Path = path.resolve(
    __dirname,
    '../../supabase/migrations/rollback/91_wallet_commercial_experiments_hardening.down.sql'
  );

  it('o arquivo da migration 91 e o script de rollback existem', () => {
    expect(fs.existsSync(migration91Path)).toBe(true);
    expect(fs.existsSync(rollback91Path)).toBe(true);
  });

  it('a migration 91 verifica status de membro ativo em tem_acesso_executivo_proprietario', () => {
    const sql = fs.readFileSync(migration91Path, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.tem_acesso_executivo_proprietario');
    expect(sql).toContain("wm.role = 'owner'");
    expect(sql).toContain('coalesce(wm.active, true) = true');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.tem_acesso_executivo_proprietario');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.tem_acesso_executivo_proprietario');
  });

  it('a migration 91 blinda inserções diretas em status inválidos (TG_OP = INSERT)', () => {
    const sql = fs.readFileSync(migration91Path, 'utf8');

    expect(sql).toContain("IF TG_OP = 'INSERT' THEN");
    expect(sql).toContain("'em_andamento'");
    expect(sql).toContain("'concluido'");
    expect(sql).toContain("'cancelado'");
    expect(sql).toContain('experimentos recém-criados devem iniciar no estado planejado ou aprovado');
    expect(sql).toContain('NEW.workspace_id IS NULL');
    expect(sql).toContain('o workspace_id é obrigatório para experimentos comerciais');
  });

  it('a migration 91 exige privilégio do proprietário para inserir com status aprovado', () => {
    const sql = fs.readFileSync(migration91Path, 'utf8');

    expect(sql).toContain("NEW.status IN ('aprovado', 'approved')");
    expect(sql).toContain('NOT public.tem_acesso_executivo_proprietario(NEW.workspace_id)');
    expect(sql).toContain('somente o proprietário do workspace pode criar experimentos diretamente com status aprovado');
  });

  it('a migration 91 mantém todas as garantias de imutabilidade e workflow em updates (TG_OP = UPDATE)', () => {
    const sql = fs.readFileSync(migration91Path, 'utf8');

    expect(sql).toContain("IF TG_OP = 'UPDATE' THEN");
    expect(sql).toContain('NEW.workspace_id IS DISTINCT FROM OLD.workspace_id');
    expect(sql).toContain('não é permitido alterar o workspace_id de um experimento comercial');
    expect(sql).toContain('experimentos concluídos ou cancelados são históricos e não podem ser reabertos');
    expect(sql).toContain('um experimento só pode ser concluído após ter sido iniciado');
    expect(sql).toContain('o experimento precisa ser aprovado pelo proprietário antes de ser iniciado');
  });
});
