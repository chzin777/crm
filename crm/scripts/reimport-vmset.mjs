/**
 * Reimportação de dados da VMSET (Oracle) para o CRM (Postgres).
 * REGRA: Apenas SELECT no Oracle. NENHUMA escrita na VMSET.
 * Conversão de IDs: alfanumérico VMSET -> numérico sequencial no CRM.
 */
import oracledb from "oracledb";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import pg from "pg";

// Config Oracle (VMSET) - SOMENTE LEITURA
const oracleConfig = {
  user: "horus",
  password: "horus",
  connectString: "172.30.20.100:1521/horus",
};

// Config Postgres (CRM)
const pgUrl = new URL("postgresql://localhost");
pgUrl.hostname = process.env.DB_HOST || "localhost";
pgUrl.port = process.env.DB_PORT || "5432";
pgUrl.username = process.env.DB_USER || "crm_user";
pgUrl.password = process.env.DB_PASSWORD || "";
pgUrl.pathname = `/${process.env.DB_NAME || "crm"}`;
pgUrl.searchParams.set("schema", "public");

const BATCH_SIZE = 500;

// Mapa de conversão de ID alfanumérico -> numérico
const storeIdMap = new Map();
let nextStoreId = 1;

function toNumericStoreId(alphaId) {
  if (!alphaId) return null;
  const key = String(alphaId).trim();
  if (!key) return null;
  if (!storeIdMap.has(key)) {
    storeIdMap.set(key, nextStoreId++);
  }
  return storeIdMap.get(key);
}

function normalize(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s || null;
}

/**
 * Gera sourceKey consistente entre contatos e vendas.
 * Mesma lógica usada na importação de contatos.
 */
function makeSourceKey(row) {
  const cpf = normalize(row.PARCEIRO_CPF)?.replace(/\D/g, "") || null;
  const email = normalize(row.EMAIL)?.toLowerCase() || null;
  const phone = normalize(row.CELULAR) || normalize(row.TELEFONE) || null;
  const phoneDigits = phone?.replace(/\D/g, "") || null;

  if (cpf) return `cpf:${cpf}`;
  if (email) return `email:${email}`;
  if (phoneDigits) return `phone:${phoneDigits}`;
  return null; // sem chave válida = não pode vincular venda
}

