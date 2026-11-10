#!/usr/bin/env python3
"""Sincroniza as vendas do VMSet (Oracle) com o banco do CRM quase em tempo real.

REGRA: apenas SELECT no Oracle. Nenhuma escrita na VMSET.

Roda no host de produção como serviço (crm-vmset-sync.service):
  - a cada 60 s: busca só as linhas novas pelo índice único do Oracle (ITEM_MOVI_ESTOQUE_ID), consulta leve;
  - a cada 2 h: reconcilia os últimos 62 dias (alterações e cancelamentos) e atualiza o resumo diário;
  - 1x por dia (a partir das 03h) e na primeira execução: espelho completo da tabela.

Uso manual: vmset-sync.py --once DIAS | --new | --full

Ambiente: ORACLE_USER, ORACLE_PASSWORD, ORACLE_DSN, ORACLE_LIB_DIR, PG_CONTAINER (padrão crm-postgres).
O Postgres é acessado pelo psql do container (credenciais do próprio container).
"""
import csv
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import time

import oracledb

PG_CONTAINER = os.environ.get("PG_CONTAINER", "crm-postgres")
SLOW_DAYS = 62
FAST_EVERY, SLOW_EVERY = 60, 7200
FULL_HOUR = 3

# Colunas que identificam uma linha do Oracle (dados voláteis como idade ficam de fora).
KEY_COLS = [
    "ITEM_MOVI_ESTOQUE_ID", "LOJA", "NUM_PEDIDO", "NUM_NOTA", "SERIE_NOTA", "DATA_PEDIDO", "DATA_NOTA", "TIPO",
    "CODIGO", "QTDE_ITEM_VENDA", "VALOR_ITEM_VENDA", "VLR_DESCONTO", "VALOR_TOTAL", "PAGTO", "VL_PAGTO",
    "COND_PAGTO", "PARCEIRO_ID", "VENDEDOR_ID", "NOME_CATEGORIA",
]
SALE_COLS = [
    "key", "sourceKey", "partnerId", "customerName", "store", "seller", "orderNumber", "invoiceNumber",
    "orderDate", "invoiceDate", "type", "category", "subcategory", "productCode", "description", "brand",
    "quantity", "amount", "discount", "payment", "paymentTerms", "paymentAmount", "itemMovementId",
]
EXTRA_COLS = ["cpf", "phone", "email", "city", "neighborhood", "state", "raw"]


def log(message):
    print(f"[{dt.datetime.now():%Y-%m-%d %H:%M:%S}] {message}", flush=True)


def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).replace("\x00", "").strip()
    return text or None


def number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    text = re.sub(r"[^0-9,.-]", "", str(value))
    if re.fullmatch(r"-?[0-9][0-9.]*,[0-9]{1,2}", text):
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def day(value):
    if isinstance(value, dt.datetime):
        return value.date().isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    return None


def source_key(row):
    cpf = re.sub(r"\D", "", clean(row.get("PARCEIRO_CPF")) or "")
    if cpf:
        return f"cpf:{cpf}"
    email = (clean(row.get("EMAIL")) or "").lower()
    if email:
        return f"email:{email}"
    phone = re.sub(r"\D", "", clean(row.get("CELULAR")) or clean(row.get("TELEFONE")) or "")
    return f"phone:{phone}" if phone else None


