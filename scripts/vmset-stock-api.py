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
GET /orders/pending?days=30  (cabeçalho x-api-key)  ->  {"at", "items": [{"id", "number", "status", "release", "issuedAt", "updatedAt", "total", "customer", "store", "seller", "mode"}]}
  - pedidos de venda ativos ainda não faturados (A Liberar / Reservado) para o painel de pedidos;
GET /orders/credit?days=30  (cabeçalho x-api-key)  ->  {"at", "items": [{"id", "orderId", "number", "issuedAt", "sentAt", "analysisAt", "analyst", "note", "total", "customer", "customerCode", "store", "storeCode", "seller"}]}
  - fila de autorização de crédito (SOLICITACAO_AUTZ_VENDA): pedidos A Liberar enviados pela loja ao financeiro e ainda sem resposta;
  - "id" é a solicitação (um pedido reenviado gera nova solicitação), "analysisAt" = financeiro abriu a solicitação;
  - também "uf"/"city" da loja e "attempt" (1 = primeiro envio, 2+ = reenvio);
GET /orders/credit/history?date=YYYY-MM-DD  (cabeçalho x-api-key)  ->  {"at", "items": [{"id", "number", "sentAt", "analysisAt", "answeredAt", "analyst", "store", "storeCode", "uf", "status", "denied", "total"}]}
  - solicitações de crédito enviadas no dia (resumo do painel: tempo de resposta, por analista, por loja);
GET /sales/today  (cabeçalho x-api-key)  ->  {"at", "day", "items": [{"id", "store", "order", "invoice", "date", "time", "seller", "customer", "cpf", "phone", "brand", "description", "category", "quantity", "amount", "payment", "terms", "orderTotal"}]}
GET /sales/range?from=YYYY-MM-DD&to=YYYY-MM-DD  (cabeçalho x-api-key)  ->  {"at", "from", "to", "items": [...mesmo formato]} (até 93 dias)
  - itens das vendas faturadas (PEDIDO_SAIDA, emissão em horário de Brasília) para o painel ao vivo e os períodos;
    Oracle no máximo a cada 10 s (hoje), 60 s (período com hoje) ou 10 min (período fechado);
GET /sellers/active?days=60  (cabeçalho x-api-key)  ->  {"at", "days", "items": [{"id", "name", "store", "stores", "orders", "amount", "lastSale"}]}
  - vendedores ativos com venda no período (cadastro de vendedores e metas do CRM); loja principal = a que mais vendeu;
GET /orders/credit/customer?order=PEDIDO_SAIDA_ID  (cabeçalho x-api-key)  ->  {"customer", "order", "receivables", "purchases", "requests"}
  - ficha do cliente para decidir o crédito: situação/SPC, plano do pedido, parcelas em aberto/atrasadas, pontualidade, compras;
GET /health

Roda no host como serviço (crm-vmset-stock.service). Ambiente: ORACLE_USER, ORACLE_PASSWORD, ORACLE_DSN,
ORACLE_LIB_DIR (de /etc/crm-vmset-sync.env) e STOCK_API_TOKEN, STOCK_API_PORT (de /etc/crm-vmset-stock.env).
"""
import datetime
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
       PS.PDSD_VLR_TOTAL, P.PRCR_NOME, UE.PRCR_NOME, V.PRCR_NOME, PS.PDSD_MODO_VD
FROM PEDIDO_SAIDA PS
LEFT JOIN PARCEIRO P ON P.PARCEIRO_ID = PS.PARCEIRO_ID
LEFT JOIN PARCEIRO UE ON UE.PARCEIRO_ID = PS.UNIDADE_EMPRESARIAL_ID
LEFT JOIN PARCEIRO V ON V.PARCEIRO_ID = PS.VENDEDOR_COMPRADOR_ID
WHERE PS.PDSD_STATUS IN ('A Liberar', 'Reservado') AND TRIM(PS.STATUS) = 'Ativo'
  AND PS.PDSD_DT_EMISSAO >= TRUNC(SYSDATE) - :days
ORDER BY PS.PDSD_DT_EMISSAO DESC
"""
MAX_ORDERS = 2000