async function main() {
  // Init Oracle Thick mode
  oracledb.initOracleClient({ libDir: "/opt/oracle/instantclient_19_26" });
  console.log("=== Conectando ao Oracle (VMSET) - SOMENTE LEITURA ===");
  const oraConn = await oracledb.getConnection(oracleConfig);
  console.log("Conexão Oracle OK");

  console.log("=== Conectando ao Postgres (CRM) ===");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: pgUrl.toString() }),
  });
  const pgClient = new pg.Client({ connectionString: pgUrl.toString() });
  await pgClient.connect();
  console.log("Conexão Postgres OK");

  try {
    // ========================================
    // 1. IMPORTAR LOJAS (view_unidade_empresarial)
    // ========================================
    console.log("\n=== Importando Lojas (73 registros) ===");
    const storesResult = await oraConn.execute(
      "SELECT * FROM view_unidade_empresarial",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const stores = storesResult.rows || [];
    console.log(`Lidas ${stores.length} lojas da VMSET`);

    let storesImported = 0;
    for (const row of stores) {
      const numericId = toNumericStoreId(row.UNIDADE_EMPRESARIAL_ID || row.EMPRESA_ID);
      const storeData = {
        number: numericId,
        name: normalize(row.PRCR_NOME) || normalize(row.PSJR_NOME_FANTASIA) || `Loja ${numericId}`,
        address: normalize(row.PRCR_ENDERECO) || null,
        addressNumber: normalize(row.PRCR_NR_ENDERECO) || null,
        complement: normalize(row.PRCR_COMPLEMENTO_ENDERECO) || null,
        postalCode: normalize(row.CEPX_CODIGO) || null,
        city: normalize(row.CDDE_NOME) || null,
        state: normalize(row.ESTD_SIGLA) || null,
        neighborhoods: normalize(row.BRRO_NOME) ? [normalize(row.BRRO_NOME)] : [],
        active: normalize(row.STATUS)?.toLowerCase() !== "inativo",
        kind: normalize(row.UNEM_TIPO) || null,
      };
      await prisma.store.upsert({
        where: { number: numericId },
        update: storeData,
        create: storeData,
      });
      storesImported++;
    }
    console.log(`${storesImported} lojas importadas`);

    // ========================================
    // 2. IMPORTAR CONTATOS (tab_dados_dinamicos - distintos por CPF/email/telefone)
    // ========================================
    console.log("\n=== Importando Contatos (deduplicado por CPF/email/telefone) ===");
    const contactsQuery = `
      SELECT DISTINCT
        PARCEIRO_ID, PARCEIRO_CPF, NOME_CLIENTE,
        TELEFONE, CELULAR, EMAIL,
        NASCIMENTO, SEXO, PROFISSAO,
        NOME_CIDADE, NOME_BAIRRO, UF, LOJA
      FROM tab_dados_dinamicos
      WHERE NOME_CLIENTE IS NOT NULL
      ORDER BY PARCEIRO_ID
    `;
    const contactsResult = await oraConn.execute(contactsQuery, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      resultSet: true,
    });

    let contactsImported = 0;
    let contactsBatch = [];
    const seenKeys = new Set();

    while (true) {
      const rows = await contactsResult.resultSet.getRows(BATCH_SIZE);
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const sourceKey = makeSourceKey(row);
        if (!sourceKey || seenKeys.has(sourceKey)) continue;
        seenKeys.add(sourceKey);

        const contactData = {
          sourceKey,
          name: normalize(row.NOME_CLIENTE) || "Contato sem nome",
          cpf: normalize(row.PARCEIRO_CPF)?.replace(/\D/g, "") || null,
          phone: normalize(row.CELULAR) || normalize(row.TELEFONE) || null,
          email: normalize(row.EMAIL)?.toLowerCase() || null,
          birthDate: normalize(row.NASCIMENTO),
          gender: normalize(row.SEXO) || null,
          occupation: normalize(row.PROFISSAO) || null,
          city: normalize(row.NOME_CIDADE) || null,
          neighborhood: normalize(row.NOME_BAIRRO) || null,
          state: normalize(row.UF) || null,
          store: normalize(row.LOJA) || null,
        };
        contactsBatch.push(contactData);

        if (contactsBatch.length >= BATCH_SIZE) {
          await prisma.contact.createMany({ data: contactsBatch, skipDuplicates: true });
          contactsImported += contactsBatch.length;
          contactsBatch = [];
          if (contactsImported % 5000 === 0) {
            console.log(`  ... ${contactsImported} contatos importados`);
          }
        }
      }
    }
    if (contactsBatch.length > 0) {
      await prisma.contact.createMany({ data: contactsBatch, skipDuplicates: true });
      contactsImported += contactsBatch.length;
    }
    await contactsResult.resultSet.close();
    console.log(`${contactsImported} contatos únicos importados`);

    // ========================================
    // 3. IMPORTAR VENDAS (tab_dados_dinamicos)
    //    Apenas linhas cujo sourceKey existe em Contact
    // ========================================
    console.log("\n=== Importando Vendas (~1.6M registros) ===");

    // Buscar todos os sourceKeys existentes no CRM para filtrar vendas órfãs
    console.log("Carregando sourceKeys válidas do CRM...");
    const validKeysResult = await pgClient.query('SELECT "sourceKey" FROM "Contact"');
    const validKeys = new Set(validKeysResult.rows.map(r => r.sourceKey));
    console.log(`${validKeys.size} sourceKeys válidas carregadas`);

    const salesQuery = `
      SELECT
        LOJA, NUM_PEDIDO, NUM_NOTA, SERIE_NOTA,
        DATA_PEDIDO, HORA_PEDIDO, TURNO_PEDIDO, DIA_SEMANA_PEDIDO,
        UNIDADE_EMPRESARIAL_ID, DATA_NOTA,
        ANO_PEDIDO, MES_PEDIDO, DIA_PEDIDO,
        ANO_NOTA, MES_NOTA, DIA_NOTA,
        VENDEDOR, FUNCAO, MEDICO, CRM_MEDICO,
        CLINICA, BAIRRO_CLINICA, CIDADE_CLINICA, ESTADO_CLINICA,
        TIPO, COND_PAGTO, PRAZO_MEDIO, NR_PARCELAS,
        PAGTO, ENTRADA, DOC_ADIC,
        VL_PAGTO, VL_ENTRADA, VLR_ADIC_PAGO,
        REF_FABRICANTE, CODIGO, DESCRICAO, FABRICANTE, MARCA,
        VENDEDOR_ID, QTDE_ITEM_VENDA, QTDE_TOTAL,
        VLR_DESCONTO, VALOR_ITEM_VENDA, VALOR_TOTAL,
        CAMPANHA, CUSTOSEMICMS, CUSTO_COM_ICMS,
        CLIENTE_LOJA, PARCEIRO_ID, PARCEIRO_CPF,
        NOME_CLIENTE, TELEFONE, CELULAR, EMAIL,
        NASCIMENTO, SEXO, PROFISSAO,
        NOME_CIDADE, NOME_BAIRRO, UF,
        STATUS, LOCAL, FAIXA_ETARIA, TIPO_CLIENTE,
        PROMOTOR_ID, PROMOTOR_NOME, ORDEM_COMPRA
      FROM tab_dados_dinamicos
      ORDER BY NUM_PEDIDO
    `;
    const salesResult = await oraConn.execute(salesQuery, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      resultSet: true,
    });

    let salesImported = 0;
    let salesSkipped = 0;
    let salesBatch = [];

    while (true) {
      const rows = await salesResult.resultSet.getRows(BATCH_SIZE);
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const sourceKey = makeSourceKey(row);
        if (!sourceKey || !validKeys.has(sourceKey)) {
          salesSkipped++;
          continue;
        }

        const saleData = {
          sourceFile: "vmset-oracle-reimport",
          sourceRow: salesImported + salesSkipped + 1,
          sourceKey: sourceKey,
          data: JSON.stringify(row),
        };
        salesBatch.push(saleData);

        if (salesBatch.length >= BATCH_SIZE) {
          const values = salesBatch.map(s =>
            `('${s.sourceFile.replace(/'/g,"''")}',${s.sourceRow},'${s.sourceKey.replace(/'/g,"''")}','${s.data.replace(/'/g,"''")}')`
          ).join(",");
          await pgClient.query(
            `INSERT INTO "ImportedSale" ("sourceFile","sourceRow","sourceKey","data") VALUES ${values} ON CONFLICT DO NOTHING`
          );
          salesImported += salesBatch.length;
          salesBatch = [];
          if (salesImported % 10000 === 0) {
            console.log(`  ... ${salesImported.toLocaleString()} vendas importadas (${salesSkipped.toLocaleString()} puladas)`);
          }
        }
      }
    }
    if (salesBatch.length > 0) {
      const values = salesBatch.map(s =>
        `('${s.sourceFile.replace(/'/g,"''")}',${s.sourceRow},'${s.sourceKey.replace(/'/g,"''")}','${s.data.replace(/'/g,"''")}')`
      ).join(",");
      await pgClient.query(
        `INSERT INTO "ImportedSale" ("sourceFile","sourceRow","sourceKey","data") VALUES ${values} ON CONFLICT DO NOTHING`
      );
      salesImported += salesBatch.length;
    }
    await salesResult.resultSet.close();
    console.log(`${salesImported.toLocaleString()} vendas importadas (${salesSkipped.toLocaleString()} puladas por contato inexistente)`);

    // ========================================
    // 4. ATUALIZAR AGREGADOS DOS CONTATOS
    // ========================================
    console.log("\n=== Atualizando agregados dos contatos ===");
    await pgClient.query(`
      WITH amounts AS (
        SELECT
          "sourceKey",
          COUNT(DISTINCT COALESCE(
            NULLIF("data"->>'NUM_PEDIDO', ''),
            NULLIF("data"->>'NUM_NOTA', ''),
            'row:' || "sourceRow"::text
          ))::integer AS purchases,
          SUM(
            CASE
              WHEN amount.value ~ '^-?[0-9][0-9.]*,[0-9]{1,2}$'
              THEN replace(replace(amount.value, '.', ''), ',', '.')::numeric
              WHEN amount.value ~ '^-?[0-9]+(\\.[0-9]{1,2})?$'
              THEN amount.value::numeric
              ELSE 0
            END
          ) AS total_spent
        FROM "ImportedSale"
        CROSS JOIN LATERAL (
          SELECT regexp_replace(COALESCE("data"->>'VALOR_ITEM_VENDA', ''), '[^0-9,.-]', '', 'g') AS value
        ) AS amount
        WHERE "sourceFile" = 'vmset-oracle-reimport'
        GROUP BY "sourceKey"
      ),
      latest AS (
        SELECT DISTINCT ON ("sourceKey")
          "sourceKey",
          "data"
        FROM "ImportedSale"
        WHERE "sourceFile" = 'vmset-oracle-reimport'
        ORDER BY "sourceKey", "sourceRow" DESC
      )
      UPDATE "Contact" AS contact
      SET
        "purchases" = amounts.purchases,
        "totalSpent" = amounts.total_spent,
        "lastPurchaseDate" = NULLIF(latest."data"->>'DATA_PEDIDO', ''),
        "name" = COALESCE(NULLIF(latest."data"->>'NOME_CLIENTE', ''), contact."name"),
        "phone" = COALESCE(NULLIF(latest."data"->>'CELULAR', ''), NULLIF(latest."data"->>'TELEFONE', ''), contact."phone"),
        "email" = COALESCE(NULLIF(latest."data"->>'EMAIL', ''), contact."email"),
        "store" = COALESCE(NULLIF(latest."data"->>'LOJA', ''), contact."store"),
        "updatedAt" = NOW()
      FROM amounts
      JOIN latest USING ("sourceKey")
      WHERE contact."sourceKey" = amounts."sourceKey"
    `);
    console.log("Agregados atualizados");

    console.log("\n=== REIMPORTAÇÃO CONCLUÍDA ===");
    console.log(`Lojas: ${storesImported}`);
    console.log(`Contatos: ${contactsImported}`);
    console.log(`Vendas: ${salesImported.toLocaleString()}`);
    console.log(`Vendas puladas: ${salesSkipped.toLocaleString()}`);

  } catch (err) {
    console.error("ERRO NA REIMPORTAÇÃO:", err.message);
    process.exitCode = 1;
  } finally {
    await oraConn.close().catch(() => {});
    await pgClient.end().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    console.log("\n=== CONEXÕES FECHADAS ===");
  }
}

main();