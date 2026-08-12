#!/usr/bin/env bash
set -euo pipefail

pg_root="/tmp/qsp-pg17-full-${RANDOM}-${RANDOM}"
data_dir="/tmp/qsp-pg17-data-${RANDOM}-${RANDOM}"
archive="/tmp/postgresql-17.9.0-x86_64-unknown-linux-gnu-${RANDOM}.tar.gz"
log_file="/tmp/qsp-pg17-${RANDOM}-${RANDOM}.log"
port=$((55432 + RANDOM % 500))
pg_bin=""
pg_os_user="qsp_pg_validation"
created_os_user=false

cleanup() {
  if [[ -n "$pg_bin" && -x "$pg_bin/pg_ctl" && -f "$data_dir/PG_VERSION" ]]; then
    as_pg "$pg_bin/pg_ctl" -D "$data_dir" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$data_dir" "$pg_root" "$archive" "$log_file"
  if [[ "$created_os_user" == "true" ]]; then
    userdel "$pg_os_user" >/dev/null 2>&1 || true
  fi
}

as_pg() {
  if [[ "$created_os_user" == "true" ]]; then
    runuser -u "$pg_os_user" -- env "LD_LIBRARY_PATH=${LD_LIBRARY_PATH:-}" "$@"
  else
    "$@"
  fi
}
trap cleanup EXIT

echo "Validation host: $(uname -a)"
echo "Validation uid: $(id -u)"
if [[ "$(id -u)" == "0" ]]; then
  if ! command -v useradd >/dev/null || ! command -v runuser >/dev/null; then
    echo "Root validation host lacks useradd/runuser required by PostgreSQL." >&2
    exit 2
  fi
  useradd --system --user-group --home-dir "/tmp/${pg_os_user}" --create-home --shell /bin/bash "$pg_os_user"
  created_os_user=true
fi

mkdir -p "$pg_root"
asset_url="https://github.com/theseus-rs/postgresql-binaries/releases/download/17.9.0/postgresql-17.9.0-x86_64-unknown-linux-gnu.tar.gz"
expected_sha256="463422cb007fd15bb37819b1d3562392dd81bba385205fbd0eef4891cb1d18b5"
echo "Downloading pinned PostgreSQL 17.9.0 x86_64 Linux release..."
curl --fail --location --silent --show-error "$asset_url" --output "$archive"
printf '%s  %s\n' "$expected_sha256" "$archive" | sha256sum --check --status

tar -xzf "$archive" -C "$pg_root"
pg_server=$(find "$pg_root" -type f -name postgres -perm -u+x | head -n 1)
psql_path=$(find "$pg_root" -type f -name psql -perm -u+x | head -n 1)
initdb_path=$(find "$pg_root" -type f -name initdb -perm -u+x | head -n 1)
pg_ctl_path=$(find "$pg_root" -type f -name pg_ctl -perm -u+x | head -n 1)
if [[ -z "$pg_server" || -z "$psql_path" || -z "$initdb_path" || -z "$pg_ctl_path" ]]; then
  echo "Pinned archive is missing required PostgreSQL binaries." >&2
  find "$pg_root" -maxdepth 4 -type f | sort >&2
  exit 3
fi
pg_bin=$(dirname "$pg_server")
if [[ "$(dirname "$psql_path")" != "$pg_bin" || "$(dirname "$initdb_path")" != "$pg_bin" || "$(dirname "$pg_ctl_path")" != "$pg_bin" ]]; then
  echo "PostgreSQL binaries were not extracted into one bin directory." >&2
  exit 3
fi

lib_dir=$(find "$pg_root" -type f \( -name 'libpq.so' -o -name 'libpq.so.*' \) -printf '%h\n' | head -n 1 || true)
if [[ -n "$lib_dir" ]]; then
  export LD_LIBRARY_PATH="$lib_dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

server_version=$("$pg_bin/postgres" --version)
client_version=$("$pg_bin/psql" --version)
echo "Server runtime: $server_version"
echo "Client runtime: $client_version"
if [[ "$server_version" != *"17.9"* || "$client_version" != *"17.9"* ]]; then
  echo "Expected PostgreSQL 17.9 server and psql client." >&2
  exit 4
fi

rm -rf "$data_dir"
as_pg "$pg_bin/initdb" \
  -D "$data_dir" \
  -U postgres \
  -A trust \
  --no-locale \
  --encoding=UTF8

as_pg "$pg_bin/pg_ctl" \
  -D "$data_dir" \
  -l "$log_file" \
  -o "-p $port -h 127.0.0.1" \
  -w start

psql=("$pg_bin/psql" -h 127.0.0.1 -p "$port" -U postgres)
"${psql[@]}" -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE quran_test;'
"${psql[@]}" -d quran_test -Atqc 'SELECT version();'

run_sql() {
  local file="$1" output status
  echo "--- applying $file"
  set +e
  output=$("${psql[@]}" -d quran_test -v ON_ERROR_STOP=1 < "$file" 2>&1)
  status=$?
  set -e
  printf '%s\n' "$output"
  if [[ "$status" -ne 0 ]]; then
    echo "FAILED SQL FILE: $file" >&2
    printf '%s\n' "$output" | tail -n 50 >&2
    echo "PostgreSQL server log:" >&2
    tail -n 50 "$log_file" >&2 || true
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
for file in "${base_files[@]}"; do run_sql "$file"; done
run_sql tests/guardian-security-foundation-fixture.sql

run_sql supabase/017_guardian_security_foundation.sql
run_sql supabase/018_guardian_invitations.sql
run_sql supabase/023_guardian_push_foundation.sql
run_sql supabase/024_guardian_absence_notifications.sql
run_sql supabase/025_guardian_directory_notification_center.sql
run_sql supabase/026_notification_center_module_categories.sql

run_sql supabase/043_payroll_foundation.sql
run_sql supabase/044_payroll_hardening_and_history.sql
run_sql supabase/045_recurring_billing_and_finance_reminders.sql
run_sql supabase/046_recurring_billing_discount_scope_fix.sql
run_sql supabase/047_treasury_and_other_income_foundation.sql
run_sql supabase/048_treasury_workspace_and_reporting.sql
run_sql supabase/049_treasury_bootstrap_scope_hardening.sql
run_sql supabase/050_treasury_reconciliation_and_source_linking.sql
run_sql supabase/051_treasury_reconciliation_scope_hardening.sql
run_sql tests/treasury-other-income-fixture.sql
run_sql tests/treasury-other-income-assertions.sql
run_sql tests/treasury-reconciliation-assertions.sql
run_sql tests/treasury-hidden-central-account-assertions.sql
run_sql supabase/052_financial_period_close_and_account_reconciliation.sql
run_sql supabase/053_financial_statements.sql
run_sql supabase/054_financial_close_acceptance_hardening.sql
run_sql tests/financial-period-close-assertions.sql

echo "Integrated finance PostgreSQL 17.9 validation passed through Migration 054."
