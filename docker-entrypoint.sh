#!/bin/sh
set -e
npx prisma migrate deploy
exec node server/bin/prod.js