# Fila de autorização de crédito do VMSet (mesma regra da tela do financeiro): solicitação enviada pela loja
# (SOAV_DT_SAIDA_LOJA) e ainda não devolvida pelo crédito, pedido A Liberar ativo e sem crédito negado.
CREDIT_QUEUE_SQL = """
SELECT SAV.SOLICITACAO_AUTZ_VENDA_ID, PS.PEDIDO_SAIDA_ID, PS.PDSD_NR_PEDIDO, PS.PDSD_DT_EMISSAO,
       SAV.SOAV_DT_SAIDA_LOJA, SAV.SOAV_DT_ENTR_CRED, F.PRCR_NOME, SAV.SOAV_OBSERVACAO, PS.PDSD_VLR_TOTAL,
       P.PRCR_NOME, P.PRCR_CODIGO_CLIENTE, UEP.PRCR_NOME, UE.UNEM_CODIGO, V.PRCR_NOME, PS.UNIDADE_EMPRESARIAL_ID,
       (SELECT COUNT(*) FROM SOLICITACAO_AUTZ_VENDA S2 WHERE S2.PEDIDO_SAIDA_ID = SAV.PEDIDO_SAIDA_ID
          AND S2.SOAV_DT_SAIDA_LOJA <= SAV.SOAV_DT_SAIDA_LOJA)
FROM SOLICITACAO_AUTZ_VENDA SAV
JOIN PEDIDO_SAIDA PS ON PS.PEDIDO_SAIDA_ID = SAV.PEDIDO_SAIDA_ID
JOIN UNIDADE_EMPRESARIAL UE ON UE.UNIDADE_EMPRESARIAL_ID = PS.UNIDADE_EMPRESARIAL_ID
LEFT JOIN PARCEIRO UEP ON UEP.PARCEIRO_ID = PS.UNIDADE_EMPRESARIAL_ID
LEFT JOIN PARCEIRO P ON P.PARCEIRO_ID = PS.PARCEIRO_ID
LEFT JOIN PARCEIRO V ON V.PARCEIRO_ID = PS.VENDEDOR_COMPRADOR_ID
LEFT JOIN PARCEIRO F ON F.PARCEIRO_ID = SAV.FUNCIONARIO_ID
WHERE (SAV.FUNCIONARIO_ID IS NULL OR SAV.SOAV_DT_SAIDA_CRED IS NULL)
  AND SAV.SOAV_DT_SAIDA_LOJA IS NOT NULL
  AND PS.PDSD_STATUS = 'A Liberar' AND TRIM(PS.STATUS) = 'Ativo'
  AND NVL(PS.PDSD_NEGADO_CREDITO, 'Nao') = 'Nao'
  AND PS.PDSD_DT_EMISSAO >= TRUNC(SYSDATE) - :days
ORDER BY SAV.SOAV_DT_SAIDA_LOJA
"""

# Solicitações de crédito enviadas pelas lojas num dia (resumo do painel do financeiro).
CREDIT_HISTORY_SQL = """
SELECT SAV.SOLICITACAO_AUTZ_VENDA_ID, PS.PDSD_NR_PEDIDO, SAV.SOAV_DT_SAIDA_LOJA, SAV.SOAV_DT_ENTR_CRED,
       SAV.SOAV_DT_SAIDA_CRED, F.PRCR_NOME, UEP.PRCR_NOME, UE.UNEM_CODIGO, PS.UNIDADE_EMPRESARIAL_ID, PS.PDSD_STATUS,
       PS.PDSD_NEGADO_CREDITO, PS.PDSD_VLR_TOTAL
FROM SOLICITACAO_AUTZ_VENDA SAV
JOIN PEDIDO_SAIDA PS ON PS.PEDIDO_SAIDA_ID = SAV.PEDIDO_SAIDA_ID
JOIN UNIDADE_EMPRESARIAL UE ON UE.UNIDADE_EMPRESARIAL_ID = PS.UNIDADE_EMPRESARIAL_ID
LEFT JOIN PARCEIRO UEP ON UEP.PARCEIRO_ID = PS.UNIDADE_EMPRESARIAL_ID
LEFT JOIN PARCEIRO F ON F.PARCEIRO_ID = SAV.FUNCIONARIO_ID
WHERE SAV.SOAV_DT_SAIDA_LOJA >= :d AND SAV.SOAV_DT_SAIDA_LOJA < :d + 1
ORDER BY SAV.SOAV_DT_SAIDA_LOJA
"""

