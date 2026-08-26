import { Suspense, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./domains/auth/components/ProtectedRoute";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import { Toaster } from "@/shared/components/ui/toaster";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { PrivacyProvider } from "@/contexts/PrivacyContext";
import { lazyWithRetry } from "@/shared/utils/lazyWithRetry";
import "./App.css";

// ── Loader global de fallback ──────────────────────────────────────
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

// ── Lazy imports — carregados apenas na primeira visita ────────────
const LandingPage         = lazyWithRetry(() => import("./pages/LandingPage"));
const Login               = lazyWithRetry(() => import("./pages/Login"));
const NotFound            = lazyWithRetry(() => import("./pages/NotFound"));

// Rotas protegidas — usuário comum
const Dashboard           = lazyWithRetry(() => import("./pages/Dashboard"));
const Receitas            = lazyWithRetry(() => import("./pages/Receitas"));
const Despesas            = lazyWithRetry(() => import("./pages/Despesas"));
const Transacoes          = lazyWithRetry(() => import("./pages/Transacoes"));
const Dividas             = lazyWithRetry(() => import("./pages/Dividas"));
const Categorias          = lazyWithRetry(() => import("./pages/Categorias"));
const Relatorios          = lazyWithRetry(() => import("./pages/Relatorios"));
const Metas               = lazyWithRetry(() => import("./pages/Metas"));
const Mercado             = lazyWithRetry(() => import("./pages/Mercado"));
const Veiculos            = lazyWithRetry(() => import("./pages/Veiculos"));
const Perfil              = lazyWithRetry(() => import("./pages/Perfil"));
const IAPage              = lazyWithRetry(() => import("./pages/IAPage")); // Legacy — mantido como fallback
const WalletIAPage        = lazyWithRetry(() => import("./pages/WalletIAPage")); // Wallet IA Unificada — Etapa 1
const Lembretes           = lazyWithRetry(() => import("./pages/Lembretes"));
const ContasCartoes       = lazyWithRetry(() => import("./pages/ContasCartoes"));
const InvestimentoDetalhe = lazyWithRetry(() => import("./pages/InvestimentoDetalhe"));
const MetaInvestimentoDetalhe = lazyWithRetry(() => import("./pages/MetaInvestimentoDetalhe"));
const EyemobilePDV        = lazyWithRetry(() => import("./pages/EyemobilePDV"));
const Divipay             = lazyWithRetry(() => import("./pages/Divipay"));
const DRE                 = lazyWithRetry(() => import("./pages/DRE"));
const FluxoCaixa          = lazyWithRetry(() => import("./pages/FluxoCaixa"));
const Cardapio            = lazyWithRetry(() => import("./pages/Cardapio"));
const CardapioNovo        = lazyWithRetry(() => import("./pages/CardapioNovo"));
const CardapioDetalhe     = lazyWithRetry(() => import("./pages/CardapioDetalhe"));
const Validades           = lazyWithRetry(() => import("./pages/Validades"));
const Comparativo         = lazyWithRetry(() => import("./pages/Comparativo"));
const Patrimonio          = lazyWithRetry(() => import("./pages/Patrimonio"));
const Transferencias      = lazyWithRetry(() => import("./pages/Transferencias"));
const Agenda              = lazyWithRetry(() => import("./pages/Agenda"));
const Subcategorias       = lazyWithRetry(() => import("./pages/Subcategorias"));
const CentrosCusto        = lazyWithRetry(() => import("./pages/CentrosCusto"));
const Fornecedores        = lazyWithRetry(() => import("./pages/Fornecedores"));
const EquipePage          = lazyWithRetry(() => import("./pages/Equipe"));
const EquipeDetalhePage   = lazyWithRetry(() => import("./pages/EquipeDetalhe"));
const EquipeNovoPage      = lazyWithRetry(() => import("./pages/EquipeNovo"));
const EquipeEditarPage    = lazyWithRetry(() => import("./pages/EquipeEditar"));
const EquipeCustoNovoPage = lazyWithRetry(() => import("./pages/EquipeCustoNovo"));
const Conciliacao         = lazyWithRetry(() => import("./pages/Conciliacao"));
const AIMetricsDashboard  = lazyWithRetry(() => import("./pages/AIMetricsDashboard"));
const Recibos             = lazyWithRetry(() => import("./pages/Recibos"));
const ConfiguracoesNotificacoes = lazyWithRetry(() => import("./pages/ConfiguracoesNotificacoes"));
const PDVPage             = lazyWithRetry(() => import("./pages/PDVPage"));

// Rotas admin — carregadas somente para admins
const AdminDashboard      = lazyWithRetry(() => import("./pages/AdminDashboard"));
const AdminUsers          = lazyWithRetry(() => import("./pages/AdminUsers"));
const AdminPlans          = lazyWithRetry(() => import("./pages/AdminPlans"));
const AdminPlanLimits     = lazyWithRetry(() => import("./pages/AdminPlanLimits"));
const AdminSubscriptions  = lazyWithRetry(() => import("./pages/AdminSubscriptions"));
const AdminReports        = lazyWithRetry(() => import("./pages/AdminReports"));
const AdminAuditLogs      = lazyWithRetry(() => import("./pages/AdminAuditLogs"));
const AdminPaymentSettings = lazyWithRetry(() => import("./pages/AdminPaymentSettings"));
const AdminWebhookSettings = lazyWithRetry(() => import("./pages/AdminWebhookSettings"));
const AdminWebhooksManutencao = lazyWithRetry(() => import("./pages/AdminWebhooksManutencao"));
const AdminWebhooks       = lazyWithRetry(() => import("./pages/AdminWebhooks"));

// ── App ───────────────────────────────────────────────────────────
function App() {
  // Registra o Service Worker de notificações push (Web Push API)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  return (
    <Router>
      <ErrorBoundary context="App">
        <WorkspaceProvider>
          <PrivacyProvider>
            <Suspense fallback={<PageLoader />}>
              <div className="min-h-screen bg-background">
                <Routes>
                  {/* Públicas */}
                  <Route path="/"      element={<LandingPage />} />
                  <Route path="/login" element={<Login />} />

                  {/* Protegidas — usuário comum */}
                  <Route path="/dashboard"  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/receitas"   element={<ProtectedRoute><Receitas /></ProtectedRoute>} />
                  <Route path="/despesas"   element={<ProtectedRoute><Despesas /></ProtectedRoute>} />
                  <Route path="/transacoes" element={<ProtectedRoute><Transacoes /></ProtectedRoute>} />
                  <Route path="/dividas"    element={<ProtectedRoute><Dividas /></ProtectedRoute>} />
                  <Route path="/categorias" element={<ProtectedRoute><Categorias /></ProtectedRoute>} />
                  <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
                  <Route path="/metas"      element={<ProtectedRoute><Metas /></ProtectedRoute>} />
                  <Route path="/mercado"    element={<ProtectedRoute><Mercado /></ProtectedRoute>} />
                  <Route path="/veiculos"   element={<ProtectedRoute><Veiculos /></ProtectedRoute>} />
                  <Route path="/perfil"     element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
                  <Route path="/ia"         element={<ProtectedRoute><WalletIAPage /></ProtectedRoute>} /> {/* Wallet IA Unificada — Etapa 1 */}
                  <Route path="/ia-legacy"  element={<ProtectedRoute><IAPage /></ProtectedRoute>} />       {/* IAPage legada — mantida para rollback */}
                  <Route path="/ia-chat"    element={<ProtectedRoute><WalletIAPage /></ProtectedRoute>} />
                  <Route path="/lembretes"  element={<ProtectedRoute><Lembretes /></ProtectedRoute>} />
                  <Route path="/eyemobile-pdv" element={<ProtectedRoute><EyemobilePDV /></ProtectedRoute>} />
                  <Route path="/divipay"       element={<ProtectedRoute><Divipay /></ProtectedRoute>} />
                  <Route path="/dre"           element={<ProtectedRoute><DRE /></ProtectedRoute>} />
                  <Route path="/fluxo-caixa"   element={<ProtectedRoute><FluxoCaixa /></ProtectedRoute>} />
                  <Route path="/contas"        element={<ProtectedRoute><ContasCartoes /></ProtectedRoute>} />
                  <Route path="/investimento/:id" element={<ProtectedRoute><InvestimentoDetalhe /></ProtectedRoute>} />
                  <Route path="/meta-investimento/:id" element={<ProtectedRoute><MetaInvestimentoDetalhe /></ProtectedRoute>} />
                  <Route path="/cardapio"      element={<ProtectedRoute><Cardapio /></ProtectedRoute>} />
                  <Route path="/cardapio/novo" element={<ProtectedRoute><CardapioNovo /></ProtectedRoute>} />
                  <Route path="/cardapio/:id"  element={<ProtectedRoute><CardapioDetalhe /></ProtectedRoute>} />
                  <Route path="/validades"     element={<ProtectedRoute><Validades /></ProtectedRoute>} />
                  <Route path="/comparativo"   element={<ProtectedRoute><Comparativo /></ProtectedRoute>} />
                  <Route path="/patrimonio"    element={<ProtectedRoute><Patrimonio /></ProtectedRoute>} />
                  <Route path="/ia-chat"       element={<ProtectedRoute><IAPage /></ProtectedRoute>} />
                  <Route path="/transferencias" element={<ProtectedRoute><Transferencias /></ProtectedRoute>} />
                  <Route path="/agenda"        element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
                  <Route path="/subcategorias" element={<ProtectedRoute><Subcategorias /></ProtectedRoute>} />
                  <Route path="/centros-custo" element={<ProtectedRoute><CentrosCusto /></ProtectedRoute>} />
                  <Route path="/fornecedores"  element={<ProtectedRoute><Fornecedores /></ProtectedRoute>} />
                  <Route path="/equipe"        element={<ProtectedRoute><EquipePage /></ProtectedRoute>} />
                  <Route path="/equipe/novo"   element={<ProtectedRoute><EquipeNovoPage /></ProtectedRoute>} />
                  <Route path="/equipe/:id"    element={<ProtectedRoute><EquipeDetalhePage /></ProtectedRoute>} />
                  <Route path="/equipe/:id/editar" element={<ProtectedRoute><EquipeEditarPage /></ProtectedRoute>} />
                  <Route path="/equipe/:id/custos/novo" element={<ProtectedRoute><EquipeCustoNovoPage /></ProtectedRoute>} />
                  <Route path="/conciliacao"   element={<ProtectedRoute><Conciliacao /></ProtectedRoute>} />
                  <Route path="/recibos"       element={<ProtectedRoute><Recibos /></ProtectedRoute>} />
                  <Route path="/admin/ia-metrics" element={<ProtectedRoute><AIMetricsDashboard /></ProtectedRoute>} />
                  <Route path="/ia-metrics"    element={<ProtectedRoute><AIMetricsDashboard /></ProtectedRoute>} />
                  <Route path="/configuracoes/notificacoes" element={<ProtectedRoute><ConfiguracoesNotificacoes /></ProtectedRoute>} />
                  <Route path="/pdv"           element={<ProtectedRoute><PDVPage /></ProtectedRoute>} />

                  {/* Rotas administrativas */}
                  <Route path="/admin"                element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
                  <Route path="/admin/users"          element={<ProtectedRoute requiredRole="admin"><AdminUsers /></ProtectedRoute>} />
                  <Route path="/admin/plans"          element={<ProtectedRoute requiredRole="admin"><AdminPlans /></ProtectedRoute>} />
                  <Route path="/admin/plans/limits"   element={<ProtectedRoute requiredRole="admin"><AdminPlanLimits /></ProtectedRoute>} />
                  <Route path="/admin/subscriptions"  element={<ProtectedRoute requiredRole="admin"><AdminSubscriptions /></ProtectedRoute>} />
                  <Route path="/admin/reports"        element={<ProtectedRoute requiredRole="admin"><AdminReports /></ProtectedRoute>} />
                  <Route path="/admin/audit-logs"     element={<ProtectedRoute requiredRole="admin"><AdminAuditLogs /></ProtectedRoute>} />
                  <Route path="/admin/payment-settings" element={<ProtectedRoute requiredRole="admin"><AdminPaymentSettings /></ProtectedRoute>} />
                  <Route path="/admin/webhook-settings" element={<ProtectedRoute requiredRole="admin"><AdminWebhookSettings /></ProtectedRoute>} />
                  <Route path="/admin/webhooks/manutencao" element={<ProtectedRoute requiredRole="admin"><AdminWebhooksManutencao /></ProtectedRoute>} />
                  <Route path="/admin/webhooks"       element={<ProtectedRoute requiredRole="admin"><AdminWebhooks /></ProtectedRoute>} />

                  {/* 404 */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
                <Toaster />
              </div>
            </Suspense>
          </PrivacyProvider>
        </WorkspaceProvider>
      </ErrorBoundary>
    </Router>
  );
}

export default App;

