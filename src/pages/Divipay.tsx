import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { DivipayDashboardView } from "@/domains/divipay/components/DivipayDashboardView";
import { DivipayCobrancasView } from "@/domains/divipay/components/DivipayCobrancasView";
import { DivipayTransferenciasView } from "@/domains/divipay/components/DivipayTransferenciasView";
import { DivipayExtratoView } from "@/domains/divipay/components/DivipayExtratoView";
import { DivipayConfiguracoesView } from "@/domains/divipay/components/DivipayConfiguracoesView";
import { useDivipayConfig } from "@/domains/divipay/hooks/useDivipayConfig";
import { LayoutDashboard, QrCode, ArrowRightLeft, ScrollText, Settings, AlertCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

const Divipay = () => {
  const { config, loading: configLoading } = useDivipayConfig();
  const [activeTab, setActiveTab] = useState("dashboard");

  const isConfigured = !configLoading && !!config?.client_id && !!config?.client_secret;
  const showSetupBanner = !configLoading && !isConfigured;

  return (
    <DashboardLayout>
      <main className="p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
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

          {/* Banner de configuração pendente */}
          {showSetupBanner && activeTab !== "configuracoes" && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Integração Divipay não configurada</p>
                <p className="text-sm mt-0.5 text-amber-600/80 dark:text-amber-400/80">
                  Configure suas credenciais (Client ID e Client Secret) para usar cobranças, transferências e extrato.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 flex-shrink-0"
                onClick={() => setActiveTab("configuracoes")}
              >
                Configurar
              </Button>
            </div>
          )}

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
