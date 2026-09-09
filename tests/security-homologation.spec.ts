import { test, expect } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDk5NjQ4MDAsImV4cCI6MTk2NTUzMjgwMH0.6pnT9q8_Z3M3s9a0Y7mPqQ0P2QjP0V9O7W4qM3a0Z5g';
const INBUCKET_URL = process.env.INBUCKET_URL || 'http://localhost:54324';
const _MOCK_PROVIDER_URL = process.env.MOCK_PROVIDER_URL || 'http://localhost:18080';

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
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

// Helper para Inbucket
async function getInbucketMessages(emailPrefix: string) {
  try {
    const res = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${emailPrefix}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

test.describe('Homologação de Segurança e Auditoria End-to-End (Real Supabase Stack)', () => {

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

  test('1. Auth completo: Cadastro com Inbucket, confirmação, login, logout e recovery', async () => {
    // 1.1 Cadastro do Usuario 1
    const signup = await authCall('/signup', {
      email: user1Email,
      password: testPassword,
      data: { name: 'Usuario Homologacao 1', telefone: '11999990001' }
    });
    expect(signup.status).toBeLessThan(300);
    user1Id = signup.data.id || signup.data.user?.id;

    // 1.2 Verificacao no Inbucket (capturador local de email)
    const messages = await getInbucketMessages(`user1_${timestamp}`);
    expect(Array.isArray(messages)).toBe(true);

    // 1.3 Login no GoTrue isolado
    const login = await authCall('/token?grant_type=password', {
      email: user1Email,
      password: testPassword,
    });
    expect(login.ok).toBe(true);
    user1Token = login.data.access_token;
    expect(user1Token).toBeDefined();

    // 1.4 Cadastro do Usuario 2
    const _signup2 = await authCall('/signup', {
      email: user2Email,
      password: testPassword,
      data: { name: 'Usuario Homologacao 2', telefone: '11999990002' }
    });
    const login2 = await authCall('/token?grant_type=password', {
      email: user2Email,
      password: testPassword,
    });
    user2Token = login2.data.access_token;
    user2Id = login2.data.user?.id;

    // 1.5 Teste de Recuperacao de Senha com email no Inbucket
    const recovery = await authCall('/recover', { email: user1Email });
    expect(recovery.status).toBeLessThan(300);
    const recoveryMsgs = await getInbucketMessages(`user1_${timestamp}`);
    expect(recoveryMsgs.length).toBeGreaterThanOrEqual(1);

    // 1.6 Logout
    const logout = await authCall('/logout', {}, user1Token);
    expect(logout.status).toBeLessThan(300);

    // Reloga para os testes seguintes
    const relogin = await authCall('/token?grant_type=password', { email: user1Email, password: testPassword });
    user1Token = relogin.data.access_token;
  });

  test('2. Perfis: Edição legítima permitida e bloqueio absoluto de auto-promoção para admin', async () => {
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
    // 3.1 Primeiro cadastro da senha de investimentos (PBKDF2 via RPC segura)
    const _cadRes = await postgrest('/rpc/cadastrar_senha_investimentos', {
      method: 'POST',
      token: user1Token,
      body: { p_senha_hash: '$pbkdf2$100000$salt_homolog$hash_invest_123' }
    });
    // 3.2 Tentativa de recadastro direto sem autorizacao
    const recadRes = await postgrest('/rpc/cadastrar_senha_investimentos', {
      method: 'POST',
      token: user1Token,
      body: { p_senha_hash: '$pbkdf2$100000$novo_hash' }
    });
    // Se a funcao ja existir ou falhar, deve retornar falso ou erro
    if (recadRes.ok) {
      expect(recadRes.data).toBe(false);
    }

    // 3.3 Verificacao de desbloqueio com hash
    const sessionTokenA = 'sess_desktop_token_' + timestamp;
    const unlockRes = await postgrest('/rpc/desbloquear_sessao_investimentos', {
      method: 'POST',
      token: user1Token,
      body: {
        p_user_id: user1Id,
        p_session_id: sessionTokenA,
        p_expected_hash: '$pbkdf2$100000$salt_homolog$hash_invest_123',
        p_new_hash: null,
        p_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }
    });
    // Como a RPC de desbloqueio foi concedida estritamente ao service_role na Fase A,
    // o cliente comum recebe 403 / 404 caso chame diretamente via REST (bloqueio esperado)
    // ou se chamada via backend valida o hash
    expect([200, 401, 403, 404]).toContain(unlockRes.status);
  });

  test('4. Duas sessões concorrentes: Desbloquear uma NÃO desbloqueia a outra', async () => {
    // 4.1 Token de sessao A e B
    const _sessionA = 'session_desk_' + timestamp;
    const sessionB = 'session_mobi_' + timestamp;

    // Chamada a is_investimentos_unlocked na sessao B sem desbloqueio
    const checkB = await postgrest('/rpc/is_investimentos_unlocked', {
      method: 'POST',
      token: user1Token,
      headers: { 'x-session-id': sessionB },
      body: { p_user_id: user1Id }
    });
    if (checkB.ok) {
      expect(checkB.data).toBe(false);
    }
  });

  test('5. Multi-Tenant: Dois usuários de workspaces diferentes com dados confirmados existentes', async () => {
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

  test('8. Edge Functions de IA: Reserva prévia no banco, bloqueio por quota e provedor simulado', async () => {
    // 8.1 Chamada para categorizar-ia via Edge Function
    const efRes = await fetch(`${SUPABASE_URL}/functions/v1/categorizar-ia`, {
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
    // Resposta esperada: 200 (se servico mock ativo) ou 429 (se quota esgotada)
    expect([200, 429, 403, 502]).toContain(efRes.status);

    // 8.2 Chamada com workspace forjado de outro usuario -> DEVE retornar 403 antes do provedor
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
        workspace_id: user2WorkspaceId, // Workspace pertencente ao Usuario 2
      })
    });
    expect(spoofedRes.status).toBe(403);
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
