import "jsr:@supabase/functions-js@2.4.6/edge-runtime.d.ts";
import { createGuardianNotificationHandler } from "./handler.ts";
import { createSupabaseGuardianNotificationDependencies } from "./services.ts";

const handler = createGuardianNotificationHandler(
  createSupabaseGuardianNotificationDependencies()
);

Deno.serve(handler);
