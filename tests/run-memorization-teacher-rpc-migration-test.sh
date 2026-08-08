#!/usr/bin/env bash
set -euo pipefail

container_name="qsp-memorization-teacher-rpc-${RANDOM}-${RANDOM}"
cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --name "$container_name" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=quran_test \
  -d postgres:17-alpine >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$container_name" pg_isready -U postgres -d quran_test >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "$container_name" pg_isready -U postgres -d quran_test >/dev/null

docker exec -i "$container_name" psql -v ON_ERROR_STOP=1 -U postgres -d quran_test \
  < tests/memorization-teacher-rpc-fixture.sql

docker exec -i "$container_name" psql -v ON_ERROR_STOP=1 -U postgres -d quran_test \
  < supabase/016_memorization_class_teachers_rpc.sql

docker exec -i "$container_name" psql -v ON_ERROR_STOP=1 -U postgres -d quran_test \
  < tests/memorization-teacher-rpc-assertions.sql
