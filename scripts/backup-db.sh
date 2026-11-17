#!/usr/bin/env bash
# Backup diário do PostgreSQL do CRM (roda no host, pelo cron).
#   - pg_dump dentro do container crm-postgres, comprimido com gzip: backup-YYYYMMDD-HHMMSS.sql.gz
#   - confere tamanho > 0 e integridade do gzip antes de considerar o backup válido
#   - retenção: últimos 14 dias + o último backup de cada mês (3 meses), ajustável no .env
#   - agendado pelo systemd: deploy/systemd/crm-db-backup.timer (03:00, o servidor não tem cron)
#   - registra em /var/log/crm-db-backup.log e grava o último backup válido no banco (aparece em /api/health?details=1)
# Configuração opcional no /opt/crm/.env: BACKUP_DIR, BACKUP_RETENTION_DAYS, BACKUP_RETENTION_MONTHS.
# Somente leitura no banco (pg_dump) + 1 upsert na chave system:last-backup. Nenhum dado é apagado.

main() {
  set -uo pipefail
  local app_dir="${CRM_DIR:-/opt/crm}"
  local env_file="$app_dir/.env"
  env_value() { [ -f "$env_file" ] && grep -E "^$1=" "$env_file" | tail -1 | cut -d= -f2- | tr -d '"\r' ; }

  local backup_dir="${BACKUP_DIR:-$(env_value BACKUP_DIR)}"; backup_dir="${backup_dir:-/var/backups/crm-db}"
  local keep_days="${BACKUP_RETENTION_DAYS:-$(env_value BACKUP_RETENTION_DAYS)}"; keep_days="${keep_days:-14}"
  local keep_months="${BACKUP_RETENTION_MONTHS:-$(env_value BACKUP_RETENTION_MONTHS)}"; keep_months="${keep_months:-3}"
  local container="${PG_CONTAINER:-crm-postgres}"
  local db_user="${PG_USER:-crm_user}" db_name="${PG_DB:-crm}"
  local log="${BACKUP_LOG:-/var/log/crm-db-backup.log}"
  local lock="/run/crm-db-backup.lock"

  ts() { TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %z'; }
  say() { echo "[$(ts)] [crm-db-backup] $*" >> "$log"; echo "$*"; }

  exec 9>"$lock"
  if ! flock -n 9; then say "outro backup em andamento; ignorando"; return 0; fi

  mkdir -p "$backup_dir" && chmod 700 "$backup_dir" || { say "ERRO: não foi possível criar $backup_dir"; return 1; }
  # Cada backup tem ~700 MB: sem 3 GB livres, não arrisca encher o disco do servidor.
  local free_kb
  free_kb="$(df -Pk "$backup_dir" | awk 'NR==2 {print $4}')"
  if [ "${free_kb:-0}" -lt 3145728 ]; then say "ERRO: menos de 3 GB livres em $backup_dir; backup não executado"; return 1; fi
  if ! docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q true; then
    say "ERRO: container $container não está rodando"; return 1
  fi

  local stamp file tmp
  stamp="$(TZ=America/Sao_Paulo date '+%Y%m%d-%H%M%S')"
  file="$backup_dir/backup-$stamp.sql.gz"
  tmp="$file.partial"
  local started=$SECONDS

  if ! docker exec "$container" pg_dump -U "$db_user" -d "$db_name" --no-owner --no-privileges | gzip -6 > "$tmp"; then
    rm -f "$tmp"; say "ERRO: pg_dump falhou"; return 1
  fi
  local size
  size="$(stat -c %s "$tmp" 2>/dev/null || echo 0)"
  if [ "$size" -le 0 ]; then rm -f "$tmp"; say "ERRO: arquivo gerado vazio"; return 1; fi
  if ! gzip -t "$tmp" 2>/dev/null; then rm -f "$tmp"; say "ERRO: gzip corrompido"; return 1; fi
  # Dump completo termina com esta linha; sem ela o pg_dump foi interrompido.
  if ! gzip -dc "$tmp" | tail -n 5 | grep -q "PostgreSQL database dump complete"; then
    rm -f "$tmp"; say "ERRO: dump incompleto (sem marcador de fim)"; return 1
  fi
  mv "$tmp" "$file"
  chmod 600 "$file"
  say "OK: $file ($(numfmt --to=iec "$size" 2>/dev/null || echo "$size bytes")) em $((SECONDS - started))s"

  # Último backup válido no banco, para o /api/health.
  local at
  at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  docker exec -i "$container" psql -q -U "$db_user" -d "$db_name" -v ON_ERROR_STOP=1 >/dev/null 2>>"$log" <<SQL || say "AVISO: não foi possível registrar o backup no banco"
INSERT INTO "CrmWorkspaceData" ("key", "value", "updatedAt")
VALUES ('system:last-backup', '{"file":"$file","sizeBytes":$size,"at":"$at"}'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW();
SQL

  # Retenção: mantém os dos últimos N dias e o mais recente de cada um dos últimos M meses.
  local cutoff_day keep_list removed=0
  cutoff_day="$(TZ=America/Sao_Paulo date -d "-$keep_days days" '+%Y%m%d')"
  keep_list="$(ls -1 "$backup_dir"/backup-*.sql.gz 2>/dev/null | sort | awk -F'backup-' '{ m = substr($2, 1, 6); last[m] = $0 } END { for (k in last) print last[k] }' | sort | tail -n "$keep_months")"
  local candidate day
  for candidate in "$backup_dir"/backup-*.sql.gz; do
    [ -e "$candidate" ] || continue
    [ "$candidate" = "$file" ] && continue
    day="$(basename "$candidate" | sed -E 's/^backup-([0-9]{8})-.*/\1/')"
    [ "$day" -ge "$cutoff_day" ] 2>/dev/null && continue
    echo "$keep_list" | grep -qxF "$candidate" && continue
    rm -f "$candidate" && removed=$((removed + 1)) && say "retenção: removido $(basename "$candidate")"
  done
  rm -f "$backup_dir"/*.partial 2>/dev/null
  say "retenção: $removed arquivo(s) removido(s); $(ls -1 "$backup_dir"/backup-*.sql.gz 2>/dev/null | wc -l) backup(s) guardado(s)"
  return 0
}

main "$@"
exit $?
