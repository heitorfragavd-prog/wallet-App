import { describe, it, expect } from 'vitest';
import {
  simulateChannelPricing,
  compareItemAcrossChannels,
} from './pricing-simulator';

describe('Wallet Delivery Growth — Simulador de Margem e Precificação', () => {
  describe('simulateChannelPricing', () => {
    it('calcula deduções de comissão, pagamento e embalagem para pedido no iFood', () => {
      const result = simulateChannelPricing({
        base_cost_cmv: 10.0,
        in_store_price: 30.0,
        channel_type: 'ifood',
        channel_commission_rate: 0.23, // 23%
        payment_fee_rate: 0.032,       // 3.2%
        packaging_cost: 2.50,
      });

      // Se vender pelo preço de balcão (R$ 30,00) no iFood:
      expect(result.channel_price).toBe(30.0);
      expect(result.commission_amount).toBe(6.90); // 30 * 0.23
      expect(result.payment_fee_amount).toBe(0.96); // 30 * 0.032
      expect(result.total_channel_deductions).toBe(7.86);
      expect(result.net_payout).toBe(22.14);

      // Margem no canal = 22.14 - 10.0 (CMV) - 2.50 (embalagem) = R$ 9.64
      expect(result.contribution_margin_amount).toBe(9.64);
      expect(result.contribution_margin_percent).toBeCloseTo(32.13, 1);

      // Margem no balcão = 30.0 - 10.0 = R$ 20.00
      expect(result.in_store_margin_amount).toBe(20.0);

      // Vazamento de margem se não reajustar: 9.64 - 20.00 = -10.36
      expect(result.margin_gap_amount).toBe(-10.36);
    });

    it('calcula o preço e markup recomendados para preservar o lucro nominal em R$ do balcão', () => {
      const result = simulateChannelPricing({
        base_cost_cmv: 10.0,
        in_store_price: 30.0,
        channel_type: 'ifood',
        channel_commission_rate: 0.23,
        payment_fee_rate: 0.032,
        packaging_cost: 2.50,
      });

      // Retenção líquida: 1 - (0.23 + 0.032) = 0.738
      // Necessário: in_store_margin (20.00) + CMV (10.00) + embalagem (2.50) = 32.50
      // Preço recomendado = 32.50 / 0.738 = ~44.04
      expect(result.recommended_price_to_match_in_store_margin).toBeCloseTo(44.04, 1);
      expect(result.markup_recommended_percent).toBeGreaterThan(40);

      // Se aplicarmos esse preço recomendado no simulador, a margem resultante deve ser igual à do balcão:
      const protectedResult = simulateChannelPricing({
        base_cost_cmv: 10.0,
        in_store_price: 30.0,
        proposed_channel_price: result.recommended_price_to_match_in_store_margin,
        channel_type: 'ifood',
        channel_commission_rate: 0.23,
        payment_fee_rate: 0.032,
        packaging_cost: 2.50,
      });

      expect(protectedResult.contribution_margin_amount).toBeCloseTo(result.in_store_margin_amount, 0);
    });

    it('trata valores zerados ou taxas nulas sem quebrar o cálculo', () => {
      const result = simulateChannelPricing({
        base_cost_cmv: 0,
        in_store_price: 0,
        channel_type: 'direct',
        channel_commission_rate: 0,
        payment_fee_rate: 0,
        packaging_cost: 0,
      });

      expect(result.net_payout).toBe(0);
      expect(result.contribution_margin_amount).toBe(0);
      expect(result.contribution_margin_percent).toBe(0);
    });
  });

  describe('compareItemAcrossChannels', () => {
    it('gera comparação simultânea para Balcão, iFood, 99Food e WhatsApp/Direto', () => {
      const comp = compareItemAcrossChannels(12.0, 35.0, 2.50, 35);

      expect(comp.in_store.price).toBe(35.0);
      expect(comp.in_store.margin_amount).toBe(23.0); // 35 - 12

      // iFood com 23% comissão
      expect(comp.channels.ifood.channel_type).toBe('ifood');
      expect(comp.channels.ifood.recommended_price_to_match_in_store_margin).toBeGreaterThan(comp.in_store.price);

      // 99Food com 20% comissão
      expect(comp.channels['99food'].channel_type).toBe('99food');
      expect(comp.channels['99food'].recommended_price_to_match_in_store_margin).toBeGreaterThan(comp.in_store.price);

      // Direto / WhatsApp com 0% comissão (só embalagem e taxa pix)
      expect(comp.channels.direct.channel_type).toBe('direct');
      expect(comp.channels.direct.recommended_price_to_match_in_store_margin).toBeLessThan(
        comp.channels.ifood.recommended_price_to_match_in_store_margin
      );
    });
  });
});
