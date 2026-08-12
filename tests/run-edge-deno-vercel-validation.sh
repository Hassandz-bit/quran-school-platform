#!/usr/bin/env bash
set -euo pipefail

run_deno() {
  pnpm dlx deno@2.9.4 "$@"
}

run_deno --version

run_deno test \
  --allow-env \
  --allow-sys=umask \
  --config supabase/functions/import-students/deno.json \
  supabase/functions/import-students/index.test.ts
run_deno check \
  --config supabase/functions/import-students/deno.json \
  supabase/functions/import-students/index.ts \
  supabase/functions/import-students/handler.ts \
  supabase/functions/import-students/services.ts

run_deno test \
  --config supabase/functions/dispatch-guardian-notifications/deno.json \
  supabase/functions/dispatch-guardian-notifications/index.test.ts
run_deno check \
  --config supabase/functions/dispatch-guardian-notifications/deno.json \
  supabase/functions/dispatch-guardian-notifications/index.ts \
  supabase/functions/dispatch-guardian-notifications/services.ts
