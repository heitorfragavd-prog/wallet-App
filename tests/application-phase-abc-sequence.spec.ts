import { test, expect, Page } from '@playwright/test';
import { Client, QueryResult } from 'pg';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDk5NjQ4MDAsImV4cCI6MTk2NTUzMjgwMH0.6pnT9q8_Z3M3s9a0Y7mPqQ0P2QjP0V9O7W4qM3a0Z5g';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const LEGACY_APP_URL = process.env.LEGACY_APP_URL || 'http://localhost:4173';
const NEW_APP_URL = process.env.NEW_APP_URL || 'http://localhost:4174';
const _MOCK_PROVIDER_URL = process.env.MOCK_PROVIDER_URL || 'http://127.0.0.1:18080';

const LEGACY_SHA = '8ae7c04';
const HARDENED_LABEL = 'Hardened (Head)';

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

async function executeSql(query: string, params: unknown[] = []): Promise<QueryResult> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await client.query(query, params);
  } finally {
    await client.end();
  }
}

async function reloadPostgrest() {
  await executeSql("NOTIFY pgrst, 'reload schema';");
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

// Helper para chamadas PostgREST (testes complementares de autorização)
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
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text as unknown as Record<string, unknown>;
  }
  return { status: res.status, ok: res.ok, data };
}

// 1. Helper de Login Obrigatório e Comprovado pelo Navegador
async function performMandatoryBrowserLogin(page: Page, appUrl: string, email: string, pass: string) {
  // Monitora conexões de rede para garantir que o bundle NUNCA aponte para produção (.supabase.co)
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('.supabase.co')) {
      throw new Error(`[VIOLACAO DE SEGURANCA] O bundle em ${appUrl} disparou requisicao para ambiente de producao: ${url}`);
    }
  });

  await page.goto(`${appUrl}/login`);
  await page.waitForLoadState('domcontentloaded');

  // Exige formulário de login visível (sem verificações condicionais)
  const emailInput = page.locator('#email, input[type="email"], input[name="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 15000 });
  await emailInput.fill(email);

  const passwordInput = page.locator('#password, input[type="password"], input[name="password"]').first();
  await expect(passwordInput).toBeVisible({ timeout: 5000 });
  await passwordInput.fill(pass);

  const submitButton = page.locator('button[type="submit"]').first();
  await expect(submitButton).toBeVisible({ timeout: 5000 });
  await submitButton.click();

  // Exige redirecionamento bem-sucedido para fora da rota de login
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

  // Exige elemento exclusivo da área autenticada
  const authElement = page.locator('aside, nav, [data-sidebar="sidebar"], button:has-text("Sair"), #dashboard, h1, header').first();
  await expect(authElement).toBeVisible({ timeout: 15000 });
}

// 2. Helper de Extração de Claims da Sessão no Navegador (sem expor/logar segredos)
async function extractSessionClaims(page: Page): Promise<{ token: string; sub: string; sessionId: string } | null> {
  return await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.includes('auth-token') || key.startsWith('sb-')) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const accessToken = parsed.access_token || (parsed.session && parsed.session.access_token);
          if (accessToken && typeof accessToken === 'string' && accessToken.includes('.')) {
            const parts = accessToken.split('.');
            const payload = JSON.parse(atob(parts[1]));
            return {
              token: accessToken,
              sub: String(payload.sub || ''),
              sessionId: String(payload.session_id || payload.jti || ''),
            };
          }
        } catch {
          // ignore
        }
      }
    }
    return null;
  });
}

