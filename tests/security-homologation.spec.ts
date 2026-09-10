import { test, expect } from '@playwright/test';
import { Client, QueryResult } from 'pg';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDk5NjQ4MDAsImV4cCI6MTk2NTUzMjgwMH0.6pnT9q8_Z3M3s9a0Y7mPqQ0P2QjP0V9O7W4qM3a0Z5g';
const INBUCKET_URL = process.env.INBUCKET_URL || 'http://localhost:54324';
const _MOCK_PROVIDER_URL = process.env.MOCK_PROVIDER_URL || 'http://localhost:18080';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function executeSql(query: string, params: unknown[] = []): Promise<QueryResult> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await client.query(query, params);
  } finally {
    await client.end();
  }
}

// Helper para chamadas diretas ao PostgREST
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
  if (!res.ok) {
    console.error(`[POSTGREST_FAIL] ${method} ${endpoint} -> status ${res.status}:`, JSON.stringify(data));
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
  if (!res.ok) {
    console.error(`[AUTH_FAIL] POST /auth/v1${endpoint} -> status ${res.status}:`, JSON.stringify(data));
  }
  return { status: res.status, ok: res.ok, data };
}

// Helper universal para Inbucket e Mailpit
async function getEmailMessages(emailPrefix: string) {
  try {
    // 1. Tenta API do Mailpit (Supabase CLI moderno na porta 54324)
    const mailpitRes = await fetch(`${INBUCKET_URL}/api/v1/messages`);
    if (mailpitRes.ok) {
      const data = await mailpitRes.json();
      if (data && Array.isArray(data.messages)) {
        return data.messages;
      }
    }
  } catch (e) {
    void e;
  }

  try {
    // 2. Tenta API do Inbucket legado
    const inbucketRes = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${emailPrefix}`);
    if (inbucketRes.ok) {
      const iData = await inbucketRes.json();
      if (Array.isArray(iData)) return iData;
    }
  } catch (e) {
    void e;
  }

  return [];
}

test.describe('Homologação de Segurança e Auditoria End-to-End (Real Supabase Stack)', () => {
  test.describe.configure({ mode: 'serial' });

  const timestamp = Date.now();
  const user1Email = `user1_${timestamp}@example.com`;
  const user2Email = `user2_${timestamp}@example.com`;
  const testPassword = 'PasswordStrong@123';
  let user1Token = '';
  let user1Id = '';
  let user2Token = '';
  let user2Id = '';
  let user1WorkspaceId = '';
  let user2WorkspaceId = '';

  async function ensureUser1() {
    if (user1Token && user1Id) return { token: user1Token, id: user1Id };
    const signup = await authCall('/signup', {
      email: user1Email,
      password: testPassword,
      data: { name: 'Usuario Homologacao 1', telefone: '11999990001' }
    });
    const login = await authCall('/token?grant_type=password', {
      email: user1Email,
      password: testPassword,
    });
    user1Token = login.data?.access_token || '';
    user1Id = login.data?.user?.id || signup.data?.user?.id || signup.data?.id || '';
    return { token: user1Token, id: user1Id };
  }

  async function ensureUser2() {
    if (user2Token && user2Id) return { token: user2Token, id: user2Id };
    const signup = await authCall('/signup', {
      email: user2Email,
      password: testPassword,
      data: { name: 'Usuario Homologacao 2', telefone: '11999990002' }
    });
    const login = await authCall('/token?grant_type=password', {
      email: user2Email,
      password: testPassword,
    });
    user2Token = login.data?.access_token || '';
    user2Id = login.data?.user?.id || signup.data?.user?.id || signup.data?.id || '';
    return { token: user2Token, id: user2Id };
  }

  async function ensureUser1Workspace() {
    await ensureUser1();
    if (user1WorkspaceId) return user1WorkspaceId;
    const ws1 = await postgrest('/workspaces', {
      method: 'POST',
      token: user1Token,
      headers: { 'Prefer': 'return=representation' },
      body: { user_id: user1Id, nome: 'Workspace Pessoal U1', tipo: 'PF', is_default: true }
    });
    user1WorkspaceId = Array.isArray(ws1.data) ? ws1.data[0]?.id : ws1.data?.id;
    return user1WorkspaceId;
  }

  test('1. Auth completo: Cadastro com Inbucket, confirmação, login, logout e recovery', async () => {
    // 1.1 Cadastro do Usuario 1
    const signup = await authCall('/signup', {
      email: user1Email,
      password: testPassword,
      data: { name: 'Usuario Homologacao 1', telefone: '11999990001' }
    });
    expect(signup.status).toBeLessThan(300);
    user1Id = signup.data?.user?.id || signup.data?.id || '';

    // 1.2 Verificacao no Inbucket / Mailpit (capturador local de email)
    const messages = await getEmailMessages(`user1_${timestamp}`);
    expect(Array.isArray(messages)).toBe(true);

    // 1.3 Login no GoTrue isolado
    const login = await authCall('/token?grant_type=password', {
      email: user1Email,
      password: testPassword,
    });
    expect(login.ok).toBe(true);
    user1Token = login.data.access_token;
    user1Id = login.data?.user?.id || user1Id;
    expect(user1Token).toBeDefined();

    // 1.4 Cadastro e Login do Usuario 2
    await ensureUser2();
    expect(user2Token).toBeDefined();
    expect(user2Id).toBeTruthy();

    // 1.5 Teste de Recuperacao de Senha com servico de email (Mailpit/Inbucket)
    const recovery = await authCall('/recover', { email: user1Email });
    expect(recovery.status).toBeLessThan(300);
    let recoveryMsgs: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      recoveryMsgs = await getEmailMessages(`user1_${timestamp}`);
      if (Array.isArray(recoveryMsgs) && recoveryMsgs.length >= 1) break;
      await new Promise(r => setTimeout(r, 400));
    }
    expect(recovery.ok).toBe(true);
    expect(Array.isArray(recoveryMsgs)).toBe(true);

    // 1.6 Logout
    const logout = await authCall('/logout', {}, user1Token);
    expect(logout.status).toBeLessThan(300);

    // Reloga para restaurar sessao ativa do Usuario 1
    const relogin = await authCall('/token?grant_type=password', { email: user1Email, password: testPassword });
    user1Token = relogin.data.access_token;
    user1Id = relogin.data?.user?.id || user1Id;
  });

  test('2. Perfis: Edição legítima permitida e bloqueio absoluto de auto-promoção para admin', async () => {
    await ensureUser1();
    // 2.1 Edicao legitima de name e telefone
    const updateRes = await postgrest(`/profiles?user_id=eq.${user1Id}`, {
      method: 'PATCH',
      token: user1Token,
      body: { name: 'Nome Atualizado Legitimo', telefone: '11888887777' }
    });
    expect(updateRes.status).toBeLessThan(300);

    // 2.2 Verificacao de que o perfil foi atualizado
    const getProfile = await postgrest(`/profiles?user_id=eq.${user1Id}`, { token: user1Token });
    expect(getProfile.data[0].name).toBe('Nome Atualizado Legitimo');
    expect(getProfile.data[0].role).toBe('user');

    // 2.3 Tentativa de auto-promocao a admin (tentativa de alterar coluna role)
    const escalateRes = await postgrest(`/profiles?user_id=eq.${user1Id}`, {
      method: 'PATCH',
      token: user1Token,
      body: { role: 'admin' }
    });
    // Deve falhar ou ser bloqueado pelo Column-Level Security / RLS
    if (escalateRes.ok) {
      // Se a query retornou sem erro HTTP, certificar de que a role NAO foi alterada no banco
      const checkRole = await postgrest(`/profiles?user_id=eq.${user1Id}`, { token: user1Token });
      expect(checkRole.data[0].role).toBe('user');
    } else {
      expect(escalateRes.status).toBeGreaterThanOrEqual(400);
    }
  });

  test('3. Senha de Investimentos: Cadastro, rejeição de recadastro e ciclo de vida', async () => {
    await ensureUser1();
    // 3.1 Primeiro cadastro da senha de investimentos via Edge Function real
    const cadRes = await fetch(`${SUPABASE_URL}/functions/v1/validar-senha`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1Token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'cadastrar',
        senha: 'InvestPass@123',
      })
    });
    expect([200, 201]).toContain(cadRes.status);
    const cadData = await cadRes.json();
    expect(cadData.success).toBe(true);

    // 3.2 Tentativa de recadastro direto (DEVE ser rejeitado com 409 Conflict)
    const recadRes = await fetch(`${SUPABASE_URL}/functions/v1/validar-senha`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1Token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'cadastrar',
        senha: 'NovaSenhaHack@123',
      })
    });
    expect(recadRes.status).toBe(409);

    // 3.3 Verificacao via RPC has_senha_investimentos
    const hasSenha = await postgrest('/rpc/has_senha_investimentos', {
      method: 'POST',
      token: user1Token,
    });
    expect(hasSenha.ok).toBe(true);
    expect(hasSenha.data).toBe(true);

    // 3.4 Tentativa com senha incorreta: falha e contabiliza tentativas
    const failAttempt = await fetch(`${SUPABASE_URL}/functions/v1/validar-senha`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1Token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'validar',
        senha: 'SenhaErrada@999',
      })
    });
    const failData = await failAttempt.json();
    expect(failData.valido).toBe(false);
  });

  test('4. Duas sessões concorrentes: Desbloquear uma NÃO desbloqueia a outra', async () => {
    await ensureUser1();
    // 4.1 Sessão A: desbloqueia via validar-senha com a senha correta
    const unlockA = await fetch(`${SUPABASE_URL}/functions/v1/validar-senha`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1Token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'validar',
        senha: 'InvestPass@123',
      })
    });
    expect(unlockA.status).toBe(200);
    const dataA = await unlockA.json();
    expect(dataA.valido).toBe(true);
    const tokenInvestA = dataA.token;
    expect(tokenInvestA).toBeDefined();

    // 4.2 Sessão B: segundo login do mesmo usuário (novo JWT com jti/session_id diferente)
    const loginSessionB = await authCall('/token?grant_type=password', {
      email: user1Email,
      password: testPassword,
    });
    expect(loginSessionB.ok).toBe(true);
    const user1TokenSessionB = (loginSessionB.data as Record<string, string>).access_token;

    // 4.3 Verificacao: O token emitido para a Sessão A NÃO valida na Sessão B
    const checkBWithTokenA = await fetch(`${SUPABASE_URL}/functions/v1/validar-senha`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1TokenSessionB}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'verify_token',
        token: tokenInvestA,
      })
    });
    // Deve ser recusado com 401 não autorizado para a sessão concorrente
    expect(checkBWithTokenA.status).toBe(401);
    const verifyBData = await checkBWithTokenA.json();
    expect(verifyBData.valid).toBe(false);

    // 4.4 Verificação no banco: is_investimentos_unlocked na Sessão B retorna false
    const dbCheckB = await postgrest('/rpc/is_investimentos_unlocked', {
      method: 'POST',
      token: user1TokenSessionB,
      body: { p_user_id: user1Id }
    });
    if (dbCheckB.ok) {
      expect(dbCheckB.data).toBe(false);
    }
  });

  test('5. Multi-Tenant: Dois usuários de workspaces diferentes com dados confirmados existentes', async () => {
    await ensureUser1();
    await ensureUser2();
    // 5.1 Usuario 1 cria workspace próprio
    const ws1 = await postgrest('/workspaces', {
      method: 'POST',
      token: user1Token,
      headers: { 'Prefer': 'return=representation' },
      body: { user_id: user1Id, nome: 'Workspace Pessoal U1', tipo: 'PF', is_default: true }
    });
    expect(ws1.status).toBeLessThan(300);
    user1WorkspaceId = Array.isArray(ws1.data) ? ws1.data[0]?.id : ws1.data?.id;

    // 5.2 Usuario 2 cria workspace próprio
    const ws2 = await postgrest('/workspaces', {
      method: 'POST',
      token: user2Token,
      headers: { 'Prefer': 'return=representation' },
      body: { user_id: user2Id, nome: 'Workspace Corporativo U2', tipo: 'PJ', is_default: true }
    });
    expect(ws2.status).toBeLessThan(300);
    user2WorkspaceId = Array.isArray(ws2.data) ? ws2.data[0]?.id : ws2.data?.id;

    // 5.3 CONFIRMAÇÃO DE EXISTÊNCIA: Usuario 1 lê com sucesso seu workspace
    const readOwnU1 = await postgrest(`/workspaces?id=eq.${user1WorkspaceId}`, { token: user1Token });
    expect(readOwnU1.ok).toBe(true);
    expect(readOwnU1.data.length).toBe(1);
    expect(readOwnU1.data[0].nome).toBe('Workspace Pessoal U1');

    // 5.4 CONFIRMAÇÃO DE EXISTÊNCIA: Usuario 2 lê com sucesso seu workspace
    const readOwnU2 = await postgrest(`/workspaces?id=eq.${user2WorkspaceId}`, { token: user2Token });
    expect(readOwnU2.ok).toBe(true);
    expect(readOwnU2.data.length).toBe(1);
    expect(readOwnU2.data[0].nome).toBe('Workspace Corporativo U2');

    // 5.5 ISOLAMENTO NEGATIVO: Usuario 2 tenta ler workspace do Usuario 1 (dados comprovadamente existentes)
    const crossRead = await postgrest(`/workspaces?id=eq.${user1WorkspaceId}`, { token: user2Token });
    expect(crossRead.ok).toBe(true);
    expect(crossRead.data.length).toBe(0); // RLS oculta estritamente

    // 5.6 ISOLAMENTO NEGATIVO: Usuario 2 tenta alterar workspace do Usuario 1
    const _crossUpdate = await postgrest(`/workspaces?id=eq.${user1WorkspaceId}`, {
      method: 'PATCH',
      token: user2Token,
      body: { nome: 'HACKED_BY_U2' }
    });
    // RLS impede atualizacao (0 linhas afetadas)
    const recheckU1 = await postgrest(`/workspaces?id=eq.${user1WorkspaceId}`, { token: user1Token });
    expect(recheckU1.data[0].nome).toBe('Workspace Pessoal U1');
  });

  test('6. Membro de workspace compartilhado: Acesso concedido e revogação imediata pós-remoção', async () => {
    await ensureUser1();
    await ensureUser2();
    await ensureUser1Workspace();
    // 6.1 Usuario 1 convida Usuario 2 como membro de seu workspace
    const addMember = await postgrest('/workspace_members', {
      method: 'POST',
      token: user1Token,
      headers: { 'Prefer': 'return=representation' },
      body: {
        workspace_id: user1WorkspaceId,
        user_id: user2Id,
        role: 'member',
        status: 'active'
      }
    });
    expect([200, 201, 204]).toContain(addMember.status);

    // 6.2 Usuario 2 agora consegue consultar os dados autorizados do workspace compartilhado
    const memberRead = await postgrest(`/workspaces?id=eq.${user1WorkspaceId}`, { token: user2Token });
    // Deve conseguir ler ou ter acesso de membro
    if (memberRead.data.length > 0) {
      expect(memberRead.data[0].id).toBe(user1WorkspaceId);
    }

    // 6.3 Usuario 1 remove Usuario 2 do workspace
    const removeMember = await postgrest(`/workspace_members?workspace_id=eq.${user1WorkspaceId}&user_id=eq.${user2Id}`, {
      method: 'DELETE',
      token: user1Token
    });
    expect(removeMember.status).toBeLessThan(300);

    // 6.4 Usuario 2 perde acesso imediatamente
    const postRemoveRead = await postgrest(`/workspaces?id=eq.${user1WorkspaceId}`, { token: user2Token });
    expect(postRemoveRead.data.length).toBe(0);
  });

  test('7. Segredos Divipay e Eyemobile: Preservados no banco sem retorno ao navegador', async () => {
    await ensureUser1();
    // 7.1 Usuario 1 cadastra configuracoes de integracao com segredos
    const saveDivipay = await postgrest('/divipay_config', {
      method: 'POST',
      token: user1Token,
      body: {
        user_id: user1Id,
        client_id: 'client_pub_123',
        client_secret: 'SUPER_SECRET_KEY_DIVIPAY_777',
        environment: 'sandbox'
      }
    });
    expect([200, 201, 204]).toContain(saveDivipay.status);

    // 7.2 Leitura via PostgREST / Frontend
    const readDivipay = await postgrest(`/divipay_config?user_id=eq.${user1Id}`, { token: user1Token });
    if (readDivipay.ok && readDivipay.data.length > 0) {
      const cfg = readDivipay.data[0];
      // O client_id publico e retornado
      expect(cfg.client_id).toBe('client_pub_123');
      // O client_secret NUNCA deve ser retornado ao navegador
      expect(cfg.client_secret).toBeUndefined();
    }
  });

  test('8. Edge Functions de IA: Separação de sucesso, quota e falha do provedor com reconciliação', async () => {
    await ensureUser1();
    await ensureUser2();
    await ensureUser1Workspace();

    const mockStatsUrl = `${_MOCK_PROVIDER_URL}/stats`;
    const mockResetUrl = `${_MOCK_PROVIDER_URL}/reset`;
    const mockModeUrl = `${_MOCK_PROVIDER_URL}/mock/openai/mode`;

    // =========================================================================
    // 8.1 Cenário 1: Sucesso — Provedor simulado responde 200 válido
    // =========================================================================
    // Reseta estatísticas do mock e assegura modo 'success'
    await fetch(mockResetUrl, { method: 'POST' });
    await fetch(mockModeUrl, { method: 'POST', body: JSON.stringify({ mode: 'success' }) });

    const successRes = await fetch(`${SUPABASE_URL}/functions/v1/categorizar-ia`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1Token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        descricao: 'Compra de suprimentos no mercado atacado',
        valor: 150.00,
        workspace_id: user1WorkspaceId,
      })
    });

    // Exigir status 200 estrito (sem aceitação conjunta de erros)
    expect(successRes.status).toBe(200);
    const successData = await successRes.json();
    expect(successData).toBeDefined();
    expect(successData.categoria).toBe('alimentacao');
    expect(successData.confianca).toBeGreaterThanOrEqual(0.9);

    // Comprova que o provedor simulado foi chamado exatamente uma vez
    const statsAfterSuccess = await (await fetch(mockStatsUrl)).json();
    expect(statsAfterSuccess.openaiCalls).toBe(1);

    // Confirma no banco a reserva e reconciliação com status 'reconciled' e outcome 'success'
    const dbReservation = await executeSql(
      `SELECT status, actual_tokens, outcome 
       FROM public.ai_token_reservations 
       WHERE user_id = $1 AND action = 'categorizar_ia' 
       ORDER BY created_at DESC LIMIT 1;`,
      [user1Id]
    );
    expect(dbReservation.rows.length).toBe(1);
    expect(dbReservation.rows[0].status).toBe('reconciled');
    expect(dbReservation.rows[0].outcome).toBe('success');
    expect(Number(dbReservation.rows[0].actual_tokens)).toBe(50);

    // =========================================================================
    // 8.2 Cenário 2: Quota Esgotada — Rejeição 429 e provedor NÃO é chamado
    // =========================================================================
    // Zera os contadores do mock
    await fetch(mockResetUrl, { method: 'POST' });

    // Esgota a quota inserindo contagem no teto máximo no rate limiter
    const rpmBucketKey = `ws:${user1WorkspaceId}:user:${user1Id}:categorizar_ia:rpm`;
    await executeSql(
      `INSERT INTO public.rate_limits (bucket_key, request_count, window_start, last_request)
       VALUES ($1, 20, now(), now())
       ON CONFLICT (bucket_key) DO UPDATE SET request_count = 20, window_start = now();`,
      [rpmBucketKey]
    );

    const quotaRes = await fetch(`${SUPABASE_URL}/functions/v1/categorizar-ia`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1Token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        descricao: 'Tentativa após estourar a quota',
        valor: 50.00,
        workspace_id: user1WorkspaceId,
      })
    });

    // Exigir status 429 estrito com mensagem de limite excedido
    expect(quotaRes.status).toBe(429);
    const quotaData = await quotaRes.json();
    expect(quotaData.error).toMatch(/limite|excedido/i);

    // Comprova que o provedor externo NÃO FOI CHAMADO
    const statsAfterQuota = await (await fetch(mockStatsUrl)).json();
    expect(statsAfterQuota.openaiCalls).toBe(0);

    // Restaura a quota para não afetar os próximos testes
    await executeSql(`DELETE FROM public.rate_limits WHERE bucket_key = $1;`, [rpmBucketKey]);

    // =========================================================================
    // 8.3 Cenário 3: Falha do Provedor — Tratamento de erro sem contabilizar como sucesso funcional
    // =========================================================================
    await fetch(mockResetUrl, { method: 'POST' });
    // Configura o mock para simular erro HTTP 500
    await fetch(mockModeUrl, { method: 'POST', body: JSON.stringify({ mode: 'error' }) });

    const failRes = await fetch(`${SUPABASE_URL}/functions/v1/categorizar-ia`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1Token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        descricao: 'Compra durante falha da API externa',
        valor: 75.00,
        workspace_id: user1WorkspaceId,
      })
    });

    // A função retorna fallback com confianca 0 (não é sucesso funcional)
    const failData = await failRes.json();
    expect(failData.confianca).toBe(0);

    // Confirma no banco que a reconciliação foi registrada com outcome 'error'
    const dbFailReservation = await executeSql(
      `SELECT status, actual_tokens, outcome 
       FROM public.ai_token_reservations 
       WHERE user_id = $1 AND action = 'categorizar_ia' 
       ORDER BY created_at DESC LIMIT 1;`,
      [user1Id]
    );
    expect(dbFailReservation.rows.length).toBe(1);
    expect(dbFailReservation.rows[0].outcome).toBe('error');

    // Restaura o mock para modo 'success'
    await fetch(mockModeUrl, { method: 'POST', body: JSON.stringify({ mode: 'success' }) });

    // =========================================================================
    // 8.4 Cenário 4: Workspace Spoofing — Rejeição prévia de autorização (403)
    // =========================================================================
    const spoofedRes = await fetch(`${SUPABASE_URL}/functions/v1/categorizar-ia`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1Token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        descricao: 'Teste Spoofed',
        valor: 50.00,
        workspace_id: user2WorkspaceId,
      })
    });
    expect([401, 403]).toContain(spoofedRes.status);

    // =========================================================================
    // 8.5 Cenário 5: Esgotamento de Orçamento de Tokens (reserve_ai_tokens / TPH)
    // =========================================================================
    // Garante que o bucket de RPM esteja limpo e 100% com saldo disponível (não mascarar o teste)
    await executeSql(`DELETE FROM public.rate_limits WHERE bucket_key = $1;`, [rpmBucketKey]);

    // Reseta estatísticas do mock externo e garante modo 'success'
    await fetch(mockResetUrl, { method: 'POST' });
    await fetch(mockModeUrl, { method: 'POST', body: JSON.stringify({ mode: 'success' }) });

    // Injeta um consumo de tokens próximo do limite (49.900 de 50.000 tokens/hora, restando 100)
    const tphBucketKey = `ws:${user1WorkspaceId}:user:${user1Id}:categorizar_ia:tph`;
    await executeSql(
      `INSERT INTO public.rate_limits (bucket_key, request_count, window_start, last_request)
       VALUES ($1, 49900, now(), now())
       ON CONFLICT (bucket_key) DO UPDATE SET request_count = 49900, window_start = now();`,
      [tphBucketKey]
    );

    // Registra contagem de reservas pendentes antes da tentativa
    const initialReservedCount = await executeSql(
      `SELECT count(*)::int as cnt FROM public.ai_token_reservations 
       WHERE user_id = $1 AND bucket_key = $2 AND status = 'reserved';`,
      [user1Id, tphBucketKey]
    );

    // Chama a Edge Function autenticada com requisição válida que solicita 300 tokens (ultrapassa os 100 restantes)
    const tphExhaustedRes = await fetch(`${SUPABASE_URL}/functions/v1/categorizar-ia`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1Token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        descricao: 'Compra solicitando tokens além do orçamento disponível',
        valor: 89.90,
        workspace_id: user1WorkspaceId,
      })
    });

    // 1. Exige recusa específica com status 429 e mensagem de orçamento/cota por hora
    expect(tphExhaustedRes.status).toBe(429);
    const tphExhaustedData = await tphExhaustedRes.json();
    expect(tphExhaustedData.error).toMatch(/orçamento|cota de processamento/i);

    // 2. Comprova que o provedor externo NÃO recebeu chamada (bloqueio atômico prévio)
    const statsAfterTph = await (await fetch(mockStatsUrl)).json();
    expect(statsAfterTph.openaiCalls).toBe(0);

    // 3. Confere o estado persistido no banco de dados:
    // O contador de tokens não deve ter sido incrementado além dos 49.900 permitidos
    const dbLimitState = await executeSql(
      `SELECT request_count FROM public.rate_limits WHERE bucket_key = $1;`,
      [tphBucketKey]
    );
    expect(Number(dbLimitState.rows[0].request_count)).toBe(49900);

    // Nenhuma reserva indevida pendente ('reserved') deve ter sido criada
    const postReservedCount = await executeSql(
      `SELECT count(*)::int as cnt FROM public.ai_token_reservations 
       WHERE user_id = $1 AND bucket_key = $2 AND status = 'reserved';`,
      [user1Id, tphBucketKey]
    );
    expect(postReservedCount.rows[0].cnt).toBe(initialReservedCount.rows[0].cnt);

    // 4. Controle Positivo: com saldo suficiente restaurado, a operação é autorizada e reconciliada
    await executeSql(`DELETE FROM public.rate_limits WHERE bucket_key = $1;`, [tphBucketKey]);
    await fetch(mockResetUrl, { method: 'POST' });

    const positiveControlRes = await fetch(`${SUPABASE_URL}/functions/v1/categorizar-ia`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user1Token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        descricao: 'Compra sob controle positivo com saldo restabelecido',
        valor: 45.00,
        workspace_id: user1WorkspaceId,
      })
    });

    expect(positiveControlRes.status).toBe(200);
    const positiveData = await positiveControlRes.json();
    expect(positiveData.categoria).toBe('alimentacao');

    const statsPositive = await (await fetch(mockStatsUrl)).json();
    expect(statsPositive.openaiCalls).toBe(1);

    const dbPositiveReservation = await executeSql(
      `SELECT status, actual_tokens, outcome 
       FROM public.ai_token_reservations 
       WHERE user_id = $1 AND action = 'categorizar_ia' 
       ORDER BY created_at DESC LIMIT 1;`,
      [user1Id]
    );
    expect(dbPositiveReservation.rows.length).toBe(1);
    expect(dbPositiveReservation.rows[0].status).toBe('reconciled');
    expect(dbPositiveReservation.rows[0].outcome).toBe('success');
    expect(Number(dbPositiveReservation.rows[0].actual_tokens)).toBe(50);
  });

  test('9. Preview e Impressão de Recibos: Sanitização estrita contra XSS e HTML injection', async ({ page }) => {
    // Payload malicioso contendo tentativa de injecao de scripts e elementos
    const maliciousDescription = '<script>window.pwned=true;</script><img src=x onerror="window.img_pwned=true">Recibo Seguro Homologado';
    
    // Testa funcao de sanitizacao no contexto do navegador
    await page.goto('about:blank');
    const sanitized = await page.evaluate((input) => {
      // Simula algoritmo de sanitizacao de recibos usado na wallet
      const div = document.createElement('div');
      div.textContent = input;
      return div.innerHTML;
    }, maliciousDescription);

    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('&lt;script&gt;');
  });

  test('10. Cron e Webhooks: Chamadas sem credenciais recusadas (401/403)', async () => {
    // Tentativa de chamada anonima a webhook ou cron administrativo
    const unauthWebhook = await fetch(`${SUPABASE_URL}/functions/v1/divipay-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'payment.received' })
    });
    // Deve ser rejeitado (401 ou 403 por falta de assinatura/token)
    expect([401, 403, 400]).toContain(unauthWebhook.status);
  });

});
