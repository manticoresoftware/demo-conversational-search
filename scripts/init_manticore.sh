#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TABLE_DUMP="${TABLE_DUMP:-dumps/fiqa_docs_with_embeddings.sql.tar.gz.part-*}"
TABLE_DUMP_MEMBER="${TABLE_DUMP_MEMBER:-fiqa_docs_with_embeddings.sql}"
CHAT_MODEL_SQL="${CHAT_MODEL_SQL:-dumps/create_chat_model.sql}"
SERVICE_NAME="${MANTICORE_SERVICE:-manticore}"

if [[ ! -f "$CHAT_MODEL_SQL" ]]; then
  echo "Missing chat model SQL: $CHAT_MODEL_SQL" >&2
  exit 1
fi

shopt -s nullglob
table_dump_parts=($TABLE_DUMP)
shopt -u nullglob
if (( ${#table_dump_parts[@]} == 0 )); then
  echo "Missing table dump: $TABLE_DUMP" >&2
  exit 1
fi

docker compose up -d --remove-orphans "$SERVICE_NAME"

container_id="$(docker compose ps -q "$SERVICE_NAME")"
if [[ -z "$container_id" ]]; then
  echo "Manticore container is not running" >&2
  exit 1
fi

echo "Waiting for Manticore MySQL protocol..."
until docker exec "$container_id" sh -c 'exec mysql -e "SELECT 1"' >/dev/null 2>&1; do
  sleep 1
done

echo "Dropping existing FIQA table and chat model if present..."
docker exec "$container_id" sh -c 'exec mysql -e "DROP TABLE IF EXISTS fiqa_docs"' >/dev/null
docker exec "$container_id" sh -c 'exec mysql -e "DROP CHAT MODEL IF EXISTS assistant"' >/dev/null 2>&1 || true

echo "Restoring $TABLE_DUMP..."
case "${table_dump_parts[0]}" in
  *.part-*)
    cat "${table_dump_parts[@]}" | tar -xOzf - "$TABLE_DUMP_MEMBER" | docker exec -i "$container_id" sh -c 'exec mysql'
    ;;
  *.tar.gz|*.tgz)
    tar -xOzf "${table_dump_parts[0]}" "$TABLE_DUMP_MEMBER" | docker exec -i "$container_id" sh -c 'exec mysql'
    ;;
  *)
    docker exec -i "$container_id" sh -c 'exec mysql' < "${table_dump_parts[0]}"
    ;;
esac

echo "Applying $CHAT_MODEL_SQL..."
docker exec -i "$container_id" sh -c 'exec mysql' < "$CHAT_MODEL_SQL"

echo "Manticore initialization complete."
