import "jsr:@supabase/functions-js@2.4.6/edge-runtime.d.ts";
import { createInviteTeacherHandler } from "./handler.ts";
import { createSupabaseInviteDependencies } from "./services.ts";

const handler = createInviteTeacherHandler(createSupabaseInviteDependencies());

Deno.serve(handler);