# UF/cidade de cada loja pelo endereço cadastrado (bairro ou CEP -> cidade -> estado).
STORE_PLACE_SQL = """
SELECT UE.UNIDADE_EMPRESARIAL_ID, MAX(P.PRCR_NOME), MAX(ES.ESTD_SIGLA), MAX(CI.CDDE_NOME)
FROM UNIDADE_EMPRESARIAL UE
JOIN PARCEIRO P ON P.PARCEIRO_ID = UE.UNIDADE_EMPRESARIAL_ID
LEFT JOIN ENDERECO EN ON EN.PARCEIRO_ID = UE.UNIDADE_EMPRESARIAL_ID
LEFT JOIN BAIRRO B ON B.BAIRRO_ID = EN.BAIRRO_ID
LEFT JOIN CEP C ON C.CEP_ID = EN.CEP_ID
LEFT JOIN CIDADE CI ON CI.CIDADE_ID = NVL(B.CIDADE_ID, C.CIDADE_ID)
LEFT JOIN ESTADO ES ON ES.ESTADO_ID = CI.ESTADO_ID
GROUP BY UE.UNIDADE_EMPRESARIAL_ID
"""
STORE_PLACE_TTL = 3600
store_place_cache = {"at": 0, "map": {}}

# Ficha do cliente para a decisão de crédito (pedido -> cliente).
CUSTOMER_SQL = """
SELECT PS.PARCEIRO_ID, P.PRCR_NOME, P.PRCR_CODIGO_CLIENTE, P.PRCR_CGC_CPF, P.DATA_INCLUSAO, PC.PRCL_SITUACAO,
       PC.PRCL_QTDE_RESTRICOES_SPC, PC.PRCL_DT_ULT_CONS_SPC, PS.PDSD_NR_PEDIDO, PS.PDSD_VLR_TOTAL, D.TPDC_DESCRICAO,
       CP.CDPG_DESCRICAO
FROM PEDIDO_SAIDA PS
JOIN PARCEIRO P ON P.PARCEIRO_ID = PS.PARCEIRO_ID
LEFT JOIN PARAM_CLIENTE PC ON PC.PARAM_CLIENTE_ID = PS.PARCEIRO_ID
LEFT JOIN TIPO_DOCUMENTO D ON D.TIPO_DOCUMENTO_ID = PS.TIPO_DOCTO_PAGO1_ID
LEFT JOIN CONDICAO_PAGTO CP ON CP.CONDICAO_PAGTO_ID = PS.CONDICAO_PAGTO_ID
WHERE PS.PEDIDO_SAIDA_ID = :id
"""
ORDER_PLAN_SQL = """
SELECT PCPS_NR_PARCELA, PCPS_DT_VENCTO, PCPS_VALOR FROM PARCELA_PEDIDO_SAIDA
WHERE PEDIDO_SAIDA_ID = :id AND NVL(TRIM(STATUS), 'Ativo') LIKE 'Ativo%'
ORDER BY PCPS_NR_PARCELA
"""
# Títulos a receber do cliente (carnê/boleto/crédito interno), últimos 5 anos, sem cancelados.
CUSTOMER_TITLES_SQL = """
SELECT T.TITL_NUMERO, T.TITL_PARCELA, T.TITL_DT_VENCTO, T.TITL_VALOR, T.TITL_POSICAO, T.TITL_DT_PAGTO,
       T.TITL_VLR_PAGTO, MAX(LJ.PRCR_NOME)
FROM TITULO T
JOIN FATURA F ON F.FATURA_ID = T.FATURA_ID AND F.FTRA_TIPO = 'Recebimento'
JOIN TIPO_DOCUMENTO D ON D.TIPO_DOCUMENTO_ID = T.TIPO_DOCUMENTO_ID AND D.TPDC_DESCRICAO IN ('CARNE', 'BOLETO BANCARIO', 'CREDITO INTERNO')
LEFT JOIN PARCEIRO LJ ON LJ.PARCEIRO_ID = T.UNIDADE_MANTENEDORA_ID
WHERE T.PARCEIRO_ID = :p AND T.STATUS LIKE 'Ativo%' AND T.TITL_POSICAO <> 'Cancelado'
  AND T.TITL_DT_VENCTO >= ADD_MONTHS(TRUNC(SYSDATE), -60)
GROUP BY T.TITULO_ID, T.TITL_NUMERO, T.TITL_PARCELA, T.TITL_DT_VENCTO, T.TITL_VALOR, T.TITL_POSICAO, T.TITL_DT_PAGTO, T.TITL_VLR_PAGTO
ORDER BY T.TITL_DT_VENCTO
"""
CUSTOMER_PURCHASES_SQL = """
SELECT * FROM (
  SELECT PS.PDSD_NR_PEDIDO, PS.PDSD_DT_EMISSAO, PS.PDSD_VLR_TOTAL, UEP.PRCR_NOME, D.TPDC_DESCRICAO
  FROM PEDIDO_SAIDA PS
  LEFT JOIN PARCEIRO UEP ON UEP.PARCEIRO_ID = PS.UNIDADE_EMPRESARIAL_ID
  LEFT JOIN TIPO_DOCUMENTO D ON D.TIPO_DOCUMENTO_ID = PS.TIPO_DOCTO_PAGO1_ID
  WHERE PS.PARCEIRO_ID = :p AND PS.PDSD_STATUS = 'Faturado' AND TRIM(PS.STATUS) = 'Ativo'
  ORDER BY PS.PDSD_DT_EMISSAO DESC
) WHERE ROWNUM <= 6
"""
CUSTOMER_PURCHASE_TOTALS_SQL = """
SELECT COUNT(*), SUM(PDSD_VLR_TOTAL), MIN(PDSD_DT_EMISSAO) FROM PEDIDO_SAIDA
WHERE PARCEIRO_ID = :p AND PDSD_STATUS = 'Faturado' AND TRIM(STATUS) = 'Ativo'
"""
CUSTOMER_REQUESTS_SQL = """
SELECT COUNT(*), SUM(CASE WHEN PS.PDSD_NEGADO_CREDITO = 'Sim' THEN 1 ELSE 0 END)
FROM SOLICITACAO_AUTZ_VENDA SAV JOIN PEDIDO_SAIDA PS ON PS.PEDIDO_SAIDA_ID = SAV.PEDIDO_SAIDA_ID
WHERE PS.PARCEIRO_ID = :p AND PS.PEDIDO_SAIDA_ID <> :id
"""
ORDER_ID = re.compile(r"^[A-Za-z0-9]{1,40}$")


