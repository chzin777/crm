#!/usr/bin/env python3
"""API de saldo de estoque do VMSet (Oracle) para o agente de IA do CRM.

REGRA: apenas SELECT no Oracle. Nenhuma escrita na VMSET.

GET /stock?codes=146011,145644  (cabeçalho x-api-key)  ->  {"items": [{"code", "unit", "name", "qty"}]}
  - no máximo 5 códigos por chamada (o CRM consulta só os produtos achados na busca local);
  - saldo disponível = quantidade - reserva de venda, só setores ativos que vendem (mesma regra da VIEW_OTCS_ESTOQUE);
  - unidades virtuais (100-199, 1000-2999) ficam de fora; o filtro de varejo (ADM, CD, fábrica) é feito no CRM.
GET /installments?cpf=12345678901  (cabeçalho x-api-key)  ->  {"found", "name", "items": [{"numero", "parcela", "vencimento", "valor", "posicao", "pagamento", "valorPago", "tipo", "loja"}]}
  - títulos a receber (carnê/boleto) do CPF, últimos 3 anos, sem cancelados;
GET /events?kind=overdue|due|paid|good_payer|lab_ready&date=YYYY-MM-DD  (cabeçalho x-api-key)  ->  {"items": [...]}
  - eventos do dia para os gatilhos de /automacoes (parcela vencida/a vencer, baixa, bom pagador, OS pronta no laboratório);
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

# Preço de venda vigente por loja (tabela PRECO_VENDA do ERP): ativo e dentro da validade.
PRICE_SQL = """
SELECT PR.PRDT_CODIGO, UE.UNEM_CODIGO, MAX(PV.PRVD_PRECO)
FROM PRODUTO PR
JOIN EMBALAGEM_VENDA EV ON EV.PRODUTO_ID = PR.PRODUTO_ID
JOIN PRECO_VENDA PV ON PV.EMBALAGEM_VENDA_ID = EV.EMBALAGEM_VENDA_ID AND PV.STATUS = 'Ativo'
JOIN UNIDADE_EMPRESARIAL UE ON UE.UNIDADE_EMPRESARIAL_ID = PV.UNIDADE_EMPRESARIAL_ID AND UE.STATUS = 'Ativo'
WHERE PR.PRDT_CODIGO IN ({binds})
  AND (PV.PRVD_DT_VALIDADE IS NULL OR PV.PRVD_DT_VALIDADE >= TRUNC(SYSDATE))
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
        params = {f"c{i}": code for i, code in enumerate(codes)}
        cur.execute(SQL.format(binds=binds), params)
        rows = cur.fetchall()
        # Preço é complemento: se a consulta falhar, o saldo segue sem preço (o CRM trata como "sob consulta").
        prices = {}
        try:
            cur.execute(PRICE_SQL.format(binds=binds), params)
            for code, unit, price in cur.fetchall():
                key = (str(code), str(int(unit)) if str(unit).isdigit() else str(unit))
                prices[key] = round(float(price), 2) if price is not None and float(price) > 0 else None
        except Exception as error:
            log(f"preço indisponível ({','.join(codes)}): {str(error)[:160]}")
        items = []
        for code, unit, name, qty in rows:
            unit_code = str(int(unit)) if str(unit).isdigit() else str(unit)
            items.append({"code": str(code), "unit": unit_code, "name": (name or "").strip(), "qty": float(qty or 0), "price": prices.get((str(code), unit_code))})
        return items



# Parcelas do crediário (carnê/boleto) de um CPF: títulos A RECEBER (FATURA.FTRA_TIPO = 'Recebimento'), ativos e não
# cancelados, dos últimos 3 anos. Só leitura; o CRM decide o que mostrar (com aprovação do operador antes do cliente).
INSTALLMENTS_SQL = """
SELECT P.PRCR_NOME, T.TITL_NUMERO, T.TITL_PARCELA, T.TITL_DT_VENCTO, T.TITL_VALOR, T.TITL_POSICAO,
       T.TITL_DT_PAGTO, T.TITL_VLR_PAGTO, D.TPDC_DESCRICAO, MAX(LJ.PRCR_NOME)
FROM PARCEIRO P
JOIN TITULO T ON T.PARCEIRO_ID = P.PARCEIRO_ID AND T.STATUS LIKE 'Ativo%' AND T.TITL_POSICAO <> 'Cancelado'
JOIN FATURA F ON F.FATURA_ID = T.FATURA_ID AND F.FTRA_TIPO = 'Recebimento'
LEFT JOIN TIPO_DOCUMENTO D ON D.TIPO_DOCUMENTO_ID = T.TIPO_DOCUMENTO_ID
LEFT JOIN PARCEIRO LJ ON LJ.PARCEIRO_ID = T.UNIDADE_MANTENEDORA_ID
WHERE P.PRCR_CGC_CPF = :cpf
  AND T.TITL_DT_VENCTO >= ADD_MONTHS(TRUNC(SYSDATE), -36)
GROUP BY P.PRCR_NOME, T.TITULO_ID, T.TITL_NUMERO, T.TITL_PARCELA, T.TITL_DT_VENCTO, T.TITL_VALOR, T.TITL_POSICAO,
         T.TITL_DT_PAGTO, T.TITL_VLR_PAGTO, D.TPDC_DESCRICAO
ORDER BY T.TITL_DT_VENCTO
"""
NAME_SQL = "SELECT MAX(PRCR_NOME) FROM PARCEIRO WHERE PRCR_CGC_CPF = :cpf"
CPF = re.compile(r"^\d{11}$")


