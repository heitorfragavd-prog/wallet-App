import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";

// Chave pública VAPID (a privada fica SOMENTE nos secrets do Supabase)
const DEFAULT_VAPID_PUBLIC_KEY =
  "BEM0rflmqkKKDz4KymrZyF8ADQa6cpYk8VBF_LLstTzhntGDAkUdIesDCAwGCjjDeqfI3NLgU1LY6bm1uXk9Mj0";
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

const areUint8ArraysEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const requestNotificationPermission = (): Promise<NotificationPermission> => {
  if (Notification.requestPermission.length > 0) {
    return new Promise((resolve) => {
      Notification.requestPermission((perm) => resolve(perm));
    });
  }
  return Notification.requestPermission();
};

const subscribeWithVapidKey = async (
  reg: ServiceWorkerRegistration,
  vapidPublicKey: string,
  forceFresh = false
): Promise<PushSubscription> => {
  const expectedKey = urlBase64ToUint8Array(vapidPublicKey);
  const existingSub = await reg.pushManager.getSubscription();

  if (existingSub) {
    const currentKeyBuffer = existingSub.options?.applicationServerKey;
    const keyMatches =
      !forceFresh &&
      currentKeyBuffer instanceof ArrayBuffer &&
      areUint8ArraysEqual(new Uint8Array(currentKeyBuffer), expectedKey);

    if (keyMatches) {
      return existingSub;
    }

    await existingSub.unsubscribe();
  }

  try {
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: expectedKey as BufferSource,
    });
  } catch (err: unknown) {
    const errName = err instanceof DOMException ? err.name : (err as { name?: string })?.name;
    if (errName === "InvalidStateError") {
      const staleSub = await reg.pushManager.getSubscription();
      if (staleSub) await staleSub.unsubscribe();
      return await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey as BufferSource,
      });
    }
    throw err;
  }
};

const savePushSubscription = async (userId: string, subscription: PushSubscription): Promise<void> => {
  const json = subscription.toJSON();
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
    return;
  }

  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  });
  if (error) throw error;
};

export const useNotificacoesPush = () => {
  const { toast } = useToast();
  const [permission, setPermission] = useState<PushPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);

  const isSupported = useCallback((): boolean => {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }, []);

  const getPermissionStatus = useCallback((): PushPermission => {
    if (!isSupported()) return "unsupported";
    return Notification.permission as PushPermission;
  }, [isSupported]);

  const syncPushState = useCallback(async () => {
    const currentPerm = getPermissionStatus();
    setPermission(currentPerm);
    if (currentPerm === "granted") {
      setPromptDismissed(false);
    }
    if (!isSupported()) {
      setIsSubscribed(false);
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }
  }, [getPermissionStatus, isSupported]);

  // Atualiza estado inicial e acompanha mudanças de permissão no navegador
  useEffect(() => {
    void syncPushState();
    if (!isSupported()) return;

    let permStatus: PermissionStatus | null = null;
    let active = true;

    const handleChange = () => {
      if (active) void syncPushState();
    };

    if ("permissions" in navigator && typeof navigator.permissions?.query === "function") {
      navigator.permissions
        .query({ name: "notifications" as PermissionName })
        .then((status) => {
          if (!active) return;
          permStatus = status;
          status.addEventListener("change", handleChange);
        })
        .catch(() => {
          // Alguns navegadores não expõem query("notifications")
        });
    }

    window.addEventListener("focus", handleChange);
    return () => {
      active = false;
      window.removeEventListener("focus", handleChange);
      if (permStatus) {
        permStatus.removeEventListener("change", handleChange);
      }
    };
  }, [isSupported, syncPushState]);

  const registerPush = useCallback(async (): Promise<boolean> => {
    if (!isSupported()) {
      toast({ title: "Não suportado", description: "Este navegador não suporta notificações push.", variant: "destructive" });
      return false;
    }
    if (!VAPID_PUBLIC_KEY) {
      toast({ title: "Configuração pendente", description: "Chave VAPID pública não configurada no app.", variant: "destructive" });
      return false;
    }

    if (Notification.permission === "denied") {
      setPermission("denied");
      setPromptDismissed(false);
      toast({
        title: "Notificações bloqueadas no navegador",
        description: "Clique no ícone ao lado do endereço do site e altere Notificações para Permitir.",
        variant: "destructive",
      });
      return false;
    }

    setLoading(true);
    try {
      const perm = await requestNotificationPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") {
        if (perm === "denied") {
          setPromptDismissed(false);
          toast({
            title: "Notificações bloqueadas no navegador",
            description: "Clique no ícone ao lado do endereço do site e altere Notificações para Permitir.",
            variant: "destructive",
          });
        } else {
          setPromptDismissed(true);
          toast({
            title: "Confirmação pendente no navegador",
            description:
              "O aviso foi fechado ou silenciado pelo navegador. Clique no ícone ao lado do endereço do site e mude Notificações para Permitir.",
          });
        }
        return false;
      }

      setPromptDismissed(false);

      // Garante que o service worker está registrado
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;

      let subscription = await subscribeWithVapidKey(reg, VAPID_PUBLIC_KEY);
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");

      try {
        await savePushSubscription(userId, subscription);
      } catch (saveErr: unknown) {
        const code = (saveErr as { code?: string })?.code;
        if (code === "23505") {
          // Endpoint já vinculado a outra conta neste navegador: renova subscription para gerar endpoint único
          await subscription.unsubscribe();
          subscription = await subscribeWithVapidKey(reg, VAPID_PUBLIC_KEY, true);
          await savePushSubscription(userId, subscription);
        } else {
          throw saveErr;
        }
      }

      setIsSubscribed(true);
      toast({ title: "Notificações ativadas! 🔔", description: "Você receberá alertas de dívidas e compromissos." });
      return true;
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : typeof err === "object"
            ? JSON.stringify(err)
            : String(err);
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
    } catch (err: unknown) {
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

  return { isSupported, permission, isSubscribed, loading, promptDismissed, registerPush, unregisterPush, testarPush, getPermissionStatus };
};
