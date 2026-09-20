/**
 * Telegram Webhook Security — Fail-Closed Secret Token Authentication
 * 
 * Valida o header X-Telegram-Bot-Api-Secret-Token enviado pelo Telegram.
 * 
 * Regras:
 * - O segredo NUNCA deve ser impresso em logs.
 * - Secret correto -> processa.
 * - Secret incorreto -> 403 Forbidden.
 * - Secret ausente no ambiente em produção -> fail-closed (401/403).
 */

export interface TelegramWebhookAuthResult {
  authorized: boolean;
  statusCode?: number;
  reason?: string;
}

export function validateTelegramWebhookSecret(
  headers: Headers | Record<string, string | null | undefined>,
  expectedSecret?: string,
  options?: {
    allowBypassInDev?: boolean;
    isProduction?: boolean;
  },
): TelegramWebhookAuthResult {
  let secretHeader: string | null | undefined = null;

  if (headers instanceof Headers) {
    secretHeader = headers.get("x-telegram-bot-api-secret-token");
  } else if (typeof headers === "object" && headers !== null) {
    secretHeader =
      headers["x-telegram-bot-api-secret-token"] ||
      headers["X-Telegram-Bot-Api-Secret-Token"];
  }

  const cleanExpected = expectedSecret ? expectedSecret.trim() : "";

  // 1. Secret não configurado no ambiente
  if (!cleanExpected) {
    if (options?.allowBypassInDev && !options?.isProduction) {
      return { authorized: true, reason: "dev_bypass_unconfigured" };
    }
    return {
      authorized: false,
      statusCode: 401,
      reason: "telegram_webhook_secret_not_configured",
    };
  }

  // 2. Header ausente
  if (!secretHeader || secretHeader.trim() === "") {
    return {
      authorized: false,
      statusCode: 401,
      reason: "telegram_webhook_secret_header_missing",
    };
  }

  // 3. Validação do segredo
  if (secretHeader === cleanExpected) {
    return { authorized: true };
  }

  // 4. Segredo incorreto -> 403 Forbidden
  return {
    authorized: false,
    statusCode: 403,
    reason: "telegram_webhook_secret_mismatch",
  };
}
