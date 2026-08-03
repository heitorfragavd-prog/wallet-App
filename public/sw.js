/* ═══════════════════════════════════════════════════════════════
   Wallet App — Service Worker de Notificações Push
   Recebe push da Edge Function enviar-push e exibe no celular/PC
   ═══════════════════════════════════════════════════════════════ */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let dados = { titulo: "Wallet", mensagem: "Você tem um novo aviso.", url: "/" };
  try {
    if (event.data) {
      const payload = event.data.json();
      dados = {
        titulo: payload.titulo || dados.titulo,
        mensagem: payload.mensagem || dados.mensagem,
        url: payload.url || dados.url,
      };
    }
  } catch {
    // mantém valores padrão
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.mensagem,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "wallet-notificacao",
      renotify: true,
      data: { url: dados.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Se o app já está aberto, foca na aba e navega
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Senão, abre uma nova aba na rota certa (/dividas, /agenda...)
      return self.clients.openWindow(url);
    })
  );
});
