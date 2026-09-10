#!/usr/bin/env bash
# ============================================================
# نسخة احتياطية لمنصة نَما
#
# ما يُنسخ:
#   1) قاعدة SQLite — عبر أمر .backup الآمن (لا نسخ للملف وهو مفتوح)
#   2) مجلد المرفقات والوسائط
#
# التثبيت:
#   sudo cp deployment/backup.sh /usr/local/bin/mana-backup
#   sudo chmod +x /usr/local/bin/mana-backup
#
# التشغيل اليدوي:
#   mana-backup
#
# جدولة يومية عند الثالثة صباحاً:
#   echo '0 3 * * * mana /usr/local/bin/mana-backup >> /var/log/mana-backup.log 2>&1' \
#     | sudo tee /etc/cron.d/mana-backup
# ============================================================
set -euo pipefail

# ---------- إعدادات (تُعدَّل حسب مساراتك) ----------
APP_DIR="${MANA_APP_DIR:-/opt/mana}"
DATA_DIR="${MANA_DATA_DIR:-$APP_DIR/data}"
DB_FILE="${MANA_DB:-$DATA_DIR/mana.db}"
UPLOADS_DIR="${MANA_UPLOADS:-$DATA_DIR/uploads}"
BACKUP_ROOT="${MANA_BACKUP_DIR:-/var/backups/mana}"
KEEP_DAYS="${MANA_BACKUP_KEEP_DAYS:-14}"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
OUT="$BACKUP_ROOT/mana-$STAMP"

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { printf 'خطأ: %s\n' "$*" >&2; exit 1; }

command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 غير مثبّت — نفّذ: sudo apt-get install -y sqlite3"
[ -f "$DB_FILE" ] || die "قاعدة البيانات غير موجودة: $DB_FILE"

mkdir -p "$BACKUP_ROOT"
mkdir -p "$WORK"

# ---------- 1) القاعدة ----------
# .backup يأخذ قفل قراءة متّسقاً، فالنسخة سليمة حتى أثناء عمل التطبيق.
log "نسخ القاعدة من $DB_FILE"
sqlite3 "$DB_FILE" ".backup '$WORK/mana.db'"

# تحقق من سلامة النسخة قبل الاعتماد عليها
sqlite3 "$WORK/mana.db" "PRAGMA integrity_check;" | grep -q '^ok$' \
  || die "فحص سلامة النسخة فشل — لم تُنشأ نسخة"

# ---------- 2) المرفقات ----------
if [ -d "$UPLOADS_DIR" ]; then
  log "نسخ المرفقات من $UPLOADS_DIR"
  # --exclude tmp: الملفات المؤقتة لرفع لم يكتمل لا قيمة لها
  tar -C "$DATA_DIR" --exclude='uploads/tmp' -cf "$WORK/uploads.tar" uploads
else
  log "تحذير: مجلد المرفقات غير موجود — $UPLOADS_DIR"
fi

# ---------- 3) الحزمة ----------
mkdir -p "$OUT"
cp "$WORK/mana.db" "$OUT/mana.db"
[ -f "$WORK/uploads.tar" ] && cp "$WORK/uploads.tar" "$OUT/uploads.tar"

{
  echo "created_at=$(date -u +%FT%TZ)"
  echo "db_sha256=$(sha256sum "$OUT/mana.db" | cut -d' ' -f1)"
  echo "app_version=$(node -p "require('$APP_DIR/package.json').version" 2>/dev/null || echo unknown)"
  echo "db_size=$(stat -c%s "$OUT/mana.db")"
} > "$OUT/BACKUP-INFO"

# أرشيف واحد نهائي
tar -C "$BACKUP_ROOT" -czf "$BACKUP_ROOT/mana-$STAMP.tar.gz" "mana-$STAMP"
rm -rf "$OUT"

SIZE="$(du -h "$BACKUP_ROOT/mana-$STAMP.tar.gz" | cut -f1)"
log "تم: $BACKUP_ROOT/mana-$STAMP.tar.gz ($SIZE)"

# ---------- 4) تدوير النسخ القديمة ----------
DELETED="$(find "$BACKUP_ROOT" -name 'mana-*.tar.gz' -mtime +"$KEEP_DAYS" -print -delete | wc -l)"
[ "$DELETED" -gt 0 ] && log "حُذفت $DELETED نسخة أقدم من $KEEP_DAYS يوماً"

log "انتهى"
