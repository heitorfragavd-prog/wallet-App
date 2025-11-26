import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getConfigInstance } from "@/config/env";

// Load configuration from environment variables
const config = getConfigInstance();

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
