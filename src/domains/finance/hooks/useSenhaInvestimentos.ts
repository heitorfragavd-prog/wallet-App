import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";

const AUTH_KEY = "wallet_invest_auth";
const EXPIRES_KEY = "wallet_invest_auth_expires";
const TENTATIVAS_KEY = "wallet_invest_auth_attempts";

export function useSenhaInvestimentos() {
  const { toast } = useToast();
  const [isLocked, setIsLocked] = useState(true);
  const [tentativasRestantes, setTentativasRestantes] = useState(3);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const checkLockState = () => {
    const token = localStorage.getItem(AUTH_KEY);
    const expires = localStorage.getItem(EXPIRES_KEY);

    if (token && expires) {
      const now = Date.now();
      if (now < Number(expires)) {
        setIsLocked(false);
        return;
      }
    }
    setIsLocked(true);
  };

  const checkHasPassword = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data, error } = await supabase
        .from("senha_investimentos")
        .select("id")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (error) throw error;
      setHasPassword(!!data);
    } catch (err: any) {
      logger.error("useSenhaInvestimentos", "Erro ao verificar existência de senha", { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkLockState();
    checkHasPassword();

    const storedAttempts = localStorage.getItem(TENTATIVAS_KEY);
    if (storedAttempts) {
      setTentativasRestantes(Number(storedAttempts));
    }
  }, []);

  const cadastrarSenha = async (senha: string): Promise<boolean> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      const resp = await supabase.functions.invoke("validar-senha", {
        body: {
          mode: "cadastrar",
          user_id: userData.user.id,
          senha,
        },
      });

      if (resp.error) throw resp.error;

      if (resp.data?.success) {
        toast({
          title: "Senha cadastrada",
          description: "Sua senha de investimentos foi criada com sucesso!",
        });
        setHasPassword(true);
        // Autentica automaticamente
        const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutos
        localStorage.setItem(AUTH_KEY, resp.data.token || "temp_token");
        localStorage.setItem(EXPIRES_KEY, expiresAt.toString());
        setIsLocked(false);
        return true;
      }
      throw new Error(resp.data?.error || "Falha no cadastro");
    } catch (err: any) {
      logger.error("useSenhaInvestimentos", "Erro no cadastro de senha", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: err.message || "Erro ao cadastrar senha de investimentos",
      });
      return false;
    }
  };

  const validarSenha = async (senha: string): Promise<boolean> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      const resp = await supabase.functions.invoke("validar-senha", {
        body: {
          mode: "validar",
          user_id: userData.user.id,
          senha,
        },
      });

      if (resp.error) throw resp.error;

      if (resp.data?.valido) {
        const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutos
        localStorage.setItem(AUTH_KEY, resp.data.token || "temp_token");
        localStorage.setItem(EXPIRES_KEY, expiresAt.toString());
        localStorage.removeItem(TENTATIVAS_KEY);
        setTentativasRestantes(3);
        setIsLocked(false);
        return true;
      } else {
        const rest = resp.data?.tentativasRestantes ?? (tentativasRestantes - 1);
        setTentativasRestantes(rest);
        localStorage.setItem(TENTATIVAS_KEY, rest.toString());

        if (resp.data?.bloqueado) {
          toast({
            variant: "destructive",
            title: "Acesso Bloqueado",
            description: "Senha incorreta multiplas vezes. Acesso bloqueado por 30 minutos.",
          });
        } else {
          toast({
            variant: "destructive",
            title: "Senha Incorreta",
            description: `Senha incorreta. Você tem mais ${rest} tentativas.`,
          });
        }
        return false;
      }
    } catch (err: any) {
      logger.error("useSenhaInvestimentos", "Erro na validação de senha", { error: err.message });
      toast({
        variant: "destructive",
        title: "Erro",
        description: err.message || "Erro ao validar senha",
      });
      return false;
    }
  };

  const logoutInvestimentos = () => {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    setIsLocked(true);
  };

  return {
    isLocked,
    tentativasRestantes,
    hasPassword,
    loading,
    cadastrarSenha,
    validarSenha,
    logoutInvestimentos,
  };
}
