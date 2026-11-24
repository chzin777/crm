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
GET /punctuality?months=24&grace=0  (cabeçalho x-api-key)  ->  {"items": [{"cpf", "due", "onTime", "avgDelay", "maxOverdueDays"}]}
  - pontualidade por CPF (carnê/boleto/crédito interno vencidos na janela) para a matriz RFV-P do CRM;
GET /catalog/products[?refresh=1]  (cabeçalho x-api-key)  ->  {"at", "items": [[codigo, descricao, referencia, ean, marca, categoria, subcategoria, ncm, cor, material, aro, ponte, garantiaMeses, preco, precoMin, precoMax]]}
  - produtos ativos das categorias de venda (armações, solares, lentes, acessórios...), preço mais comum entre as lojas;
  - retrato em memória por 60 min (a consulta de preços varre a PRECO_VENDA e leva ~30 s), renovado em segundo plano;
GET /catalog/stock[?refresh=1]  (cabeçalho x-api-key)  ->  {"at", "items": [[codigo, unidade, nomeUnidade, disponivel, reservado]]}
  - saldo de todas as unidades que vendem, retrato de 2 min (mesma regra do /stock);
GET /orders/pending?days=30  (cabeçalho x-api-key)  ->  {"at", "items": [{"id", "number", "status", "release", "issuedAt", "updatedAt", "total", "customer", "store", "seller", "mode", "credit"}]}
  - pedidos de venda ativos ainda não faturados (A Liberar / Reservado) para o painel de pedidos;
  - "credit": verificações de crédito ainda pendentes (aguardando o financeiro liberar); vazio = não depende do financeiro;
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

# Catálogo de produtos (página /produtos do CRM): cadastro + preço mais comum entre as lojas.
CATALOG_CATEGORIES = ("ARMACAO", "OCULOS SOLAR", "LENTES", "LENTE PRONTA", "ACESSORIOS", "LENTES DE CONTATO", "RELOGIO")
CATALOG_SQL = """
SELECT PR.PRDT_CODIGO, PR.PRDT_DESCRICAO, PR.PRDT_REFERENCIA_FABRICAN, NVL(PR.PRDT_COD_BARRA_INDUSTRIA, EB.EAN),
       M.MARC_DESCRICAO, CP.CATG_DESCRICAO, SP.SBCA_DESCRICAO, N.NCMX_CODIGO, CO.CORS_DESCRICAO, MA.MATE_DESCRICAO,
       PR.PRDT_ARO_ARMACAO, PR.PRDT_PONTE_ARMACAO, PR.PRDT_GARANTIA_MES, PZ.PRECO, PZ.PRECO_MIN, PZ.PRECO_MAX
FROM PRODUTO PR
JOIN SUBCATEGORIA_PRODUTO SP ON SP.SUBCATEGORIA_PRODUTO_ID = PR.SUBCATEGORIA_PRODUTO_ID
JOIN CATEGORIA_PRODUTO CP ON CP.CATEGORIA_PRODUTO_ID = SP.CATEGORIA_PRODUTO_ID
LEFT JOIN MARCAS M ON M.MARCA_ID = PR.MARCA_ID
LEFT JOIN NCM N ON N.NCM_ID = PR.NCM_ID
LEFT JOIN CORES CO ON CO.CORES_ID = PR.CORES_ID
LEFT JOIN MATERIAL MA ON MA.MATERIAL_ID = PR.MATERIAL_ID
LEFT JOIN (SELECT PRODUTO_ID, MAX(EMBV_COD_BARRA) EAN FROM EMBALAGEM_VENDA WHERE STATUS = 'Ativo' GROUP BY PRODUTO_ID) EB ON EB.PRODUTO_ID = PR.PRODUTO_ID
LEFT JOIN (
  SELECT EV.PRODUTO_ID, STATS_MODE(PV.PRVD_PRECO) PRECO, MIN(PV.PRVD_PRECO) PRECO_MIN, MAX(PV.PRVD_PRECO) PRECO_MAX
  FROM PRECO_VENDA PV
  JOIN EMBALAGEM_VENDA EV ON EV.EMBALAGEM_VENDA_ID = PV.EMBALAGEM_VENDA_ID
  WHERE PV.STATUS = 'Ativo' AND PV.PRVD_PRECO > 0 AND (PV.PRVD_DT_VALIDADE IS NULL OR PV.PRVD_DT_VALIDADE >= TRUNC(SYSDATE))
  GROUP BY EV.PRODUTO_ID
) PZ ON PZ.PRODUTO_ID = PR.PRODUTO_ID
WHERE PR.STATUS = 'Ativo' AND CP.CATG_DESCRICAO IN ({categories})
"""

