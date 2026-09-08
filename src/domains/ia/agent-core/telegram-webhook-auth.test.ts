import { describe, it, expect } from "vitest";
import { validateTelegramWebhookSecret } from "../../../../supabase/functions/_shared/ai/telegram-webhook-auth";

describe("Telegram Webhook Secret Authentication (Fail-Closed)", () => {
  const EXPECTED_SECRET = "secret_token_wallet_prod_12345";

  it("permite requisição com secret correto via Headers", () => {
    const headers = new Headers();
    headers.set("x-telegram-bot-api-secret-token", EXPECTED_SECRET);

    const result = validateTelegramWebhookSecret(headers, EXPECTED_SECRET, { isProduction: true });
    expect(result.authorized).toBe(true);
    expect(result.statusCode).toBeUndefined();
  });

  it("permite requisição com secret correto via objeto de headers", () => {
    const headers = { "x-telegram-bot-api-secret-token": EXPECTED_SECRET };

    const result = validateTelegramWebhookSecret(headers, EXPECTED_SECRET, { isProduction: true });
    expect(result.authorized).toBe(true);
  });

  it("rejeita com 403 quando o secret for incorreto", () => {
    const headers = new Headers();
    headers.set("x-telegram-bot-api-secret-token", "token_malicioso_errado");

    const result = validateTelegramWebhookSecret(headers, EXPECTED_SECRET, { isProduction: true });
    expect(result.authorized).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.reason).toBe("telegram_webhook_secret_mismatch");
  });

  it("rejeita com 401 quando o header estiver ausente", () => {
    const headers = new Headers();

    const result = validateTelegramWebhookSecret(headers, EXPECTED_SECRET, { isProduction: true });
    expect(result.authorized).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.reason).toBe("telegram_webhook_secret_header_missing");
  });

  it("aplica FAIL-CLOSED (401) em produção se o secret não estiver configurado no ambiente", () => {
    const headers = new Headers();
    headers.set("x-telegram-bot-api-secret-token", EXPECTED_SECRET);

    const result = validateTelegramWebhookSecret(headers, undefined, { isProduction: true });
    expect(result.authorized).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.reason).toBe("telegram_webhook_secret_not_configured");
  });

  it("permite bypass em dev apenas se explicitamente autorizado e não-produção", () => {
    const headers = new Headers();
    const result = validateTelegramWebhookSecret(headers, undefined, {
      allowBypassInDev: true,
      isProduction: false,
    });
    expect(result.authorized).toBe(true);
    expect(result.reason).toBe("dev_bypass_unconfigured");
  });

  it("nunca vaza o segredo no resultado de erro", () => {
    const headers = new Headers();
    headers.set("x-telegram-bot-api-secret-token", "tentativa_segredo");

    const result = validateTelegramWebhookSecret(headers, EXPECTED_SECRET, { isProduction: true });
    expect(JSON.stringify(result)).not.toContain(EXPECTED_SECRET);
    expect(JSON.stringify(result)).not.toContain("tentativa_segredo");
  });
});