def moment(value):
    return value.strftime("%Y-%m-%dT%H:%M:%S") if value else None


def pending_orders(days):
    with pool.acquire() as conn:
        cur = conn.cursor()
        cur.execute(PENDING_ORDERS_SQL, days=days)
        return [{
            "id": str(order_id), "number": str(number or ""), "status": text(status), "release": text(release),
            "issuedAt": moment(issued), "updatedAt": moment(updated), "total": round(float(total or 0), 2),
            "customer": text(customer), "store": text(store), "seller": text(seller), "mode": text(mode),
        } for order_id, number, status, release, issued, updated, total, customer, store, seller, mode in cur.fetchmany(MAX_ORDERS)]


def store_places(conn):
    """{UNIDADE_EMPRESARIAL_ID: (uf, cidade)}; loja sem endereço no VMSet cai na UF pelo nome (OTICAS BRASIL TO, -ZVC = GO)."""
    if time.time() - store_place_cache["at"] < STORE_PLACE_TTL:
        return store_place_cache["map"]
    cur = conn.cursor()
    cur.execute(STORE_PLACE_SQL)
    places = {}
    for store_id, name, uf, city in cur.fetchall():
        name = text(name) or ""
        if not uf:
            uf = "TO" if " TO " in f" {name} " else "GO" if "-ZVC" in name else None
        places[str(store_id)] = (text(uf), text(city))
    store_place_cache.update(at=time.time(), map=places)
    return places


def credit_queue(days):
    with pool.acquire() as conn:
        places = store_places(conn)
        cur = conn.cursor()
        cur.execute(CREDIT_QUEUE_SQL, days=days)
        return [{
            "id": str(request_id), "orderId": str(order_id), "number": str(number or ""), "issuedAt": moment(issued),
            "sentAt": moment(sent), "analysisAt": moment(analysis), "analyst": text(analyst), "note": text(note),
            "total": round(float(total or 0), 2), "customer": text(customer), "customerCode": text(customer_code),
            "store": text(store), "storeCode": text(store_code), "seller": text(seller),
            "uf": places.get(str(store_id), (None, None))[0], "city": places.get(str(store_id), (None, None))[1],
            "attempt": int(attempt or 1),
        } for request_id, order_id, number, issued, sent, analysis, analyst, note, total, customer, customer_code,
            store, store_code, seller, store_id, attempt in cur.fetchmany(MAX_ORDERS)]


