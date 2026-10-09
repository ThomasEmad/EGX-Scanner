#!/bin/bash
cd /home/z/my-project/EGX-Scanner
export DATABASE_URL="file:/home/z/my-project/EGX-Scanner/prisma/prisma/dev.db"
export ADMIN_PASSCODE="egx-admin"
export NEXT_TELEMETRY_DISABLED=1
exec npx next dev -p 3000 --webpack