# Saldo de todas as unidades que vendem (mesma regra do SQL acima, sem filtro de código).
CATALOG_STOCK_SQL = """
SELECT PR.PRDT_CODIGO, UE.UNEM_CODIGO, MAX(PU.PRCR_NOME),
       SUM(ES.ESTQ_QTDE - NVL(ES.ESTQ_QTDE_RESERVA_VENDA, 0)), SUM(NVL(ES.ESTQ_QTDE_RESERVA_VENDA, 0))
FROM ESTOQUE ES
JOIN PRODUTO PR ON PR.PRODUTO_ID = ES.PRODUTO_ID
JOIN SETOR SE ON SE.SETOR_ID = ES.SETOR_ID AND SE.STATUS = 'Ativo' AND NVL(SE.SETR_EFETUA_VENDA, 'Nao') = 'Sim'
JOIN UNIDADE_EMPRESARIAL UE ON UE.UNIDADE_EMPRESARIAL_ID = SE.UNIDADE_EMPRESARIAL_ID AND UE.STATUS = 'Ativo'
JOIN PARCEIRO PU ON PU.PARCEIRO_ID = UE.UNIDADE_EMPRESARIAL_ID
WHERE TO_NUMBER(UE.UNEM_CODIGO) NOT BETWEEN 100 AND 199
  AND TO_NUMBER(UE.UNEM_CODIGO) NOT BETWEEN 1000 AND 2999
GROUP BY PR.PRDT_CODIGO, UE.UNEM_CODIGO
HAVING SUM(ES.ESTQ_QTDE - NVL(ES.ESTQ_QTDE_RESERVA_VENDA, 0)) > 0 OR SUM(NVL(ES.ESTQ_QTDE_RESERVA_VENDA, 0)) > 0
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


# Pontualidade por CPF para a matriz RFV-P do CRM: parcelas de carnê/boleto/crédito interno vencidas na janela
# (:months meses até hoje). "Em dia" = quitada até o vencimento + :grace dias. Também o maior atraso em aberto hoje.
PUNCTUALITY_SQL = """
SELECT P.PRCR_CGC_CPF,
       COUNT(*),
       SUM(CASE WHEN T.TITL_POSICAO = 'Quitado' AND TRUNC(T.TITL_DT_PAGTO) <= TRUNC(T.TITL_DT_VENCTO) + :grace THEN 1 ELSE 0 END),
       AVG(CASE WHEN T.TITL_POSICAO = 'Quitado' AND T.TITL_DT_PAGTO IS NOT NULL THEN GREATEST(TRUNC(T.TITL_DT_PAGTO) - TRUNC(T.TITL_DT_VENCTO), 0)
                WHEN T.TITL_POSICAO IN ('Aberto', 'Recebendo') THEN TRUNC(SYSDATE) - TRUNC(T.TITL_DT_VENCTO) END),
       MAX(CASE WHEN T.TITL_POSICAO IN ('Aberto', 'Recebendo') THEN TRUNC(SYSDATE) - TRUNC(T.TITL_DT_VENCTO) ELSE 0 END)
FROM TITULO T
JOIN FATURA F ON F.FATURA_ID = T.FATURA_ID AND F.FTRA_TIPO = 'Recebimento'
JOIN PARCEIRO P ON P.PARCEIRO_ID = T.PARCEIRO_ID
JOIN TIPO_DOCUMENTO D ON D.TIPO_DOCUMENTO_ID = T.TIPO_DOCUMENTO_ID AND D.TPDC_DESCRICAO IN ('CARNE', 'BOLETO BANCARIO', 'CREDITO INTERNO')
WHERE T.STATUS LIKE 'Ativo%' AND T.TITL_POSICAO <> 'Cancelado'
  AND T.TITL_DT_VENCTO >= ADD_MONTHS(TRUNC(SYSDATE), -:months) AND T.TITL_DT_VENCTO < TRUNC(SYSDATE)
  AND P.PRCR_CGC_CPF IS NOT NULL
