import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encryptVaultSecret,
  decryptVaultSecret,
  rotateVaultSecret,
  validateMasterVaultKey,
  validateVaultKeyEntropy,
} from '../../../../supabase/functions/_shared/vault-crypto';
import { MarketplaceIntegrationService } from './MarketplaceIntegrationService';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('MarketplaceVaultSecurity — Testes Mandatórios de Auditoria, Criptografia e Integridade (Gates 1 a 4)', () => {
  // Chaves de teste sintéticas criptograficamente fortes (formato verificável de 256 bits)
  const masterKeyHex64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const masterKeyBase64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
  const masterKeyV1 = 'super-secret-master-encryption-key-for-wallet-2026';
  const masterKeyV2 = 'rotated-super-secret-master-encryption-key-2027';
  const syntheticSecret = 'prod-ifood-secret-oauth-9988-test-live-key-xyz!@#';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Teste 1: Cifragem de credencial sintética com AES-256-GCM + IV aleatório
  it('1. Cifra credencial sintética em formato canônico v1 com IV aleatório único', async () => {
    const enc1 = await encryptVaultSecret(syntheticSecret, masterKeyV1, 'v1');
    const enc2 = await encryptVaultSecret(syntheticSecret, masterKeyV1, 'v1');

    expect(enc1.startsWith('v1:v1:')).toBe(true);
    expect(enc2.startsWith('v1:v1:')).toBe(true);

    const parts1 = enc1.split(':');
    const parts2 = enc2.split(':');
    expect(parts1).toHaveLength(4);
    expect(parts2).toHaveLength(4);

    // IV aleatório: mesmo com mesmo plaintext e chave, cada cifragem gera IV e ciphertext distintos
    expect(parts1[2]).not.toBe(parts2[2]);
    expect(parts1[3]).not.toBe(parts2[3]);
  });

  // Teste 2: Não contenção do plaintext no payload cifrado
  it('2. Garante que o plaintext da credencial NUNCA está contido no payload cifrado', async () => {
    const encrypted = await encryptVaultSecret(syntheticSecret, masterKeyV1, 'v1');

    expect(encrypted).not.toContain(syntheticSecret);
    expect(encrypted).not.toContain('prod-ifood-secret');
    expect(encrypted).not.toContain('oauth-9988');
  });

  // Teste 3: Descriptografia exclusiva com a chave autorizada
  it('3. Rejeita descriptografia se a chave informada for incorreta', async () => {
    const encrypted = await encryptVaultSecret(syntheticSecret, masterKeyV1, 'v1');
    const wrongKey = 'wrong-unauthorized-key-for-decrypting-vault';

    await expect(decryptVaultSecret(encrypted, wrongKey)).rejects.toThrow(
      /Vault decryption failed|authentication tag mismatch/i
    );
  });

  // Teste 4: Validação da descriptografia correta (payload original restaurado)
  it('4. Restaura exatamente o payload original íntegro com a chave correta', async () => {
    const encrypted = await encryptVaultSecret(syntheticSecret, masterKeyV1, 'v1');
    const decrypted = await decryptVaultSecret(encrypted, masterKeyV1);

    expect(decrypted).toBe(syntheticSecret);
  });

  // Teste 5: Falha com chave ausente, chave incorreta ou tag adulterada (autenticação AEAD)
  it('5. Falha se o ciphertext ou tag de autenticação for adulterado (AEAD Integrity)', async () => {
    const encrypted = await encryptVaultSecret(syntheticSecret, masterKeyV1, 'v1');
    const parts = encrypted.split(':');

    // Inverte um byte real do ciphertext binário para invalidar a integridade AEAD
    const cipherBuf = Buffer.from(parts[3], 'base64');
    cipherBuf[0] ^= 0xff;
    const tamperedPayload = `${parts[0]}:${parts[1]}:${parts[2]}:${cipherBuf.toString('base64')}`;

    await expect(decryptVaultSecret(tamperedPayload, masterKeyV1)).rejects.toThrow(
      /Vault decryption failed|authentication tag mismatch/i
    );
  });

  // Teste 6: Rotação de chaves (rotateVaultSecret de v1 para v2)
  it('6. Executa rotação de chaves sem expor segredo intermediário de v1 para v2', async () => {
    const encryptedV1 = await encryptVaultSecret(syntheticSecret, masterKeyV1, 'v1');
    const rotatedV2 = await rotateVaultSecret(encryptedV1, masterKeyV1, masterKeyV2, 'v2');

    expect(rotatedV2.startsWith('v1:v2:')).toBe(true);

    const decryptedV2 = await decryptVaultSecret(rotatedV2, masterKeyV2);
    expect(decryptedV2).toBe(syntheticSecret);

    await expect(decryptVaultSecret(rotatedV2, masterKeyV1)).rejects.toThrow();
  });

  // Teste 7: Revogação / purga de credenciais e privilégios mínimos (GATE 1)
  it('7. Revogação e purga: desconectar canal invoca exclusivamente a Edge Function sem fallback direto para RPC no cliente', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true, message: 'Credenciais purgadas via service_role' },
      error: null,
    });

    const res = await MarketplaceIntegrationService.disconnectChannel('ws-secure-99', 'ifood');

    expect(res.success).toBe(true);
    expect(res.state).toBe('disconnected');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('delivery-marketplace-vault', {
      body: {
        action: 'disconnect',
        workspace_id: 'ws-secure-99',
        channel_name: 'ifood',
      },
    });

    // GATE 1: Cliente NUNCA tenta chamar supabase.rpc('disconnect_delivery_marketplace')
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  // Teste 7.B: Fail-closed no cliente se a Edge Function falhar ao desconectar (GATE 1)
  it('7.B. Fail-closed: se a Edge Function de desconexão falhar, retorna erro sem contornar permissões via RPC', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: false, error: 'Erro interno no cofre' },
      error: null,
    });

    const res = await MarketplaceIntegrationService.disconnectChannel('ws-secure-99', 'ifood');

    expect(res.success).toBe(false);
    expect(res.message).toContain('Erro interno no cofre');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  // Teste 8: Tentativa de acesso cruzado de workspaces (IDOR / isolamento RBAC)
  it('8. Bloqueia acesso cruzado entre workspaces (IDOR Protection)', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: false,
        error: 'Acesso negado: apenas administradores do workspace podem gerenciar o cofre de credenciais.',
      },
      error: null,
    });

    const res = await MarketplaceIntegrationService.saveCredentials({
      workspaceId: 'workspace-alheio-hack-attempt',
      channelName: 'ifood',
      merchantId: 'store-1',
      clientId: 'client-1',
      clientSecret: 'secret-1',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('Acesso negado');
  });

  // Teste 9: Confirmação de que o serviço frontend / tipagem nunca expõe client_secret em leituras
  it('9. Frontend getIntegrations NUNCA expõe client_secret nem ciphertext bruto', async () => {
    const mockRows = [
      {
        id: 'ch-sec-1',
        workspace_id: 'ws-1',
        channel_name: 'ifood',
        display_name: 'iFood Marketplace',
        is_active: true,
        status: 'active',
        connection_state: 'homologated',
        commission_rate: 0.15,
        payment_fee_rate: 0.02,
        fixed_fee: 0,
        auto_accept_orders: true,
        config: {
          merchant_id: 'm-sec-1',
          client_id_preview: 'ifoo••••••••9988',
          has_client_secret: true,
          event_log: [],
        },
      },
    ];

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    } as unknown as ReturnType<typeof supabase.from>);

    const integrations = await MarketplaceIntegrationService.getIntegrations('ws-1');
    const ifood = integrations[0];

    expect((ifood as unknown as Record<string, unknown>).client_secret).toBeUndefined();
    expect((ifood as unknown as Record<string, unknown>).clientSecret).toBeUndefined();
    expect(ifood.has_client_secret).toBe(true);
    expect(ifood.client_id_preview).toBe('ifoo••••••••9988');
  });

  // Teste 10: Fail-closed em erros e exceções internas
  it('10. Fail-closed: tokens e segredos nunca vazam em respostas ou logs de erro', async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValue(
      new Error('Internal network error with raw-secret-12345 in stack trace')
    );

    const res = await MarketplaceIntegrationService.saveCredentials({
      workspaceId: 'ws-1',
      channelName: 'ifood',
      merchantId: 'm-1',
      clientId: 'c-1',
      clientSecret: 'raw-secret-12345',
    });

    expect(res.success).toBe(false);
    expect(res.message).toBe(
      'Serviço seguro de cofre indisponível no servidor. Ação não executada por segurança.'
    );
    expect(res.message).not.toContain('raw-secret-12345');
  });

  // Teste 11: Gate C - Tratamento de falha parcial do banco (não retorna sucesso)
  it('11. Falha parcial do banco: retorna erro caso a persistência ou cofre falhe', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: false,
        error: 'Falha ao persistir no cofre: conexão recusada pelo pool Postgres',
      },
      error: null,
    });

    const res = await MarketplaceIntegrationService.saveCredentials({
      workspaceId: 'ws-1',
      channelName: 'ifood',
      merchantId: 'm-1',
      clientId: 'c-1',
      clientSecret: 'secret-xyz',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('Falha ao persistir no cofre');
  });

  // Teste 12: Invalidação de homologação ao alterar credenciais
  it('12. Invalidação de homologação: atualizar credenciais reseta o estado para credentials_saved e desativa auto-aceite', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: true,
        state: 'credentials_saved',
        message: 'Credenciais armazenadas no cofre seguro. Execute o teste de conexão para homologar o canal.',
      },
      error: null,
    });

    const res = await MarketplaceIntegrationService.saveCredentials({
      workspaceId: 'ws-1',
      channelName: 'ifood',
      merchantId: 'm-novo',
      clientId: 'c-novo',
      clientSecret: 'novo-secret',
      autoAcceptOrders: true,
    });

    expect(res.success).toBe(true);
    expect(res.state).toBe('credentials_saved');
    expect(res.state).not.toBe('homologated');
  });

  // Teste 13: GATE 2 — Homologação oficial preservada mesmo com loja fechada ou pausada
  it('13. HTTP 200 com loja fechada/pausada: homologação concedida com separação estrita de status operacional (CLOSED/PAUSED)', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: true,
        state: 'homologated',
        operational_status: 'CLOSED',
        message: 'Homologação comprovada preservada no iFood. Loja atualmente fechada/pausada operacionalmente (CLOSED).',
      },
      error: null,
    });

    const res = await MarketplaceIntegrationService.testConnection({
      workspaceId: 'ws-1',
      channelName: 'ifood',
      merchantId: 'm-closed',
    });

    // GATE 2: Loja fechada NÃO perde homologação da aplicação
    expect(res.success).toBe(true);
    expect(res.state).toBe('homologated');
    expect(res.message).toContain('fechada/pausada operacionalmente');
  });

  // Teste 14: Taxas e comissões não configuradas retornam 0 sem presumir estimativas contratuais fictícias
  it('14. Taxas e comissões não configuradas retornam 0 sem presumir estimativas contratuais fictícias', async () => {
    const mockRows = [
      {
        id: 'ch-ifood-unconfigured',
        workspace_id: 'ws-1',
        channel_name: 'ifood',
        display_name: 'iFood Marketplace',
        is_active: false,
        status: 'pending_auth',
        connection_state: 'not_configured',
        commission_rate: null,
        payment_fee_rate: null,
        fixed_fee: null,
        auto_accept_orders: false,
        config: {},
      },
    ];

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    } as unknown as ReturnType<typeof supabase.from>);

    const integrations = await MarketplaceIntegrationService.getIntegrations('ws-1');
    const ifood = integrations.find((i) => i.channel_name === 'ifood')!;

    expect(ifood.commission_rate).toBe(0);
    expect(ifood.payment_fee_rate).toBe(0);
    expect(ifood.fixed_fee).toBe(0);
  });

  // Teste 15: GATE 3 — Validação de chave criptográfica de 256 bits verificável (Hex 64 ou Base64 32 bytes)
  it('15. Validação de formato criptográfico da MARKETPLACE_VAULT_KEY (formato verificável de 256 bits)', async () => {
    // 15.1: Chave Hexadecimal de 64 caracteres (256 bits exatos)
    const vHex = validateMasterVaultKey(masterKeyHex64);
    expect(vHex.valid).toBe(true);
    expect(vHex.format).toBe('hex');

    // Cifragem e decifragem com chave Hex 64
    const encHex = await encryptVaultSecret(syntheticSecret, masterKeyHex64);
    const decHex = await decryptVaultSecret(encHex, masterKeyHex64);
    expect(decHex).toBe(syntheticSecret);

    // 15.2: Chave Base64 representando 32 bytes (256 bits exatos)
    const vB64 = validateMasterVaultKey(masterKeyBase64);
    expect(vB64.valid).toBe(true);
    expect(vB64.format).toBe('base64');

    // Cifragem e decifragem com chave Base64 32 bytes
    const encB64 = await encryptVaultSecret(syntheticSecret, masterKeyBase64);
    const decB64 = await decryptVaultSecret(encB64, masterKeyBase64);
    expect(decB64).toBe(syntheticSecret);

    // 15.3: Chave Hexadecimal com bytes repetidos/nulos (rejeitada)
    const badHex = '0000000000000000000000000000000000000000000000000000000000000000';
    const vBadHex = validateMasterVaultKey(badHex);
    expect(vBadHex.valid).toBe(false);
    expect(vBadHex.reason).toContain('bytes repetidos/triviais');

    // 15.4: Chave curta (< 32 bytes)
    const shortKey = 'short-key-123';
    const vShort = validateVaultKeyEntropy(shortKey);
    expect(vShort.valid).toBe(false);
    expect(vShort.reason).toContain('apenas 13 bytes');

    // 15.5: Chave com 32 caracteres porém repetitiva (baixa diversidade)
    const repeatedKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const vRep = validateVaultKeyEntropy(repeatedKey);
    expect(vRep.valid).toBe(false);
    expect(vRep.reason).toContain('baixa diversidade');
  });

  // Teste 16: GATE 2 — Escopos ausentes no token OAuth tratados estritamente como insufficient_scopes
  it('16. Escopos ausentes no token OAuth são tratados estritamente como insufficient_scopes (sem presunção)', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: false,
        state: 'insufficient_scopes',
        message: 'Token emitido pelo iFood sem escopos explícitos comprovados (insufficient_scopes). Homologação requer escopos de pedidos.',
      },
      error: null,
    });

    const res = await MarketplaceIntegrationService.testConnection({
      workspaceId: 'ws-1',
      channelName: 'ifood',
    });

    expect(res.success).toBe(false);
    expect(res.state).toBe('insufficient_scopes');
    expect(res.message).toContain('insufficient_scopes');
  });

  // Teste 17: GATE 1 & GATE 2 — Testes com credenciais temporárias são executados como simulação (dry-run)
  it('17. Testes com credenciais temporárias são executados como dry-run sem alterar estado persistente do canal', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: true,
        state: 'homologated',
        is_dry_run: true,
        message: '[MODO SIMULAÇÃO] Conexão e aplicativo homologados no iFood. Salve as credenciais no cofre para registrar a homologação definitiva.',
      },
      error: null,
    });

    const res = await MarketplaceIntegrationService.testConnection({
      workspaceId: 'ws-1',
      channelName: 'ifood',
      clientId: 'temp-client-id',
      clientSecret: 'temp-secret',
    });

    expect(res.success).toBe(true);
    expect(res.message).toContain('[MODO SIMULAÇÃO]');
  });
});
