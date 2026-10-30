import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import {
  Calculator,
  AlertTriangle,
  Percent,
  DollarSign,
  Package,
} from 'lucide-react';
import { compareItemAcrossChannels, DEFAULT_CHANNEL_BENCHMARKS } from '../pricing-simulator';

export const DeliveryMarginSimulator: React.FC = () => {
  const [dishName, setDishName] = useState<string>('X-Tudo Especial Rodo Point');
  const [baseCostCmv, setBaseCostCmv] = useState<number>(10.5);
  const [inStorePrice, setInStorePrice] = useState<number>(32.0);
  const [packagingCost, setPackagingCost] = useState<number>(2.5);
  const [targetMarginPercent, setTargetMarginPercent] = useState<number>(40);

  // Simulação comparativa em tempo real
  const comparison = useMemo(() => {
    return compareItemAcrossChannels(
      Math.max(0.1, Number(baseCostCmv) || 0),
      Math.max(0.1, Number(inStorePrice) || 0),
      Math.max(0, Number(packagingCost) || 0),
      Math.max(1, Number(targetMarginPercent) || 35)
    );
  }, [baseCostCmv, inStorePrice, packagingCost, targetMarginPercent]);

  const { in_store, channels } = comparison;
  const ifood = channels.ifood;
  const ninetyNine = channels['99food'];
  const direct = channels.direct;

  return (
    <div className="space-y-6">
      {/* Bloco de Entradas e Parâmetros */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Simulador de Margem & Precificação Inteligente</CardTitle>
          </div>
          <CardDescription>
            Calcule o markup necessário para cobrir taxas de marketplaces (iFood, 99Food) e embalagens, protegendo a margem líquida da Rodo Point.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5 lg:col-span-1">
              <Label htmlFor="dishName" className="text-xs font-semibold">
                Item / Prato
              </Label>
              <Input
                id="dishName"
                value={dishName}
                onChange={(e) => setDishName(e.target.value)}
                className="h-9 text-xs"
                placeholder="Ex: X-Salada..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cmvInput" className="text-xs font-semibold flex items-center justify-between">
                <span>CMV Insumos (R$)</span>
                <span className="text-muted-foreground text-[10px]">Custo unitário</span>
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="cmvInput"
                  type="number"
                  step="0.5"
                  min="0"
                  value={baseCostCmv}
                  onChange={(e) => setBaseCostCmv(parseFloat(e.target.value) || 0)}
                  className="pl-8 h-9 text-xs font-semibold"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="priceInput" className="text-xs font-semibold flex items-center justify-between">
                <span>Preço Balcão (R$)</span>
                <span className="text-muted-foreground text-[10px]">Venda na loja</span>
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="priceInput"
                  type="number"
                  step="1.0"
                  min="0"
                  value={inStorePrice}
                  onChange={(e) => setInStorePrice(parseFloat(e.target.value) || 0)}
                  className="pl-8 h-9 text-xs font-semibold text-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="packInput" className="text-xs font-semibold flex items-center justify-between">
                <span>Embalagem (R$)</span>
                <span className="text-muted-foreground text-[10px]">Caixa/sacola</span>
              </Label>
              <div className="relative">
                <Package className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="packInput"
                  type="number"
                  step="0.25"
                  min="0"
                  value={packagingCost}
                  onChange={(e) => setPackagingCost(parseFloat(e.target.value) || 0)}
                  className="pl-8 h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="targetMargin" className="text-xs font-semibold flex items-center justify-between">
                <span>Margem Alvo (%)</span>
                <span className="text-muted-foreground text-[10px]">Meta líquida</span>
              </Label>
              <div className="relative">
                <Percent className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="targetMargin"
                  type="number"
                  step="5"
                  min="5"
                  max="80"
                  value={targetMarginPercent}
                  onChange={(e) => setTargetMarginPercent(parseFloat(e.target.value) || 0)}
                  className="pl-8 h-9 text-xs font-semibold"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerta de Diagnóstico de Vazamento de Margem */}
      <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">
            Alerta Estratégico: Vender no iFood sem reajuste reduz seu lucro nominal de R$ {in_store.margin_amount.toFixed(2)} para R$ {ifood.contribution_margin_amount.toFixed(2)} por pedido!
          </p>
          <p className="text-muted-foreground dark:text-amber-300/80">
            A comissão de {((DEFAULT_CHANNEL_BENCHMARKS.ifood.commission_rate + DEFAULT_CHANNEL_BENCHMARKS.ifood.payment_fee_rate) * 100).toFixed(1)}% e a embalagem de R$ {packagingCost.toFixed(2)} geram uma perda de R$ {Math.abs(ifood.margin_gap_amount).toFixed(2)} por unidade se o preço do cardápio presencial for replicado diretamente.
          </p>
        </div>
      </div>

      {/* Grid de Canais Comparativos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card: Balcão / Loja Física */}
        <Card className="border-2 border-border shadow-sm">
          <CardHeader className="p-4 pb-2 bg-muted/30 border-b">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="font-bold">
                Balcão / Presencial
              </Badge>
              <span className="text-xs font-semibold text-muted-foreground">Base 100%</span>
            </div>
            <div className="pt-2">
              <span className="text-2xl font-black text-foreground">
                R$ {in_store.price.toFixed(2)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2.5 text-xs">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">CMV Unitário:</span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                - R$ {in_store.cmv.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Comissão / Taxas:</span>
              <span className="font-semibold text-emerald-600">R$ 0,00 (0%)</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Embalagem Extra:</span>
              <span className="font-semibold text-muted-foreground">R$ 0,00</span>
            </div>
            <div className="pt-2 flex justify-between items-baseline">
              <span className="font-bold text-sm">Margem Líquida:</span>
              <div className="text-right">
                <span className="font-extrabold text-base text-emerald-600 block">
                  R$ {in_store.margin_amount.toFixed(2)}
                </span>
                <span className="text-[11px] text-muted-foreground font-semibold">
                  {in_store.margin_percent.toFixed(1)}% do preço
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: iFood */}
        <Card className="border-2 border-red-200 dark:border-red-900 shadow-sm bg-red-50/10">
          <CardHeader className="p-4 pb-2 bg-red-500/10 border-b border-red-200 dark:border-red-900">
            <div className="flex items-center justify-between">
              <Badge className="bg-red-600 text-white font-bold">iFood</Badge>
              <span className="text-[11px] font-bold text-red-600 dark:text-red-400">
                Taxas: 26,2%
              </span>
            </div>
            <div className="pt-2 flex items-baseline justify-between">
              <div>
                <span className="text-xs text-muted-foreground block">Preço Recomendado</span>
                <span className="text-2xl font-black text-red-600 dark:text-red-400">
                  R$ {ifood.recommended_price_to_match_in_store_margin.toFixed(2)}
                </span>
              </div>
              <Badge variant="outline" className="text-xs font-bold border-red-400 text-red-700 dark:text-red-300">
                +{ifood.markup_recommended_percent.toFixed(0)}% markup
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2 text-xs">
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Comissão iFood (23%):</span>
              <span className="font-semibold text-red-600">
                - R$ {((ifood.recommended_price_to_match_in_store_margin * 0.23)).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Pagamento Online (3,2%):</span>
              <span className="font-semibold text-red-600">
                - R$ {((ifood.recommended_price_to_match_in_store_margin * 0.032)).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Embalagem Entrega:</span>
              <span className="font-semibold text-red-600">
                - R$ {packagingCost.toFixed(2)}
              </span>
            </div>
            <div className="pt-2 flex justify-between items-baseline">
              <span className="font-bold text-sm">Margem Protegida:</span>
              <div className="text-right">
                <span className="font-extrabold text-base text-emerald-600 block">
                  R$ {in_store.margin_amount.toFixed(2)}
                </span>
                <span className="text-[11px] text-muted-foreground font-semibold">
                  Lucro nominal preservado
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: 99Food */}
        <Card className="border-2 border-amber-200 dark:border-amber-900 shadow-sm bg-amber-50/10">
          <CardHeader className="p-4 pb-2 bg-amber-500/10 border-b border-amber-200 dark:border-amber-900">
            <div className="flex items-center justify-between">
              <Badge className="bg-amber-500 text-stone-900 font-bold">99Food</Badge>
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                Taxas: 22,5%
              </span>
            </div>
            <div className="pt-2 flex items-baseline justify-between">
              <div>
                <span className="text-xs text-muted-foreground block">Preço Recomendado</span>
                <span className="text-2xl font-black text-amber-700 dark:text-amber-400">
                  R$ {ninetyNine.recommended_price_to_match_in_store_margin.toFixed(2)}
                </span>
              </div>
              <Badge variant="outline" className="text-xs font-bold border-amber-400 text-amber-800 dark:text-amber-300">
                +{ninetyNine.markup_recommended_percent.toFixed(0)}% markup
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2 text-xs">
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Comissão 99Food (20%):</span>
              <span className="font-semibold text-amber-700">
                - R$ {((ninetyNine.recommended_price_to_match_in_store_margin * 0.20)).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Taxa Pagamento (2,5%):</span>
              <span className="font-semibold text-amber-700">
                - R$ {((ninetyNine.recommended_price_to_match_in_store_margin * 0.025)).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Embalagem Entrega:</span>
              <span className="font-semibold text-red-600">
                - R$ {packagingCost.toFixed(2)}
              </span>
            </div>
            <div className="pt-2 flex justify-between items-baseline">
              <span className="font-bold text-sm">Margem Protegida:</span>
              <div className="text-right">
                <span className="font-extrabold text-base text-emerald-600 block">
                  R$ {in_store.margin_amount.toFixed(2)}
                </span>
                <span className="text-[11px] text-muted-foreground font-semibold">
                  Lucro nominal preservado
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: Delivery Direto / WhatsApp */}
        <Card className="border-2 border-emerald-300 dark:border-emerald-800 shadow-sm bg-emerald-50/10">
          <CardHeader className="p-4 pb-2 bg-emerald-500/10 border-b border-emerald-300 dark:border-emerald-800">
            <div className="flex items-center justify-between">
              <Badge className="bg-emerald-600 text-white font-bold">Direto / WhatsApp</Badge>
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                0% Comissão!
              </span>
            </div>
            <div className="pt-2 flex items-baseline justify-between">
              <div>
                <span className="text-xs text-muted-foreground block">Preço Recomendado</span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  R$ {direct.recommended_price_to_match_in_store_margin.toFixed(2)}
                </span>
              </div>
              <Badge variant="outline" className="text-xs font-bold border-emerald-400 text-emerald-700 dark:text-emerald-300">
                +{direct.markup_recommended_percent.toFixed(0)}% (só embalagem)
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2 text-xs">
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Comissão de Plataforma:</span>
              <span className="font-semibold text-emerald-600">R$ 0,00</span>
            </div>
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Taxa Pix / Cartão (1,5%):</span>
              <span className="font-semibold text-emerald-700">
                - R$ {((direct.recommended_price_to_match_in_store_margin * 0.015)).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between py-0.5 border-b">
              <span className="text-muted-foreground">Embalagem Entrega:</span>
              <span className="font-semibold text-red-600">
                - R$ {packagingCost.toFixed(2)}
              </span>
            </div>
            <div className="pt-2 flex justify-between items-baseline">
              <span className="font-bold text-sm">Margem Líquida:</span>
              <div className="text-right">
                <span className="font-extrabold text-base text-emerald-600 block">
                  R$ {in_store.margin_amount.toFixed(2)}
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold">
                  Máxima rentabilidade
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
