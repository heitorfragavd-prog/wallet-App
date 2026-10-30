import {
  DeliveryChannelType,
  PricingSimulationInput,
  PricingSimulationResult,
  ChannelPricingComparison,
} from './types';

/**
 * Arredonda valor monetário para 2 casas decimais com segurança
 */
function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Simula a precificação de um item para um canal de delivery específico.
 * Calcula comissão da plataforma, taxa de pagamento, embalagem, CMV base
 * e indica o preço ideal para preservar a margem de contribuição da Rodo Point.
 * 
 * NOTA METODOLÓGICA:
 * Os cálculos derivam a Margem de Contribuição unitária (Preço Líquido - CMV - Embalagem - Taxas).
 * Não representam Lucro Líquido final da empresa, o qual depende do rateio de despesas fixas
 * (equipe, aluguel, energia, impostos globais e depreciação).
 */
export function simulateChannelPricing(input: PricingSimulationInput): PricingSimulationResult {
  const {
    base_cost_cmv,
    in_store_price,
    channel_type,
    channel_commission_rate,
    payment_fee_rate,
    packaging_cost,
    fixed_order_fee = 0,
    target_margin_percent,
    proposed_channel_price,
  } = input;

  // Preço testado no canal (se não informado, usa o in_store_price para mostrar o impacto da perda de margem)
  const channel_price = proposed_channel_price !== undefined && proposed_channel_price > 0
    ? proposed_channel_price
    : in_store_price;

  // Deduções do canal
  const commission_amount = roundCurrency(channel_price * Math.max(0, channel_commission_rate));
  const payment_fee_amount = roundCurrency(channel_price * Math.max(0, payment_fee_rate));
  const total_channel_deductions = roundCurrency(commission_amount + payment_fee_amount + fixed_order_fee);
  const net_payout = roundCurrency(channel_price - total_channel_deductions);

  // Margem de contribuição no canal
  const contribution_margin_amount = roundCurrency(net_payout - base_cost_cmv - packaging_cost);
  const contribution_margin_percent = channel_price > 0
    ? roundCurrency((contribution_margin_amount / channel_price) * 100)
    : 0;

  // Margem de contribuição no balcão (in-store) de referência
  const in_store_margin_amount = roundCurrency(in_store_price - base_cost_cmv);
  const in_store_margin_percent = in_store_price > 0
    ? roundCurrency((in_store_margin_amount / in_store_price) * 100)
    : 0;

  // 1. Preço recomendado para igualar a margem de contribuição nominal (R$) do balcão
  const feeRateSum = Math.max(0, channel_commission_rate) + Math.max(0, payment_fee_rate);
  const retainedRate = 1 - feeRateSum;

  let recommended_price_to_match_in_store_margin = in_store_price;
  if (retainedRate > 0.05) {
    const neededRevenue = in_store_margin_amount + base_cost_cmv + packaging_cost + fixed_order_fee;
    recommended_price_to_match_in_store_margin = roundCurrency(neededRevenue / retainedRate);
  }

  // 2. Preço recomendado para atingir a meta percentual de margem de contribuição (ex: 35%)
  let recommended_price_to_match_target_margin = recommended_price_to_match_in_store_margin;
  if (target_margin_percent !== undefined && target_margin_percent > 0) {
    const targetRateDecimal = target_margin_percent / 100;
    const denominator = 1 - feeRateSum - targetRateDecimal;
    if (denominator > 0.05) {
      const fixedCosts = base_cost_cmv + packaging_cost + fixed_order_fee;
      recommended_price_to_match_target_margin = roundCurrency(fixedCosts / denominator);
    }
  }

  const markup_recommended_percent = in_store_price > 0
    ? roundCurrency(((recommended_price_to_match_in_store_margin - in_store_price) / in_store_price) * 100)
    : 0;

  const margin_gap_amount = roundCurrency(contribution_margin_amount - in_store_margin_amount);

  return {
    channel_type,
    in_store_price: roundCurrency(in_store_price),
    channel_price: roundCurrency(channel_price),
    commission_amount,
    payment_fee_amount,
    fixed_order_fee: roundCurrency(fixed_order_fee),
    packaging_cost: roundCurrency(packaging_cost),
    base_cost_cmv: roundCurrency(base_cost_cmv),
    total_channel_deductions,
    net_payout,
    contribution_margin_amount,
    contribution_margin_percent,
    in_store_margin_amount,
    in_store_margin_percent,
    recommended_price_to_match_in_store_margin,
    recommended_price_to_match_target_margin,
    markup_recommended_percent,
    margin_gap_amount,
  };
}

/**
 * Taxas de referência de mercado (benchmarks) para hipóteses de simulação.
 * IMPORTANTE: São estimativas de mercado para modelagem e NÃO comprovam contrato real
 * firmado com o estabelecimento até que sejam configuradas pelo administrador.
 */
export const DEFAULT_CHANNEL_BENCHMARKS: Record<
  DeliveryChannelType,
  {
    commission_rate: number;
    payment_fee_rate: number;
    fixed_fee: number;
    default_packaging: number;
    description: string;
    is_benchmark_hypothesis: boolean;
  }
