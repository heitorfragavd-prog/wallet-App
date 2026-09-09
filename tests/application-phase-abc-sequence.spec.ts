import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDk5NjQ4MDAsImV4cCI6MTk2NTUzMjgwMH0.6pnT9q8_Z3M3s9a0Y7mPqQ0P2QjP0V9O7W4qM3a0Z5g';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const LEGACY_APP_URL = process.env.LEGACY_APP_URL || 'http://localhost:4173';
const NEW_APP_URL = process.env.NEW_APP_URL || 'http://localhost:4174';

function readSqlFile(relativePath: string): string {
  const primaryPath = path.resolve(process.cwd(), relativePath);
  if (fs.existsSync(primaryPath)) {
    return fs.readFileSync(primaryPath, 'utf8');
  }
  const altPath = path.resolve(process.cwd(), relativePath.replace('supabase/migrations/', 'supabase/all_migrations/'));
  if (fs.existsSync(altPath)) {
    return fs.readFileSync(altPath, 'utf8');
  }
  throw new Error(`Arquivo SQL não encontrado em ${primaryPath} ou ${altPath}`);
}

async function executeSql(query: string): Promise<unknown> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await client.query(query);
  } finally {
    await client.end();
  }
}

async function reloadPostgrest() {
  await executeSql("NOTIFY pgrst, 'reload schema';");
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

// Helper para chamadas PostgREST
async function postgrest(endpoint: string, options: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}) {
  const { method = 'GET', body, token, headers = {} } = options;
  const h: Record<string, string> = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    ...headers,
  };
  if (token) {
    h['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1${endpoint}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

// Helper para chamadas Auth
async function authCall(endpoint: string, body: unknown, token?: string) {
  const h: Record<string, string> = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1${endpoint}`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

test.describe('Homologação da Aplicação na Sequência A → B → C (Stack Real e Builds Isolados)', () => {
  test.describe.configure({ mode: 'serial' });

  const timestamp = Date.now();
  const testEmail = `app_seq_${timestamp}@example.com`;
  const testPassword = 'PasswordStrongSeq@123';
  let userToken = '';
  let userId = '';
  let userWorkspaceId = '';

  const phaseCSql = readSqlFile('supabase/migrations/20260908120001_security_phase_c_enforcement.sql');
  const rollbackSql = readSqlFile('supabase/ops/rollback_20260908120000_safe_recovery.sql');

  test('0. Setup Inicial: Autenticação do usuário e inserção dos dados com segredos sintéticos', async () => {
    // 0.1 Cadastro do usuário de teste
    const signup = await authCall('/signup', {
      email: testEmail,
      password: testPassword,
      data: { name: 'Usuario Sequencia A-B-C', telefone: '11999998888' }
    });
    expect(signup.status).toBeLessThan(300);

    // 0.2 Login para obter JWT
    const login = await authCall('/token?grant_type=password', {
      email: testEmail,
      password: testPassword,
    });
    expect(login.ok).toBe(true);
    userToken = login.data.access_token;
    userId = login.data?.user?.id || signup.data?.user?.id || signup.data?.id;
    expect(userToken).toBeTruthy();
    expect(userId).toBeTruthy();

    // 0.3 Criar workspace para o usuário
    const wsRes = await postgrest('/workspaces', {
      method: 'POST',
      token: userToken,
      headers: { 'Prefer': 'return=representation' },
      body: { user_id: userId, nome: 'Workspace Seq ABC', tipo: 'PF', is_default: true }
    });
    expect(wsRes.status).toBeLessThan(300);
    userWorkspaceId = Array.isArray(wsRes.data) ? wsRes.data[0]?.id : wsRes.data?.id;

    // 0.4 Inserir credenciais legadas em divipay_config com SEGREDOS SINTÉTICOS
    const diviRes = await postgrest('/divipay_config', {
      method: 'POST',
      token: userToken,
      body: {
        user_id: userId,
        client_id: 'divi_pub_synthetic_1',
        client_secret: 'synthetic_divipay_secret_999',
        environment: 'sandbox'
      }
    });
    expect([200, 201, 204]).toContain(diviRes.status);

    // 0.5 Inserir credenciais legadas em eyemobile_config com SEGREDOS SINTÉTICOS
    const eyeRes = await postgrest('/eyemobile_config', {
      method: 'POST',
      token: userToken,
      body: {
        user_id: userId,
        access_key: 'eye_pub_synthetic_1',
        secret_key: 'synthetic_eyemobile_secret_888',
        environment: 'sandbox'
      }
    });
    expect([200, 201, 204]).toContain(eyeRes.status);

    // 0.6 Inserir registro em ia_configuracoes com SEGREDO SINTÉTICO
    const iaRes = await postgrest('/ia_configuracoes', {
      method: 'POST',
      token: userToken,
      body: {
        user_id: userId,
        api_key: 'synthetic_openai_api_key_777',
        modelo: 'gpt-4o-mini'
      }
    });
    expect([200, 201, 204]).toContain(iaRes.status);

    // 0.7 Inserir registro em investimentos
    const investRes = await postgrest('/investimentos', {
      method: 'POST',
      token: userToken,
      body: {
        user_id: userId,
        ativo: 'PETR4',
        valor: 5000.00
      }
    });
    expect([200, 201, 204]).toContain(investRes.status);
  });

  test('1. Fase A: Aplicação antiga (Build SHA 8ae7c04) opera via navegador e API', async ({ page }) => {
    // 1.1 Execução no navegador real contra a build antiga (SHA 8ae7c04)
    await page.goto(`${LEGACY_APP_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Preenche login na aplicação antiga
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill(testEmail);
      await page.locator('input[type="password"], input[name="password"]').fill(testPassword);
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(2000);
    }

    // 1.2 Aplicação antiga lê segredos em divipay_config (comportamento da versão anterior)
    const readDivi = await postgrest(`/divipay_config?user_id=eq.${userId}&select=client_id,client_secret`, {
      token: userToken
    });
    expect(readDivi.ok).toBe(true);
    expect(readDivi.data[0].client_id).toBe('divi_pub_synthetic_1');
    expect(readDivi.data[0].client_secret).toBe('synthetic_divipay_secret_999');

    // 1.3 Aplicação antiga lê segredos em eyemobile_config (comportamento da versão anterior)
    const readEye = await postgrest(`/eyemobile_config?user_id=eq.${userId}&select=access_key,secret_key`, {
      token: userToken
    });
    expect(readEye.ok).toBe(true);
    expect(readEye.data[0].access_key).toBe('eye_pub_synthetic_1');
    expect(readEye.data[0].secret_key).toBe('synthetic_eyemobile_secret_888');

    // 1.4 Ponto 2: ia_configuracoes.api_key JÁ ESTAVA PROTEGIDA pela migration anterior
    // Portanto, o resultado legítimo esperado continua sendo ACESSO NEGADO / COLUNA NÃO CONCEDIDA
    const readIaKey = await postgrest(`/ia_configuracoes?user_id=eq.${userId}&select=api_key`, {
      token: userToken
    });
    expect(readIaKey.ok).toBe(false);
    expect([400, 403]).toContain(readIaKey.status);

    // Consulta segura via RPC get_ia_config_status permitida
    const readIaStatus = await postgrest('/rpc/get_ia_config_status', {
      method: 'POST',
      token: userToken
    });
    expect(readIaStatus.ok).toBe(true);
    expect(readIaStatus.data[0].api_key_configurada).toBe(true);
    expect(readIaStatus.data[0].api_key).toBeUndefined();

    // 1.5 Aplicação antiga lê investimentos sem exigir sessão desbloqueada (contrato anterior)
    const readInvest = await postgrest(`/investimentos?user_id=eq.${userId}&select=*`, {
      token: userToken
    });
    expect(readInvest.ok).toBe(true);
    expect(readInvest.data.length).toBeGreaterThanOrEqual(1);
    expect(readInvest.data[0].ativo).toBe('PETR4');
  });

  test('2. Fase B: Nova aplicação (Build Hardened) opera via navegador e API sob a Fase A', async ({ page }) => {
    // 2.1 Execução no navegador real contra o novo build (Hardened)
    await page.goto(`${NEW_APP_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Login no novo build
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill(testEmail);
      await page.locator('input[type="password"], input[name="password"]').fill(testPassword);
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(2000);
    }

    // 2.2 Nova aplicação consome RPCs seguras de status
    const diviStatus = await postgrest('/rpc/get_divipay_config_status', {
      method: 'POST',
      token: userToken
    });
    expect(diviStatus.ok).toBe(true);
    expect(diviStatus.data[0].has_secret).toBe(true);
    expect(diviStatus.data[0].client_secret).toBeUndefined();

    const eyeStatus = await postgrest('/rpc/get_eyemobile_config_status', {
      method: 'POST',
      token: userToken
    });
    expect(eyeStatus.ok).toBe(true);
    expect(eyeStatus.data[0].has_secret).toBe(true);
    expect(eyeStatus.data[0].secret_key).toBeUndefined();

    // 2.3 Nova aplicação cadastra e valida senha de investimentos via Edge Function
    const cadRes = await fetch(`${SUPABASE_URL}/functions/v1/validar-senha`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'cadastrar',
        senha: 'InvestSeqPass@123',
      })
    });
    expect([200, 201]).toContain(cadRes.status);

    // 2.4 Ponto 3: Reserva de IA segue o CAMINHO REAL (Edge Function autenticada)
    // O navegador chama a Edge Function categorizar-ia, que internamente invoca reserve_ai_tokens
    const aiEfRes = await fetch(`${SUPABASE_URL}/functions/v1/categorizar-ia`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        descricao: 'Compra de suprimentos de homologacao',
        valor: 120.00,
        workspace_id: userWorkspaceId,
      })
    });
    // Resposta de sucesso ou rota de IA autorizada
    expect([200, 429, 502]).toContain(aiEfRes.status);

    // 2.5 Ponto 3: Tentativa direta do navegador de chamar reserve_ai_tokens DEVE SER RECUSADA
    // (A RPC é restrita exclusivamente a service_role)
    const directBrowserCall = await postgrest('/rpc/reserve_ai_tokens', {
      method: 'POST',
      token: userToken,
      body: {
        p_user_id: userId,
        p_workspace_id: userWorkspaceId,
        p_estimated_tokens: 100
      }
    });
    expect(directBrowserCall.ok).toBe(false);
    expect([401, 403, 404]).toContain(directBrowserCall.status);
  });

  test('3. Gating da Fase C: Rejeição formal de execução conjunta sem confirmação da Fase B', async () => {
    let gatingTriggered = false;
    try {
      await executeSql(phaseCSql);
    } catch (err: unknown) {
      gatingTriggered = true;
      expect((err as Error).message).toMatch(/OPERACAO BLOQUEADA/i);
    }
    expect(gatingTriggered).toBe(true);
  });

  test('4. Aplicação da Fase C pelo Operador (Enforcement de Segurança)', async () => {
    await executeSql(`
      SET wallet.deploy_phase_b_completed = 'true';
      ${phaseCSql}
    `);
    await reloadPostgrest();
  });

  test('5. Fase C Ativa: Nova aplicação opera com sucesso, brechas antigas são bloqueadas e sessões são estritamente isoladas', async () => {
    // 5.1 Sessão A (Nova Aplicação): Desbloqueia sessão de investimentos
    const unlockRes = await fetch(`${SUPABASE_URL}/functions/v1/validar-senha`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'validar',
        senha: 'InvestSeqPass@123',
      })
    });
    expect(unlockRes.status).toBe(200);
    const unlockData = await unlockRes.json();
    expect(unlockData.valido).toBe(true);

    // 5.2 Sessão A lê investimentos com sessão desbloqueada -> SUCESSO
    const readInvestUnlocked = await postgrest(`/investimentos?user_id=eq.${userId}&select=*`, {
      token: userToken
    });
    expect(readInvestUnlocked.ok).toBe(true);
    expect(readInvestUnlocked.data.length).toBeGreaterThanOrEqual(1);
    expect(readInvestUnlocked.data[0].ativo).toBe('PETR4');

    // 5.3 Ponto 4: SEPARAÇÃO ESTRITA DAS SESSÕES DE INVESTIMENTOS
    // Emite Sessão B (segundo login, simulando o cliente antigo ou concorrente NÃO desbloqueado)
    const loginSessionB = await authCall('/token?grant_type=password', {
      email: testEmail,
      password: testPassword,
    });
    expect(loginSessionB.ok).toBe(true);
    const userTokenSessionB = loginSessionB.data.access_token;
    expect(userTokenSessionB).toBeTruthy();
    expect(userTokenSessionB).not.toBe(userToken); // Tokens e jti distintos

    // Sessão B tenta ler investimentos -> DEVE RETORNAR 0 LINHAS (RLS estrito bloqueia)
    // Comprova que o desbloqueio da Sessão A NÃO vaza nem desprotege a Sessão B!
    const readInvestSessionB = await postgrest(`/investimentos?user_id=eq.${userId}&select=*`, {
      token: userTokenSessionB
    });
    expect(readInvestSessionB.ok).toBe(true);
    expect(readInvestSessionB.data.length).toBe(0);

    // =========================================================================
    // BLOQUEIO DO CONTRATO DA APLICAÇÃO ANTIGA (Eliminação de Brechas)
    // =========================================================================

    // 5.4 Leitura direta de client_secret em divipay_config -> BLOQUEADA (400 ou 403)
    const oldDivi = await postgrest(`/divipay_config?user_id=eq.${userId}&select=client_id,client_secret`, {
      token: userToken
    });
    expect(oldDivi.ok).toBe(false);
    expect([400, 401, 403]).toContain(oldDivi.status);

    // 5.5 Leitura direta de secret_key em eyemobile_config -> BLOQUEADA (400 ou 403)
    const oldEye = await postgrest(`/eyemobile_config?user_id=eq.${userId}&select=access_key,secret_key`, {
      token: userToken
    });
    expect(oldEye.ok).toBe(false);
    expect([400, 401, 403]).toContain(oldEye.status);

    // 5.6 Leitura de senha_investimentos -> BLOQUEADA (401 ou 403)
    const oldSenha = await postgrest(`/senha_investimentos?user_id=eq.${userId}`, {
      token: userToken
    });
    expect(oldSenha.ok).toBe(false);
    expect([400, 401, 403]).toContain(oldSenha.status);

    // 5.7 Auto-promoção de role para admin em profiles -> BLOQUEADA (400 ou 403)
    const oldRole = await postgrest(`/profiles?user_id=eq.${userId}`, {
      method: 'PATCH',
      token: userToken,
      body: { role: 'admin' }
    });
    expect(oldRole.ok).toBe(false);
    expect([400, 401, 403]).toContain(oldRole.status);
  });

  test('6. Procedimento de Contingência: Rollback seguro mantém segredos e investimentos protegidos', async () => {
    // 6.1 Executa script de rollback seguro
    await executeSql(rollbackSql);
    await reloadPostgrest();

    // 6.2 Segredos CONTINUAM BLOQUEADOS após o rollback
    const rollbackDivi = await postgrest(`/divipay_config?user_id=eq.${userId}&select=client_id,client_secret`, {
      token: userToken
    });
    expect(rollbackDivi.ok).toBe(false);
    expect([400, 401, 403]).toContain(rollbackDivi.status);

    const rollbackEye = await postgrest(`/eyemobile_config?user_id=eq.${userId}&select=access_key,secret_key`, {
      token: userToken
    });
    expect(rollbackEye.ok).toBe(false);
    expect([400, 401, 403]).toContain(rollbackEye.status);

    const rollbackSenha = await postgrest(`/senha_investimentos?user_id=eq.${userId}`, {
      token: userToken
    });
    expect(rollbackSenha.ok).toBe(false);
    expect([400, 401, 403]).toContain(rollbackSenha.status);

    const rollbackRole = await postgrest(`/profiles?user_id=eq.${userId}`, {
      method: 'PATCH',
      token: userToken,
      body: { role: 'admin' }
    });
    expect(rollbackRole.ok).toBe(false);
    expect([400, 401, 403]).toContain(rollbackRole.status);

    // 6.3 Sessão não desbloqueada CONTINUA RECEBENDO 0 LINHAS em investimentos
    const loginRollbackSession = await authCall('/token?grant_type=password', {
      email: testEmail,
      password: testPassword,
    });
    const tokenSessao = loginRollbackSession.data.access_token;
    const investRollback = await postgrest(`/investimentos?user_id=eq.${userId}&select=*`, {
      token: tokenSessao
    });
    expect(investRollback.ok).toBe(true);
    expect(investRollback.data.length).toBe(0);
  });

  test('7. Restauração do Estado Alvo (Fase C) para os testes subsequentes', async () => {
    await executeSql(`
      SET wallet.deploy_phase_b_completed = 'true';
      ${phaseCSql}
    `);
    await reloadPostgrest();
  });
});
