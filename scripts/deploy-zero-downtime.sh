#!/usr/bin/env bash
# Deploy sem queda (blue/green) do CRM em /opt/crm.
#
#   deploy-zero-downtime.sh                 build do commit atual (HEAD) e troca de cor
#   deploy-zero-downtime.sh --release <sha> sobe uma release já construída (usado pelo rollback.sh)
#
# Arquitetura: Cloudflare Tunnel -> :3000 crm-proxy (nginx) -> crm-app-blue (:3001) | crm-app-green (:3002)
#   1. build isolado: docker build gera a imagem crm-app:<sha> enquanto a cor ativa segue atendendo
#   2. migrations: prisma migrate deploy, só se existir prisma/migrations (o projeto usa SQL aditivo em prisma/*.sql)
#   3. a imagem vira crm-app:<cor parada>, a cor sobe e precisa responder /api/health com o commit novo
#   4. proxy aponta para a cor nova (nginx -s reload, sem cortar conexões) e confere o /api/health pela porta 3000
#      por até 15 s; se falhar, volta o proxy para a cor anterior (que ainda está no ar) e desliga a nova
#   5. a cor antiga recebe 10 s para terminar o que estava fazendo e é parada; ficam as 3 últimas releases
# Log em /var/log/crm-deploy.log. Estado (não versionado) em /opt/crm/runtime.

