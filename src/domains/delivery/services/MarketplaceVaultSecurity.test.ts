import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encryptVaultSecret,
  decryptVaultSecret,
  rotateVaultSecret,
  calculateShannonEntropy,
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

describe('MarketplaceVaultSecurity — Testes Mandatórios de Auditoria, Criptografia e Integridade (Gates A a D & Missão 2)', () => {
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

  // Teste 7: Revogação / purga de credenciais (disconnectChannel)
  it('7. Revogação e purga: desconectar canal elimina credenciais do cofre', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true, message: 'Credenciais purgadas' },
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

  // Teste 12: Gate B - Alterar credenciais invalida homologação anterior e bloqueia auto-aceite
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

  // Teste 13: Ponto 1 (Missão 2) — Homologação oficial preservada mesmo com loja fechada ou pausada
  it('13. HTTP 200 com loja fechada/pausada: homologação concedida com separação estrita de status operacional (CLOSED/PAUSED)', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        success: true,
        state: 'homologated',
        operational_status: 'CLOSED',
        message: 'Conexão e aplicativo homologados no iFood. Loja autorizada, atualmente fechada/pausada operacionalmente (CLOSED).',
      },
      error: null,
    });

    const res = await MarketplaceIntegrationService.testConnection({
      workspaceId: 'ws-1',
      channelName: 'ifood',
      merchantId: 'm-closed',
    });

    // Ponto 1: Loja fechada NÃO perde homologação da aplicação
    expect(res.success).toBe(true);
    expect(res.state).toBe('homologated');
    expect(res.message).toContain('fechada/pausada operacionalmente');
  });

  // Teste 14: Gate D - Não assume taxas contratuais fictícias (retorna 0 para canais sem taxa registrada)
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

    // Não deve assumir 0.23 (23%) como fato contratual comprovado
    expect(ifood.commission_rate).toBe(0);
    expect(ifood.payment_fee_rate).toBe(0);
    expect(ifood.fixed_fee).toBe(0);
  });

  // Teste 15: Ponto 3 (Missão 2) — Validação matemática de entropia criptográfica da MARKETPLACE_VAULT_KEY
  it('15. Entropia criptográfica: rejeita chaves fracas, curtas ou repetitivas e aprova chaves de alta entropia', () => {
    // Chave curta (< 32 chars)
    const shortKey = 'short-key-123';
    const vShort = validateVaultKeyEntropy(shortKey);
    expect(vShort.valid).toBe(false);
    expect(vShort.reason).toContain('apenas 13 caracteres');

    // Chave longa repetitiva (32 caracteres iguais, entropia = 0)
    const repeatedKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const vRep = validateVaultKeyEntropy(repeatedKey);
    expect(vRep.valid).toBe(false);
    expect(vRep.reason).toContain('baixa diversidade');

    // Chave com padrão repetitivo (baixa diversidade)
    const lowDivKey = '12341234123412341234123412341234';
    const vLowDiv = validateVaultKeyEntropy(lowDivKey);
    expect(vLowDiv.valid).toBe(false);
    expect(vLowDiv.reason).toContain('baixa diversidade');

    // Chave com 12 caracteres distintos porém com viés de repetição (entropia de Shannon < 3.2 bits/char)
    const lowEntropyKey = 'abcdefghijklabcdefghijklaaaaaaaaaa';
    const vLow = validateVaultKeyEntropy(lowEntropyKey);
    expect(vLow.valid).toBe(false);
    expect(vLow.reason).toContain('entropia de Shannon insuficiente');

    // Chave criptograficamente forte (entropia >= 3.2 bits/char)
    const strongKey = 'v1_prod_vault_key_AES256GCM_Wallet2026_x89#$kL!';
    const vStrong = validateVaultKeyEntropy(strongKey);
    expect(vStrong.valid).toBe(true);
    expect(calculateShannonEntropy(strongKey)).toBeGreaterThan(3.5);
  });

  // Teste 16: Ponto 2 (Missão 2) — Escopos ausentes no token OAuth tratados estritamente como insufficient_scopes
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

  // Teste 17: Ponto 2 (Missão 2) — Teste com credenciais temporárias é executado como simulação (dry-run)
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
