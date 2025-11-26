import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Receitas from "./pages/Receitas";
import Despesas from "./pages/Despesas";
import Transacoes from "./pages/Transacoes";
import Dividas from "./pages/Dividas";
import Categorias from "./pages/Categorias";
import Relatorios from "./pages/Relatorios";
import Metas from "./pages/Metas";
import Mercado from "./pages/Mercado";
import Veiculos from "./pages/Veiculos";
import Perfil from "./pages/Perfil";
import IA from "./pages/IA";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminPlans from "./pages/AdminPlans";
import AdminPlanLimits from "./pages/AdminPlanLimits";
import AdminSubscriptions from "./pages/AdminSubscriptions";
import AdminReports from "./pages/AdminReports";
import AdminAuditLogs from "./pages/AdminAuditLogs";
import AdminPaymentSettings from "./pages/AdminPaymentSettings";
import AdminWebhookSettings from "./pages/AdminWebhookSettings";
import Lembretes from "./pages/Lembretes";
import Login from "./pages/Login";
import LandingPage from "./pages/LandingPage";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./domains/auth/components/ProtectedRoute";
import { Toaster } from "@/shared/components/ui/toaster";
import "./App.css";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/receitas"
            element={
              <ProtectedRoute>
                <Receitas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/despesas"
            element={
              <ProtectedRoute>
                <Despesas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transacoes"
            element={
              <ProtectedRoute>
                <Transacoes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dividas"
            element={
              <ProtectedRoute>
                <Dividas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categorias"
            element={
              <ProtectedRoute>
                <Categorias />
              </ProtectedRoute>
            }
          />
          <Route
            path="/relatorios"
            element={
              <ProtectedRoute>
                <Relatorios />
              </ProtectedRoute>
            }
          />
          <Route
            path="/metas"
            element={
              <ProtectedRoute>
                <Metas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mercado"
            element={
              <ProtectedRoute>
                <Mercado />
              </ProtectedRoute>
            }
          />
          <Route
            path="/veiculos"
            element={
              <ProtectedRoute>
                <Veiculos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/perfil"
            element={
              <ProtectedRoute>
                <Perfil />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ia"
            element={
              <ProtectedRoute>
                <IA />
              </ProtectedRoute>
            }
          />
          <Route
            path="/lembretes"
            element={
              <ProtectedRoute>
                <Lembretes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminUsers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/plans"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminPlans />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/limits"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminPlanLimits />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/subscriptions"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminSubscriptions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminAuditLogs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/payment-settings"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminPaymentSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/webhook-settings"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminWebhookSettings />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </div>
    </Router>
  );
}

export default App;
