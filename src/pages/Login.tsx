import { useState } from "react";
import { LoginForm } from "@/domains/auth/components/auth/LoginForm";
import { RegisterForm } from "@/domains/auth/components/auth/RegisterForm";
import { ForgotPasswordForm } from "@/domains/auth/components/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "@/domains/auth/components/auth/ResetPasswordForm";
import { useSearchParams } from "react-router-dom";
import { Wallet } from "lucide-react";
import { ThemeToggle } from "@/shared/components/ThemeToggle";

type AuthMode = "login" | "register" | "forgot-password" | "reset-password";

const Login = () => {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>(() => {
    // Se tiver o token de redefinição de senha na URL, mostra o formulário de reset
    return searchParams.get("type") === "recovery" ? "reset-password" : "login";
  });

  const renderAuthForm = () => {
    switch (mode) {
      case "login":
        return (
          <LoginForm
            onSwitchToRegister={() => setMode("register")}
            onSwitchToForgot={() => setMode("forgot-password")}
          />
        );
      case "register":
        return <RegisterForm onSwitchToLogin={() => setMode("login")} />;
      case "forgot-password":
        return <ForgotPasswordForm onSwitchToLogin={() => setMode("login")} />;
      case "reset-password":
        return <ResetPasswordForm onSwitchToLogin={() => setMode("login")} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      {/* Theme Toggle - Fixed position */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-orange-500 rounded-lg p-3">
                <Wallet className="h-8 w-8 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Wallet</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              {mode === "login" && "Faça login em sua conta"}
              {mode === "register" && "Crie sua conta"}
              {mode === "forgot-password" && "Recupere sua senha"}
              {mode === "reset-password" && "Defina sua nova senha"}
            </p>
          </div>

          {/* Auth Form */}
          {renderAuthForm()}
        </div>
      </div>
    </div>
  );
};

export default Login;
