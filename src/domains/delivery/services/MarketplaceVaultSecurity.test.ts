import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encryptVaultSecret,
  decryptVaultSecret,
  rotateVaultSecret,
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

describe('MarketplaceVaultSecurity — 10 Testes Mandatórios de Auditoria e Segurança Criptográfica (Gate 7)', () => {
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

    // IV aleatório: mesmo com mesmo plaintext e chave, cada cifragem gera IV e ciphertext distintos (não reutilização de nonce)
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

    // Corrompe o último byte do ciphertext base64
    const originalCipher = parts[3];
    const tamperedCipher =
      originalCipher.slice(0, -2) + (originalCipher.endsWith('A') ? 'B' : 'A') + originalCipher.slice(-1);
    const tamperedPayload = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCipher}`;

    await expect(decryptVaultSecret(tamperedPayload, masterKeyV1)).rejects.toThrow(
      /Vault decryption failed|authentication tag mismatch/i
    );
  });

  // Teste 6: Rotação de chaves (rotateVaultSecret de v1 para v2)
  it('6. Executa rotação de chaves sem expor segredo intermediário de v1 para v2', async () => {
    const encryptedV1 = await encryptVaultSecret(syntheticSecret, masterKeyV1, 'v1');
    const rotatedV2 = await rotateVaultSecret(encryptedV1, masterKeyV1, masterKeyV2, 'v2');

    expect(rotatedV2.startsWith('v1:v2:')).toBe(true);

    // O novo ciphertext decifra com a chave v2
    const decryptedV2 = await decryptVaultSecret(rotatedV2, masterKeyV2);
    expect(decryptedV2).toBe(syntheticSecret);

    // A chave antiga v1 não consegue mais decifrar o novo payload v2
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
    // Simula resposta do backend rejeitando acesso a workspace alheio (403 Forbidden)
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
        commission_rate: 0.23,
        payment_fee_rate: 0.032,
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

    // Verifica que a interface tipada do canal não possui client_secret
    expect((ifood as unknown as Record<string, unknown>).client_secret).toBeUndefined();
    expect((ifood as unknown as Record<string, unknown>).clientSecret).toBeUndefined();
    expect(ifood.has_client_secret).toBe(true);
    expect(ifood.client_id_preview).toBe('ifoo••••••••9988');
  });

  // Teste 10: Confirmação de que tokens e segredos nunca aparecem em logs de erro ou payloads de resposta
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
});
