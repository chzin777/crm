import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const ORACLE_LIB_DIR = "/opt/oracle/instantclient_19_26";
const ORACLE_CONFIG_DIR = "/tmp/oracletest/network/admin";
const CURSOR_FILE = "/tmp/oracletest/last_rowid.txt";
const BATCH_SIZE = 500;
const MAX_ITERATIONS = 200;
const CRM_API = "http://localhost:3000";

interface OracleRow {
  RID: string;
  LOJA: number | null;
  NOME_CLIENTE: string | null;
  TELEFONE: string | null;
  CELULAR: string | null;
  EMAIL: string | null;
  NASCIMENTO: string | Date | null;
  SEXO: string | null;
  PROFISSAO: string | null;
  NOME_CIDADE: string | null;
  NOME_BAIRRO: string | null;
  UF: string | null;
  DATA_PEDIDO: string | Date | null;
  VALOR_TOTAL: number | null;
  VENDEDOR: string | null;
  UNIDADE_EMPRESARIAL_ID: string | null;
  PARCEIRO_ID: string | null;
  STATUS: string | null;
  TIPO_CLIENTE: string | null;
}

interface ContactPayload {
  sourceKey: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  gender: string | null;
  occupation: string | null;
  city: string | null;
  neighborhood: string | null;
  state: string | null;
  store: string;
  category: string;
  purchases: number;
  totalSpent: number;
  lastPurchaseDate?: string;
}

function idToNumber(alphaId: string): number {
  if (!alphaId) return 0;
  let hash = 0;
  for (let i = 0; i < alphaId.length; i++) {
    hash = ((hash << 5) - hash + alphaId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function loadCursor(): string | null {
  try {
    return fs.readFileSync(CURSOR_FILE, "utf8").trim();
  } catch {
    return null;
  }
}

function saveCursor(rid: string): void {
  try {
    fs.mkdirSync(path.dirname(CURSOR_FILE), { recursive: true });
    fs.writeFileSync(CURSOR_FILE, rid);
  } catch {
    // ignore write errors in read-only filesystems
  }
}

// Ensure Oracle Thick mode libs are discoverable by the Node.js process.
// The Next.js standalone server does not inherit LD_LIBRARY_PATH from the
// container environment, so we set it explicitly before loading oracledb.
if (!process.env.LD_LIBRARY_PATH) {
  process.env.LD_LIBRARY_PATH = ORACLE_LIB_DIR;
} else if (!process.env.LD_LIBRARY_PATH.includes(ORACLE_LIB_DIR)) {
  process.env.LD_LIBRARY_PATH = `${ORACLE_LIB_DIR}:${process.env.LD_LIBRARY_PATH}`;
}
if (!process.env.TNS_ADMIN) {
  process.env.TNS_ADMIN = ORACLE_CONFIG_DIR;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOracleDb(): Promise<any> {
  // Dynamic import prevents Next.js/Turbopack from trying to resolve
  // the native oracledb module at build time. It is only available
  // at runtime after manual installation inside the container.
  const mod = await Function('return import("oracledb")')() as Record<string, unknown>;
  return mod.default ?? mod;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.SYNC_API_TOKEN || "vmset-sync-token-2026";
  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let oracledb: any;
  try {
    oracledb = await getOracleDb();
  } catch {
    return NextResponse.json(
      { error: "oracledb module not available in this container" },
      { status: 500 }
    );
  }

  try {
    try {
      oracledb.initOracleClient({
        libDir: ORACLE_LIB_DIR,
        configDir: ORACLE_CONFIG_DIR,
      });
    } catch {
      // Already initialized in a previous request — safe to ignore
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let conn: any;
    try {
      conn = await oracledb.getConnection({
        user: "horus",
        password: "horus",
        connectString: "172.30.20.100:1521/horus",
      });

      let lastRowId = loadCursor();
      if (!lastRowId) {
        const minR = await conn.execute(
          "SELECT MIN(ROWID) as MIN_RID FROM tab_dados_dinamicos WHERE NOME_CLIENTE IS NOT NULL",
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        lastRowId = minR.rows?.[0]?.MIN_RID ?? null;
      }

      if (!lastRowId) {
        return NextResponse.json({ ok: true, synced: 0, message: "No data found" });
      }

      let totalSynced = 0;
      let totalErrors = 0;
      let iteration = 0;

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        const sql =
          "SELECT * FROM (SELECT ROWID as RID, LOJA, NOME_CLIENTE, TELEFONE, CELULAR, EMAIL, NASCIMENTO, SEXO, PROFISSAO, NOME_CIDADE, NOME_BAIRRO, UF, DATA_PEDIDO, VALOR_TOTAL, VENDEDOR, UNIDADE_EMPRESARIAL_ID, PARCEIRO_ID, STATUS, TIPO_CLIENTE FROM tab_dados_dinamicos WHERE NOME_CLIENTE IS NOT NULL AND ROWID > :cursor ORDER BY ROWID) WHERE ROWNUM <= :batchSize";

        const queryResult = await conn.execute(sql, { cursor: lastRowId, batchSize: BATCH_SIZE }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const rows: OracleRow[] = queryResult.rows ?? [];

        if (rows.length === 0) break;

        const contactMap = new Map<string, ContactPayload>();

        for (const row of rows) {
          const partnerId = row.PARCEIRO_ID ?? "";
          const phone = (row.CELULAR ?? row.TELEFONE ?? "").replace(/\D/g, "");
          const email = (row.EMAIL ?? "").trim().toLowerCase();
          const name = (row.NOME_CLIENTE ?? "").trim();
          const key = partnerId || `${phone}_${name}`;
          if (!key || key === "_") continue;

          if (!contactMap.has(key)) {
            contactMap.set(key, {
              sourceKey: partnerId || `vmset_${idToNumber(phone + name)}`,
              name,
              phone: phone || null,
              email: email || null,
              birthDate: row.NASCIMENTO
                ? new Date(row.NASCIMENTO).toISOString().split("T")[0]
                : null,
              gender: (row.SEXO ?? "").trim() || null,
              occupation: (row.PROFISSAO ?? "").trim() || null,
              city: (row.NOME_CIDADE ?? "").trim() || null,
              neighborhood: (row.NOME_BAIRRO ?? "").trim() || null,
              state: (row.UF ?? "").trim() || null,
              store: String(row.LOJA ?? ""),
              category: "cliente",
              purchases: 0,
              totalSpent: 0,
            });
          }

          const c = contactMap.get(key)!;
          if (row.VALOR_TOTAL != null) {
            c.purchases++;
            c.totalSpent += Number(row.VALOR_TOTAL) || 0;
          }
          if (row.DATA_PEDIDO) {
            c.lastPurchaseDate = new Date(row.DATA_PEDIDO).toISOString().split("T")[0];
          }
        }

        const contacts = Array.from(contactMap.values());
        for (const contact of contacts) {
          try {
            const resp = await fetch(`${CRM_API}/api/contacts/sync`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(contact),
            });
            if (!resp.ok) totalErrors++;
            else totalSynced++;
          } catch {
            totalErrors++;
          }
        }

        lastRowId = rows[rows.length - 1].RID || lastRowId;
        saveCursor(lastRowId);

        if (rows.length < BATCH_SIZE) break;
      }

      return NextResponse.json({
        ok: true,
        synced: totalSynced,
        errors: totalErrors,
        iterations: iteration,
        finalCursor: lastRowId,
      });
    } finally {
      if (conn) {
        try { await conn.close(); } catch { /* ignore */ }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sync/incremental]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}