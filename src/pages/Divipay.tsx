import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Tabs, TabsContent } from "@/shared/components/ui/tabs";
import { DivipayDashboardView } from "@/domains/divipay/components/DivipayDashboardView";
import { DivipayCobrancasView } from "@/domains/divipay/components/DivipayCobrancasView";
import { DivipayTransferenciasView } from "@/domains/divipay/components/DivipayTransferenciasView";
import { DivipayExtratoView } from "@/domains/divipay/components/DivipayExtratoView";
import { DivipayConfiguracoesView } from "@/domains/divipay/components/DivipayConfiguracoesView";
import { DivipaySidebar } from "@/domains/divipay/components/DivipaySidebar";
import { useDivipayConfig } from "@/domains/divipay/hooks/useDivipayConfig";
import { AlertCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

const Divipay = () => {
  const { config, loading: configLoading } = useDivipayConfig();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isConfigured = !configLoading && !!config?.client_id && !!config?.client_secret;
  const showSetupBanner = !configLoading && !isConfigured;

  return (
    <DashboardLayout>
      <div className="flex gap-4 p-4 md:p-6 min-h-[calc(100vh-4rem)]">
        {/* Menu Lateral Retrátil Estilo Banco Divipay */}
        <DivipaySidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Conteúdo Principal */}
        <main className="flex-1 min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            {/* Banner de configuração pendente */}
            {showSetupBanner && activeTab !== "configuracoes" && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
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
              <DivipayDashboardView onNavigateTab={setActiveTab} />
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
      </div>
    </DashboardLayout>
  );
};

export default Divipay;

