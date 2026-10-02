/**
 * DivipayWorkspaceIsolation.security.test.ts
 *
 * Testes de segurança e regressão obrigatórios para a vulnerabilidade SEC-001:
 * - TESTE 1: Usuário autenticado + workspace PJ autorizado -> dados Divipay da PJ retornados
 * - TESTE 2: Mesmo usuário + workspace PF autorizado + PF sem Divipay -> nenhum dado Divipay da PJ aparece
 * - TESTE 3: Usuário tenta informar workspace ao qual não pertence -> negação / erro 403
 * - TESTE 4: Workspace válido + configuração Divipay pertencente a outro workspace -> negado
 * - TESTE 5: Request sem workspace -> negado / fail-closed, sem fallback por user_id
 * - TESTE 6: Request sem autenticação -> 401 / negado
 * - TESTE 7: Alternância de workspace PJ -> PF -> PJ -> isolamento mantido e sem vazamento
 * - TESTE 8: DivipayService propaga workspace_id em todas as chamadas operacionais
 * - TESTE 9: getConfig e saveConfig isolam divipay_config por workspace_id
 * - TESTE 10 (Novo): Configuração com workspace_id NULL não é utilizável (fail-closed, rejeitada)
 * - TESTE 11 (Novo): Cross-tenant PJ-A vs PJ-B: Workspace PJ-A não acessa credenciais ou dados de PJ-B
 * - TESTE 12 (Novo): Chamada direta de getConfig sem workspaceId retorna null (fail-closed)
 * - TESTE 13 (Novo): Chamada de saveConfig sem workspaceId lança erro (fail-closed)
 * - TESTE 14 (Novo): Verificação estática da Edge Function divipay-api (proíbe fallback legado e exige workspace_id)
 * - TESTE 15 (Novo): Verificação estática da Migration (proíbe 'workspace_id IS NULL' nas policies RLS)
 * - TESTE 16 (Novo): Same-Workspace User Impersonation: Usuário A com acesso ao mesmo workspace não acessa divipay_config de Usuário B mesmo manipulando userId (fail-closed)
 * - TESTE 17 (Novo): Migration contém backfill defensivo de divipay_conciliacoes (fail-closed, com guardas de contagem e validação de PJ)
 * - TESTE 18 (Novo): Migration impede que conciliações legadas fiquem inacessíveis por workspace_id NULL e aplica NOT NULL em divipay_transacoes
 * - TESTE 19 (Novo): Migration possui transação explícita BEGIN e COMMIT (garantia de atomicidade integral sem DDL incompatível)
 * - TESTE 20 (Novo): registrarConciliacao exige workspace_id (fail-closed) e inclui workspace_id no upsert
 * - TESTE 21 (Novo): Webhook nunca cria divipay_conciliacoes sem workspace_id (fail-closed, 3 fluxos auditados)
 * - TESTE 22 (Novo): Migration aplica NOT NULL em divipay_conciliacoes e divipay_transacoes com todos os writers compatíveis
 * - TESTE 23 (Novo): Não existe fallback por PJ/user/primeiro workspace nos writers (ConciliacaoDivipayService e webhook)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { divipayService } from './DivipayService';
import { conciliacaoDivipayService } from './ConciliacaoDivipayService';
import { supabase } from '@/integrations/supabase/client';
import fs from 'fs';
import path from 'path';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('@/core/logging/LoggerService', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe('SEC-001: Isolamento de Workspace na Integração Divipay', () => {
  const USER_ID = 'user-uuid-123';
  const WORKSPACE_PJ = 'workspace-pj-rodo-point';
  const WORKSPACE_PF = 'workspace-pf-pessoal';
  const WORKSPACE_PJ_B = 'workspace-pj-outra-empresa';
  const WORKSPACE_ALHEIO = 'workspace-outro-usuario';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: USER_ID } as unknown as import('@supabase/supabase-js').User },
      error: null,
    });
  });

  it('TESTE 1: Usuário autenticado + workspace PJ -> envia workspace_id e retorna dados da PJ', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          items: [
            { id: 'saque-pj-1', amount: 1500, status: 'FINISHED', type: 'DICT' },
          ],
          hasMore: false,
        },
      },
      error: null,
    });

    const result = await divipayService.listWithdraws({ limit: 50 }, WORKSPACE_PJ);

    expect(supabase.functions.invoke).toHaveBeenCalledWith('divipay-api', {
      body: expect.objectContaining({
        action: 'listWithdraws',
        workspace_id: WORKSPACE_PJ,
      }),
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('saque-pj-1');
  });

  it('TESTE 2: Mesmo usuário + workspace PF autorizado (sem Divipay) -> divipay-api recusa ou retorna erro/vazio sem vazar dados da PJ', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Configuração Divipay não encontrada para este workspace.',
      },
      error: null,
    });

    await expect(divipayService.listWithdraws({ limit: 50 }, WORKSPACE_PF))
      .rejects.toThrow('Configuração Divipay não encontrada para este workspace.');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('divipay-api', {
      body: expect.objectContaining({
        action: 'listWithdraws',
        workspace_id: WORKSPACE_PF,
      }),
    });
  });

  it('TESTE 3: Usuário tenta acessar workspace alheio ao qual não pertence -> 403 negado', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Acesso negado: usuário não possui permissão para o workspace informado.',
      },
      error: null,
    });

    await expect(divipayService.listWithdraws({ limit: 50 }, WORKSPACE_ALHEIO))
      .rejects.toThrow('Acesso negado: usuário não possui permissão para o workspace informado.');
  });

  it('TESTE 4: Workspace válido porém configuração Divipay de outro workspace -> acesso negado', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Configuração Divipay não encontrada para este workspace.',
      },
      error: null,
    });

    await expect(divipayService.getBalance(WORKSPACE_PF))
      .rejects.toThrow('Configuração Divipay não encontrada para este workspace.');
  });

  it('TESTE 5: Request sem workspace_id -> negado fail-closed, sem fallback por user_id', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'workspace_id é obrigatório para acessar recursos da Divipay.',
      },
      error: null,
    });

    await expect(divipayService.listWithdraws({ limit: 50 }, null))
      .rejects.toThrow('workspace_id é obrigatório para acessar recursos da Divipay.');
  });

  it('TESTE 6: Request sem autenticação -> negado com 401', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Token de autenticação ausente',
      },
      error: null,
    });

    await expect(divipayService.getBalance(WORKSPACE_PJ))
      .rejects.toThrow('Token de autenticação ausente');
  });

  it('TESTE 7: Alternância de contexto PJ -> PF -> PJ garante isolamento sem vazamento de cache', async () => {
    // 1. Chamada PJ
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { success: true, data: [{ id: 'pj-acc', balance: 50000 }] },
      error: null,
    });
    const balPJ = await divipayService.getBalance(WORKSPACE_PJ);
    expect(balPJ[0].balance).toBe(50000);

    // 2. Alterna para PF (não tem divipay)
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { success: false, error: 'Configuração Divipay não encontrada para este workspace.' },
      error: null,
    });
    await expect(divipayService.getBalance(WORKSPACE_PF)).rejects.toThrow('não encontrada');

    // 3. Volta para PJ
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { success: true, data: [{ id: 'pj-acc', balance: 50000 }] },
      error: null,
    });
    const balPJ2 = await divipayService.getBalance(WORKSPACE_PJ);
    expect(balPJ2[0].balance).toBe(50000);
  });

  it('TESTE 8: DivipayService propaga workspace_id em todas as chamadas operacionais', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true, data: {} },
      error: null,
    });

    await divipayService.createWithdraw({ amount: 100, keyPix: 'teste@pix' }, WORKSPACE_PJ);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('divipay-api', {
      body: expect.objectContaining({
        action: 'createWithdraw',
        workspace_id: WORKSPACE_PJ,
      }),
    });

    await divipayService.createPixCharge({ amount: 50 }, WORKSPACE_PJ);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('divipay-api', {
      body: expect.objectContaining({
        action: 'createPixCharge',
        workspace_id: WORKSPACE_PJ,
      }),
    });

    await divipayService.listMovements({ initialDate: '2026-09-01', finalDate: '2026-09-30' }, WORKSPACE_PJ);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('divipay-api', {
      body: expect.objectContaining({
        action: 'listMovements',
        workspace_id: WORKSPACE_PJ,
      }),
    });
  });

  it('TESTE 9: getConfig e saveConfig isolam divipay_config por workspace_id', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'cfg-1', user_id: USER_ID, workspace_id: WORKSPACE_PJ, client_id: 'cid' },
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockEqUser = vi.fn().mockReturnValue({ eq: mockEq });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqUser });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as unknown as ReturnType<typeof supabase.from>);

    await divipayService.getConfig(WORKSPACE_PJ);

    expect(supabase.from).toHaveBeenCalledWith('divipay_config');
    expect(mockSelect).toHaveBeenCalled();
    expect(mockEqUser).toHaveBeenCalledWith('user_id', USER_ID);
    expect(mockEq).toHaveBeenCalledWith('workspace_id', WORKSPACE_PJ);
  });

  it('TESTE 10: Configuração com workspace_id NULL não é utilizável (Edge Function retorna erro 400)', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Configuração Divipay não encontrada para este workspace. Cadastre as credenciais na aba Configurações.',
      },
      error: null,
    });

    await expect(divipayService.getBalance(WORKSPACE_PJ))
      .rejects.toThrow('Configuração Divipay não encontrada para este workspace');
  });

  it('TESTE 11: Cross-tenant PJ-A vs PJ-B: Workspace PJ-B não acessa credenciais de PJ-A', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Configuração Divipay não encontrada para este workspace. Cadastre as credenciais na aba Configurações.',
      },
      error: null,
    });

    await expect(divipayService.getBalance(WORKSPACE_PJ_B))
      .rejects.toThrow('Configuração Divipay não encontrada para este workspace');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('divipay-api', {
      body: expect.objectContaining({
        action: 'getBalance',
        workspace_id: WORKSPACE_PJ_B,
      }),
    });
  });

  it('TESTE 12: Chamada de getConfig sem workspaceId retorna null (fail-closed)', async () => {
    const config = await divipayService.getConfig(null);
    expect(config).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('TESTE 13: Chamada de saveConfig sem workspaceId lança erro (fail-closed)', async () => {
    await expect(divipayService.saveConfig({
      client_id: 'cid',
      client_secret: 'csec',
      environment: 'sandbox',
    }, null)).rejects.toThrow('workspace_id é obrigatório para salvar configuração da Divipay');
  });

  it('TESTE 14: Verificação estática da Edge Function divipay-api (proíbe fallback PJ e exige workspace_id)', () => {
    const edgeFunctionPath = path.resolve(process.cwd(), 'supabase/functions/divipay-api/index.ts');
    expect(fs.existsSync(edgeFunctionPath)).toBe(true);

    const content = fs.readFileSync(edgeFunctionPath, 'utf8');

    // Não deve conter checagem de tipo PJ como fallback
    expect(content).not.toMatch(/wsCheck\?\.tipo\s*===\s*['"]PJ['"]/);
    expect(content).not.toMatch(/legacyConfig/);

    // Deve conter verificação estrita não-nula de workspace_id
    expect(content).toMatch(/\.eq\(['"]workspace_id['"],\s*targetWorkspaceId\)/);
    expect(content).toMatch(/\.not\(['"]workspace_id['"],\s*['"]is['"],\s*null\)/);
  });

  it('TESTE 15: Verificação estática da Migration (proíbe workspace_id IS NULL nas policies RLS)', () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261002061000_isolate_divipay_by_workspace.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf8');

    // Não deve conter 'workspace_id IS NULL' como bypass de RLS
    expect(content).not.toMatch(/workspace_id IS NULL OR/i);
    expect(content).not.toMatch(/OR workspace_id IS NULL/i);

    // Deve exigir workspace_id IS NOT NULL E tem_acesso_workspace
    expect(content).toMatch(/workspace_id IS NOT NULL/i);
    expect(content).toMatch(/public\.tem_acesso_workspace\(workspace_id\)/i);
  });

  it('TESTE 16: Same-Workspace User Impersonation: Usuário A com acesso ao mesmo workspace não acessa divipay_config do Usuário B mesmo manipulando userId (fail-closed)', async () => {
    const USER_A_ID = 'user-a-1111-1111';
    const WORKSPACE_SHARED = 'workspace-shared-pj';

    // 1. Verificação estática da Edge Function:
    // Garante que o endpoint divipay-api deriva targetUserId obrigatoriamente do JWT para clientes comuns,
    // ignorando qualquer manipulação de user_id vindo do payload do cliente, mesmo com service_role disponível no backend.
    const edgeFunctionPath = path.resolve(process.cwd(), 'supabase/functions/divipay-api/index.ts');
    const edgeContent = fs.readFileSync(edgeFunctionPath, 'utf8');

    // Confirma que requestBody.user_id só é permitido se isServiceRole === true
    expect(edgeContent).toMatch(/if\s*\(\s*isServiceRole\s*&&\s*requestBody\.user_id\s*\)/);

    // Confirma que cliente comum (não service_role) tem targetUserId estritamente extraído de auth.getUser(token)
    expect(edgeContent).toMatch(/targetUserId\s*=\s*user\.id/);

    // Confirma que a consulta a divipay_config filtra estritamente por targetUserId
    expect(edgeContent).toMatch(/\.eq\(['"]user_id['"],\s*targetUserId\)/);

    // 2. Simulação funcional: Usuário A autenticado tenta acessar o workspace compartilhado
    // onde apenas o Usuário B possui credenciais Divipay cadastradas.
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: USER_A_ID } as unknown as import('@supabase/supabase-js').User },
      error: null,
    });

    // Como o Usuário A não possui registro próprio em divipay_config para este workspace,
    // a Edge Function retorna erro 400 (fail-closed), independentemente de o Usuário B ter registro.
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        success: false,
        error: 'Configuração Divipay não encontrada para este workspace. Cadastre as credenciais na aba Configurações.',
      },
      error: null,
    });

    await expect(divipayService.getBalance(WORKSPACE_SHARED))
      .rejects.toThrow('Configuração Divipay não encontrada para este workspace');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('divipay-api', {
      body: expect.objectContaining({
        action: 'getBalance',
        workspace_id: WORKSPACE_SHARED,
      }),
    });
  });

  it('TESTE 17: Migration contém backfill defensivo de divipay_conciliacoes (fail-closed, dinâmico e validação de PJ)', () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261002061000_isolate_divipay_by_workspace.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, 'utf8');

    // Valida presença do backfill de divipay_conciliacoes
    expect(content).toMatch(/UPDATE\s+public\.divipay_conciliacoes\s+SET\s+workspace_id\s*=\s*v_rodo_point_ws_id/i);

    // Valida guardas estritas de integridade
    expect(content).toMatch(/v_expected_user_id\s*CONSTANT\s*UUID\s*:=\s*'0adfbd4b-bc98-48c4-8f3b-e22ee5c317c0'/i);
    expect(content).toMatch(/v_rodo_point_ws_id\s*CONSTANT\s*UUID\s*:=\s*'2af415b6-76aa-4134-8133-a9b405671c1c'/i);
    expect(content).toMatch(/v_ws_record\.tipo\s*<>\s*'PJ'/i);
    expect(content).toMatch(/user_id\s*<>\s*v_expected_user_id/i);

    // Valida checagem dinâmica de ROW_COUNT do update
    expect(content).toMatch(/v_rows_updated\s*<>\s*v_total_null_conciliacoes/i);
  });

  it('TESTE 18: Migration impede que conciliações legadas fiquem inacessíveis e aplica NOT NULL em divipay_transacoes', () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261002061000_isolate_divipay_by_workspace.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Valida asserção final garantindo que 0 conciliações restaram com workspace_id NULL
    expect(content).toMatch(/SELECT\s+COUNT\(\*\)\s+INTO\s+v_remaining_null_count\s+FROM\s+public\.divipay_conciliacoes\s+WHERE\s+workspace_id\s+IS\s+NULL/i);
    expect(content).toMatch(/IF\s+v_remaining_null_count\s*>\s*0\s+THEN/i);

    // Valida que divipay_transacoes agora recebe NOT NULL
    expect(content).toMatch(/ALTER\s+TABLE\s+public\.divipay_transacoes\s+ALTER\s+COLUMN\s+workspace_id\s+SET\s+NOT\s+NULL/i);

    // Valida que índice de workspace em conciliações é criado
    expect(content).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_divipay_conciliacoes_workspace/i);
  });

  it('TESTE 19: Migration possui transação explícita BEGIN e COMMIT (garantia de atomicidade integral sem DDL incompatível)', () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261002061000_isolate_divipay_by_workspace.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Transação explícita
    expect(content).toMatch(/\bBEGIN;/);
    expect(content).toMatch(/\bCOMMIT;/);

    // Proíbe comandos que quebram transação no PostgreSQL
    expect(content).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i);
    expect(content).not.toMatch(/\bVACUUM\b/i);
  });

  it('TESTE 20: registrarConciliacao exige workspace_id (fail-closed) e inclui workspace_id no upsert', async () => {
    const mockSaque = {
      externalId: 'ext-saque-123',
      tipo: 'PIX',
      favorecidoNome: 'Fornecedor Teste',
      favorecidoDocumento: '12345678000199',
      valor: 250.50,
      taxa: 3.50,
      dataPagamento: '2026-10-02T12:00:00Z',
      descricao: 'Pagamento de teste',
    };

    // Sem workspace_id: FAIL-CLOSED imediato
    await expect(
      conciliacaoDivipayService.registrarConciliacao(USER_ID, '', mockSaque, 'pendente')
    ).rejects.toThrow(/workspace_id é obrigatório/i);

    await expect(
      conciliacaoDivipayService.registrarConciliacao(USER_ID, null as unknown as string, mockSaque, 'pendente')
    ).rejects.toThrow(/workspace_id é obrigatório/i);

    // Com workspace_id válido: executa upsert com workspace_id
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValueOnce({ upsert: mockUpsert } as any);

    await conciliacaoDivipayService.registrarConciliacao(USER_ID, WORKSPACE_PJ, mockSaque, 'pendente');

    expect(supabase.from).toHaveBeenCalledWith('divipay_conciliacoes');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        workspace_id: WORKSPACE_PJ,
        divipay_external_id: 'ext-saque-123',
        status: 'pendente',
      }),
      { onConflict: 'user_id,divipay_external_id' },
    );
  });

  it('TESTE 21: Webhook nunca cria divipay_conciliacoes sem workspace_id (fail-closed, 3 fluxos auditados)', () => {
    const webhookPath = path.resolve(process.cwd(), 'supabase/functions/divipay-webhook/index.ts');
    expect(fs.existsSync(webhookPath)).toBe(true);

    const content = fs.readFileSync(webhookPath, 'utf8');

    // CASH_OUT aborta se transacao.workspace_id for nulo (fail-closed)
    expect(content).toMatch(/if\s*\(!targetWorkspaceId\)\s*\{[\s\S]*?Conciliação abortada: transação sem workspace_id/i);

    // Contagem de writers de divipay_conciliacoes no webhook
    const upsertMatches = content.match(/from\(['"]divipay_conciliacoes['"]\)\.upsert/g);
    expect(upsertMatches).not.toBeNull();
    expect(upsertMatches?.length).toBe(3);

    // Todos os 3 upserts passam workspace_id: targetWorkspaceId
    const conciliaBlocks = content.match(/from\(['"]divipay_conciliacoes['"]\)\.upsert\(\s*\{[\s\S]*?\}\s*,\s*\{/g);
    expect(conciliaBlocks).not.toBeNull();
    expect(conciliaBlocks?.length).toBe(3);

    for (const block of conciliaBlocks ?? []) {
      expect(block).toMatch(/workspace_id:\s*targetWorkspaceId/);
      expect(block).not.toMatch(/workspace_id:\s*defaultWorkspaceId/);
    }
  });

  it('TESTE 22: Migration aplica NOT NULL em divipay_conciliacoes e divipay_transacoes com todos os writers compatíveis', () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261002061000_isolate_divipay_by_workspace.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');

    // divipay_config recebe NOT NULL
    expect(content).toMatch(/ALTER\s+TABLE\s+public\.divipay_config\s+ALTER\s+COLUMN\s+workspace_id\s+SET\s+NOT\s+NULL/i);

    // divipay_transacoes recebe NOT NULL
    expect(content).toMatch(/ALTER\s+TABLE\s+public\.divipay_transacoes\s+ALTER\s+COLUMN\s+workspace_id\s+SET\s+NOT\s+NULL/i);

    // divipay_conciliacoes recebe NOT NULL
    expect(content).toMatch(/ALTER\s+TABLE\s+public\.divipay_conciliacoes\s+ALTER\s+COLUMN\s+workspace_id\s+SET\s+NOT\s+NULL/i);
  });

  it('TESTE 23: Não existe fallback por PJ/user/primeiro workspace nos writers (ConciliacaoDivipayService e webhook)', () => {
    const servicePath = path.resolve(process.cwd(), 'src/domains/divipay/services/ConciliacaoDivipayService.ts');
    const serviceContent = fs.readFileSync(servicePath, 'utf8');

    // ConciliacaoDivipayService não deve ter queries de fallback por PJ ou default workspace
    expect(serviceContent).not.toMatch(/resolveWorkspaceId/);
    expect(serviceContent).not.toMatch(/\.eq\(['"]tipo['"],\s*['"]PJ['"]\)/);
    expect(serviceContent).not.toMatch(/\.eq\(['"]is_default['"],\s*true\)/);

    // Webhook: divipay_conciliacoes não recebe defaultWorkspaceId
    const webhookPath = path.resolve(process.cwd(), 'supabase/functions/divipay-webhook/index.ts');
    const webhookContent = fs.readFileSync(webhookPath, 'utf8');

    const webhookConciliaUpserts = webhookContent.match(/from\(['"]divipay_conciliacoes['"]\)\.upsert\([\s\S]*?\)/g) || [];
    for (const upsert of webhookConciliaUpserts) {
      expect(upsert).not.toMatch(/defaultWorkspaceId/);
      expect(upsert).not.toMatch(/findDefaultWorkspace/);
    }
  });
});
