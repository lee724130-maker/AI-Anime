#!/usr/bin/env bash
#
# AI-Anime MySQL 备份脚本（跑在服务器上，Linux + bash）
#
# 为什么要它：P0 核查发现 backend/tools 与服务器上都没有任何 mysqldump/logrotate 类的备份脚本，
# 全站数据只靠宝塔面板的全量备份兜着——数据库一旦 synchronize/误操作吃掉列，没有可按时间点恢复的
# 逻辑备份。本脚本产出「每天一份、带校验、gzip」的 SQL dump。
#
# 用法（服务器上）：
#   bash backup-mysql.sh                     # 用默认 /home/www/ai-anime/backend/.env 里的库配置
#   ENV_FILE=/path/.env BACKUP_DIR=/data/backup bash backup-mysql.sh
#
# crontab 示例（每天 04:30，避开宝塔计划任务常用 03:00/05:00 档）：
#   30 4 * * * bash /home/www/ai-anime/backend/scripts/backup-mysql.sh >> /home/www/backups/backup-cron.log 2>&1
#
# ⚠️ 保留策略默认「只报告不删除」（PURGE_OLD=0）：自动删除属于不可逆动作，本脚本不替你做主。
#    确认稳定后想自动清理，把 PURGE_OLD=1 加进 crontab 行前缀即可。
#
set -uo pipefail

ENV_FILE="${ENV_FILE:-/home/www/ai-anime/backend/.env}"
BACKUP_DIR="${BACKUP_DIR:-/home/www/backups/ai-anime-mysql}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
PURGE_OLD="${PURGE_OLD:-0}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/$(date +%Y/%m)/ai_anime-${STAMP}.sql.gz"

read_env() {
  # 从 .env 取键值；只认 KEY=VALUE 行，去掉包裹引号。注意 .env.local 优先级更高（与后端一致）
  local key="$1" file
  for file in "${ENV_FILE%.env}.env.local" "$ENV_FILE"; do
    [ -f "$file" ] || continue
    local line
    line="$(grep -e "^${key}=" "$file" | tail -n 1)" || true
    if [ -n "$line" ]; then
      printf '%s' "${line#*=}" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
      return 0
    fi
  done
  return 1
}

DB_HOST="$(read_env DB_HOST)"; DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="$(read_env DB_PORT)"; DB_PORT="${DB_PORT:-3306}"
DB_USER="$(read_env DB_USER)"
DB_PASSWORD="$(read_env DB_PASSWORD)"
DB_NAME="$(read_env DB_NAME)"; DB_NAME="${DB_NAME:-ai_anime}"

if [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
  echo "[FATAL] $(date '+%F %T') 没能从 $ENV_FILE 读到 DB_USER / DB_PASSWORD，备份中止"
  exit 2
fi

mkdir -p "$(dirname "$OUT")"

# -h127.0.0.1 而不是默认的 localhost socket：生产 MySQL 走 socket 会 1045（docs/current-version.md 铁律）
# --single-transaction：InnoDB 一致性快照，不锁表，生成中的任务不会被备份卡住
echo "[INFO] $(date '+%F %T') 开始备份 ${DB_NAME} -> ${OUT}"
if ! mysqldump \
    -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
    --single-transaction --routines --triggers --events \
    --default-character-set=utf8mb4 --set-gtid-purged=OFF --column-statistics=0 \
    --databases "$DB_NAME" \
    | gzip -9 > "$OUT.tmp"; then
  echo "[FATAL] $(date '+%F %T') mysqldump 失败，已保留 .tmp 供排查: ${OUT}.tmp"
  exit 3
fi

# 校验：gzip 完整性 + dump 末尾必须出现 Completed dump 标记，否则视为坏备份
# 备份「写了但写坏」比没写更危险——它会让你以为自己有备份
if ! gzip -t "$OUT.tmp"; then
  echo "[FATAL] $(date '+%F %T') gzip 完整性校验失败: ${OUT}.tmp"
  exit 4
fi
if ! zcat "$OUT.tmp" | grep -q -- "-- Dump completed"; then
  echo "[FATAL] $(date '+%F %T') dump 结尾缺少 'Dump completed' 标记，备份不完整: ${OUT}.tmp"
  exit 5
fi
mv "$OUT.tmp" "$OUT"
echo "[OK] $(date '+%F %T') 备份完成 $(du -h "$OUT" | cut -f1) -> $OUT"

# 保留策略：默认只列出超出 RETAIN_DAYS 的文件，不删除
OLD_LIST="$(find "$BACKUP_DIR" -name 'ai_anime-*.sql.gz' -mtime +"$RETAIN_DAYS" -print)"
if [ -n "$OLD_LIST" ]; then
  if [ "$PURGE_OLD" = "1" ]; then
    echo "[WARN] $(date '+%F %T') PURGE_OLD=1，删除超过 ${RETAIN_DAYS} 天的备份："
    printf '%s\n' "$OLD_LIST" | while read -r f; do
      [ -n "$f" ] || continue
      rm -f -- "$f" && echo "  deleted: $f"
    done
  else
    echo "[INFO] 有超过 ${RETAIN_DAYS} 天的备份（默认不删，确认无误后设 PURGE_OLD=1 才会清理）："
    printf '%s\n' "$OLD_LIST" | sed 's/^/  /'
  fi
fi
