#!/usr/bin/env bash
set -euo pipefail

container_name="qsp-notification-center-${RANDOM}-${RANDOM}"
cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --name "$container_name" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=quran_test \
  -d postgres:17-alpine >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$container_name" \
    psql -U postgres -d quran_test -Atqc 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$container_name" \
  psql -U postgres -d quran_test -Atqc 'SELECT 1' >/dev/null; then
  echo "PostgreSQL database quran_test did not become ready." >&2
  exit 1
fi

run_sql() {
  local file="$1"
  local output
  local status
  set +e
  output=$(docker exec -i "$container_name" \
    psql -v ON_ERROR_STOP=1 -U postgres -d quran_test < "$file" 2>&1)
  status=$?
  set -e
  printf '%s\n' "$output"
  if [ "$status" -ne 0 ]; then
    local diagnostic
    diagnostic=$(printf '%s\n' "$output" | tail -n 25 | tr '\n' ' ' | sed 's/%/%25/g; s/\r/%0D/g; s/\n/%0A/g')
    echo "::error file=${file}::${diagnostic}"
    exit "$status"
  fi
}

run_sql tests/guardian-security-foundation-bootstrap.sql

base_files=(
  supabase/001_initial_schema.sql
  supabase/seed.sql
  supabase/002_rls_policies.sql
  supabase/004_students_module.sql
  supabase/005_security_hardening.sql
  supabase/006_teachers_module.sql
  supabase/007_finance_module.sql
  supabase/008_finance_payment_scope_index.sql
  supabase/009_finance_student_directory.sql
  supabase/010_student_charge_discount_details.sql
  supabase/011_payments_manage_visibility.sql
  supabase/012_expenses_visibility.sql
  supabase/013_attendance_module.sql
  supabase/014_memorization_module.sql
  supabase/015_teacher_invitations.sql
  supabase/016_memorization_class_teachers_rpc.sql
)

for base_file in "${base_files[@]}"; do
  run_sql "$base_file"
done

run_sql tests/guardian-security-foundation-fixture.sql
run_sql supabase/017_guardian_security_foundation.sql
run_sql supabase/018_guardian_invitations.sql
run_sql supabase/023_guardian_push_foundation.sql
run_sql supabase/024_guardian_absence_notifications.sql
run_sql supabase/025_guardian_directory_notification_center.sql
run_sql tests/guardian-notification-center-assertions.sql