def credit_history(date):
    with pool.acquire() as conn:
        conn.call_timeout = 15_000
        places = store_places(conn)
        cur = conn.cursor()
        cur.execute(CREDIT_HISTORY_SQL, d=date)
        return [{
            "id": str(request_id), "number": str(number or ""), "sentAt": moment(sent), "analysisAt": moment(analysis),
            "answeredAt": moment(answered), "analyst": text(analyst), "store": text(store), "storeCode": text(store_code),
            "uf": places.get(str(store_id), (None, None))[0], "status": text(status), "denied": text(denied) == "Sim",
            "total": round(float(total or 0), 2),
        } for request_id, number, sent, analysis, answered, analyst, store, store_code, store_id, status, denied, total
            in cur.fetchmany(MAX_ORDERS)]


def credit_customer(order_id):
    with pool.acquire() as conn:
        conn.call_timeout = 15_000
        cur = conn.cursor()
        cur.execute(CUSTOMER_SQL, id=order_id)
        row = cur.fetchone()
        if not row:
            return None
        (partner, name, code, cpf, since, rating, spc_count, spc_at, number, total, doc_type, condition) = row
        cur.execute(ORDER_PLAN_SQL, id=order_id)
        plan = [{"n": int(n or 0), "due": day(due), "value": money(value)} for n, due, value in cur.fetchall()]

        cur.execute(CUSTOMER_TITLES_SQL, p=partner)
        today = datetime.date.today()
        open_items, paid, on_time, delays, last_payment = [], 0, 0, [], None
        for numero, parcela, due, value, position, paid_at, paid_value, store in cur.fetchmany(2000):
            position = text(position) or ""
            if position in ("Aberto", "Recebendo"):
                remaining = float(value or 0) - (float(paid_value or 0) if position == "Recebendo" else 0)
                late = (today - due.date()).days if due and due.date() < today else 0
                open_items.append({"numero": str(numero or ""), "parcela": str(parcela or ""), "due": day(due),
                                   "value": round(max(remaining, 0), 2), "lateDays": late, "store": text(store)})
            elif position == "Quitado" and paid_at and due and due.date() < today:
                paid += 1
                delay = max((paid_at.date() - due.date()).days, 0)
                delays.append(delay)
                on_time += delay == 0
            if paid_at and (not last_payment or paid_at > last_payment):
                last_payment = paid_at
        overdue = [t for t in open_items if t["lateDays"] > 0]

        cur.execute(CUSTOMER_PURCHASE_TOTALS_SQL, p=partner)
        bought, spent, first = cur.fetchone()
        cur.execute(CUSTOMER_PURCHASES_SQL, p=partner)
        purchases = [{"number": str(n or ""), "date": day(d), "total": money(v), "store": text(s), "payment": text(t)}
                     for n, d, v, s, t in cur.fetchall()]
        cur.execute(CUSTOMER_REQUESTS_SQL, p=partner, id=order_id)
        requests, denied = cur.fetchone()
        return {
            "customer": {"name": text(name), "code": text(code), "cpf": text(cpf), "since": day(since), "rating": text(rating),
                         "spcRestrictions": int(spc_count) if spc_count is not None else None, "spcCheckedAt": day(spc_at)},
            "order": {"number": str(number or ""), "total": money(total), "payment": text(doc_type), "condition": text(condition),
                      "plan": plan},
            "receivables": {
                "openCount": len(open_items), "openValue": round(sum(t["value"] for t in open_items), 2),
                "overdueCount": len(overdue), "overdueValue": round(sum(t["value"] for t in overdue), 2),
                "maxLateDays": max((t["lateDays"] for t in overdue), default=0),
                "paidCount": paid, "paidOnTime": on_time,
                "avgDelayDays": round(sum(delays) / len(delays), 1) if delays else None,
                "lastPaymentAt": day(last_payment),
                "open": sorted(open_items, key=lambda t: t["due"] or "")[:30],
            },
            "purchases": {"count": int(bought or 0), "total": money(spent), "firstAt": day(first), "last": purchases},
            "requests": {"previous": int(requests or 0), "denied": int(denied or 0)},
        }


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


