#!/usr/bin/env bash
set -euo pipefail

container_name="qsp-memorization-follow-up-${RANDOM}-${RANDOM}"
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

docker exec -i "$container_name" psql -v ON_ERROR_STOP=1 -U postgres -d quran_test \
  < tests/memorization-follow-up-fixture.sql

docker exec -i "$container_name" psql -v ON_ERROR_STOP=1 -U postgres -d quran_test \
  < supabase/040_memorization_follow_up_notes.sql

docker exec -i "$container_name" psql -v ON_ERROR_STOP=1 -U postgres -d quran_test \
  < supabase/041_memorization_follow_up_scope_hardening.sql

docker exec -i "$container_name" psql -v ON_ERROR_STOP=1 -U postgres -d quran_test \
  < tests/memorization-follow-up-assertions.sql

docker exec -i "$container_name" psql -v ON_ERROR_STOP=1 -U postgres -d quran_test \
  < tests/memorization-follow-up-transfer-assertions.sql