main() {
  set -uo pipefail
  local dir="${CRM_DIR:-/opt/crm}"
  local log="${CRM_DEPLOY_LOG:-/var/log/crm-deploy.log}"
  local runtime="$dir/runtime"
  local keep_releases=3
  local health_timeout=180 switch_timeout=15 drain_seconds=10

  ts() { TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %z'; }
  say() { echo "[$(ts)] [crm-deploy] [zero-downtime] $*" | tee -a "$log"; }
  port_of() { [ "$1" = "blue" ] && echo 3001 || echo 3002; }
  other() { [ "$1" = "blue" ] && echo green || echo blue; }
  compose() { docker compose --project-directory "$dir" "$@"; }
  running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]; }
  # /api/health respondendo 200 com o commit esperado.
  healthy() { curl -fsS -m 5 "http://127.0.0.1:$1/api/health" 2>/dev/null | grep -q "\"commit\":\"$2\""; }
  write_upstream() {
    mkdir -p "$runtime/proxy"
    printf 'set $crm_upstream crm-app-%s:3000;\n' "$1" > "$runtime/proxy/active.conf.tmp"
    mv -f "$runtime/proxy/active.conf.tmp" "$runtime/proxy/active.conf"
  }
  reload_proxy() { docker exec crm-proxy nginx -t >/dev/null 2>&1 && docker exec crm-proxy nginx -s reload >/dev/null 2>&1; }

  if [ "${CRM_DEPLOY_LOCKED:-0}" != "1" ]; then
    exec 9>/run/crm-deploy.lock
    flock -n 9 || { say "outro deploy em andamento"; return 1; }
  fi
  cd "$dir" || { say "ERRO: pasta $dir não existe"; return 1; }
  mkdir -p "$runtime/proxy"

  local mode="build" sha version
  if [ "${1:-}" = "--release" ]; then
    mode="release"; sha="${2:-}"
    [ -n "$sha" ] || { say "ERRO: informe o sha da release"; return 1; }
    docker image inspect "crm-app:$sha" >/dev/null 2>&1 || { say "ERRO: imagem crm-app:$sha não existe"; return 1; }
    version="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "crm-app:$sha" | sed -n 's/^APP_VERSION=//p')"
  else
    sha="$(git rev-parse --short=9 HEAD)"
    version="${APP_VERSION:-$(git log -1 --format=%s HEAD | grep -oE '^v[0-9]+\.[0-9]+\.[0-9]+' || echo sem-versao)}"
  fi

  local active idle
  active="$(cat "$runtime/active-color" 2>/dev/null || true)"
  [ "$active" = "blue" ] || [ "$active" = "green" ] || active=""
  idle="$( [ -n "$active" ] && other "$active" || echo blue )"
  local started=$SECONDS
  say "início: $version ($sha) na cor $idle; ativa: ${active:-nenhuma (primeira migração)}"

  # 1. Build isolado: a versão no ar não é tocada; falhou aqui, nada muda.
  if [ "$mode" = "build" ]; then
    if docker image inspect "crm-app:$sha" >/dev/null 2>&1; then
      say "imagem crm-app:$sha já existe; reaproveitando"
    elif ! docker build --build-arg "GIT_COMMIT=$sha" --build-arg "APP_VERSION=$version" -t "crm-app:$sha" . >> "$log" 2>&1; then
      say "ERRO: build falhou; versão no ar continua intacta"; return 1
    fi
  fi

  # 2. Migrations seguras (expansão antes da troca do código). Só roda com migrations do Prisma versionadas.
  if [ "$mode" = "build" ] && [ -d prisma/migrations ] && ls prisma/migrations/*/migration.sql >/dev/null 2>&1; then
    local direct_url
    direct_url="$(sed -n 's/^ *DATABASE_URL: *postgres:\/\/\(.*\)@pgbouncer:5432\/\(.*\)$/postgresql:\/\/\1@postgres:5432\/\2/p' docker-compose.yml | head -1)"
    if ! docker build --target builder -t "crm-app-builder:$sha" . >> "$log" 2>&1 \
      || ! docker run --rm --network crm_crm-network -e "DATABASE_URL=$direct_url" "crm-app-builder:$sha" npx prisma migrate deploy >> "$log" 2>&1; then
      say "ERRO: prisma migrate deploy falhou; versão no ar continua intacta"; return 1
    fi
    say "migrations aplicadas"
  else
    say "migrations: sem prisma/migrations (alterações de banco são SQL aditivo em prisma/*.sql); etapa ignorada"
  fi

  # 3. Sobe a cor parada com a nova imagem e espera o /api/health dela (direto na porta da cor).
  docker tag "crm-app:$sha" "crm-app:$idle"
  if ! compose up -d --no-deps --force-recreate "crm-app-$idle" >> "$log" 2>&1; then
    say "ERRO: não foi possível subir crm-app-$idle"; return 1
  fi
  local waited=0
  until healthy "$(port_of "$idle")" "$sha"; do
    if [ "$waited" -ge "$health_timeout" ] || ! running "crm-app-$idle"; then
      say "ERRO: crm-app-$idle não respondeu /api/health com $sha em ${waited}s; desligando a cor nova, versão no ar intacta"
      docker logs --tail 30 "crm-app-$idle" >> "$log" 2>&1
      compose stop "crm-app-$idle" >> "$log" 2>&1
      return 1
    fi
    sleep 2; waited=$((waited + 2))
  done
  say "crm-app-$idle saudável em ${waited}s (porta $(port_of "$idle"))"

  # 4. Virada do tráfego.
  local legacy=""
  write_upstream "$idle"
  if running crm-proxy; then
    if ! reload_proxy; then
      say "ERRO: nginx recusou a configuração; tráfego segue na cor anterior"
      [ -n "$active" ] && write_upstream "$active"
      compose stop "crm-app-$idle" >> "$log" 2>&1
      return 1
    fi
  else
    # Primeira migração: o container antigo "crm-app" ocupa a porta 3000; a troca leva ~1 s.
    if running crm-app; then legacy="crm-app"; docker stop -t 20 crm-app >> "$log" 2>&1; fi
    if ! compose up -d --no-deps crm-proxy >> "$log" 2>&1; then
      say "ERRO: proxy não subiu; religando o container antigo"
      [ -n "$legacy" ] && docker start "$legacy" >> "$log" 2>&1
      compose stop "crm-app-$idle" >> "$log" 2>&1
      return 1
    fi
  fi

  waited=0
  until healthy 3000 "$sha"; do
    if [ "$waited" -ge "$switch_timeout" ]; then
      say "ERRO: porta 3000 não confirmou $sha em ${switch_timeout}s; ROLLBACK automático"
      if [ -n "$active" ] && running "crm-app-$active"; then
        write_upstream "$active"; reload_proxy
        say "rollback: tráfego de volta para crm-app-$active"
      elif [ -n "$legacy" ]; then
        compose stop crm-proxy >> "$log" 2>&1; docker start "$legacy" >> "$log" 2>&1
        say "rollback: container antigo crm-app religado na porta 3000"
      fi
      compose stop "crm-app-$idle" >> "$log" 2>&1
      return 1
    fi
    sleep 1; waited=$((waited + 1))
  done
  echo "$idle" > "$runtime/active-color"
  say "tráfego na cor $idle (confirmado na porta 3000 em ${waited}s)"

  # 5. A cor antiga termina o que estava fazendo e é desligada.
  sleep "$drain_seconds"
  if [ -n "$active" ] && running "crm-app-$active"; then compose stop -t 30 "crm-app-$active" >> "$log" 2>&1; fi
  [ -n "$legacy" ] && docker rm "$legacy" >> "$log" 2>&1 && say "container antigo crm-app removido (migração para blue/green concluída)"

  # Retenção: só as 3 últimas releases (as cores em uso nunca são apagadas).
  local releases="$runtime/releases"
  { grep -vxF "$sha" "$releases" 2>/dev/null; echo "$sha"; } > "$releases.tmp" && mv -f "$releases.tmp" "$releases"
  local old
  for old in $(head -n -"$keep_releases" "$releases"); do
    docker rmi "crm-app:$old" "crm-app-builder:$old" >/dev/null 2>&1 || true
  done
  tail -n "$keep_releases" "$releases" > "$releases.tmp" && mv -f "$releases.tmp" "$releases"
  docker image prune -f >/dev/null 2>&1 || true

  say "OK: $version ($sha) no ar na cor $idle em $((SECONDS - started))s, sem queda"
  return 0
}

main "$@"
exit $?