> = {
  ifood: {
    commission_rate: 0.23, // 23% Hipótese de benchmark (Plano Entrega Parceira padrão)
    payment_fee_rate: 0.032, // 3.2% Hipótese de pagamento online
    fixed_fee: 0,
    default_packaging: 2.50,
    description: 'Hipótese padrão de mercado (iFood Entrega Parceira + Pagamento Online)',
    is_benchmark_hypothesis: true,
  },
  '99food': {
    commission_rate: 0.20, // 20% Hipótese de benchmark médio
    payment_fee_rate: 0.025,
    fixed_fee: 0,
    default_packaging: 2.50,
    description: 'Hipótese padrão de mercado (99Food padrão)',
    is_benchmark_hypothesis: true,
  },
  direct: {
    commission_rate: 0.0, // Próprio: 0% comissão de marketplace
    payment_fee_rate: 0.015, // Média taxa de cartão maquininha / Pix
    fixed_fee: 0,
    default_packaging: 2.00,
    description: 'Canal Direto próprio (sem comissão de terceiros)',
    is_benchmark_hypothesis: true,
  },
  whatsapp: {
    commission_rate: 0.0,
    payment_fee_rate: 0.01, // Média Pix direto
    fixed_fee: 0,
    default_packaging: 2.00,
    description: 'Atendimento via WhatsApp (sem comissão de terceiros)',
    is_benchmark_hypothesis: true,
  },
};

export interface ChannelRateConfig {
  commission_rate?: number;
  payment_fee_rate?: number;
  fixed_fee?: number;
  default_packaging?: number;
}

/**
 * Compara o mesmo item em todos os canais simultaneamente, permitindo personalização
 * das taxas contratuais reais ou uso dos benchmarks de mercado.
 */
export function compareItemAcrossChannels(
  base_cost_cmv: number,
  in_store_price: number,
  customPackaging?: number,
  target_margin_percent: number = 35,
  customRates?: Partial<Record<DeliveryChannelType, ChannelRateConfig>>
): ChannelPricingComparison {
  const in_store_margin_amount = roundCurrency(in_store_price - base_cost_cmv);
  const in_store_margin_percent = in_store_price > 0
    ? roundCurrency((in_store_margin_amount / in_store_price) * 100)
    : 0;

  const getRates = (channel: DeliveryChannelType) => {
    const benchmark = DEFAULT_CHANNEL_BENCHMARKS[channel];
    const custom = customRates?.[channel];
    return {
      commission_rate: custom?.commission_rate !== undefined ? custom.commission_rate : benchmark.commission_rate,
      payment_fee_rate: custom?.payment_fee_rate !== undefined ? custom.payment_fee_rate : benchmark.payment_fee_rate,
      fixed_fee: custom?.fixed_fee !== undefined ? custom.fixed_fee : benchmark.fixed_fee,
      packaging: customPackaging !== undefined ? customPackaging : (custom?.default_packaging ?? benchmark.default_packaging),
    };
  };

  const ifoodRates = getRates('ifood');
  const ninetyNineRates = getRates('99food');
  const directRates = getRates('direct');
  const whatsappRates = getRates('whatsapp');

  const channels: Record<DeliveryChannelType, PricingSimulationResult> = {
    ifood: simulateChannelPricing({
      base_cost_cmv,
      in_store_price,
      channel_type: 'ifood',
      channel_commission_rate: ifoodRates.commission_rate,
      payment_fee_rate: ifoodRates.payment_fee_rate,
      packaging_cost: ifoodRates.packaging,
      fixed_order_fee: ifoodRates.fixed_fee,
      target_margin_percent,
    }),
    '99food': simulateChannelPricing({
      base_cost_cmv,
      in_store_price,
      channel_type: '99food',
      channel_commission_rate: ninetyNineRates.commission_rate,
      payment_fee_rate: ninetyNineRates.payment_fee_rate,
      packaging_cost: ninetyNineRates.packaging,
      fixed_order_fee: ninetyNineRates.fixed_fee,
      target_margin_percent,
    }),
    direct: simulateChannelPricing({
      base_cost_cmv,
      in_store_price,
      channel_type: 'direct',
      channel_commission_rate: directRates.commission_rate,
      payment_fee_rate: directRates.payment_fee_rate,
      packaging_cost: directRates.packaging,
      fixed_order_fee: directRates.fixed_fee,
      target_margin_percent,
    }),
    whatsapp: simulateChannelPricing({
      base_cost_cmv,
      in_store_price,
      channel_type: 'whatsapp',
      channel_commission_rate: whatsappRates.commission_rate,
      payment_fee_rate: whatsappRates.payment_fee_rate,
      packaging_cost: whatsappRates.packaging,
      fixed_order_fee: whatsappRates.fixed_fee,
      target_margin_percent,
    }),
  };

  return {
    in_store: {
      price: roundCurrency(in_store_price),
      cmv: roundCurrency(base_cost_cmv),
      packaging: 0,
      margin_amount: in_store_margin_amount,
      margin_percent: in_store_margin_percent,
    },
    channels,
  };
}
