import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { DivipayDashboardView } from "@/domains/divipay/components/DivipayDashboardView";
import { DivipayCobrancasView } from "@/domains/divipay/components/DivipayCobrancasView";
import { DivipayTransferenciasView } from "@/domains/divipay/components/DivipayTransferenciasView";
import { DivipayExtratoView } from "@/domains/divipay/components/DivipayExtratoView";
import { DivipayConfiguracoesView } from "@/domains/divipay/components/DivipayConfiguracoesView";
import { LayoutDashboard, QrCode, ArrowRightLeft, ScrollText, Settings } from "lucide-react";

const Divipay = () => {
  return (
    <DashboardLayout>
      <main className="p-4 md:p-6">
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-2">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="cobrancas" className="flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              Cobranças
            </TabsTrigger>
            <TabsTrigger value="transferencias" className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              Transferências
            </TabsTrigger>
            <TabsTrigger value="extrato" className="flex items-center gap-2">
              <ScrollText className="w-4 h-4" />
              Extrato
            </TabsTrigger>
            <TabsTrigger value="configuracoes" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Configurações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DivipayDashboardView />
          </TabsContent>
          <TabsContent value="cobrancas">
            <DivipayCobrancasView />
          </TabsContent>
          <TabsContent value="transferencias">
            <DivipayTransferenciasView />
          </TabsContent>
          <TabsContent value="extrato">
            <DivipayExtratoView />
          </TabsContent>
          <TabsContent value="configuracoes">
            <DivipayConfiguracoesView />
          </TabsContent>
        </Tabs>
      </main>
    </DashboardLayout>
  );
};

export default Divipay;
