import React, { useMemo } from 'react';
import { DashboardLayout } from '@/shared/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import {
  Bike,
  Calculator,
  Settings2,
  MonitorCheck,
  ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DeliveryRoleGuard } from '@/domains/delivery/DeliveryRoleGuard';
import { DeliveryMarginSimulator } from '@/domains/delivery/components/DeliveryMarginSimulator';
import { IFoodConnector } from '@/domains/delivery/connectors/ifood-connector';
import { NinetyNineConnector } from '@/domains/delivery/connectors/ninety-nine-connector';
import { ConnectorCapabilityStatus } from '@/domains/delivery/types';

export const WalletDeliveryPage: React.FC = () => {
  const ifoodConnector = useMemo(() => new IFoodConnector(), []);
  const ninetyNineConnector = useMemo(() => new NinetyNineConnector(), []);

  const ifoodCaps = useMemo(() => ifoodConnector.getCapabilities(), [ifoodConnector]);
  const ninetyNineCaps = useMemo(() => ninetyNineConnector.getCapabilities(), [ninetyNineConnector]);

  const renderStatusBadge = (status: ConnectorCapabilityStatus) => {
    switch (status) {
      case 'available':
        return <Badge className="bg-emerald-600 text-white font-bold text-[10px]">Disponível</Badge>;
      case 'awaiting_homologation':
        return <Badge className="bg-amber-500 text-stone-900 font-bold text-[10px]">Aguardando Homologação</Badge>;
      case 'unauthorized':
        return <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400 text-[10px]">Requer Credencial</Badge>;
      case 'unsupported':
        return <Badge variant="secondary" className="text-[10px]">Não Suportado na API</Badge>;
      case 'temporarily_unavailable':
        return <Badge variant="destructive" className="text-[10px]">Temporariamente Indisponível</Badge>;
    }
  };

  return (
    <DeliveryRoleGuard fallbackPath="/delivery/kds">
      <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Cabeçalho da Central Delivery */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Bike className="h-6 w-6" />
              </span>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Wallet Delivery Growth — Hub de Canais
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Conectores próprios para iFood, 99Food e Delivery Direto, simulador de margem para evitar sangria e KDS integrado.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/delivery/kds">
              <Button className="h-9 text-xs font-bold bg-primary flex items-center gap-1.5">
                <MonitorCheck className="h-4 w-4" />
                Abrir KDS Cozinha (Mac / Android)
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Status dos 3 Canais de Venda */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* iFood */}
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-2 border-b bg-red-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-600 text-white font-bold">iFood</Badge>
                  <span className="text-xs font-semibold">Merchant API v1.0</span>
                </div>
                <Badge variant="outline" className="text-emerald-600 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 text-[10px]">
                  Conectado
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Comissão Plataforma:</span>
                <span className="font-bold text-red-600">23% (Entrega Parceira)</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Taxa Pagamento:</span>
                <span className="font-semibold">3,2% (Online)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Recepção de Pedidos:</span>
                <span className="font-bold text-emerald-600">Automática no KDS</span>
              </div>
            </CardContent>
          </Card>

          {/* 99Food */}
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-2 border-b bg-amber-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500 text-stone-900 font-bold">99Food</Badge>
                  <span className="text-xs font-semibold">Open Platform</span>
                </div>
                <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-[10px]">
                  Homologando
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Comissão Plataforma:</span>
                <span className="font-bold text-amber-700 dark:text-amber-400">20% médio</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Taxa Pagamento:</span>
                <span className="font-semibold">2,5%</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Recepção de Pedidos:</span>
                <span className="font-bold text-emerald-600">Ativa via Webhook</span>
              </div>
            </CardContent>
          </Card>

          {/* Delivery Direto / WhatsApp */}
          <Card className="border shadow-sm">
            <CardHeader className="p-4 pb-2 border-b bg-emerald-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-600 text-white font-bold">Direto / WhatsApp</Badge>
                  <span className="text-xs font-semibold">Canal Próprio</span>
                </div>
                <Badge variant="outline" className="text-emerald-600 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 text-[10px]">
                  0% Comissão
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Comissão Plataforma:</span>
                <span className="font-bold text-emerald-600">0,0% (Lucro 100% Rodo Point)</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Taxa Pagamento:</span>
                <span className="font-semibold">1,0% - 1,5% (Pix / Maquininha)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Recepção de Pedidos:</span>
                <span className="font-bold text-emerald-600">Direta no KDS</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Abas Principais: Simulador vs Conectores */}
        <Tabs defaultValue="simulator" className="space-y-4">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="simulator" className="text-xs font-bold">
              <Calculator className="h-3.5 w-3.5 mr-1.5" />
              Simulador de Margem & Preço
            </TabsTrigger>
            <TabsTrigger value="connectors" className="text-xs font-bold">
              <Settings2 className="h-3.5 w-3.5 mr-1.5" />
              Capacidades Declaradas dos Conectores
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: Simulador de Precificação */}
          <TabsContent value="simulator" className="space-y-4">
            <DeliveryMarginSimulator />
          </TabsContent>

          {/* ABA 2: Detalhes das APIs e Conectores */}
          <TabsContent value="connectors" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* iFood Capabilities */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 pb-2 border-b">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                    Contrato & Recursos do Conector iFood
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Recepção de Pedidos (can_fetch_orders):</span>
                    {renderStatusBadge(ifoodCaps.can_fetch_orders.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Aceite de Pedidos (can_accept_orders):</span>
                    {renderStatusBadge(ifoodCaps.can_accept_orders.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Atualização de Status (can_update_status):</span>
                    {renderStatusBadge(ifoodCaps.can_update_status.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Sincronização de Cardápio (can_sync_menu):</span>
                    {renderStatusBadge(ifoodCaps.can_sync_menu.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Pausa / Estoque de Itens (can_update_stock):</span>
                    {renderStatusBadge(ifoodCaps.can_update_stock.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Cancelamento com Motivo (can_cancel_order):</span>
                    {renderStatusBadge(ifoodCaps.can_cancel_order.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span>Avaliações de Clientes (can_fetch_reviews):</span>
                    {renderStatusBadge(ifoodCaps.can_fetch_reviews.status)}
                  </div>
                </CardContent>
              </Card>

              {/* 99Food Capabilities */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 pb-2 border-b">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                    Contrato & Recursos do Conector 99Food
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Recepção de Pedidos (can_fetch_orders):</span>
                    {renderStatusBadge(ninetyNineCaps.can_fetch_orders.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Aceite de Pedidos (can_accept_orders):</span>
                    {renderStatusBadge(ninetyNineCaps.can_accept_orders.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Atualização de Status (can_update_status):</span>
                    {renderStatusBadge(ninetyNineCaps.can_update_status.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Sincronização de Cardápio (can_sync_menu):</span>
                    {renderStatusBadge(ninetyNineCaps.can_sync_menu.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Pausa / Estoque de Itens (can_update_stock):</span>
                    {renderStatusBadge(ninetyNineCaps.can_update_stock.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b">
                    <span>Cancelamento com Motivo (can_cancel_order):</span>
                    {renderStatusBadge(ninetyNineCaps.can_cancel_order.status)}
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span>Avaliações de Clientes (can_fetch_reviews):</span>
                    {renderStatusBadge(ninetyNineCaps.can_fetch_reviews.status)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      </DashboardLayout>
    </DeliveryRoleGuard>
  );
};

export default WalletDeliveryPage;
