#!/usr/bin/env bash
# Rollback rápido do CRM: volta para a release anterior (ou a informada) sem queda, pelo mesmo caminho blue/green.
#   rollback.sh            release anterior à que está no ar
#   rollback.sh <sha>      release específica (uma das 3 guardadas: cat /opt/crm/runtime/releases)
#   rollback.sh --list     lista as releases disponíveis
# A release escolhida fica "fixada": o timer de deploy não reconstrói a main por cima dela.
# O próximo push na main (webhook) faz deploy normal e remove a fixação.

main() {
  set -uo pipefail
  local dir="${CRM_DIR:-/opt/crm}"
  local runtime="$dir/runtime"
  local releases="$runtime/releases"

  [ -s "$releases" ] || { echo "Nenhuma release registrada em $releases."; return 1; }
  local current
  current="$(curl -fsS -m 5 http://127.0.0.1:3000/api/health 2>/dev/null | sed -n 's/.*"commit":"\([0-9a-f]*\)".*/\1/p')"

  if [ "${1:-}" = "--list" ]; then
    local sha
    while read -r sha; do
      echo "$sha $(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "crm-app:$sha" 2>/dev/null | sed -n 's/^APP_VERSION=//p')$( [ "$sha" = "$current" ] && echo '  <- no ar')"
    done < "$releases"
    return 0
  fi

  local target="${1:-}"
  if [ -z "$target" ]; then
    target="$(grep -vxF "${current:-none}" "$releases" | tail -n 1)"
    [ -n "$target" ] || { echo "Não há release anterior guardada."; return 1; }
  fi
  [ "$target" = "$current" ] && { echo "$target já está no ar."; return 0; }

  echo "Rollback: ${current:-?} -> $target"
  if bash "$dir/scripts/deploy-zero-downtime.sh" --release "$target"; then
    echo "$target" > "$runtime/rollback-pin"
    echo "OK: $target no ar. Fixado até o próximo push na main."
    return 0
  fi
  echo "Rollback falhou; a versão anterior continua no ar. Veja /var/log/crm-deploy.log."
  return 1
}

main "$@"
exit $?
