#!/bin/sh
# First-boot migration + optional seed, then exec the Next standalone server.
set -e

DB_PATH="/app/db/custom.db"

# Always apply migrations — `migrate deploy` is a no-op when the schema is
# current, and skipping it on an existing DB left mounts silently outdated.
echo "[entrypoint] applying migrations (if any)..."
DATABASE_URL="file:$DB_PATH" node node_modules/prisma/build/index.js migrate deploy
echo "[entrypoint] migrations up to date."

exec "$@"