# Vendas faturadas (painel ao vivo e períodos do CRM): fonte oficial = PEDIDO_SAIDA faturado e ativo, pela data/hora
# de emissão do pedido (relógio do Oracle = horário de Brasília). A tabela de BI tab_dados_dinamicos deixava de fora
# ~20% dos pedidos (lentes/serviços ainda sem movimento de estoque). Um registro por item; o valor do pedido é
# PDSD_VLR_TOTAL (líquido, já com descontos) e vai repetido em "orderTotal" para não somar duas vezes.
# Fora: cancelados/abertos/inconsistentes, transferências entre lojas (cliente = unidade da rede) e depósitos.
# "A Liberar" (venda feita aguardando liberação de desconto/crédito) conta como no relatório de vendas do VMSET:
# só "Faturado" deixava ~R$ 20 mil de fora em 26/11/2026 (R$ 133.871,56 no painel x R$ 153.947,14 no VMSET).
SALES_SQL = """
SELECT NVL(TO_CHAR(I.ITEM_PEDIDO_SAIDA_ID), 'P' || PS.PEDIDO_SAIDA_ID), UE.UNEM_CODIGO, PS.PDSD_NR_PEDIDO,
       PS.PDSD_DT_EMISSAO, V.PRCR_NOME, P.PRCR_NOME, P.PRCR_CGC_CPF, P.PRCR_CELULAR, P.PRCR_FONE, M.MARC_DESCRICAO,
       PR.PRDT_DESCRICAO, CP.CATG_DESCRICAO, I.PSIT_QTDE_PEDIDA,
       I.PSIT_QTDE_PEDIDA * I.PSIT_PRC_UNIT - NVL(I.PSIT_VLR_DESCTO, 0) - NVL(I.PSIT_VLR_DESCTO_ADICIONAL, 0)
         + NVL(I.PSIT_VLR_DESP, 0) + NVL(I.PSIT_VLR_FRETE, 0) + NVL(I.PSIT_VLR_JURO, 0),
       D.TPDC_DESCRICAO, CPG.CDPG_DESCRICAO, PS.PDSD_VLR_TOTAL
FROM PEDIDO_SAIDA PS
JOIN UNIDADE_EMPRESARIAL UE ON UE.UNIDADE_EMPRESARIAL_ID = PS.UNIDADE_EMPRESARIAL_ID
LEFT JOIN ITEM_PEDIDO_SAIDA I ON I.PEDIDO_SAIDA_ID = PS.PEDIDO_SAIDA_ID
LEFT JOIN PRODUTO PR ON PR.PRODUTO_ID = I.PRODUTO_ID
LEFT JOIN SUBCATEGORIA_PRODUTO SP ON SP.SUBCATEGORIA_PRODUTO_ID = PR.SUBCATEGORIA_PRODUTO_ID
LEFT JOIN CATEGORIA_PRODUTO CP ON CP.CATEGORIA_PRODUTO_ID = SP.CATEGORIA_PRODUTO_ID
LEFT JOIN MARCAS M ON M.MARCA_ID = PR.MARCA_ID
LEFT JOIN PARCEIRO P ON P.PARCEIRO_ID = PS.PARCEIRO_ID
LEFT JOIN PARCEIRO V ON V.PARCEIRO_ID = PS.VENDEDOR_COMPRADOR_ID
LEFT JOIN TIPO_DOCUMENTO D ON D.TIPO_DOCUMENTO_ID = PS.TIPO_DOCTO_PAGO1_ID
LEFT JOIN CONDICAO_PAGTO CPG ON CPG.CONDICAO_PAGTO_ID = PS.CONDICAO_PAGTO_ID
WHERE PS.PDSD_STATUS IN ('Faturado', 'A Liberar') AND TRIM(PS.STATUS) = 'Ativo'
  AND PS.PDSD_DT_EMISSAO >= :a AND PS.PDSD_DT_EMISSAO < :b
  AND NOT EXISTS (SELECT 1 FROM UNIDADE_EMPRESARIAL U WHERE U.UNIDADE_EMPRESARIAL_ID = PS.PARCEIRO_ID)
  AND TO_NUMBER(UE.UNEM_CODIGO) NOT BETWEEN 100 AND 199
  AND TO_NUMBER(UE.UNEM_CODIGO) NOT BETWEEN 1000 AND 2999
"""
MAX_SALES_DAYS = 93


def digits(value, pad=0):
    """Só dígitos (CPF numérico no Oracle perde o zero à esquerda: volta com pad)."""
    if value is None:
        return None
    raw = str(int(value)) if isinstance(value, (int, float)) else re.sub(r"\D", "", str(value))
    if pad and 9 <= len(raw) < pad:
        raw = raw.zfill(pad)
    return raw or None


