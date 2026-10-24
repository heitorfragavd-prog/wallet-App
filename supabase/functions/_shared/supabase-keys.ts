/**
 * Utilitário canônico para resolução de credenciais Supabase modernas e legadas em Edge Functions (Deno e Node/Vitest).
 * Documentação oficial: "Migrating to publishable and secret API keys"
 * https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
 *
 * Prioridades:
 * 1. Chaves modernas estruturadas: SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS (JSON {"default": "..."})
 * 2. Variáveis diretas modernas: SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY
 * 3. Fallback defensivo legado: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
 */

function getEnv(key: string): string | undefined {
  try {
    if (typeof Deno !== "undefined" && Deno?.env?.get) {
      return Deno.env.get(key);
    }
  } catch (_) {}

  try {
    if (typeof process !== "undefined" && process?.env) {
      return process.env[key];
    }
  } catch (_) {}

  return undefined;
}

export function getSupabaseSecretKey(): string {
  const raw = getEnv("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.default === "string" && parsed.default.trim().length > 0) {
          return parsed.default.trim();
        }
        const values = Object.values(parsed);
        if (values.length > 0 && typeof values[0] === "string" && (values[0] as string).trim().length > 0) {
          return (values[0] as string).trim();
        }
      }
    } catch (_) {
      // Ignora erro de parsing e segue para fallback
    }
  }

  const directSecret = getEnv("SUPABASE_SECRET_KEY");
  if (directSecret && directSecret.trim().length > 0) {
    return directSecret.trim();
  }

  const legacyKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey && legacyKey.trim().length > 0) {
    return legacyKey.trim();
  }

  return "";
}

export function getSupabasePublishableKey(): string {
  const raw = getEnv("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.default === "string" && parsed.default.trim().length > 0) {
          return parsed.default.trim();
        }
        const values = Object.values(parsed);
        if (values.length > 0 && typeof values[0] === "string" && (values[0] as string).trim().length > 0) {
          return (values[0] as string).trim();
        }
      }
    } catch (_) {
      // Ignora erro de parsing e segue para fallback
    }
  }

  const directPub = getEnv("SUPABASE_PUBLISHABLE_KEY");
  if (directPub && directPub.trim().length > 0) {
    return directPub.trim();
  }

  const legacyAnon = getEnv("SUPABASE_ANON_KEY");
  if (legacyAnon && legacyAnon.trim().length > 0) {
    return legacyAnon.trim();
  }

  return "";
}
