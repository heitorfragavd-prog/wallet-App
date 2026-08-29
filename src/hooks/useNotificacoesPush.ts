import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";

// Chave pública VAPID (a privada fica SOMENTE nos secrets do Supabase)
const DEFAULT_VAPID_PUBLIC_KEY = "BEtwvFLl-HHwPmp6nm6DuH-ja-ZLw4krGin8Dr4V6Iwzgvw761rqRf5Lh9V9zq9Xgy3a2HqNyzmqI6dX0nRvAmw";
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || DEFAULT_VAPID_PUBLIC_KEY;

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

      // Evita falha de constraint onConflict do PostgREST usando busca prévia
      const { data: existing } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("endpoint", subscription.endpoint)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("push_subscriptions")
          .update({
            user_id: userId,
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("push_subscriptions").insert({
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        });
        if (error) throw error;
      }

      setIsSubscribed(true);
      toast({ title: "Notificações ativadas! 🔔", description: "Você receberá alertas de dívidas e compromissos." });
      return true;
    } catch (err: any) {
      const errorMsg = err?.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
      logger.error("useNotificacoesPush", "Erro ao registrar push", { error: errorMsg });
      toast({ title: "Erro ao ativar", description: errorMsg, variant: "destructive" });
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

  const testarPush = useCallback(async (customTitulo?: string, customMensagem?: string): Promise<void> => {
    const titulo = customTitulo || "🔔 Teste Wallet";
    const mensagem = customMensagem || "Se você viu esta notificação, o sistema Web Push está funcionando perfeitamente!";

    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");

      // Tenta enviar via Edge Function
      const { error } = await supabase.functions.invoke("enviar-push", {
        body: { user_id: userId, titulo, mensagem, url: "/dividas" },
      });

      if (error) {
        console.warn("Edge Function não implantada ou offline, usando Service Worker local:", error.message);
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(titulo, {
          body: mensagem,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: "wallet-notificacao-teste",
          requireInteraction: true,
          data: { url: "/dividas" },
        });
      }

      toast({ title: "Push enviado! 🔔", description: "Notificação disparada com sucesso para este dispositivo." });
    } catch (err: any) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(titulo, {
          body: mensagem,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: "wallet-notificacao-teste",
          requireInteraction: true,
          data: { url: "/dividas" },
        });
        toast({ title: "Push enviado! 🔔", description: "Notificação disparada com sucesso." });
      } catch (_swErr) {
        toast({ title: "Falha no teste", description: err?.message || String(err), variant: "destructive" });
      }
    }
  }, [toast]);

  return { isSupported, permission, isSubscribed, loading, registerPush, unregisterPush, testarPush, getPermissionStatus };
};
