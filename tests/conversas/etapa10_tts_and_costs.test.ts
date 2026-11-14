import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanMarkdownForSpeech } from '../../src/domains/conversas/hooks/useTextToSpeech';
import { WalletAudioService } from '../../src/domains/conversas/services/WalletAudioService';

describe('👑 WALLET CEO 3.0 — Etapa 10 (Gates 11, 12, 14): TTS, Custos de Áudio e Governança', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cleanMarkdownForSpeech', () => {
    it('remove formatações markdown e caracteres especiais para fala fluida e natural', () => {
      const raw = `
### Relatório Diário de Vendas
Ontem o faturamento foi de **R$ 5.420,00** com *142 pedidos*.
Acesse o [Dashboard](https://wallet.wonderwold.com.br/dashboard) para mais detalhes.

\`\`\`json
{ "vendas": 5420 }
\`\`\`

- Item A
- Item B
`;

      const cleaned = cleanMarkdownForSpeech(raw);

      expect(cleaned).not.toContain('###');
      expect(cleaned).not.toContain('**');
      expect(cleaned).not.toContain('*');
      expect(cleaned).not.toContain('```');
      expect(cleaned).not.toContain('https://');
      expect(cleaned).toContain('Relatório Diário de Vendas');
      expect(cleaned).toContain('Ontem o faturamento foi de R$ 5.420,00 com 142 pedidos');
      expect(cleaned).toContain('Acesse o Dashboard para mais detalhes');
    });

    it('retorna string vazia se o texto fornecido for nulo ou vazio', () => {
      expect(cleanMarkdownForSpeech('')).toBe('');
    });
  });

  describe('WalletAudioService - Estimativa de Custos Whisper', () => {
    it('calcula o custo correto para áudio de 30 segundos com taxa oficial ($0.006/min)', () => {
      const estimate = WalletAudioService.calculateCostEstimate(30, 5.80);

      expect(estimate.durationSeconds).toBe(30);
      expect(estimate.ratePerMinuteUsd).toBe(0.006);
      // 30s = 0.5 min * 0.006 = 0.003 USD
      expect(estimate.costUsd).toBe(0.003);
      // 0.003 * 5.80 = 0.0174 BRL
      expect(estimate.costBrl).toBe(0.0174);
    });

    it('calcula o custo correto para áudio de 120 segundos (limite máximo)', () => {
      const estimate = WalletAudioService.calculateCostEstimate(120, 5.80);

      expect(estimate.durationSeconds).toBe(120);
      // 120s = 2 min * 0.006 = 0.012 USD
      expect(estimate.costUsd).toBe(0.012);
      // 0.012 * 5.80 = 0.0696 BRL
      expect(estimate.costBrl).toBe(0.0696);
    });

    it('trata duração zero ou negativa de forma resiliente', () => {
      const estimate = WalletAudioService.calculateCostEstimate(-10);

      expect(estimate.durationSeconds).toBe(0);
      expect(estimate.costUsd).toBe(0);
      expect(estimate.costBrl).toBe(0);
    });
  });
});