def day(value):
    return value.strftime("%Y-%m-%d") if value else None


def installments(cpf):
    with pool.acquire() as conn:
        conn.call_timeout = CALL_TIMEOUT_MS * 2
        cur = conn.cursor()
        cur.execute(INSTALLMENTS_SQL, cpf=cpf)
        rows = cur.fetchmany(200)
        name = rows[0][0] if rows else None
        if not rows:
            cur.execute(NAME_SQL, cpf=cpf)
            found = cur.fetchone()
            name = found[0] if found else None
        items = [{
            "numero": str(numero or ""), "parcela": str(parcela or ""), "vencimento": day(venc),
            "valor": round(float(valor or 0), 2), "posicao": (posicao or "").strip(), "pagamento": day(pagto),
            "valorPago": round(float(pago), 2) if pago is not None else None, "tipo": (tipo or "").strip(), "loja": (loja or "").strip(),
        } for _, numero, parcela, venc, valor, posicao, pagto, pago, tipo, loja in rows]
        return {"found": bool(name), "name": (name or "").strip() or None, "items": items}


# Eventos do ERP para os gatilhos de /automacoes (só leitura). Cada linha: cliente (CPF, nome, celular) + dados do evento.
TITLE_BASE = """
FROM TITULO T
JOIN FATURA F ON F.FATURA_ID = T.FATURA_ID AND F.FTRA_TIPO = 'Recebimento'
JOIN PARCEIRO P ON P.PARCEIRO_ID = T.PARCEIRO_ID
LEFT JOIN PARCEIRO LJ ON LJ.PARCEIRO_ID = T.UNIDADE_MANTENEDORA_ID
WHERE T.STATUS LIKE 'Ativo%'
"""
TITLE_COLS = """SELECT T.TITULO_ID, P.PRCR_CGC_CPF, P.PRCR_NOME, P.PRCR_CELULAR, P.PRCR_FONE, T.TITL_NUMERO, T.TITL_PARCELA,
       T.TITL_DT_VENCTO, T.TITL_VALOR, T.TITL_DT_PAGTO, T.TITL_VLR_PAGTO, LJ.PRCR_NOME, T.FATURA_ID"""
OPEN = "T.TITL_POSICAO IN ('Aberto', 'Recebendo')"
OVERDUE_ELSEWHERE = """NOT EXISTS (
  SELECT 1 FROM TITULO T3 JOIN FATURA F3 ON F3.FATURA_ID = T3.FATURA_ID AND F3.FTRA_TIPO = 'Recebimento'
  WHERE T3.PARCEIRO_ID = T.PARCEIRO_ID AND T3.STATUS LIKE 'Ativo%' AND T3.TITL_POSICAO IN ('Aberto', 'Recebendo')
    AND T3.TITL_DT_VENCTO < TRUNC(SYSDATE))"""
REMAINING = """(SELECT COUNT(*) FROM TITULO T2 WHERE T2.FATURA_ID = T.FATURA_ID AND T2.STATUS LIKE 'Ativo%'
  AND T2.TITL_POSICAO IN ('Aberto', 'Recebendo'))"""