GROUP BY P.PRCR_CGC_CPF
"""


def punctuality(months, grace):
    with pool.acquire() as conn:
        conn.call_timeout = 120000
        cur = conn.cursor()
        cur.arraysize = 5000
        cur.execute(PUNCTUALITY_SQL, months=months, grace=grace)
        items = []
        for cpf, due, on_time, avg_delay, max_overdue in cur:
            digits = re.sub(r"\D", "", cpf or "").lstrip("0")
            if len(digits) < 9:
                continue
            items.append({"cpf": digits, "due": int(due or 0), "onTime": int(on_time or 0),
                          "avgDelay": round(float(avg_delay or 0), 1), "maxOverdueDays": max(int(max_overdue or 0), 0)})
        return items


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


def text(value):
    return " ".join(str(value).split()) if value is not None and str(value).strip() else None


def price_value(value):
    return round(float(value), 2) if value is not None and float(value) > 0 else None


# Pedidos de venda ainda não faturados (painel de pedidos): A Liberar (aguardando liberação) e Reservado
# (estoque reservado, aguardando NF). Só pedidos ativos, emitidos nos últimos :days dias.
PENDING_ORDERS_SQL = """
SELECT PS.PEDIDO_SAIDA_ID, PS.PDSD_NR_PEDIDO, PS.PDSD_STATUS, PS.PDSD_SIT_LIBERACAO, PS.PDSD_DT_EMISSAO, PS.DATA_ALTERACAO,
       PS.PDSD_VLR_TOTAL, P.PRCR_NOME, UE.PRCR_NOME, V.PRCR_NOME, PS.PDSD_MODO_VD, PS.PDSD_NEGADO_CREDITO,
       PS.PDSD_LIB_LIMITE_CREDITO, PS.PDSD_LIB_SPC, PS.PDSD_LIB_TIPO_DCTO, PS.PDSD_LIB_CONDICAO_PAGTO
FROM PEDIDO_SAIDA PS
LEFT JOIN PARCEIRO P ON P.PARCEIRO_ID = PS.PARCEIRO_ID
LEFT JOIN PARCEIRO UE ON UE.PARCEIRO_ID = PS.UNIDADE_EMPRESARIAL_ID
LEFT JOIN PARCEIRO V ON V.PARCEIRO_ID = PS.VENDEDOR_COMPRADOR_ID
WHERE PS.PDSD_STATUS IN ('A Liberar', 'Reservado') AND TRIM(PS.STATUS) = 'Ativo'
  AND PS.PDSD_DT_EMISSAO >= TRUNC(SYSDATE) - :days
