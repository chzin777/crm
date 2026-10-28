import oracledb from "oracledb";
import pg from "pg";
import fs from "node:fs";
const ORACLE_LIB_DIR = "/opt/oracle/instantclient_19_26";
const CURSOR_FILE = "/tmp/vmset-sales-cursor-desc.txt";
const BATCH_LIMIT = 10000;
const oracleConfig = {
  user: "horus",
  password: "horus",
  connectString: "172.30.20.100:1521/horus",
};
const pgUrl = new URL("postgresql://localhost");
pgUrl.hostname = process.env.DB_HOST || "localhost";
pgUrl.port = process.env.DB_PORT || "5432";
pgUrl.username = process.env.DB_USER || "crm_user";
pgUrl.password = process.env.DB_PASSWORD || "";
pgUrl.pathname = `/${process.env.DB_NAME || "crm"}`;
function normalize(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s || null;
}
function makeSourceKey(row) {
  const cpf = normalize(row.PARCEIRO_CPF)?.replace(/\D/g, "") || null;
  const email = normalize(row.EMAIL)?.toLowerCase() || null;
  const phone = normalize(row.CELULAR) || normalize(row.TELEFONE) || null;
  const phoneDigits = phone?.replace(/\D/g, "") || null;
  if (cpf) return `cpf:${cpf}`;
  if (email) return `email:${email}`;
  if (phoneDigits) return `phone:${phoneDigits}`;
  return null;
}
function loadCursor() {
  try { return fs.readFileSync(CURSOR_FILE, "utf8").trim(); } catch { return null; }
}
function saveCursor(rowid) {
  fs.writeFileSync(CURSOR_FILE, rowid);
}
async function main() {
  if (!process.env.LD_LIBRARY_PATH) {
    process.env.LD_LIBRARY_PATH = ORACLE_LIB_DIR;
  }
  oracledb.initOracleClient({ libDir: ORACLE_LIB_DIR });
  const oraConn = await oracledb.getConnection(oracleConfig);
  const pgClient = new pg.Client({ connectionString: pgUrl.toString() });
  await pgClient.connect();
  const validKeysResult = await pgClient.query('SELECT "sourceKey" FROM "Contact"');
  const validKeys = new Set(validKeysResult.rows.map(r => r.sourceKey));
  console.log(`${validKeys.size} sourceKeys válidas`);
  const lastRowId = loadCursor();
  let sql;
  if (lastRowId) {
    sql = `SELECT * FROM (SELECT ROWID as RID, PARCEIRO_CPF, EMAIL, CELULAR, TELEFONE, LOJA, NUM_PEDIDO, DATA_PEDIDO, VALOR_ITEM_VENDA, NOME_CLIENTE FROM tab_dados_dinamicos WHERE NOME_CLIENTE IS NOT NULL AND ROWID < :cursor ORDER BY DATA_PEDIDO DESC, ROWID DESC) WHERE ROWNUM <= :limit`;
  } else {
    sql = `SELECT * FROM (SELECT ROWID as RID, PARCEIRO_CPF, EMAIL, CELULAR, TELEFONE, LOJA, NUM_PEDIDO, DATA_PEDIDO, VALOR_ITEM_VENDA, NOME_CLIENTE FROM tab_dados_dinamicos WHERE NOME_CLIENTE IS NOT NULL ORDER BY DATA_PEDIDO DESC, ROWID DESC) WHERE ROWNUM <= :limit`;
  }
  const params = lastRowId ? { cursor: lastRowId, limit: BATCH_LIMIT } : { limit: BATCH_LIMIT };
  const result = await oraConn.execute(sql, params, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const rows = result.rows || [];
  console.log(`Lidos ${rows.length} registros do Oracle (cursor: ${lastRowId || "início DESC"})`);
  if (rows.length === 0) {
    console.log("Nenhum registro novo. Importação completa.");
    await oraConn.close();
    await pgClient.end();
    return;
  }
  let imported = 0;
  let skipped = 0;
  let lastRid = null;
  await pgClient.query("BEGIN");
  for (const row of rows) {
    const sourceKey = makeSourceKey(row);
    if (!sourceKey || !validKeys.has(sourceKey)) {
      skipped++;
      lastRid = row.RID;
      continue;
    }
    const dataJson = JSON.stringify(row);
    await pgClient.query(
      'INSERT INTO "ImportedSale" ("sourceFile","sourceRow","sourceKey","data") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      ["vmset-oracle-batch", imported + 1, sourceKey, dataJson]
    );
    imported++;
    lastRid = row.RID;
    if (imported % 1000 === 0) {
      await pgClient.query("COMMIT");
      await pgClient.query("BEGIN");
    }
  }
  await pgClient.query("COMMIT");
  if (lastRid) saveCursor(lastRid);
  console.log(`Importadas: ${imported}, Puladas: ${skipped}, Cursor salvo: ${lastRid}`);
  await oraConn.close();
  await pgClient.end();
}
main().catch(err => {
  console.error("ERRO:", err.message);
  process.exitCode = 1;
});
