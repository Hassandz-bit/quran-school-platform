#!/usr/bin/env bash
set -euo pipefail

package_dir="/tmp/qsp-pg17-package-${RANDOM}-${RANDOM}"
data_dir="/tmp/qsp-pg17-data-${RANDOM}-${RANDOM}"
log_file="/tmp/qsp-pg17-${RANDOM}-${RANDOM}.log"
port=$((55432 + RANDOM % 500))
pg_bin=""
psql_bin=""
pg_os_user="qsp_pg_validation"
run_as_pg=()
created_os_user=false

cleanup() {
  if [[ -n "$pg_bin" && -x "$pg_bin/pg_ctl" && -f "$data_dir/PG_VERSION" ]]; then
    "${run_as_pg[@]}" "$pg_bin/pg_ctl" -D "$data_dir" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$data_dir" "$package_dir" "$log_file"
  if [[ "$created_os_user" == "true" ]]; then
    userdel "$pg_os_user" >/dev/null 2>&1 || true
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
  run_as_pg=(runuser -u "$pg_os_user" --)
else
  run_as_pg=()
fi

mkdir -p "$package_dir"
npm install \
  --prefix "$package_dir" \
  --no-save \
  --no-audit \
  --no-fund \
  @embedded-postgres/linux-x64@17.9.0-beta.17

pg_bin="$package_dir/node_modules/@embedded-postgres/linux-x64/native/bin"
for binary in initdb postgres pg_ctl; do
  if [[ ! -x "$pg_bin/$binary" ]]; then
    echo "Missing PostgreSQL server binary: $pg_bin/$binary" >&2
    exit 3
  fi
done

if command -v psql >/dev/null 2>&1; then
  psql_bin=$(command -v psql)
elif command -v apt-get >/dev/null 2>&1; then
  echo "Installing PostgreSQL client for psql meta-command compatibility..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends postgresql-client
  psql_bin=$(command -v psql)
else
  echo "No psql client and no supported package manager are available." >&2
  exit 5
fi

version_output=$("$pg_bin/postgres" --version)
echo "Server runtime: $version_output"
echo "Client runtime: $($psql_bin --version)"
if [[ "$version_output" != *"17.9"* ]]; then
  echo "Expected PostgreSQL 17.9 server runtime." >&2
  exit 4
fi

rm -rf "$data_dir"
"${run_as_pg[@]}" "$pg_bin/initdb" \
  -D "$data_dir" \
  -U postgres \
  -A trust \
  --no-locale \
  --encoding=UTF8

"${run_as_pg[@]}" "$pg_bin/pg_ctl" \
  -D "$data_dir" \
  -l "$log_file" \
  -o "-p $port -h 127.0.0.1" \
  -w start

psql=("$psql_bin" -h 127.0.0.1 -p "$port" -U postgres)
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
