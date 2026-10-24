/**
 * Utilitário canônico para resolução de credenciais Supabase modernas e legadas em Edge Functions (Deno).
 * Documentação oficial: "Migrating to publishable and secret API keys"
 * https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
 *
 * Prioridades:
 * 1. Chaves modernas estruturadas: SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS (JSON {"default": "..."})
 * 2. Variáveis diretas modernas: SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY
 * 3. Fallback defensivo legado: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
 */

export function getSupabaseSecretKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
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

  const directSecret = Deno.env.get("SUPABASE_SECRET_KEY");
  if (directSecret && directSecret.trim().length > 0) {
    return directSecret.trim();
  }

  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey && legacyKey.trim().length > 0) {
    return legacyKey.trim();
  }

  return "";
}

export function getSupabasePublishableKey(): string {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
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

  const directPub = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (directPub && directPub.trim().length > 0) {
    return directPub.trim();
  }

  const legacyAnon = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacyAnon && legacyAnon.trim().length > 0) {
    return legacyAnon.trim();
  }

  return "";
}