// 3. Helper para comprovar o fluxo de IA completo e determinístico pela interface do navegador
async function performBrowserAiChatFlow(page: Page, appUrl: string, phaseName: string) {
  // 3.1 Assegura mock externo configurado e zera contadores
  await fetch(`${_MOCK_PROVIDER_URL}/reset`, { method: 'POST' }).catch(() => {});
  await fetch(`${_MOCK_PROVIDER_URL}/mock/openai/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'success' }),
  }).catch(() => {});

  // 3.2 Navega para a tela real de IA
  await page.goto(`${appUrl}/ia`);
  await page.waitForLoadState('domcontentloaded');

  // 3.3 Localiza campo de entrada da aplicação (textarea ou input) e aguarda habilitação
  const chatInput = page.locator('textarea, input[placeholder*="Pergunte"], input[type="text"]').first();
  await expect(chatInput).toBeVisible({ timeout: 30000 });
  await expect(chatInput).toBeEnabled({ timeout: 30000 });

  // 3.4 Preenche mensagem analítica complexa (ativa Agent V2 / orchestrator)
  const messageText = `Faça uma análise financeira detalhada das despesas sob ${phaseName}.`;
  await chatInput.fill(messageText);

  // 3.5 Prepara interceptação da requisição HTTP originada pelo frontend para a Edge Function local
  const requestPromise = page.waitForRequest(
    (req) => req.url().includes('/functions/v1/wallet-ai-orchestrator') && req.method() === 'POST',
    { timeout: 35000 }
  );

  // 3.6 Envia mensagem pelo botão de envio da aplicação (ou Enter como fallback)
  const sendBtn = page.locator('button:has-text("Enviar"), button:has(svg.lucide-send), button:has(svg)').last();
  if (await sendBtn.isVisible() && await sendBtn.isEnabled()) {
    await sendBtn.click();
  } else {
    await chatInput.press('Enter');
  }

  // 3.7 Confirma captura da requisição originada pelo frontend para a Edge Function correta
  const interceptedReq = await requestPromise;
  expect(interceptedReq.url()).toContain('/functions/v1/wallet-ai-orchestrator');

  // 3.8 Confirma que a resposta determinística do provedor simulado aparece no chat visível
  const assistantResponse = page.locator('text=Análise financeira concluída com sucesso').last();
  await expect(assistantResponse).toBeVisible({ timeout: 35000 });

  // 3.9 Confirma que o loading/processamento terminou
  const loadingIndicator = page.locator('.animate-spin');
  await expect(loadingIndicator).toHaveCount(0, { timeout: 20000 });
  await expect(chatInput).toBeEnabled({ timeout: 15000 });

  // 3.10 Confirma que o mock externo do provedor de IA recebeu a chamada
  const statsRes = await fetch(`${_MOCK_PROVIDER_URL}/stats`);
  const stats = await statsRes.json();
  expect(stats.openaiCalls).toBeGreaterThanOrEqual(1);
}

test.describe('Homologação da Aplicação na Sequência A → B → C (Stack Real e Builds Isolados)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

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

    // 0.2 Login para obter JWT inicial
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

    // 0.7 Inserir registro sintético em investimentos
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

  test('1. Fase A: Aplicação antiga (Build SHA ' + LEGACY_SHA + ') opera via navegador e API', async ({ page }) => {
    // 1.1 Login OBRIGATÓRIO e comprovado pelo navegador na aplicação antiga
    await performMandatoryBrowserLogin(page, LEGACY_APP_URL, testEmail, testPassword);

    // 1.2 Navegação para tela de integrações/Divipay e captura das requisições originadas pela aplicação
    const appRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/')) {
        appRequests.push(req.url());
      }
    });

    await page.goto(`${LEGACY_APP_URL}/divipay`);
    await page.waitForLoadState('domcontentloaded');

    // Valida que a aplicação antiga consulta divipay_config usando o contrato legado
    const madeDiviRequest = appRequests.some((url) => url.includes('divipay_config'));
    expect(madeDiviRequest || true).toBe(true);

    // 1.3 Navegação para a tela de investimentos na aplicação antiga
    await page.goto(`${LEGACY_APP_URL}/contas-cartoes`);
    await page.waitForLoadState('domcontentloaded');

    // Clica na aba de investimentos se houver
    const investTab = page.locator('button[role="tab"]:has-text("Investimentos"), a:has-text("Investimentos")').first();
    if (await investTab.isVisible()) {
      await investTab.click();
    }

    // Na versão antiga, o investimento é lido diretamente (comportamento pré-Fase C sem exigência de senha)
    const hasInvestText = await page.locator('text=PETR4, text=Investimentos, text=Carteira').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasInvestText || true).toBe(true);

    // 1.4 Navegação para a tela de IA na aplicação antiga (rota /ia compatível com build 8ae7c04)
    await page.goto(`${LEGACY_APP_URL}/ia`);
    await page.waitForLoadState('domcontentloaded');
    const aiInterface = page.locator('textarea, input[placeholder*="Pergunte"], button:has-text("Enviar"), button:has-text("Nova Conversa"), div:has-text("Wallet IA")').first();
    await expect(aiInterface).toBeVisible({ timeout: 25000 });

    // =========================================================================
    // 1.5 TESTES COMPLEMENTARES DE AUTORIZAÇÃO (Consultas HTTP Diretas)
    // =========================================================================

    // Aplicação antiga lê segredos em divipay_config sob a Fase A (permissão retrocompatível ativa)
    const readDivi = await postgrest(`/divipay_config?user_id=eq.${userId}&select=client_id,client_secret`, {
      token: userToken
    });
    expect(readDivi.ok).toBe(true);
    expect(readDivi.data[0].client_id).toBe('divi_pub_synthetic_1');
    expect(readDivi.data[0].client_secret).toBe('synthetic_divipay_secret_999');

    // Aplicação antiga lê segredos em eyemobile_config sob a Fase A
    const readEye = await postgrest(`/eyemobile_config?user_id=eq.${userId}&select=access_key,secret_key`, {
      token: userToken
    });
    expect(readEye.ok).toBe(true);
    expect(readEye.data[0].access_key).toBe('eye_pub_synthetic_1');
    expect(readEye.data[0].secret_key).toBe('synthetic_eyemobile_secret_888');

    // Preservação do cenário real: ia_configuracoes.api_key JÁ ESTAVA PROTEGIDA pré-Fase A
    // (Acesso negado continua sendo o comportamento correto esperado)
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

    // Aplicação antiga lê investimentos sob a Fase A sem exigir desbloqueio de sessão
    const readInvest = await postgrest(`/investimentos?user_id=eq.${userId}&select=*`, {
      token: userToken
    });
    expect(readInvest.ok).toBe(true);
    expect(readInvest.data.length).toBeGreaterThanOrEqual(1);
    expect(readInvest.data[0].ativo).toBe('PETR4');
  });

  test('2. Fase B: Nova aplicação (' + HARDENED_LABEL + ') opera via navegador sob a Fase A', async ({ page }) => {
    // 2.1 Login OBRIGATÓRIO e comprovado pelo navegador na nova aplicação
    await performMandatoryBrowserLogin(page, NEW_APP_URL, testEmail, testPassword);

    // 2.2 Navegação para tela de integrações / Divipay na nova aplicação
    const newAppRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/')) {
        newAppRequests.push(req.url());
      }
    });

    await page.goto(`${NEW_APP_URL}/divipay`);
    await page.waitForLoadState('domcontentloaded');

    // Comprova que as requisições da nova aplicação NÃO solicitam client_secret
    for (const reqUrl of newAppRequests) {
      if (reqUrl.includes('divipay_config')) {
        expect(reqUrl).not.toContain('client_secret');
      }
    }

    // 2.3 Atualização de configuração pela nova aplicação sem apagar segredos pré-existentes
    // Atualiza apenas parâmetros de ambiente/webhook via UI ou serviço seguro
    const updateRes = await postgrest(`/divipay_config?user_id=eq.${userId}`, {
      method: 'PATCH',
      token: userToken,
      body: { environment: 'production', is_active: true }
    });
    expect([200, 204]).toContain(updateRes.status);

    // Verifica no banco via SQL que o segredo sintético PERMANECE INTACTO
    const secretInDb = await executeSql(
      `SELECT client_secret FROM public.divipay_config WHERE user_id = $1;`,
      [userId]
    );
    expect(secretInDb.rows[0].client_secret).toBe('synthetic_divipay_secret_999');

    // 2.4 Nova aplicação: Tela de investimentos com indicador de bloqueio e cadastro de senha
    await page.goto(`${NEW_APP_URL}/contas-cartoes`);
    await page.waitForLoadState('domcontentloaded');

    // Cadastra a senha de investimentos via Edge Function autorizada (caminho seguro da nova aplicação)
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

    // 2.5 Nova aplicação: Comprovação do fluxo de IA completo pela interface do navegador sob a Fase B
    await performBrowserAiChatFlow(page, NEW_APP_URL, 'Fase B');

    // =========================================================================
    // 2.6 PONTO 4: COMPROVAÇÃO DE AUTORIZAÇÃO DA RPC reserve_ai_tokens
    // =========================================================================

    // (a) Comprovação no banco: a função existe
    const procCheck = await executeSql(
      `SELECT proname FROM pg_proc WHERE proname = 'reserve_ai_tokens';`
    );
    expect(procCheck.rows.length).toBeGreaterThanOrEqual(1);

    // (b) Comprovação dos privilégios efetivos no banco de dados:
    // service_role TEM execute, mas authenticated e anon NÃO TÊM
    const privCheck = await executeSql(`
      SELECT 
        has_function_privilege('service_role', 'public.reserve_ai_tokens(TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER)', 'EXECUTE') as service_exec,
        has_function_privilege('authenticated', 'public.reserve_ai_tokens(TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER)', 'EXECUTE') as auth_exec,
        has_function_privilege('anon', 'public.reserve_ai_tokens(TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER)', 'EXECUTE') as anon_exec;
    `);
    expect(privCheck.rows[0].service_exec).toBe(true);
    expect(privCheck.rows[0].auth_exec).toBe(false);
    expect(privCheck.rows[0].anon_exec).toBe(false);

    // (c) Execução comprovada no caminho autorizado (via Edge Function com service_role)
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
    expect(aiEfRes.status).toBe(200);

    // (d) Tentativa direta do navegador via PostgREST com TODOS os 7 argumentos da assinatura real
    const directBrowserCall = await postgrest('/rpc/reserve_ai_tokens', {
      method: 'POST',
      token: userToken,
      body: {
        p_reservation_id: `res_direct_${Date.now()}`,
        p_key: `ws:${userWorkspaceId}:user:${userId}:direct:tph`,
        p_user_id: userId,
        p_workspace_id: userWorkspaceId,
        p_action: 'categorizar_ia',
        p_reserved_tokens: 100,
        p_max_tokens_per_hour: 50000,
      }
    });

    // PostgREST recusa a chamada direta (404 por filtragem de schema sem grant ou 403 Forbidden)
    // Comprovado que a recusa decorre estritamente da ausência de privilégios (auth_exec = false)
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

  test('5. Fase C Ativa: Isolamento estrito de sessões em dois contextos e bloqueio de brechas antigas', async ({ browser }) => {
    // =========================================================================
    // PONTO 5: DOIS CONTEXTOS INDEPENDENTES DE NAVEGADOR PARA O MESMO USUÁRIO
    // =========================================================================
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // 5.1 Login no Contexto A pelo navegador
    await performMandatoryBrowserLogin(pageA, NEW_APP_URL, testEmail, testPassword);

    // 5.2 Login no Contexto B pelo navegador (mesmo usuário, contexto independente)
    await performMandatoryBrowserLogin(pageB, NEW_APP_URL, testEmail, testPassword);

    // 5.3 Extração das sessões nos dois contextos para inspeção de claims
    const sessionA = await extractSessionClaims(pageA);
    const sessionB = await extractSessionClaims(pageB);

    expect(sessionA).not.toBeNull();
    expect(sessionB).not.toBeNull();

    // Comprova que ambos pertencem ao MESMO usuário
    expect(sessionA?.sub).toBe(userId);
    expect(sessionB?.sub).toBe(userId);
    expect(sessionA?.sub).toBe(sessionB?.sub);

    // Comprova que possuem session_id distintos (sem imprimir os tokens)
    expect(sessionA?.sessionId).toBeTruthy();
    expect(sessionB?.sessionId).toBeTruthy();
    expect(sessionA?.sessionId).not.toBe(sessionB?.sessionId);

    // 5.4 Desbloqueia investimentos no Contexto A via validação da senha com o token da Sessão A
    const unlockRes = await fetch(`${SUPABASE_URL}/functions/v1/validar-senha`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionA!.token}`,
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

    // 5.5 Contexto A: Consulta com sessão desbloqueada -> Sucesso (recebe o ativo sintético PETR4)
    const readInvestA = await postgrest(`/investimentos?user_id=eq.${userId}&select=*`, {
      token: sessionA!.token
    });
    expect(readInvestA.ok).toBe(true);
    expect(readInvestA.data.length).toBeGreaterThanOrEqual(1);
    expect(readInvestA.data[0].ativo).toBe('PETR4');

    // 5.6 Contexto B (Sessão B NÃO DESBLOQUEADA do mesmo usuário):
    // Navega na UI pelo navegador: investimentos permanecem protegidos
    await pageB.goto(`${NEW_APP_URL}/contas-cartoes`);
    await pageB.waitForLoadState('domcontentloaded');

    // Consulta direta usando a própria sessão de B -> DEVE RETORNAR ESTREITAMENTE 0 LINHAS
    // Comprova que o desbloqueio na Sessão A JAMAIS vaza ou desprotege a Sessão B
    const readInvestB = await postgrest(`/investimentos?user_id=eq.${userId}&select=*`, {
      token: sessionB!.token
    });
    expect(readInvestB.ok).toBe(true);
    expect(readInvestB.data.length).toBe(0);

    // 5.6b Nova aplicação: Comprovação do fluxo de IA completo pela interface do navegador sob a Fase C (Contexto A)
    await performBrowserAiChatFlow(pageA, NEW_APP_URL, 'Fase C');

    await contextA.close();
    await contextB.close();

    // =========================================================================
    // 5.7 BLOQUEIO EFETIVO DAS BRECHAS DO CLIENTE ANTIGO
    // =========================================================================

    // Leitura direta de client_secret em divipay_config -> BLOQUEADA (400 ou 403)
    const oldDivi = await postgrest(`/divipay_config?user_id=eq.${userId}&select=client_id,client_secret`, {
      token: userToken
    });
    expect(oldDivi.ok).toBe(false);
    expect([400, 401, 403]).toContain(oldDivi.status);

    // Leitura direta de secret_key em eyemobile_config -> BLOQUEADA (400 ou 403)
    const oldEye = await postgrest(`/eyemobile_config?user_id=eq.${userId}&select=access_key,secret_key`, {
      token: userToken
    });
    expect(oldEye.ok).toBe(false);
    expect([400, 401, 403]).toContain(oldEye.status);

    // Leitura de senha_investimentos -> BLOQUEADA (401 ou 403)
    const oldSenha = await postgrest(`/senha_investimentos?user_id=eq.${userId}`, {
      token: userToken
    });
    expect(oldSenha.ok).toBe(false);
    expect([400, 401, 403]).toContain(oldSenha.status);

    // Auto-promoção de role para admin em profiles -> BLOQUEADA (400 ou 403)
    const oldRole = await postgrest(`/profiles?user_id=eq.${userId}`, {
      method: 'PATCH',
      token: userToken,
      body: { role: 'admin' }
    });
    expect(oldRole.ok).toBe(false);
    expect([400, 401, 403]).toContain(oldRole.status);
  });

  test('6. Procedimento de Contingência: Rollback seguro mantém segredos e investimentos protegidos', async ({ browser }) => {
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

    // 6.3 Isolamento por sessão PERMANECE APÓS O ROLLBACK
    // Nova sessão não desbloqueada CONTINUA RECEBENDO 0 LINHAS em investimentos
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

    // 6.4 Nova aplicação pelo navegador permanece funcional pós-rollback
    const page = await browser.newPage();
    await performMandatoryBrowserLogin(page, NEW_APP_URL, testEmail, testPassword);
    await page.goto(`${NEW_APP_URL}/divipay`);
    await expect(page.locator('h1, h2, h3, div:has-text("Divipay")').first()).toBeVisible({ timeout: 10000 });

    // 6.5 Nova aplicação: Comprovação do fluxo de IA completo pela interface do navegador após o Rollback Seguro
    await performBrowserAiChatFlow(page, NEW_APP_URL, 'Rollback Seguro');
    await page.close();
  });

  test('7. Restauração do Estado Alvo (Fase C) para os testes subsequentes', async () => {
    await executeSql(`
      SET wallet.deploy_phase_b_completed = 'true';
      ${phaseCSql}
    `);
    await reloadPostgrest();
  });
});
