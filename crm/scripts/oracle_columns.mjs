import oracledb from "oracledb";
oracledb.initOracleClient({ libDir: "/opt/oracle/instantclient_19_26" });
const conn = await oracledb.getConnection({
  user: "horus",
  password: "horus",
  connectString: "172.30.20.100:1521/horus"
});
console.log("=== CONEXAO OK ===");

const r1 = await conn.execute("SELECT * FROM view_unidade_empresarial WHERE ROWNUM = 1", [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
console.log("\n=== VIEW_UNIDADE_EMPRESARIAL COLUNAS ===");
if (r1.rows && r1.rows.length > 0) {
  console.log(JSON.stringify(Object.keys(r1.rows[0])));
} else {
  console.log("VAZIA");
}

const r2 = await conn.execute("SELECT * FROM tab_dados_dinamicos WHERE ROWNUM = 1", [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
console.log("\n=== TAB_DADOS_DINAMICOS COLUNAS ===");
if (r2.rows && r2.rows.length > 0) {
  console.log(JSON.stringify(Object.keys(r2.rows[0])));
} else {
  console.log("VAZIA");
}

const r3 = await conn.execute("SELECT COUNT(*) AS total FROM view_unidade_empresarial");
console.log("\nTOTAL_VIEW_UNIDADE:", r3.rows[0][0]);

const r4 = await conn.execute("SELECT COUNT(*) AS total FROM tab_dados_dinamicos");
console.log("TOTAL_TAB_DADOS:", r4.rows[0][0]);

await conn.close();
console.log("\n=== FECHADO ===");
