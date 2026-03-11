import { useState, useEffect, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { authService } from "@/domains/auth/services/AuthService";

/**
 * useAuth — hook React para estado de autenticação.
 *
 * Delega TODA a lógica de negócio ao AuthService (singleton testável
 * sem React). O hook gerencia apenas:
 *  - Estado reativo (user, session, loading)
 *  - Feedback de UI (toasts)
 *  - Ciclo de vida da subscription Supabase
 */
export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Inicializa o estado com a sessão corrente
    authService.getSession().then(({ session }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Mantém o estado sincronizado com mudanças de auth
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      organizationName: string,
      telefone: string
    ) => {
      const result = await authService.signUp({
        email,
        password,
        name,
        organizationName,
        telefone,
      });

      if (!result.success) {
        toast({
          title: "Erro no cadastro",
          description: result.error ?? "Erro desconhecido",
          variant: "destructive",
        });
        return { error: new Error(result.error) };
      }

      toast({
        title: "Cadastro realizado com sucesso!",
        description: "Verifique seu email para confirmar a conta.",
      });

      return { error: null };
    },
    [toast]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await authService.signIn({ email, password });

      if (!result.success) {
        toast({
          title: "Erro no login",
          description: result.error ?? "Erro desconhecido",
          variant: "destructive",
        });
        return { error: new Error(result.error) };
      }

      toast({
        title: "Login realizado com sucesso!",
        description: "Bem-vindo de volta!",
      });

      return { error: null };
    },
    [toast]
  );

  const signOut = useCallback(async () => {
    const result = await authService.signOut();

    if (!result.success) {
      toast({
        title: "Erro ao sair",
        description: result.error ?? "Erro desconhecido",
        variant: "destructive",
      });
    } else {
      toast({ title: "Logout realizado", description: "Até logo!" });
    }
  }, [toast]);

  const resetPassword = useCallback(
    async (email: string) => {
      const result = await authService.resetPassword(email);

      if (!result.success) {
        toast({
          title: "Erro ao enviar email",
          description: result.error ?? "Erro desconhecido",
          variant: "destructive",
        });
        return { error: new Error(result.error) };
      }

      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });

      return { error: null };
    },
    [toast]
  );

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
  };
};
