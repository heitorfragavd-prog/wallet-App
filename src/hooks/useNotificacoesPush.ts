import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";

// Chave pública VAPID (a privada fica SOMENTE nos secrets do Supabase)
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

export const useNotificacoesPush = () => {
  const { toast } = useToast();
  const [permission, setPermission] = useState<PushPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const isSupported = useCallback((): boolean => {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }, []);

  const getPermissionStatus = useCallback((): PushPermission => {
    if (!isSupported()) return "unsupported";
    return Notification.permission as PushPermission;
  }, [isSupported]);

  // Atualiza estado inicial: permissão + subscription existente
  useEffect(() => {
    setPermission(getPermissionStatus());
    if (!isSupported()) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(!!sub))
      .catch(() => setIsSubscribed(false));
  }, [getPermissionStatus, isSupported]);

  const registerPush = useCallback(async (): Promise<boolean> => {
    if (!isSupported()) {
      toast({ title: "Não suportado", description: "Este navegador não suporta notificações push.", variant: "destructive" });
      return false;
    }
    if (!VAPID_PUBLIC_KEY) {
      toast({ title: "Configuração pendente", description: "Chave VAPID pública não configurada no app.", variant: "destructive" });
      return false;
    }

    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") {
        toast({ title: "Permissão negada", description: "Habilite as notificações nas configurações do navegador.", variant: "destructive" });
        return false;
      }

      // Garante que o service worker está registrado
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      const json = subscription.toJSON();
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");

      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
        { onConflict: "endpoint" }
      );
      if (error) throw error;

      setIsSubscribed(true);
      toast({ title: "Notificações ativadas! 🔔", description: "Você receberá alertas de dívidas e compromissos." });
      return true;
    } catch (err) {
      logger.error("useNotificacoesPush", "Erro ao registrar push", { error: String(err) });
      toast({ title: "Erro ao ativar", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, toast]);

  const unregisterPush = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      toast({ title: "Notificações desativadas", description: "Você não receberá mais alertas push." });
      return true;
    } catch (err) {
      logger.error("useNotificacoesPush", "Erro ao desregistrar push", { error: String(err) });
      toast({ title: "Erro ao desativar", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const testarPush = useCallback(async (): Promise<void> => {
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");
      const { error } = await supabase.functions.invoke("enviar-push", {
        body: {
          user_id: userId,
          titulo: "🔔 Teste Wallet",
          mensagem: "Se você viu esta notificação, está tudo funcionando!",
          url: "/agenda",
        },
      });
      if (error) throw error;
      toast({ title: "Push de teste enviado", description: "A notificação deve aparecer em instantes." });
    } catch (err) {
      toast({ title: "Falha no teste", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  }, [toast]);

  return { isSupported, permission, isSubscribed, loading, registerPush, unregisterPush, testarPush, getPermissionStatus };
};