EVENT_SQL = {
    # Parcela vencida no dia :d e ainda em aberto (inadimplente há N dias/meses).
    "overdue": f"{TITLE_COLS}, 0 {TITLE_BASE} AND {OPEN} AND T.TITL_DT_VENCTO >= :d AND T.TITL_DT_VENCTO < :d + 1",
    # Parcela que vence no dia :d (lembrete preventivo).
    "due": f"{TITLE_COLS}, 0 {TITLE_BASE} AND {OPEN} AND T.TITL_DT_VENCTO >= :d AND T.TITL_DT_VENCTO < :d + 1",
    # Baixa/quitação no dia :d; a última coluna diz quantas parcelas da mesma fatura (carnê) seguem em aberto.
    "paid": f"{TITLE_COLS}, {REMAINING} {TITLE_BASE} AND T.TITL_POSICAO = 'Quitado' AND T.TITL_DT_PAGTO >= :d AND T.TITL_DT_PAGTO < :d + 1",
    # Pagou em dia no dia :d e hoje não tem nenhuma parcela vencida em aberto (adimplente há N).
    "good_payer": f"{TITLE_COLS}, 0 {TITLE_BASE} AND T.TITL_POSICAO = 'Quitado' AND T.TITL_DT_PAGTO >= :d AND T.TITL_DT_PAGTO < :d + 1 AND T.TITL_DT_PAGTO <= T.TITL_DT_VENCTO AND {OVERDUE_ELSEWHERE}",
}
LAB_SQL = """
SELECT PS.PEDIDO_SAIDA_ID, P.PRCR_CGC_CPF, P.PRCR_NOME, P.PRCR_CELULAR, P.PRCR_FONE, MAX(PL.PRLA_NR_PROTOCOLO),
       MAX(PL.PRLA_DT_TERMINO), MAX(LJ.PRCR_NOME)
FROM PRODUCAO_LABORATORIO PL
JOIN INFO_OTICA_ITEM_PEDSAI IO ON IO.INFO_OTICA_ITEM_PEDSAI_ID = PL.INFO_OTICA_ITEM_PEDSAI_ID
JOIN PEDIDO_SAIDA PS ON PS.PEDIDO_SAIDA_ID = IO.PEDIDO_SAIDA_ID
JOIN PARCEIRO P ON P.PARCEIRO_ID = PS.PARCEIRO_ID
LEFT JOIN PARCEIRO LJ ON LJ.PARCEIRO_ID = PL.UNIDADE_EMPRESARIAL_ID
WHERE PL.PRLA_SITUACAO = 'Produzido' AND PL.PRLA_DT_TERMINO >= :d AND PL.PRLA_DT_ENTREGA_CLIE IS NULL
  AND NVL(PL.STATUS, 'Ativo') LIKE 'Ativo%'
GROUP BY PS.PEDIDO_SAIDA_ID, P.PRCR_CGC_CPF, P.PRCR_NOME, P.PRCR_CELULAR, P.PRCR_FONE
"""
EVENT_KINDS = set(EVENT_SQL) | {"lab_ready"}
MAX_EVENTS = 2000
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def money(value):
    return round(float(value), 2) if value is not None else None


def events(kind, date):
    import datetime as dt
    day_value = dt.datetime.strptime(date, "%Y-%m-%d")
    with pool.acquire() as conn:
        conn.call_timeout = 30000
        cur = conn.cursor()
        if kind == "lab_ready":
            cur.execute(LAB_SQL, d=day_value)
            return [{
                "id": str(order), "cpf": re.sub(r"\D", "", cpf or ""), "name": (name or "").strip(), "phone": (cel or fone or "").strip(),
                "protocol": str(protocol or ""), "date": day(done), "store": (store or "").strip(),
            } for order, cpf, name, cel, fone, protocol, done, store in cur.fetchmany(MAX_EVENTS)]
        cur.execute(EVENT_SQL[kind], d=day_value)
        return [{
            "id": str(title_id), "cpf": re.sub(r"\D", "", cpf or ""), "name": (name or "").strip(), "phone": (cel or fone or "").strip(),
            "number": str(number or ""), "installment": str(installment or ""), "due": day(due), "amount": money(amount),
            "paidAt": day(paid_at), "paid": money(paid), "store": (store or "").strip(), "invoice": str(invoice or ""), "remaining": int(remaining or 0),
        } for title_id, cpf, name, cel, fone, number, installment, due, amount, paid_at, paid, store, invoice, remaining in cur.fetchmany(MAX_EVENTS)]


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
        if url.path not in ("/stock", "/installments", "/events"):
            return self._send(404, {"error": "not_found"})
        if not TOKEN or not hmac.compare_digest(self.headers.get("x-api-key", ""), TOKEN):
            return self._send(401, {"error": "unauthorized"})
        if url.path == "/events":
            query = parse_qs(url.query)
            kind = (query.get("kind", [""])[0]).strip()
            date = (query.get("date", [""])[0]).strip()
            if kind not in EVENT_KINDS or not DATE.match(date):
                return self._send(400, {"error": "informe kind e date (YYYY-MM-DD)"})
            started = time.monotonic()
            try:
                items = events(kind, date)
            except Exception as error:
                log(f"ERRO eventos {kind} {date}: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
            log(f"eventos {kind} {date}: {len(items)} em {time.monotonic() - started:.2f}s")
            return self._send(200, {"items": items})
        if url.path == "/installments":
            cpf = re.sub(r"\D", "", (parse_qs(url.query).get("cpf", [""])[0]))
            if not CPF.match(cpf):
                return self._send(400, {"error": "cpf inválido"})
            started = time.monotonic()
            try:
                result = installments(cpf)
            except Exception as error:
                log(f"ERRO parcelas ***{cpf[3:6]}***: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
            # CPF nunca vai inteiro para o log.
            log(f"parcelas ***{cpf[3:6]}***: {len(result['items'])} títulos em {time.monotonic() - started:.2f}s")
            return self._send(200, result)
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
