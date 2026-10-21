import re

script_path = "/opt/crm/crm/scripts/reimport-vmset.mjs"

with open(script_path, "r") as f:
    content = f.read()

# Add pg-copy-streams import if not present
if "pg-copy-streams" not in content:
    content = content.replace(
        'import pg from "pg";',
        'import pg from "pg";\nimport { from } from "pg-copy-streams";'
    )
    print("Added pg-copy-streams import")
else:
    print("pg-copy-streams import already present")

# The exact text to find (from sed output lines 190-287)
old_start = 'console.log("Carregando sourceKeys válidas do CRM...");'
old_end = 'console.log(`${salesImported.toLocaleString()} vendas importadas (${salesSkipped.toLocaleString()} puladas por contato inexistente)`);'

start_idx = content.find(old_start)
end_idx = content.find(old_end)

if start_idx == -1 or end_idx == -1:
    print(f"ERROR: Could not find section boundaries. start={start_idx}, end={end_idx}")
    # Debug: show what's around line 190
    lines = content.split("\n")
    for i in range(max(0, 188), min(len(lines), 195)):
        print(f"  Line {i+1}: {lines[i][:100]}")
    exit(1)

end_idx += len(old_end)
old_section = content[start_idx:end_idx]
print(f"Found sales section: {len(old_section)} chars, from pos {start_idx} to {end_idx}")

new_section = '''// Use COPY FROM STDIN for bulk insert - much faster and memory efficient
console.log("Carregando sourceKeys v\\u00e1lidas do CRM...");
const validKeysResult = await pgClient.query('SELECT "sourceKey" FROM "Contact"');
const validKeys = new Set(validKeysResult.rows.map(r => r.sourceKey));
console.log(`${validKeys.size} sourceKeys v\\u00e1lidas carregadas`);

// Start COPY stream
const copyStream = pgClient.query(from('COPY "ImportedSale" ("sourceFile","sourceRow","sourceKey","data") FROM STDIN'));
let copyBuffer = "";
let copyBufferSize = 0;
const COPY_FLUSH_SIZE = 64 * 1024;

function escapeCopyVal(val) {
  if (val === null || val === undefined) return "\\\\N";
  const s = String(val);
  // Escape backslashes, tabs, newlines per PostgreSQL COPY text format
  return s.replace(/\\\\/g, "\\\\\\\\").replace(/\\t/g, "\\\\t").replace(/\\n/g, "\\\\n").replace(/\\r/g, "\\\\r");
}

function flushCopy() {
  if (copyBuffer.length > 0) {
    copyStream.write(copyBuffer);
    copyBuffer = "";
    copyBufferSize = 0;
  }
}

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

while (true) {
  const rows = await salesResult.resultSet.getRows(BATCH_SIZE);
  if (!rows || rows.length === 0) break;

  for (const row of rows) {
    const sourceKey = makeSourceKey(row);
    if (!sourceKey || !validKeys.has(sourceKey)) {
      salesSkipped++;
      continue;
    }

    const dataJson = JSON.stringify(row);
    const line = escapeCopyVal("vmset-oracle-reimport") + "\\t" +
      (salesImported + salesSkipped + 1) + "\\t" +
      escapeCopyVal(sourceKey) + "\\t" +
      escapeCopyVal(dataJson) + "\\n";

    copyBuffer += line;
    copyBufferSize += line.length;
    salesImported++;

    if (copyBufferSize >= COPY_FLUSH_SIZE) {
      flushCopy();
    }

    if (salesImported % 10000 === 0) {
      console.log(`  ... ${salesImported.toLocaleString()} vendas importadas (${salesSkipped.toLocaleString()} puladas)`);
    }
  }
}

flushCopy();
await new Promise((resolve, reject) => {
  copyStream.end(() => resolve());
  copyStream.on("error", reject);
});

await salesResult.resultSet.close();
console.log(`${salesImported.toLocaleString()} vendas importadas (${salesSkipped.toLocaleString()} puladas por contato inexistente)`);'''

content = content[:start_idx] + new_section + content[end_idx:]

with open(script_path, "w") as f:
    f.write(content)

print("Script updated successfully with COPY FROM STDIN")