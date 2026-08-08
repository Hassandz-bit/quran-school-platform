import "jsr:@supabase/functions-js@2.4.6/edge-runtime.d.ts";
import { createInviteGuardianHandler } from "./handler.ts";
import { createSupabaseGuardianInviteDependencies } from "./services.ts";

const handler = createInviteGuardianHandler(
  createSupabaseGuardianInviteDependencies()
);

Deno.serve(handler);
