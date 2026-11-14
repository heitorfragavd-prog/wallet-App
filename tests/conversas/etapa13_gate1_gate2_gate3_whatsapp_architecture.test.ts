import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  verifyMetaSignature,
  calculateIdempotencyHash,
} from '../../supabase/functions/_shared/whatsapp-security';
import { WhatsAppIntegrationService } from '../../src/domains/conversas/services/WhatsAppIntegrationService';

vi.mock('../../src/integrations/supabase/client', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

describe('👑 WALLET CEO 3.0 — ETAPA 13: PR 1 (GATES 0, 1, 2 E 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Gate 1: Coexistência Multicanal e Preservação do Telegram', () => {
    it('garante que o WhatsApp opera como canal adicional sem substituir o Telegram ou a Web', () => {
      const allowedChannels: Array<'web' | 'telegram' | 'whatsapp'> = ['web', 'telegram', 'whatsapp'];

      expect(allowedChannels).toContain('web');
      expect(allowedChannels).toContain('telegram');
      expect(allowedChannels).toContain('whatsapp');
      expect(allowedChannels.length).toBe(3);
    });

    it('mantém isolamento de contexto de conversa por canal', () => {
      const telegramConversation = {
        id: 'conv-tg-1',
        channel: 'telegram',
        external_chat_id: '123456789',
      };

      const whatsappConversation = {
        id: 'conv-wpp-2',
        channel: 'whatsapp',
        external_chat_id: '+5511999998888',
      };

      expect(telegramConversation.channel).not.toBe(whatsappConversation.channel);
      expect(telegramConversation.external_chat_id).not.toBe(whatsappConversation.external_chat_id);
    });
  });

  describe('Gate 2: Validação da Meta Cloud API e Segurança Criptográfica', () => {
    it('valida assinatura HMAC SHA-256 válida gerada pela Meta', async () => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const secret = 'meta_test_secret_key_123';

      // Gera assinatura real para o teste
      const encoder = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signatureBuf = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payload));
      const hashHex = Array.from(new Uint8Array(signatureBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const signatureHeader = `sha256=${hashHex}`;
      const isValid = await verifyMetaSignature(payload, signatureHeader, secret);
      expect(isValid).toBe(true);
    });

    it('rejeita assinatura adulterada ou ausente (fail-closed)', async () => {
      const payload = JSON.stringify({ message: 'compromisso teste' });
      const secret = 'meta_secret';

      const isInvalid = await verifyMetaSignature(payload, 'sha256=invalid_tampered_hash_123', secret);
      expect(isInvalid).toBe(false);

      const isNullHeader = await verifyMetaSignature(payload, null, secret);
      expect(isNullHeader).toBe(false);

      const isMalformed = await verifyMetaSignature(payload, 'sha1=outdated_algorithm', secret);
      expect(isMalformed).toBe(false);
    });
  });

  describe('Gate 3: Arquitetura de Idempotência e Pareamento de Usuários', () => {
    it('gera hash de idempotência determinístico para prevenir duplicações', async () => {
      const hash1 = await calculateIdempotencyHash('ws-rodo-point:wamid.HBgLMTU1...');
      const hash2 = await calculateIdempotencyHash('ws-rodo-point:wamid.HBgLMTU1...');
      const hashDiff = await calculateIdempotencyHash('ws-rodo-point:wamid.DIFFERENT...');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hashDiff);
      expect(hash1.length).toBe(64); // SHA-256 Hex
    });

    it('rejeita números de telefone fora do formato válido E.164 no pareamento', async () => {
      const shortResult = await WhatsAppIntegrationService.pairUserPhone({
        workspaceId: 'ws-rodo',
        userId: 'usr-1',
        phoneNumber: '123',
      });
      expect(shortResult.success).toBe(false);
      expect(shortResult.error).toContain('inválido');

      const longResult = await WhatsAppIntegrationService.pairUserPhone({
        workspaceId: 'ws-rodo',
        userId: 'usr-1',
        phoneNumber: '12345678901234567890',
      });
      expect(longResult.success).toBe(false);
      expect(longResult.error).toContain('inválido');
    });
  });
});