def sale_item(row):
    (item_id, store, order, issued, seller, customer, cpf, mobile, phone, brand, description, category,
     quantity, amount, payment, terms, total) = row
    return {
        "id": text(item_id), "store": text(store), "order": text(order), "invoice": None,
        "date": issued.strftime("%Y-%m-%d") if issued else None, "time": issued.strftime("%H:%M:%S") if issued else None,
        "seller": text(seller), "customer": text(customer), "cpf": digits(cpf, 11),
        "phone": digits(mobile) or digits(phone), "brand": text(brand),
        "description": text(description), "category": text(category), "quantity": float(quantity or 0),
        # Pedido sem item (raro): a linha única leva o total do pedido.
        "amount": round(float(total if quantity is None else (amount or 0)), 2), "payment": text(payment), "terms": text(terms),
        "orderTotal": round(float(total or 0), 2),
    }


def sales_between(start, end):
    """Itens das vendas faturadas com emissão em [start, end) (datas de Brasília)."""
    with pool.acquire() as conn:
        cur = conn.cursor()
        cur.execute(SALES_SQL, a=datetime.datetime.combine(start, datetime.time()), b=datetime.datetime.combine(end, datetime.time()))
        return [item for item in (sale_item(row) for row in cur.fetchall()) if item["id"]]


class SalesCache:
    """Vendas por período em memória: o Oracle é consultado no máximo uma vez por janela (hoje a cada 10 s, períodos
    que incluem hoje a cada 60 s, períodos fechados a cada 10 min), não importa quantos navegadores estejam abertos."""

    def __init__(self):
        self.lock = threading.Lock()
        self.entries = {}

    def get(self, start, end):
        today = datetime.date.today()
        ttl = 10 if (start, end) == (today, today + datetime.timedelta(days=1)) else 60 if end > today else 600
        key = (start, end)
        with self.lock:
            entry = self.entries.get(key)
            if not entry or time.time() - entry["at"] >= ttl:
                entry = {"at": time.time(), "items": sales_between(start, end)}
                self.entries = {k: v for k, v in self.entries.items() if time.time() - v["at"] < 600}
                self.entries[key] = entry
            return entry


sales_cache = SalesCache()

# Vendedores ativos com venda no período (cadastro de vendedores e metas do CRM). Exclui a própria loja lançada
# como vendedor ("LJ 01 UNILENTES...": VENDEDOR_ID que é uma UNIDADE_EMPRESARIAL).
ACTIVE_SELLERS_SQL = """
SELECT T.VENDEDOR_ID, MAX(P.PRCR_NOME), T.LOJA, COUNT(DISTINCT T.NUM_PEDIDO), SUM(T.VALOR_ITEM_VENDA), MAX(T.DATA_PEDIDO),
       MAX(P.PRCR_CGC_CPF), MAX(LOWER(TRIM(P.PRCR_E_MAIL))), MAX(LOWER(TRIM(P.PRCR_E_MAIL2)))
FROM tab_dados_dinamicos T
JOIN PARCEIRO P ON P.PARCEIRO_ID = T.VENDEDOR_ID
WHERE T.TIPO = 'Venda' AND T.DATA_PEDIDO >= TRUNC(SYSDATE) - :d AND P.STATUS = 'Ativo'
  AND NOT EXISTS (SELECT 1 FROM UNIDADE_EMPRESARIAL U WHERE U.UNIDADE_EMPRESARIAL_ID = T.VENDEDOR_ID)
GROUP BY T.VENDEDOR_ID, T.LOJA
"""


