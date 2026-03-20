import { createClient } from "@supabase/supabase-js";

// Single browser-side Supabase client — used for Realtime subscriptions
// and claim/heartbeat writes. Server-side routes continue using raw fetch.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
);
