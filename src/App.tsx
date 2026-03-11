import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./domains/auth/components/ProtectedRoute";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import { Toaster } from "@/shared/components/ui/toaster";
import "./App.css";

// ── Loader global de fallback ──────────────────────────────────────
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

// ── Lazy imports — carregados apenas na primeira visita ────────────
const LandingPage         = lazy(() => import("./pages/LandingPage"));
const Login               = lazy(() => import("./pages/Login"));
const NotFound            = lazy(() => import("./pages/NotFound"));

// Rotas protegidas — usuário comum
const Dashboard           = lazy(() => import("./pages/Dashboard"));
const Receitas            = lazy(() => import("./pages/Receitas"));
const Despesas            = lazy(() => import("./pages/Despesas"));
const Transacoes          = lazy(() => import("./pages/Transacoes"));
const Dividas             = lazy(() => import("./pages/Dividas"));
const Categorias          = lazy(() => import("./pages/Categorias"));
const Relatorios          = lazy(() => import("./pages/Relatorios"));
const Metas               = lazy(() => import("./pages/Metas"));
const Mercado             = lazy(() => import("./pages/Mercado"));
const Veiculos            = lazy(() => import("./pages/Veiculos"));
const Perfil              = lazy(() => import("./pages/Perfil"));
const IA                  = lazy(() => import("./pages/IA"));
const Lembretes           = lazy(() => import("./pages/Lembretes"));

// Rotas admin — carregadas somente para admins
const AdminDashboard      = lazy(() => import("./pages/AdminDashboard"));
const AdminUsers          = lazy(() => import("./pages/AdminUsers"));
const AdminPlans          = lazy(() => import("./pages/AdminPlans"));
const AdminPlanLimits     = lazy(() => import("./pages/AdminPlanLimits"));
const AdminSubscriptions  = lazy(() => import("./pages/AdminSubscriptions"));
const AdminReports        = lazy(() => import("./pages/AdminReports"));
const AdminAuditLogs      = lazy(() => import("./pages/AdminAuditLogs"));
const AdminPaymentSettings = lazy(() => import("./pages/AdminPaymentSettings"));
const AdminWebhookSettings = lazy(() => import("./pages/AdminWebhookSettings"));
const AdminWebhooksManutencao = lazy(() => import("./pages/AdminWebhooksManutencao"));
const AdminWebhooks       = lazy(() => import("./pages/AdminWebhooks"));

// ── App ───────────────────────────────────────────────────────────
function App() {
  return (
    <Router>
      <ErrorBoundary context="App">
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
              <Route path="/ia"         element={<ProtectedRoute><IA /></ProtectedRoute>} />
              <Route path="/lembretes"  element={<ProtectedRoute><Lembretes /></ProtectedRoute>} />

              {/* Protegidas — somente admin */}
              <Route path="/admin"                        element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/users"                  element={<ProtectedRoute requiredRole="admin"><AdminUsers /></ProtectedRoute>} />
              <Route path="/admin/plans"                  element={<ProtectedRoute requiredRole="admin"><AdminPlans /></ProtectedRoute>} />
              <Route path="/admin/limits"                 element={<ProtectedRoute requiredRole="admin"><AdminPlanLimits /></ProtectedRoute>} />
              <Route path="/admin/subscriptions"          element={<ProtectedRoute requiredRole="admin"><AdminSubscriptions /></ProtectedRoute>} />
              <Route path="/admin/reports"                element={<ProtectedRoute requiredRole="admin"><AdminReports /></ProtectedRoute>} />
              <Route path="/admin/audit"                  element={<ProtectedRoute requiredRole="admin"><AdminAuditLogs /></ProtectedRoute>} />
              <Route path="/admin/payment-settings"       element={<ProtectedRoute requiredRole="admin"><AdminPaymentSettings /></ProtectedRoute>} />
              <Route path="/admin/webhooks"               element={<ProtectedRoute requiredRole="admin"><AdminWebhooks /></ProtectedRoute>} />
              <Route path="/admin/webhook-settings"       element={<ProtectedRoute requiredRole="admin"><AdminWebhookSettings /></ProtectedRoute>} />
              <Route path="/admin/webhooks/manutencao"    element={<ProtectedRoute requiredRole="admin"><AdminWebhooksManutencao /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            <Toaster />
          </div>
        </Suspense>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
