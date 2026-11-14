import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabasePublishableKey = import.meta.env
    .VITE_SUPABASE_PUBLISHABLE_KEY;
  const missingVariables: string[] = [];

  if (!supabaseUrl) {
    missingVariables.push("VITE_SUPABASE_URL");
  }

  if (!supabasePublishableKey) {
    missingVariables.push("VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      `إعداد Supabase غير مكتمل. أضف متغيرات البيئة التالية: ${missingVariables.join(", ")}`
    );
  }

  supabaseClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });

  return supabaseClient;
}
