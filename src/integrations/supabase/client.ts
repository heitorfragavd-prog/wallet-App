import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getConfigInstance } from "@/config/env";

// Load configuration from environment variables
const config = getConfigInstance();

/**
 * Lock resiliente para autenticação Supabase:
 * Intercepta "AbortError: Lock broken by another request with the 'steal' option"
 * comum quando múltiplas requisições concorrentes disputam o lock da sessão.
 */
async function resilientAuthLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> {
  if (typeof globalThis !== "undefined" && globalThis.navigator?.locks?.request) {
    try {
      return await globalThis.navigator.locks.request(
        name,
        acquireTimeout === 0
          ? { mode: "exclusive", ifAvailable: true }
          : { mode: "exclusive" },
        async (lock) => {
          if (!lock) {
            return await fn();
          }
          return await fn();
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : "";
      if (
        errName === "AbortError" ||
        message.includes("steal") ||
        message.includes("Lock broken")
      ) {
        console.warn(`[Supabase AuthLock] Lock "${name}" absorvido (${message}), prosseguindo com segurança.`);
        return await fn();
      }
      console.warn(`[Supabase AuthLock] Falha não crítica no lock "${name}":`, err);
      return await fn();
    }
  }
  return await fn();
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      storage: typeof window !== 'undefined' && typeof window.localStorage !== 'undefined' ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      lock: resilientAuthLock,
    },
  }
);
