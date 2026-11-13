#!/usr/bin/env python3
"""API de saldo de estoque do VMSet (Oracle) para o agente de IA do CRM.

REGRA: apenas SELECT no Oracle. Nenhuma escrita na VMSET.

GET /stock?codes=146011,145644  (cabeçalho x-api-key)  ->  {"items": [{"code", "unit", "name", "qty"}]}
  - no máximo 5 códigos por chamada (o CRM consulta só os produtos achados na busca local);
  - saldo disponível = quantidade - reserva de venda, só setores ativos que vendem (mesma regra da VIEW_OTCS_ESTOQUE);
  - unidades virtuais (100-199, 1000-2999) ficam de fora; o filtro de varejo (ADM, CD, fábrica) é feito no CRM.
GET /health

Roda no host como serviço (crm-vmset-stock.service). Ambiente: ORACLE_USER, ORACLE_PASSWORD, ORACLE_DSN,
ORACLE_LIB_DIR (de /etc/crm-vmset-sync.env) e STOCK_API_TOKEN, STOCK_API_PORT (de /etc/crm-vmset-stock.env).
"""
import hmac
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import oracledb

TOKEN = os.environ.get("STOCK_API_TOKEN", "")
PORT = int(os.environ.get("STOCK_API_PORT", "9005"))
MAX_CODES = 5
CALL_TIMEOUT_MS = 2500
CODE = re.compile(r"^[0-9A-Za-z.-]{1,20}$")

SQL = """
SELECT PR.PRDT_CODIGO, UE.UNEM_CODIGO, MAX(PU.PRCR_NOME),
       SUM(ES.ESTQ_QTDE - NVL(ES.ESTQ_QTDE_RESERVA_VENDA, 0))
FROM PRODUTO PR
JOIN ESTOQUE ES ON ES.PRODUTO_ID = PR.PRODUTO_ID
JOIN SETOR SE ON SE.SETOR_ID = ES.SETOR_ID AND SE.STATUS = 'Ativo' AND NVL(SE.SETR_EFETUA_VENDA, 'Nao') = 'Sim'
JOIN UNIDADE_EMPRESARIAL UE ON UE.UNIDADE_EMPRESARIAL_ID = SE.UNIDADE_EMPRESARIAL_ID AND UE.STATUS = 'Ativo'
JOIN PARCEIRO PU ON PU.PARCEIRO_ID = UE.UNIDADE_EMPRESARIAL_ID
WHERE PR.PRDT_CODIGO IN ({binds})
  AND TO_NUMBER(UE.UNEM_CODIGO) NOT BETWEEN 100 AND 199
  AND TO_NUMBER(UE.UNEM_CODIGO) NOT BETWEEN 1000 AND 2999
GROUP BY PR.PRDT_CODIGO, UE.UNEM_CODIGO
"""

oracledb.init_oracle_client(lib_dir=os.environ.get("ORACLE_LIB_DIR"))
pool = oracledb.create_pool(
    user=os.environ["ORACLE_USER"], password=os.environ["ORACLE_PASSWORD"], dsn=os.environ["ORACLE_DSN"],
    min=1, max=4, increment=1, getmode=oracledb.POOL_GETMODE_TIMEDWAIT, wait_timeout=1500, ping_interval=60,
)
lock = threading.Lock()


def log(message):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}", flush=True)


def stock(codes):
    binds = ",".join(f":c{i}" for i in range(len(codes)))
    with pool.acquire() as conn:
        conn.call_timeout = CALL_TIMEOUT_MS
        cur = conn.cursor()
        cur.execute(SQL.format(binds=binds), {f"c{i}": code for i, code in enumerate(codes)})
        return [
            {"code": str(code), "unit": str(int(unit)) if str(unit).isdigit() else str(unit), "name": (name or "").strip(), "qty": float(qty or 0)}
            for code, unit, name, qty in cur.fetchall()
        ]


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/health":
            return self._send(200, {"ok": True, "service": "vmset-stock"})
        if url.path != "/stock":
            return self._send(404, {"error": "not_found"})
        if not TOKEN or not hmac.compare_digest(self.headers.get("x-api-key", ""), TOKEN):
            return self._send(401, {"error": "unauthorized"})
        raw = ",".join(parse_qs(url.query).get("codes", []))
        codes = list(dict.fromkeys(code.strip() for code in raw.split(",") if code.strip()))
        if not codes or len(codes) > MAX_CODES or not all(CODE.match(code) for code in codes):
            return self._send(400, {"error": f"informe de 1 a {MAX_CODES} códigos válidos"})
        started = time.monotonic()
        try:
            items = stock(codes)
        except Exception as error:  # Oracle lento ou fora: o CRM cai no fallback seguro
            log(f"ERRO {','.join(codes)}: {str(error)[:200]}")
            return self._send(503, {"error": "oracle_unavailable"})
        log(f"{','.join(codes)}: {len(items)} unidades em {time.monotonic() - started:.2f}s")
        return self._send(200, {"items": items})

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("STOCK_API_TOKEN não definido")
    log(f"API de estoque ouvindo na porta {PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