def active_sellers(days):
    """[{id, name, cpf, emails, store, stores, orders, amount, lastSale}]: loja principal = a que mais vendeu no período.
    cpf e emails (cadastro do parceiro) ligam o vendedor ao usuário do CRM."""
    with pool.acquire() as conn:
        cur = conn.cursor()
        cur.execute(ACTIVE_SELLERS_SQL, d=days)
        rows = cur.fetchall()
    sellers = {}
    for seller_id, name, store, orders, amount, last, cpf, email, email2 in rows:
        if not seller_id:
            continue
        digits = re.sub(r"\D", "", text(cpf) or "")
        emails = sorted({value for value in (text(email), text(email2)) if value and "@" in value})
        entry = sellers.setdefault(seller_id, {"id": text(seller_id), "name": text(name), "cpf": digits or None, "emails": emails, "byStore": {}, "orders": 0, "amount": 0.0, "lastSale": None})
        value = float(amount or 0)
        if store:
            entry["byStore"][text(store)] = entry["byStore"].get(text(store), 0.0) + value
        entry["orders"] += int(orders or 0)
        entry["amount"] += value
        day_value = day(last)
        if day_value and (entry["lastSale"] is None or day_value > entry["lastSale"]):
            entry["lastSale"] = day_value
    items = []
    for entry in sellers.values():
        ranked = sorted(entry.pop("byStore").items(), key=lambda pair: pair[1], reverse=True)
        entry["store"] = ranked[0][0] if ranked else None
        entry["stores"] = [store for store, _ in ranked]
        entry["amount"] = round(entry["amount"], 2)
        items.append(entry)
    return sorted(items, key=lambda item: item["name"] or "")

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
        if url.path not in ("/stock", "/installments", "/events", "/punctuality", "/orders/pending", "/orders/credit",
                            "/orders/credit/history", "/orders/credit/customer", "/sales/today", "/sales/range", "/sellers/active", *catalog_cache):
            return self._send(404, {"error": "not_found"})
        if not TOKEN or not hmac.compare_digest(self.headers.get("x-api-key", ""), TOKEN):
            return self._send(401, {"error": "unauthorized"})
        if url.path == "/sellers/active":
            try:
                days = min(max(int(parse_qs(url.query).get("days", ["60"])[0]), 1), 365)
            except ValueError:
                return self._send(400, {"error": "days precisa ser número"})
            try:
                return self._send(200, {"at": int(time.time() * 1000), "days": days, "items": active_sellers(days)})
            except Exception as error:
                log(f"ERRO vendedores ativos: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
        if url.path == "/sales/today":
            today = datetime.date.today()
            try:
                entry = sales_cache.get(today, today + datetime.timedelta(days=1))
                return self._send(200, {"at": int(entry["at"] * 1000), "day": today.isoformat(), "items": entry["items"]})
            except Exception as error:
                log(f"ERRO vendas do dia: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
        if url.path == "/sales/range":
            query = parse_qs(url.query)
            try:
                start = datetime.date.fromisoformat(query.get("from", [""])[0])
                last = datetime.date.fromisoformat(query.get("to", [""])[0])
            except ValueError:
                return self._send(400, {"error": "from e to precisam ser YYYY-MM-DD"})
            if last < start or (last - start).days >= MAX_SALES_DAYS:
                return self._send(400, {"error": f"período inválido (até {MAX_SALES_DAYS} dias)"})
            try:
                entry = sales_cache.get(start, last + datetime.timedelta(days=1))
                return self._send(200, {"at": int(entry["at"] * 1000), "from": start.isoformat(), "to": last.isoformat(), "items": entry["items"]})
            except Exception as error:
                log(f"ERRO vendas do período: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
        if url.path in catalog_cache:
            refresh = parse_qs(url.query).get("refresh", [""])[0] == "1"
            try:
                return self._send(200, catalog_cache[url.path].get(refresh))
            except Exception as error:
                log(f"ERRO catálogo {url.path}: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
        if url.path in ("/orders/pending", "/orders/credit"):
            try:
                days = min(max(int(parse_qs(url.query).get("days", ["30"])[0]), 1), 365)
            except ValueError:
                return self._send(400, {"error": "days precisa ser número"})
            try:
                items = pending_orders(days) if url.path == "/orders/pending" else credit_queue(days)
            except Exception as error:
                log(f"ERRO pedidos {url.path}: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
            return self._send(200, {"at": int(time.time() * 1000), "items": items})
        if url.path == "/orders/credit/history":
            try:
                date = datetime.datetime.strptime(parse_qs(url.query).get("date", [""])[0], "%Y-%m-%d")
            except ValueError:
                return self._send(400, {"error": "date precisa ser YYYY-MM-DD"})
            try:
                items = credit_history(date)
            except Exception as error:
                log(f"ERRO histórico de crédito: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
            return self._send(200, {"at": int(time.time() * 1000), "items": items})
        if url.path == "/orders/credit/customer":
            order_id = parse_qs(url.query).get("order", [""])[0]
            if not ORDER_ID.match(order_id):
                return self._send(400, {"error": "order inválido"})
            try:
                data = credit_customer(order_id)
            except Exception as error:
                log(f"ERRO ficha do cliente: {str(error)[:200]}")
                return self._send(503, {"error": "oracle_unavailable"})
            return self._send(200, data) if data else self._send(404, {"error": "pedido não encontrado"})
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