def json_value(value):
    # Mesmo formato da importação antiga (datas em ISO UTC, meia-noite de Brasília).
    if isinstance(value, dt.datetime):
        return (value + dt.timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def to_record(row, ordinal, raw_since):
    key_text = "|".join(clean(row.get(col)) or "" for col in KEY_COLS)
    digest = hashlib.sha1(key_text.encode("utf-8")).hexdigest()
    n = ordinal.get(digest, 0) + 1
    ordinal[digest] = n
    skey = source_key(row)
    order_day = day(row.get("DATA_PEDIDO"))
    recent = order_day is not None and order_day >= raw_since
    raw = None
    if recent and skey:
        raw = json.dumps({k: json_value(v) for k, v in row.items()}, ensure_ascii=False, default=str)
    return [
        f"{digest}#{n}", skey, clean(row.get("PARCEIRO_ID")), clean(row.get("NOME_CLIENTE")), clean(row.get("LOJA")),
        clean(row.get("VENDEDOR")), clean(row.get("NUM_PEDIDO")), clean(row.get("NUM_NOTA")), order_day,
        day(row.get("DATA_NOTA")), clean(row.get("TIPO")), clean(row.get("NOME_CATEGORIA")),
        clean(row.get("NOME_SUBCATEGORIA")), clean(row.get("CODIGO")), clean(row.get("DESCRICAO")),
        clean(row.get("MARCA")), number(row.get("QTDE_ITEM_VENDA")), number(row.get("VALOR_ITEM_VENDA")),
        number(row.get("VLR_DESCONTO")), clean(row.get("PAGTO")), clean(row.get("COND_PAGTO")),
        number(row.get("VL_PAGTO")), clean(row.get("ITEM_MOVI_ESTOQUE_ID")),
        clean(row.get("PARCEIRO_CPF")), clean(row.get("CELULAR")) or clean(row.get("TELEFONE")),
        (clean(row.get("EMAIL")) or "").lower() or None, clean(row.get("NOME_CIDADE")),
        clean(row.get("NOME_BAIRRO")), clean(row.get("UF")), raw if recent else None,
    ]


def psql(script_head, rows, script_tail):
    """Envia um script SQL ao psql do container, com dados em COPY no meio. Retorna a saída."""
    proc = subprocess.Popen(
        ["docker", "exec", "-i", PG_CONTAINER, "sh", "-c",
         'psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8",
    )
    count = 0
    try:
        proc.stdin.write(script_head)
        if rows is not None:
            writer = csv.writer(proc.stdin, lineterminator="\n")
            for record in rows:
                writer.writerow(["" if v is None else v for v in record])
                count += 1
            proc.stdin.write("\\.\n")
        proc.stdin.write(script_tail)
    except BrokenPipeError:
        pass  # o psql parou com erro; a mensagem vem no stderr abaixo
    try:
        out, err = proc.communicate()
    except BrokenPipeError:
        out, err = proc.stdout.read(), proc.stderr.read()
        proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"psql falhou: {err.strip()[:500]}")
    return out.strip(), count


def oracle_rows(days, after=None):
    conn = oracledb.connect(
        user=os.environ["ORACLE_USER"], password=os.environ["ORACLE_PASSWORD"], dsn=os.environ["ORACLE_DSN"],
    )
    try:
        cur = conn.cursor()
        cur.arraysize = 5000
        if after is not None:
            # Linhas novas: o ID do item cresce a cada inserção e tem índice único (consulta sem varrer a tabela).
            cur.execute("SELECT * FROM tab_dados_dinamicos WHERE ITEM_MOVI_ESTOQUE_ID > :a", a=after)
        elif days is None:
            cur.execute("SELECT * FROM tab_dados_dinamicos")
        else:
            cur.execute("SELECT * FROM tab_dados_dinamicos WHERE DATA_PEDIDO >= TRUNC(SYSDATE) - :d", d=days)
        cols = [d[0] for d in cur.description]
        while True:
            batch = cur.fetchmany()
            if not batch:
                break
            for values in batch:
                yield dict(zip(cols, values))
    finally:
        conn.close()


def quoted(cols):
    return ", ".join(f'"{c}"' for c in cols)


def sync(days, after=None):
    """Espelha no CRM as linhas do Oracle (todas ou as dos últimos `days` dias). Retorna as contagens."""
    today = dt.date.today()
    raw_since = (today - dt.timedelta(days=SLOW_DAYS)).isoformat()
    scope = "FALSE" if after is not None else "TRUE" if days is None else f"v.\"orderDate\" >= DATE '{(today - dt.timedelta(days=days)).isoformat()}'"
    ordinal = {}
    records = (to_record(row, ordinal, raw_since) for row in oracle_rows(days, after))
    changed_cols = [c for c in SALE_COLS if c != "key"]
    head = f"""
BEGIN;
CREATE TEMP TABLE stage (LIKE "VmsetSale" INCLUDING DEFAULTS, cpf text, phone text, email text, city text,
  neighborhood text, state text, raw jsonb) ON COMMIT DROP;
COPY stage ({quoted(SALE_COLS + EXTRA_COLS)}) FROM STDIN WITH (FORMAT csv);
"""
    tail = f"""
WITH up AS (
  INSERT INTO "VmsetSale" ({quoted(SALE_COLS)}) SELECT {quoted(SALE_COLS)} FROM stage
  ON CONFLICT ("key") DO UPDATE SET {", ".join(f'"{c}" = EXCLUDED."{c}"' for c in changed_cols)}, "syncedAt" = now()
  WHERE ({", ".join(f'"VmsetSale"."{c}"' for c in changed_cols)}) IS DISTINCT FROM ({", ".join(f'EXCLUDED."{c}"' for c in changed_cols)})
  RETURNING 1)
SELECT 'upserted=' || count(*) FROM up;
-- Linhas que sumiram do Oracle no intervalo (ex.: pedido alterado/cancelado). Trava: só se o Oracle devolveu dados.
WITH gone AS (
  DELETE FROM "VmsetSale" v WHERE {scope} AND NOT EXISTS (SELECT 1 FROM stage s WHERE s."key" = v."key")
    AND (SELECT count(*) FROM stage) >= 0.5 * (SELECT count(*) FROM "VmsetSale" v WHERE {scope})
  RETURNING 1)
SELECT 'removed=' || count(*) FROM gone;
-- Clientes novos com compra recente entram na base do CRM.
WITH added AS (
  INSERT INTO "Contact" ("id", "sourceKey", "name", "cpf", "phone", "email", "city", "neighborhood", "state", "store", "updatedAt")
  SELECT DISTINCT ON (s."sourceKey") 'vm' || md5(s."sourceKey"), s."sourceKey", COALESCE(s."customerName", 'Cliente'),
    s.cpf, s.phone, s.email, s.city, s.neighborhood, s.state, s.store, now()
  FROM stage s
  WHERE s.raw IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Contact" c WHERE c."sourceKey" = s."sourceKey")
  ORDER BY s."sourceKey", s."orderDate" DESC NULLS LAST
  ON CONFLICT ("sourceKey") DO NOTHING
  RETURNING 1)
SELECT 'contacts=' || count(*) FROM added;
-- Mantém o histórico de compras do cliente (ImportedSale) alimentado, sem duplicar linhas já importadas.
WITH fresh AS (
  SELECT s.* FROM stage s
  WHERE s.raw IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ImportedSale" i
    WHERE i."sourceKey" = s."sourceKey"
      AND (i."data"->>'ITEM_MOVI_ESTOQUE_ID' = s."itemMovementId"
        OR (i."data"->>'ITEM_MOVI_ESTOQUE_ID' IS NULL
          AND i."data"->>'LOJA' = s.raw->>'LOJA' AND i."data"->>'NUM_PEDIDO' = s.raw->>'NUM_PEDIDO'
          AND i."data"->>'CODIGO' IS NOT DISTINCT FROM s.raw->>'CODIGO'
          AND i."data"->>'TIPO' IS NOT DISTINCT FROM s.raw->>'TIPO'
          AND i."data"->>'VALOR_ITEM_VENDA' IS NOT DISTINCT FROM s.raw->>'VALOR_ITEM_VENDA')))),
ins AS (
  INSERT INTO "ImportedSale" ("sourceFile", "sourceRow", "sourceKey", "data")
  SELECT 'vmset-oracle-live', nextval('"ImportedSale_live_row_seq"')::int, f."sourceKey", f.raw FROM fresh f
  RETURNING "sourceKey")
SELECT 'imported=' || count(*) FROM ins;
-- Totais do cliente a partir do espelho limpo (só quem teve compra recente nesta rodada).
WITH keys AS (SELECT DISTINCT "sourceKey" FROM stage WHERE raw IS NOT NULL),
agg AS (
  SELECT v."sourceKey",
    count(DISTINCT v."store" || '-' || v."orderNumber") FILTER (WHERE v."type" = 'Venda')::int AS purchases,
    COALESCE(sum(v."amount") FILTER (WHERE v."type" = 'Venda'), 0)::numeric(14, 2) AS total,
    to_char(max(v."orderDate") FILTER (WHERE v."type" = 'Venda'), 'YYYY-MM-DD') || 'T03:00:00.000Z' AS last
  FROM "VmsetSale" v JOIN keys USING ("sourceKey") GROUP BY v."sourceKey"),
upd AS (
  UPDATE "Contact" c SET "purchases" = agg.purchases, "totalSpent" = agg.total,
    "lastPurchaseDate" = COALESCE(agg.last, c."lastPurchaseDate"), "updatedAt" = now()
  FROM agg WHERE c."sourceKey" = agg."sourceKey"
    AND (c."purchases", c."totalSpent", c."lastPurchaseDate") IS DISTINCT FROM (agg.purchases, agg.total, COALESCE(agg.last, c."lastPurchaseDate"))
  RETURNING 1)
SELECT 'totals=' || count(*) FROM upd;
COMMIT;
"""
    out, read = psql(head, records, tail)
    stats = dict(line.split("=", 1) for line in out.splitlines() if "=" in line)
    stats = {k: int(v) for k, v in stats.items()}
    stats["read"] = read
    return stats


def refresh(view):
    psql(f'REFRESH MATERIALIZED VIEW CONCURRENTLY "{view}";\n', None, "")


def latest_item_id():
    out, _ = psql('SELECT max("itemMovementId" COLLATE "C") FROM "VmsetSale";\n', None, "")
    return out.strip() or None


def run(days, refresh_daily=False, after=None):
    started = time.monotonic()
    stats = sync(days, after)
    if stats.get("upserted", 0) or stats.get("removed", 0):
        refresh("VmsetCustomerOrder")
    if refresh_daily:
        refresh("DailySalesSummary")
    label = "novas" if after is not None else "completo" if days is None else f"{days}d"
    if after is None or stats.get("read", 0):
        log(f"sync {label}: {stats} em {time.monotonic() - started:.1f}s")
    return stats


def main():
    lib_dir = os.environ.get("ORACLE_LIB_DIR")
    oracledb.init_oracle_client(lib_dir=lib_dir) if lib_dir else oracledb.init_oracle_client()
    args = sys.argv[1:]
    if args[:1] == ["--full"]:
        run(None, refresh_daily=True)
        return
    if args[:1] == ["--once"]:
        run(int(args[1]) if len(args) > 1 else SLOW_DAYS)
        return
    if args[:1] == ["--new"]:
        run(None, after=latest_item_id() or "")
        return

    # Ao iniciar: espelho completo só se o espelho ainda estiver vazio; senão, reconcilia os últimos dias.
    last_full = None if latest_item_id() is None else dt.date.today()
    last_slow = 0.0
    imported_pending = False
    while True:
        cycle = time.monotonic()
        now = dt.datetime.now()
        try:
            if last_full is None or (now.hour >= FULL_HOUR and last_full != now.date()):
                run(None, refresh_daily=True)
                last_full, last_slow, imported_pending = now.date(), time.monotonic(), False
            elif time.monotonic() - last_slow >= SLOW_EVERY:
                stats = run(SLOW_DAYS)
                if imported_pending or stats.get("imported", 0) > 0:
                    refresh("DailySalesSummary")
                imported_pending = False
                last_slow = time.monotonic()
            else:
                after = latest_item_id()
                if after:
                    stats = run(None, after=after)
                    imported_pending = imported_pending or stats.get("imported", 0) > 0
        except Exception as error:  # noqa: BLE001 - o serviço não pode parar por uma falha pontual
            log(f"erro: {error}")
        time.sleep(max(5.0, FAST_EVERY - (time.monotonic() - cycle)))


if __name__ == "__main__":
    main()