ORDER BY PS.PDSD_DT_EMISSAO DESC
"""
MAX_ORDERS = 2000
# Bloqueios de crédito do pedido: "Nao" = aguardando o financeiro liberar, "Sim" = já liberado, vazio = não se aplica.
CREDIT_CHECKS = ("Limite de crédito", "SPC", "Tipo de documento", "Condição de pagamento")


def moment(value):
    return value.strftime("%Y-%m-%dT%H:%M:%S") if value else None


def credit_pending(status, denied, flags):
    if text(status) != "A Liberar" or text(denied) == "Sim":
        return []
    return [name for name, flag in zip(CREDIT_CHECKS, flags) if text(flag) == "Nao"]


def pending_orders(days):
    with pool.acquire() as conn:
        cur = conn.cursor()
        cur.execute(PENDING_ORDERS_SQL, days=days)
        return [{
            "id": str(order_id), "number": str(number or ""), "status": text(status), "release": text(release),
            "issuedAt": moment(issued), "updatedAt": moment(updated), "total": round(float(total or 0), 2),
            "customer": text(customer), "store": text(store), "seller": text(seller), "mode": text(mode),
            "credit": credit_pending(status, denied, flags),
        } for order_id, number, status, release, issued, updated, total, customer, store, seller, mode, denied, *flags
            in cur.fetchmany(MAX_ORDERS)]


def catalog_products():
    categories = ",".join(f":k{i}" for i in range(len(CATALOG_CATEGORIES)))
    with pool.acquire() as conn:
        conn.call_timeout = 180_000
        cur = conn.cursor()
        cur.arraysize = 5000
        cur.execute(CATALOG_SQL.format(categories=categories), {f"k{i}": name for i, name in enumerate(CATALOG_CATEGORIES)})
        items = []
        for row in cur:
            code = text(row[0])
            if not code:
                continue
            # A embalagem costuma repetir o próprio código como "código de barras": só vale EAN de verdade.
            ean = text(row[3])
            items.append([code, text(row[1]) or code, text(row[2]), ean if ean and ean != code else None, text(row[4]), text(row[5]), text(row[6]), text(row[7]),
                          text(row[8]), text(row[9]), text(row[10]), text(row[11]), int(row[12]) if row[12] else None,
                          price_value(row[13]), price_value(row[14]), price_value(row[15])])
        return items


def catalog_stock():
    with pool.acquire() as conn:
        conn.call_timeout = 60_000
        cur = conn.cursor()
        cur.arraysize = 5000
        cur.execute(CATALOG_STOCK_SQL)
        items = []
        for code, unit, name, available, reserved in cur:
            unit_code = str(int(unit)) if str(unit).isdigit() else str(unit)
            items.append([str(code), unit_code, (name or "").strip(), float(available or 0), float(reserved or 0)])
        return items


class Snapshot:
    """Retrato em memória com renovação em segundo plano: só a 1ª carga (ou um refresh) espera o Oracle."""

    def __init__(self, label, loader, ttl, min_refresh):
        self.label, self.loader, self.ttl, self.min_refresh = label, loader, ttl, min_refresh
        self.data, self.at, self.lock, self.refreshing = None, 0.0, threading.Lock(), False

    def _load(self):
        started = time.monotonic()
        items = self.loader()
        self.data, self.at = items, time.time()
        log(f"catálogo {self.label}: {len(items)} linhas em {time.monotonic() - started:.1f}s")

    def _background(self):
        try:
            with self.lock:
                self._load()
        except Exception as error:
            log(f"ERRO catálogo {self.label}: {str(error)[:200]}")
        finally:
            self.refreshing = False

    def get(self, refresh=False):
        if self.data is None or (refresh and time.time() - self.at > self.min_refresh):
            with self.lock:
                if self.data is None or (refresh and time.time() - self.at > self.min_refresh):
                    self._load()
        elif time.time() - self.at > self.ttl and not self.refreshing:
            self.refreshing = True
            threading.Thread(target=self._background, daemon=True).start()
        return {"at": int(self.at * 1000), "items": self.data}


catalog_cache = {
    "/catalog/products": Snapshot("produtos", catalog_products, ttl=3600, min_refresh=300),
    "/catalog/stock": Snapshot("estoque", catalog_stock, ttl=120, min_refresh=30),
}


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
        if url.path not in ("/stock", "/installments", "/events", "/punctuality", "/orders/pending", *catalog_cache):
            return self._send(404, {"error": "not_found"})
        if not TOKEN or not hmac.compare_digest(self.headers.get("x-api-key", ""), TOKEN):
            return self._send(401, {"error": "unauthorized"})
        if url.path in catalog_cache:
            refresh = parse_qs(url.query).get("refresh", [""])[0] == "1"
            try:
                return self._send(200, catalog_cache[url.path].get(refresh))
            except Exception as error:
                log(f"ERRO catálogo {url.path}: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
        if url.path == "/orders/pending":
            try:
                days = min(max(int(parse_qs(url.query).get("days", ["30"])[0]), 1), 365)
            except ValueError:
                return self._send(400, {"error": "days precisa ser número"})
            try:
                items = pending_orders(days)
            except Exception as error:
                log(f"ERRO pedidos a faturar: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
            return self._send(200, {"at": int(time.time() * 1000), "items": items})
        if url.path == "/punctuality":
            query = parse_qs(url.query)
            try:
                months = min(max(int(query.get("months", ["24"])[0]), 1), 120)
                grace = min(max(int(query.get("grace", ["0"])[0]), 0), 30)
            except ValueError:
                return self._send(400, {"error": "months e grace precisam ser números"})
            started = time.monotonic()
            try:
                items = punctuality(months, grace)
            except Exception as error:
                log(f"ERRO pontualidade: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
            log(f"pontualidade {months}m +{grace}d: {len(items)} CPFs em {time.monotonic() - started:.2f}s")
            return self._send(200, {"items": items})
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
