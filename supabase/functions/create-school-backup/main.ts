import "jsr:@supabase/functions-js@2.4.6/edge-runtime.d.ts";
import { handleCreateSchoolBackup } from "./handler.ts";

Deno.serve(handleCreateSchoolBackup);
