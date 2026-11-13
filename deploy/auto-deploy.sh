#!/usr/bin/env bash
# Deploy automático do CRM no servidor (/opt/crm).
#   auto-deploy.sh webhook  -> chamado pelo webhook do GitHub (push na main): sempre atualiza.
#   auto-deploy.sh poll     -> timer do systemd a cada 2 min: só atualiza se a main do GitHub tiver commit novo
#                              (rede de segurança para webhook perdido ou serviço fora do ar).
# Um deploy por vez (flock). Log em /var/log/crm-deploy.log com horário de Brasília.
# Tudo dentro de main(): o bash lê a função inteira antes de rodar, então o git reset que troca este
# próprio arquivo não quebra a execução em andamento.

main() {
  set -uo pipefail
  local mode="${1:-poll}"
  local dir="/opt/crm"
  local log="/var/log/crm-deploy.log"
  local lock="/run/crm-deploy.lock"

  ts() { TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %z'; }
  say() { echo "[$(ts)] [crm-deploy] [$mode] $*" >> "$log"; }

  exec 9>"$lock"
  if ! flock -n 9; then
    [ "$mode" = "webhook" ] && say "outro deploy em andamento; o timer aplica este commit em seguida"
    return 0
  fi

  cd "$dir" || { say "ERRO: pasta $dir não existe"; return 1; }
  if ! git fetch --quiet origin main >> "$log" 2>&1; then
    say "ERRO: git fetch falhou"
    return 1
  fi
  local current target
  current="$(git rev-parse HEAD)"
  target="$(git rev-parse origin/main)"
  if [ "$mode" = "poll" ] && [ "$current" = "$target" ]; then
    # Servidor em dia: confere só se o container está rodando a mesma versão.
    local running
    running="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' crm-app 2>/dev/null | sed -n 's/^GIT_COMMIT=//p')"
    [ "$running" = "${target:0:9}" ] && return 0
    say "container com versão '${running:-desconhecida}' e repositório em ${target:0:9}: reconstruindo"
  fi

  say "início: ${current:0:9} -> ${target:0:9} ($(git log -1 --format=%s "$target" | cut -c1-100))"
  # reset em vez de pull: alteração local em arquivo versionado não trava mais o deploy.
  # Arquivos não versionados (.env, postgres/data, certificados) não são tocados.
  if ! git reset --hard --quiet "$target" >> "$log" 2>&1; then
    say "ERRO: git reset falhou"
    return 1
  fi

  export GIT_COMMIT="${target:0:9}"
  export APP_VERSION="$(git log -1 --format=%s "$target" | grep -oE '^v[0-9]+\.[0-9]+\.[0-9]+' || echo "sem-versao")"
  local started=$SECONDS
  if ! docker compose up -d --build crm-app >> "$log" 2>&1; then
    say "ERRO: build/subida do container falhou (veja as linhas acima); container anterior segue no ar"
    return 1
  fi

  # Confirma que a versão nova respondeu (até 3 min).
  local health=""
  for _ in $(seq 1 36); do
    health="$(curl -fsS -m 5 http://127.0.0.1:3000/api/health 2>/dev/null || true)"
    echo "$health" | grep -q "\"commit\":\"$GIT_COMMIT\"" && break
    sleep 5
  done
  if echo "$health" | grep -q "\"commit\":\"$GIT_COMMIT\""; then
    say "OK: $APP_VERSION ($GIT_COMMIT) no ar em $((SECONDS - started))s"
  else
    say "ERRO: container subiu mas /api/health não confirmou $GIT_COMMIT (resposta: ${health:-nenhuma})"
    return 1
  fi
  # API de estoque do VMSet (host): recarrega o script versionado, se o serviço estiver instalado.
  systemctl try-restart crm-vmset-stock.service >> "$log" 2>&1 || true
  docker image prune -f >> "$log" 2>&1 || true
  return 0
}

main "$@"
exit $?
