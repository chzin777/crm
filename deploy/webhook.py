#!/usr/bin/env python3
"""Webhook de deploy do CRM (GitHub -> https://crm-webhook.oticasbrasil.com.br -> porta 9003).

Valida a assinatura do GitHub (segredo em /etc/crm-deploy/webhook-secret, fora do repositório),
aceita só push na main e dispara deploy/auto-deploy.sh em segundo plano. O timer crm-autodeploy
cobre webhooks perdidos.
"""
import hashlib
import hmac
import json
import os
import subprocess
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET_FILE = "/etc/crm-deploy/webhook-secret"
SCRIPT = "/opt/crm/deploy/auto-deploy.sh"
LOG_FILE = "/var/log/crm-deploy.log"
os.environ["TZ"] = "America/Sao_Paulo"
time.tzset()


def log(message: str) -> None:
    with open(LOG_FILE, "a", encoding="utf-8") as handle:
        handle.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S %z')}] [crm-deploy] [webhook] {message}\n")


def secret() -> bytes:
    with open(SECRET_FILE, encoding="utf-8") as handle:
        return handle.read().strip().encode()


class Handler(BaseHTTPRequestHandler):
    def reply(self, code: int, body: bytes) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        self.reply(200, b"crm deploy webhook ok")

    def do_POST(self) -> None:
        body = self.rfile.read(int(self.headers.get("Content-Length", 0) or 0))
        expected = "sha256=" + hmac.new(secret(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(self.headers.get("X-Hub-Signature-256", ""), expected):
            log("assinatura inválida: ignorado")
            return self.reply(401, b"unauthorized")
        event = self.headers.get("X-GitHub-Event", "")
        if event == "ping":
            log("ping do GitHub recebido")
            return self.reply(200, b"pong")
        try:
            payload = json.loads(body or b"{}")
        except ValueError:
            return self.reply(400, b"invalid json")
        if event != "push" or payload.get("ref") != "refs/heads/main":
            return self.reply(200, b"ignored")
        after = str(payload.get("after", ""))[:9]
        pusher = payload.get("pusher", {}).get("name", "desconhecido")
        log(f"push na main ({after}) por {pusher}: deploy disparado")
        subprocess.Popen(["bash", SCRIPT, "webhook"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        self.reply(200, b"deploy triggered")

    def log_message(self, *_args) -> None:
        pass


if __name__ == "__main__":
    log("serviço do webhook iniciado na porta 9003")
    HTTPServer(("0.0.0.0", 9003), Handler).serve_forever()
