import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getConfigInstance } from "@/config/env";

// Load configuration from environment variables
const config = getConfigInstance();

const getSupabaseUrl = () => {
  const url = config.supabase.url;
  if (url.includes("/supabase-proxy") && typeof window !== "undefined") {
    return `${window.location.origin}/supabase-proxy`;
  }
  return url;
};

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(
  getSupabaseUrl(),
  config.supabase.anonKey,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
