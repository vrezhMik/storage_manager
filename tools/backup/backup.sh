#!/usr/bin/env bash
# Nightly backup of what exists only on the server: the MySQL database,
# uploaded files (backend/storage/app) and backend/.env.
# Result: ~/backups/flexit-YYYY-MM-DD.tar.gz (last 7 kept) and
# ~/backups/latest.tar.gz, which the office computer downloads.
#
# Install (as deploy):  crontab -e  ->
#   30 3 * * * /var/www/html/storage_manager/tools/backup/backup.sh >> ~/backups/backup.log 2>&1
set -euo pipefail
umask 077

APP_DIR="${APP_DIR:-/var/www/html/storage_manager}"
BACKEND="$APP_DIR/backend"
OUT_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
STAMP="$(date +%F)"

mkdir -p "$OUT_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Read one value from .env (quotes removed).
env_value() {
  grep -E "^$1=" "$BACKEND/.env" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# The password goes through a temporary option file, not the command line.
cat > "$WORK/my.cnf" <<CNF
[client]
host=$(env_value DB_HOST)
port=$(env_value DB_PORT)
user=$(env_value DB_USERNAME)
password=$(env_value DB_PASSWORD)
CNF

mysqldump --defaults-extra-file="$WORK/my.cnf" --single-transaction --quick --routines --triggers \
  --no-tablespaces "$(env_value DB_DATABASE)" > "$WORK/database.sql"

cp "$BACKEND/.env" "$WORK/backend.env"
tar -czf "$OUT_DIR/flexit-$STAMP.tar.gz" -C "$WORK" database.sql backend.env -C "$BACKEND/storage" app
cp "$OUT_DIR/flexit-$STAMP.tar.gz" "$OUT_DIR/latest.tar.gz.tmp"
mv "$OUT_DIR/latest.tar.gz.tmp" "$OUT_DIR/latest.tar.gz"

find "$OUT_DIR" -name 'flexit-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') OK $(du -h "$OUT_DIR/flexit-$STAMP.tar.gz" | cut -f1)"
